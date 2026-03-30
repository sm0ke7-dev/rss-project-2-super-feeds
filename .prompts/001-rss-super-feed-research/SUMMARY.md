# RSS Super Feed Research — Summary

## Research Completeness

Research across all five areas is complete. All Convex, Cloudflare (R2 + Workers + Pages), RSS/Atom parsing, Schema.org structured data, and concurrency patterns have been investigated with working code examples gathered from primary sources (official documentation, GitHub READMEs, live feed inspection). The research document contains enough detail for a planning agent to produce file-level implementation tasks with specific package versions, API signatures, wrangler.toml configurations, and architectural patterns. One open question requiring a product decision was identified (YouTube duration data via Data API v3).

---

## Key Findings Per Area

### Area 1: Convex Backend Patterns
- Actions (with `"use node"`) are the correct primitive for all external HTTP calls and R2 writes. They call `ctx.runMutation()` to persist results — they do NOT have direct DB access.
- Cron jobs live in `convex/crons.ts` using `cronJobs()`. Supports interval, cron-string, daily, weekly, monthly schedules. If execution exceeds the interval, subsequent runs are skipped — design aggregation as fan-out.
- Environment variables are accessed via `process.env.KEY` and set via `npx convex env set`. Max 100 vars, 8KB each. R2 credentials go here.

### Area 2: Cloudflare Integration
- R2 is fully S3-compatible for PutObject/GetObject/DeleteObject using `@aws-sdk/client-s3` with `region: "auto"` and endpoint `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`.
- The Cloudflare Worker uses a native R2 binding (`env.FEED_BUCKET.get(key)`) to serve static feed files — no credentials needed, and `object.writeHttpMetadata(headers)` correctly propagates Content-Type.
- Cloudflare Pages deploys Vite+React with build command `npm run build` and output directory `dist`. Auto-deploys on git push.

### Area 3: RSS/Atom Feed Handling
- `rss-parser` handles both RSS 2.0 and Atom, normalizes output, and supports YouTube's `yt:` and `media:` namespaces via `customFields`. It is the right library for this project.
- YouTube Atom feeds expose: `yt:videoId`, `yt:channelId`, `media:thumbnail`, `media:description`, `media:statistics` (views), `published`, `updated` — but NOT duration (requires YouTube Data API v3).
- RSS 2.0 output is best generated via template literals with `<![CDATA[]]>` wrapping and a manual `escapeXml()` helper. WebSub ping is a simple `application/x-www-form-urlencoded` POST.

### Area 4: Schema.org Structured Data
- Google requires exactly three fields for VideoObject rich results: `name`, `thumbnailUrl`, `uploadDate`. Include `embedUrl`/`contentUrl` and `description` as strongly recommended.
- Multiple `<script type="application/ld+json">` blocks per HTML page are valid — one per item is the simplest approach and avoids building a `@graph` array.
- DigitalDocument and Article have no Google-mandated required fields, but `name/headline`, `url`, `datePublished`, and `author` should always be populated.

### Area 5: Concurrency & Error Handling
- `p-limit(3)` + `Promise.allSettled()` is the canonical pattern: wraps each source fetch in `limit()`, gathers all results, logs failures without aborting the batch.
- TTL caching: store `lastFetchedAt` (Unix ms) on each source; skip if `Date.now() - lastFetchedAt < ttlMs`. Recommended TTLs: YouTube 30–60 min, freshness feeds 1–4 hrs, authority PDFs 24 hrs.
- Fan-out architecture (cron → per-feed actions) is safer than one mega-action. Each per-feed action is small enough to complete well within the 10-minute limit.

---

## Critical Gotchas / Blockers

1. **`@aws-sdk/client-s3` v3.729.0 regression**: This version breaks PutObject and UploadPart against R2. Pin to `3.726.0` or verify current version is safe before installing.

2. **S3 SDK does not work with `wrangler dev`**: Local Worker development cannot use the S3 SDK against real R2. This only affects if someone tries to test R2 writes from a Worker locally — not an issue since R2 writes happen from Convex actions, not the Worker.

3. **`"use node"` file isolation in Convex**: Any file using `"use node"` cannot also export queries or mutations. Actions that use `rss-parser`, `p-limit`, or `@aws-sdk/client-s3` must be in dedicated action files.

4. **p-limit is ESM-only (v5+)**: Must use `import` syntax. Works correctly in Convex Node.js actions but would break any CJS context.

5. **Deadlock risk with nested p-limit**: Never call the fan-out limiter and the per-source limiter through the same `limit` instance. Use separate `pLimit()` instances for outer (feed-level) and inner (source-level) concurrency.

6. **YouTube Atom feed missing `duration`**: The free Atom feed does not include video duration. VideoObject JSON-LD can omit it, but if it's wanted for Google rich results completeness, a YouTube Data API v3 integration is required (separate API key + quota).

7. **Convex cron skip behavior**: If a cron-scheduled action is still running when the next interval fires, the next run is skipped entirely. Design the aggregation cycle to complete in under 25 minutes for a 30-minute interval.

8. **R2 has no ACLs**: Any `@aws-sdk/client-s3` options related to ACLs (`x-amz-acl`, `ACL: 'public-read'`) will be silently ignored or cause errors. The Worker binding handles access control.

---

## Confidence Levels

| Area | Confidence | Notes |
|------|-----------|-------|
| Area 1: Convex Backend | **High** | Official docs verified, complete code patterns confirmed |
| Area 2: Cloudflare Integration | **High** | R2 S3 API, Workers binding, Pages all verified from official docs |
| Area 3: RSS/Atom Feed Handling | **High** | Live YouTube feed inspected; rss-parser README verified in full |
| Area 4: Schema.org Structured Data | **High** | Schema.org pages and Google's VideoObject requirements verified |
| Area 5: Concurrency & Error Handling | **High** | p-limit README verified; Convex limits confirmed from official docs |

---

## Recommended Next Steps for Planning Phase

1. **Define the data model in detail**: Produce the full `convex/schema.ts` with all tables (offices, services, sources, feedItems, feedRuns), indexes, and validator types. The research doc has a starter schema.

2. **Plan the Convex action tree**: Map out `aggregation.ts` → `fetchSource.ts` → `generateFeed.ts` as three separate action files, each with `"use node"`. Define what internal mutations each calls.

3. **Decide on YouTube duration**: Determine whether to integrate YouTube Data API v3 for `duration` field or omit it. This affects whether an API key is needed and whether another env var and fetch call are required.

4. **Design the source resolution query**: Write the Convex query that gathers all applicable sources for a given `officeId × serviceId` pair across all 4 scopes, deduplicates by URL, and filters to stale-only sources.

5. **Scaffold the Workers feed-server**: Create `workers/feed-server/` with `wrangler.toml`, TypeScript config, and the URL-pattern-matching handler. Set up R2 bucket in Cloudflare dashboard and bind it.

6. **Scaffold the admin UI**: Create `admin/` as a Vite+React app with Convex client configured. Implement read-only views first (list offices, sources, recent feed runs) using `useQuery`.

7. **Set up Convex environment variables**: Before any integration testing, set all R2 credentials in Convex env: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`.

8. **Version-pin packages from day one**: Lock `@aws-sdk/client-s3` to `3.726.0` in `package.json`. Prevents accidental upgrade to the v3.729.0 regression.

---

## Output Files Created

| File | Description |
|------|-------------|
| `.prompts/001-rss-super-feed-research/rss-super-feed-research.md` | Full research findings with code examples for all 5 areas |
| `.prompts/001-rss-super-feed-research/SUMMARY.md` | This file — executive summary for the planning phase |
