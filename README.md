# shaivi's portfolio

Personal site: a hand-drawn film strip homepage, a stills (disco ball) page, a projects page, a writing page, and a live Spotify "receipt" of shaivi's top tracks.

## Deploys

This repo is connected to Vercel. Every push to `main` goes live automatically, so there is nothing to run by hand.

## What's in here

| Path | What it is |
| --- | --- |
| `index.html` | Homepage, about overlay and the receipt overlay |
| `stills/` | Disco ball photo page |
| `projects/` | Projects page |
| `writing/` | Writing page: a stack of newspaper front pages, one per piece |
| `assets/` | Images and fonts shared by the pages |
| `api/top-tracks.js` | Vercel serverless function that fetches the top tracks from Spotify |
| `scripts/` | One-time Spotify token script and offline tests (`npm test`) |

## Secrets

The Spotify keys (`SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_REFRESH_TOKEN`) live only in Vercel's Environment Variables. Never commit them; `.env` is gitignored.

## Making a change

Edit the files, commit, and push to `main`. Vercel builds it within a minute or two; check the Deployments tab of the `spotify-receipt` project on vercel.com if something looks off.
