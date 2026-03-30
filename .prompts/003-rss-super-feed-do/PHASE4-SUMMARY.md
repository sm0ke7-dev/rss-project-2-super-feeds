# Phase 4 Summary — Cloudflare Worker: Feed Server

## Files Created

| File | Purpose |
|------|---------|
| `workers/feed-server/package.json` | npm manifest; dev deps: wrangler, typescript, @cloudflare/workers-types |
| `workers/feed-server/tsconfig.json` | TypeScript config targeting ES2022, using Workers types |
| `workers/feed-server/wrangler.toml` | Wrangler config: worker name, R2 binding, optional custom domain route |
| `workers/feed-server/src/index.ts` | Worker entry point — validates path, fetches from R2, returns feed with headers |

---

## What the Worker Does

- Accepts `GET /feeds/{office-slug}/{service-slug}/feed.xml` (or `.html`)
- Validates the path against a strict regex before touching R2
- Returns 404 for any path that doesn't match the pattern
- Reads the file from the `aaac-super-feeds` R2 bucket via native binding
- Sets `Cache-Control: public, max-age=1800` (30 min) and CORS headers
- Handles OPTIONS preflight for CORS

---

## Before You Deploy — Cloudflare Dashboard Steps

### 1. Create the R2 Bucket

1. Log in to the [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Go to **R2** in the left sidebar
3. Click **Create bucket**
4. Name it exactly: `aaac-super-feeds`
5. Leave region as default (automatic)
6. Click **Create bucket**

### 2. Get a Wrangler API Token

1. In the Cloudflare Dashboard, go to **My Profile > API Tokens**
2. Click **Create Token**
3. Use the **Edit Cloudflare Workers** template
4. Under **Account Resources** — select your account
5. Under **Zone Resources** — select All zones (or your specific zone)
6. Click **Continue to summary**, then **Create Token**
7. Copy the token — you only see it once

---

## Wrangler Authentication

Set the token in your shell before running any wrangler commands:

```bash
export CLOUDFLARE_API_TOKEN=your_token_here
```

Or log in interactively (opens a browser):

```bash
npx wrangler login
```

---

## How to Deploy

```bash
cd workers/feed-server

# First time: log in or set token (see above)
npx wrangler login

# Deploy the worker
npm run deploy
```

After deploying, Wrangler will print the worker's URL, e.g.:
`https://aaac-feed-server.<your-subdomain>.workers.dev`

---

## How to Verify It's Working

Replace `<worker-url>` with the URL from the deploy output.

### Valid feed — expect 200 (or 404 if bucket is empty)
```bash
curl -i "https://aaac-feed-server.<your-subdomain>.workers.dev/feeds/atlanta/bat-removal/feed.xml"
```

### Bad path — expect 404
```bash
curl -i "https://aaac-feed-server.<your-subdomain>.workers.dev/feeds/atlanta/feed.xml"
curl -i "https://aaac-feed-server.<your-subdomain>.workers.dev/../etc/passwd"
```

### CORS preflight — expect 204
```bash
curl -i -X OPTIONS "https://aaac-feed-server.<your-subdomain>.workers.dev/feeds/atlanta/bat-removal/feed.xml"
```

### Check response headers on a real feed
```bash
curl -sI "https://aaac-feed-server.<your-subdomain>.workers.dev/feeds/atlanta/bat-removal/feed.xml"
# Should see: Cache-Control: public, max-age=1800
# Should see: Access-Control-Allow-Origin: *
# Should see: Content-Type: application/rss+xml (set when object was uploaded to R2)
```

---

## Optional: Custom Domain

To serve feeds from `feeds.aaacwildlife.com`, uncomment the `[[routes]]` block in `wrangler.toml` after:
1. Adding `aaacwildlife.com` to your Cloudflare account
2. Configuring DNS appropriately

---

## Notes

- The R2 bucket name (`aaac-super-feeds`) in `wrangler.toml` must match the bucket you created in the dashboard exactly.
- The worker only allows paths matching `feeds/{office-slug}/{service-slug}/feed.xml|html` — all other requests return 404.
- Slugs must be lowercase alphanumeric with hyphens only (`[a-z0-9-]+`).
- The `preview_bucket_name` line in `wrangler.toml` is commented out — uncomment it and create a dev bucket if you want `npm run dev` to serve live R2 data locally.
