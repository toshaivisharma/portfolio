// One-time script: logs you into Spotify and prints a refresh token.
// Usage: put SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in .env, then `npm run token`.
// Add http://127.0.0.1:8888/callback as a Redirect URI in your Spotify app settings first.

import { createServer } from "node:http";
import { readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { randomBytes } from "node:crypto";
import { exec } from "node:child_process";

const REDIRECT_URI = "http://127.0.0.1:8888/callback";
const SCOPE = "user-top-read";

function loadEnv() {
  try {
    for (const line of readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    // No .env file; fall back to variables already in the shell.
  }
}

loadEnv();
let { SPOTIFY_CLIENT_ID: clientId, SPOTIFY_CLIENT_SECRET: clientSecret } = process.env;
if (!clientId || !clientSecret) {
  // No .env yet: ask for the keys and save them to .env (which git ignores).
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  clientId = (await rl.question("Paste your Spotify Client ID and press Enter: ")).trim();
  clientSecret = (await rl.question("Paste your Spotify Client secret and press Enter: ")).trim();
  rl.close();
  if (!clientId || !clientSecret) {
    console.error("Both the Client ID and Client secret are needed. Run `npm run token` again.");
    process.exit(1);
  }
  writeFileSync(new URL("../.env", import.meta.url), `SPOTIFY_CLIENT_ID=${clientId}\nSPOTIFY_CLIENT_SECRET=${clientSecret}\n`, { mode: 0o600 });
  console.log("Saved them to .env.\n");
}

const state = randomBytes(16).toString("hex");
const authorizeUrl =
  "https://accounts.spotify.com/authorize?" +
  new URLSearchParams({ client_id: clientId, response_type: "code", redirect_uri: REDIRECT_URI, scope: SCOPE, state });

const server = createServer(async (req, res) => {
  const url = new URL(req.url, REDIRECT_URI);
  if (url.pathname !== "/callback") {
    res.writeHead(404).end();
    return;
  }

  const finish = (status, message) => {
    res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" }).end(message);
    server.close();
  };

  if (url.searchParams.get("state") !== state) return finish(400, "State mismatch. Run the script again.");
  if (url.searchParams.get("error")) return finish(400, `Spotify said: ${url.searchParams.get("error")}`);

  const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "authorization_code", code: url.searchParams.get("code"), redirect_uri: REDIRECT_URI }),
  });
  const data = await tokenRes.json();

  if (!tokenRes.ok || !data.refresh_token) {
    console.error("Token exchange failed:", data);
    return finish(500, "Token exchange failed. Check the terminal.");
  }

  console.log("\nYour refresh token (paste it into Vercel as SPOTIFY_REFRESH_TOKEN):\n");
  console.log(data.refresh_token + "\n");
  finish(200, "Done. Go back to the terminal to copy your refresh token. You can close this tab.");
});

server.listen(8888, "127.0.0.1", () => {
  console.log("Opening Spotify in your browser. If it doesn't open, visit:\n\n" + authorizeUrl + "\n");
  const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start \"\"" : "xdg-open";
  exec(`${opener} "${authorizeUrl}"`);
});
