# Stack Reference

## Runtime Environments

### Admin UI (Frontend)
- Browser-targeted SPA; no Node.js version constraint in package.json
- ES module output (`"type": "module"` in package.json)
- TypeScript 5.6.x throughout

### Convex Backend
- Runs on Convex's managed cloud infrastructure
- Actions marked `"use node"` execute in a Node.js-compatible environment (Convex Node runtime)
- Actions without `"use node"` run in the Convex edge runtime (V8 isolate, not full Node.js)

### Cloudflare Worker (legacy/alternative feed-server)
- Cloudflare Workers runtime (workerd / V8 isolate)
- Compatibility date: `2024-01-01`
- Located at `workers/feed-server/`

---

## Frontend Framework

| Item | Version |
|------|---------|
| React | ^18.3.1 |
| ReactDOM | ^18.3.1 |
| Tailwind CSS | ^4.0.0 (Vite plugin variant) |
| TypeScript | ^5.6.2 |

The frontend is a single-page admin UI (no router; tab-based navigation managed via React state). Entry point: `src/main.tsx`. ConvexProvider wraps the entire app, supplying the Convex client via `VITE_CONVEX_URL`.

---

## Backend / Database

| Item | Detail |
|------|--------|
| Backend platform | Convex (^1.17.0) |
| Database | Convex built-in document store |
| Schema file | `convex/schema.ts` |
| HTTP server | Convex HTTP router (`convex/http.ts`) |
| Scheduled jobs | Convex cron jobs (`convex/crons.ts`) |

### Convex Tables
- `offices` — top-level organizational unit (city + state)
- `locations` — sub-location within an office
- `services` — service types (e.g., pest control categories)
- `sources` — RSS feed source URLs with TTL, scope, and type metadata
- `static_items` — manually curated feed items attached to a source
- `feedItems` — fetched RSS items (articles, videos, documents)
- `feed_runs` — execution log for each aggregation run
- `settings` — key/value config store
- `generated_feeds` — pre-generated XML and HTML feed content stored in Convex (replaces R2 for feed delivery)

---

## Build Tools

| Tool | Version | Role |
|------|---------|------|
| Vite | ^6.0.5 | Dev server and production bundler for admin UI |
| @vitejs/plugin-react | ^4.3.4 | React fast-refresh and JSX transform |
| @tailwindcss/vite | ^4.0.0 | Tailwind v4 Vite plugin (replaces PostCSS config) |
| TypeScript compiler (tsc) | ^5.6.2 | Type checking; build command is `tsc -b && vite build` |
| Wrangler | ^3.40.0 | Cloudflare Worker build and deploy (in `workers/feed-server/`) |
| ESLint | (devDep, version in lock file) | Linting |

---

## Package Manager

npm (lockfile: `package-lock.json` present at root; also a separate `package-lock.json` in `workers/feed-server/`).

---

## Deployment Targets

### 1. Convex Cloud (primary backend + feed delivery)
- All backend logic, database, cron jobs, and HTTP feed endpoints live here.
- Feed files (XML + HTML) are generated and stored directly in the `generated_feeds` Convex table.
- HTTP endpoints served from `https://<deployment>.convex.site/feeds/{office}/{location}/{service}/feed.xml` and `/feed.html`.
- Deploy: `npx convex deploy`

### 2. Cloudflare Pages (admin UI)
- The Vite-built SPA (`dist/`) is deployed to Cloudflare Pages.
- Connects to Convex via `VITE_CONVEX_URL` environment variable set in the Pages project settings.
- See memory file `reference_cloudflare_deploy.md` for redeployment steps.

### 3. Cloudflare Worker + R2 (legacy / alternative)
- `workers/feed-server/` contains a Cloudflare Worker that serves feed files from a Cloudflare R2 bucket (`aaac-super-feeds`).
- `convex/lib/r2Client.ts` provides S3-compatible upload to R2 (AWS SDK v3).
- This path is currently superseded by storing feeds in Convex directly (see `generateFeed.ts` comment: "Store in Convex instead of R2").
- Custom domain route prepared but commented out: `feeds.aaacwildlife.com/*` on zone `aaacwildlife.com`.

---

## Key Dependencies with Versions

### Production (root `package.json`)
| Package | Version | Purpose |
|---------|---------|---------|
| convex | ^1.17.0 | Backend platform, DB client, React hooks |
| react | ^18.3.1 | UI framework |
| react-dom | ^18.3.1 | DOM rendering |
| rss-parser | ^3.13.0 | Parse RSS/Atom/YouTube feeds |
| @extractus/article-extractor | ^8.0.20 | Full-article content extraction from URLs |
| @aws-sdk/client-s3 | 3.726.0 | S3-compatible uploads to Cloudflare R2 |
| p-limit | ^7.3.0 | Concurrency limiter for parallel feed fetches |

### Dev (root)
| Package | Version | Purpose |
|---------|---------|---------|
| vite | ^6.0.5 | Build tool |
| @vitejs/plugin-react | ^4.3.4 | React Vite plugin |
| tailwindcss | ^4.0.0 | CSS framework |
| @tailwindcss/vite | ^4.0.0 | Tailwind Vite integration |
| typescript | ^5.6.2 | TypeScript compiler |
| @types/react | ^18.3.1 | React type definitions |
| @types/node | ^25.5.0 | Node.js type definitions |

### Worker (`workers/feed-server/package.json`)
| Package | Version | Purpose |
|---------|---------|---------|
| wrangler | ^3.40.0 | CF Worker dev and deploy |
| @cloudflare/workers-types | ^4.20240208.0 | CF Worker TypeScript types |
| typescript | ^5.4.0 | TypeScript compiler |
