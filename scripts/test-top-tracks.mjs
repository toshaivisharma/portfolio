// Offline checks for api/top-tracks.js against a fake Spotify. Run with `npm test`.
import assert from "node:assert/strict";

process.env.SPOTIFY_CLIENT_ID = "id";
process.env.SPOTIFY_CLIENT_SECRET = "secret";
process.env.SPOTIFY_REFRESH_TOKEN = "refresh";

let spotifyUp = true;
let calls = [];
globalThis.fetch = async (url, opts = {}) => {
  calls.push(String(url));
  const json = (status, body) => ({ ok: status < 400, status, json: async () => body });
  if (!spotifyUp) return json(503, { error: "down" });
  if (String(url).includes("/api/token")) {
    assert.match(opts.headers.Authorization, /^Basic /);
    return json(200, { access_token: "access", expires_in: 3600 });
  }
  assert.equal(opts.headers.Authorization, "Bearer access");
  const items = Array.from({ length: 10 }, (_, i) => ({
    name: `Song ${i + 1}`,
    artists: [{ name: "A" }, { name: "B" }],
    duration_ms: 180000 + i * 1000,
    external_urls: { spotify: `https://open.spotify.com/track/${i}` },
  }));
  return json(200, { items });
};

const { default: handler } = await import("../api/top-tracks.js");

function call(query) {
  const res = { headers: {}, statusCode: 0, body: null };
  res.setHeader = (k, v) => (res.headers[k] = v);
  res.status = (c) => ((res.statusCode = c), res);
  res.json = (b) => ((res.body = b), res);
  return handler({ query }, res).then(() => res);
}

// 1. Happy path: ten tracks, trimmed fields, an hour of edge caching, no tokens in the body.
let r = await call({ range: "short_term" });
assert.equal(r.statusCode, 200);
assert.equal(r.body.tracks.length, 10);
assert.deepEqual(r.body.tracks[0], { name: "Song 1", artists: "A, B", durationMs: 180000, url: "https://open.spotify.com/track/0" });
assert.match(r.headers["Cache-Control"], /s-maxage=3600/);
assert.ok(!JSON.stringify(r.body).includes("access") && !JSON.stringify(r.body).includes("refresh"));
assert.ok(calls.some((u) => u.includes("time_range=short_term&limit=10")));

// 2. Default range is the last month.
r = await call({});
assert.equal(r.body.range, "short_term");

// 3. Bad range is rejected.
r = await call({ range: "forever" });
assert.equal(r.statusCode, 400);

// 4. Spotify down: the last good result is served, marked stale.
spotifyUp = false;
r = await call({ range: "short_term" });
assert.equal(r.statusCode, 200);
assert.equal(r.body.stale, true);
assert.equal(r.body.tracks.length, 10);

// 5. Spotify down with nothing saved for that range: a clean 502.
r = await call({ range: "long_term" });
assert.equal(r.statusCode, 502);
assert.equal(r.headers["Cache-Control"], "no-store");

console.log("All top-tracks checks passed.");
