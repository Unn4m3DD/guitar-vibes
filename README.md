# Guitar Flash Modern

A standalone five-lane rhythm game using the live Guitar Flash catalog and original charts, synchronized to YouTube playback. The repository is ready for a zero-configuration Vercel deployment.

## Deploy on Vercel — no configuration

1. Push this directory as the root of a Git repository.
2. In Vercel, choose **Add New → Project** and import the repository.
3. Click **Deploy** without changing the framework, build, output, or environment settings.

That is all. `vercel.json` declares the API rewrites and function limits; Vercel serves `index.html`, `app.js`, and `styles.css` as static files and deploys every file in `api/` as a Node.js Function.

The health check is available at `/api/health` after deployment.

## Run locally

```bash
npm start
```

Open <http://localhost:4173>. Node 20 or newer is required. There are no package dependencies or build step.

## Zero-config storage behavior

Scores and multiplayer rooms work immediately using the Function instance's in-memory store. This is appropriate for a personal deployment or demo, but Vercel may recycle or horizontally scale Function instances, so this data is not guaranteed to persist or be shared by every instance.

No storage configuration is required. If persistent global rooms and scores are wanted later, connect an Upstash Redis resource in the Vercel Marketplace. The code automatically detects `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`; no code changes are necessary.

## Included

- Live Guitar Flash catalog, song metadata, and original Easy–Expert charts
- Server-side AES chart decoding in local and Vercel runtimes
- YouTube IFrame clock with original Guitar Flash per-song timing and 82 ms player adjustment
- Vertical five-lane canvas player, chords, sustains, three note speeds, and remappable controls
- Special phrases, meter accumulation, configurable activation, timed drain, and 2× scoring
- Scoring, combo, crowd meter, pause, results, hit animations, and local rankings
- Multiplayer rooms with synchronized starts and serverless-safe polling
- Optional Redis persistence with automatic in-memory fallback

## Deployment files

- `vercel.json` — routing, Function duration, and security headers
- `api/` — Vercel Functions
- `lib/` — shared Guitar Flash decoder, HTTP helpers, and storage adapter
- `server.mjs` — dependency-free local development server

## Upstream note

This is an independent client and is not affiliated with Guitar Flash. The deployed site depends on Guitar Flash's endpoints and the referenced YouTube videos remaining available. Review Guitar Flash's terms and obtain permission before operating a public deployment at scale.
