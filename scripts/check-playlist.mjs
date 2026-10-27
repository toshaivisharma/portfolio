// Checks whether the receipt's playlist link is visible to the public.
// Usage: npm run check-playlist
import { readFileSync } from "node:fs";

for (const line of readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m) process.env[m[1]] ??= m[2];
}
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const id = html.match(/open\.spotify\.com\/playlist\/([A-Za-z0-9]+)/)?.[1];
console.log("Playlist ID on your site:", id);

const auth = Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString("base64");
const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
  method: "POST",
  headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
  body: "grant_type=client_credentials",
});
const { access_token } = await tokenRes.json();

const res = await fetch(`https://api.spotify.com/v1/playlists/${id}?fields=name,public,owner(display_name,id),tracks(total)`, {
  headers: { Authorization: `Bearer ${access_token}` },
});
if (!res.ok) {
  console.log(`Spotify says: ${res.status} ${res.status === 404 ? "(not found or private: the public can't see it)" : ""}`);
} else {
  const p = await res.json();
  console.log(`Found "${p.name}" by ${p.owner.display_name} (${p.owner.id}), ${p.tracks.total} songs, public: ${p.public}`);
}
