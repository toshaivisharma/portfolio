// GET /api/top-tracks?range=short_term|medium_term|long_term
// Returns { range, tracks: [{ name, artists, durationMs, url }], fetchedAt, stale }.
// Spotify credentials stay on the server; the browser only ever sees the track list.

const RANGES = new Set(["short_term", "medium_term", "long_term"]);
const LIMIT = 10;
const CACHE_SECONDS = 3600; // about an hour, per the spec

// Warm-instance memory. Survives between requests on the same instance only.
let accessToken = null;
let accessTokenExpiresAt = 0;
const memory = new Map(); // range -> { body, savedAt }

async function getAccessToken() {
  if (accessToken && Date.now() < accessTokenExpiresAt - 60_000) return accessToken;

  const { SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REFRESH_TOKEN } = process.env;
  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET || !SPOTIFY_REFRESH_TOKEN) {
    throw new Error("Spotify environment variables are missing");
  }

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: SPOTIFY_REFRESH_TOKEN }),
  });
  if (!res.ok) throw new Error(`Spotify token request failed (${res.status})`);

  const data = await res.json();
  accessToken = data.access_token;
  accessTokenExpiresAt = Date.now() + data.expires_in * 1000;
  return accessToken;
}

async function fetchTopTracks(range) {
  const token = await getAccessToken();
  const url = `https://api.spotify.com/v1/me/top/tracks?time_range=${range}&limit=${LIMIT}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401) accessToken = null; // force a fresh token next time
  if (!res.ok) throw new Error(`Spotify top tracks request failed (${res.status})`);

  const data = await res.json();
  return data.items.map((t) => ({
    name: t.name,
    artists: t.artists.map((a) => a.name).join(", "),
    durationMs: t.duration_ms,
    url: t.external_urls?.spotify ?? null,
  }));
}

// ---- optional durable "last good result" store (Upstash Redis / Vercel KV REST API) ----
const kvUrl = () => process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const kvToken = () => process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

async function kv(command) {
  if (!kvUrl() || !kvToken()) return null;
  try {
    const res = await fetch(kvUrl(), {
      method: "POST",
      headers: { Authorization: `Bearer ${kvToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify(command),
    });
    if (!res.ok) return null;
    return (await res.json()).result ?? null;
  } catch {
    return null;
  }
}

async function saveLastGood(range, body) {
  memory.set(range, body);
  await kv(["SET", `top-tracks:${range}`, JSON.stringify(body)]);
}

async function loadLastGood(range) {
  if (memory.has(range)) return memory.get(range);
  const raw = await kv(["GET", `top-tracks:${range}`]);
  return raw ? JSON.parse(raw) : null;
}

export default async function handler(req, res) {
  const range = req.query?.range ?? "short_term";
  if (!RANGES.has(range)) {
    res.status(400).json({ error: "range must be short_term, medium_term or long_term" });
    return;
  }

  try {
    const body = { range, tracks: await fetchTopTracks(range), fetchedAt: new Date().toISOString(), stale: false };
    await saveLastGood(range, body);
    // Vercel's edge cache holds this for an hour, then refreshes it in the background.
    res.setHeader("Cache-Control", `public, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=86400`);
    res.status(200).json(body);
  } catch (err) {
    console.error(err);
    const saved = await loadLastGood(range);
    if (saved) {
      // Serve the last good receipt, but only cache it briefly so Spotify is retried soon.
      res.setHeader("Cache-Control", "public, s-maxage=300");
      res.status(200).json({ ...saved, stale: true });
      return;
    }
    res.setHeader("Cache-Control", "no-store");
    res.status(502).json({ error: "Couldn't reach Spotify right now" });
  }
}
