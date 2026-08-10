# Dish Recognition Worker

A Cloudflare Worker that proxies dish-photo recognition requests from the app to the
Anthropic API. It exists so the Anthropic API key never ships inside the client app —
the app calls this Worker over HTTPS with a shared secret instead.

## Prerequisites

- An Anthropic API key (from https://console.anthropic.com/).
- A Cloudflare account (the free tier is sufficient).
- `npm install` run inside this `worker/` directory.

## Local development

```
npm install
npx wrangler dev
```

For local secrets, create a `.dev.vars` file in this directory (already gitignored,
never commit it):

```
ANTHROPIC_API_KEY=sk-ant-...
APP_SHARED_SECRET=some-long-random-string
```

`wrangler dev` picks these up automatically.

## Deployment

1. Set the production secrets (you'll be prompted for the value):

   ```
   npx wrangler secret put ANTHROPIC_API_KEY
   npx wrangler secret put APP_SHARED_SECRET
   ```

2. Deploy:

   ```
   npx wrangler deploy
   ```

3. Wrangler prints the deployed Worker URL (e.g.
   `https://dish-recognition-worker.your-subdomain.workers.dev`). Take that URL plus
   the `APP_SHARED_SECRET` value you set above and put them in the app's `.env` file:

   ```
   EXPO_PUBLIC_RECOGNITION_API_URL=https://your-worker.your-subdomain.workers.dev/recognize
   EXPO_PUBLIC_RECOGNITION_API_SECRET=<the same value you set as APP_SHARED_SECRET>
   ```

## Abuse protection

The shared secret is the first layer of protection. As a second layer, add a
Cloudflare Rate Limiting rule on the `/recognize` route in the Cloudflare dashboard
(Security > WAF > Rate limiting rules) to cap request volume per client, per the
design spec.

## Note on web hosting

`metro.config.js` sets COOP/COEP headers for the local Expo dev server so that
`expo-sqlite`'s web worker (which relies on `SharedArrayBuffer`) can run in the
browser. If this app is ever exported to a static/production web host (not just
served by the Expo dev server), that host needs to set the same
`Cross-Origin-Embedder-Policy` and `Cross-Origin-Opener-Policy` headers, or
`expo-sqlite` will fail there too.
