# Phase 1 — Execution Summary

## Status: COMPLETE
## Date: 2026-03-19

---

## Files Created

### Project Root
- `package.json` — Vite + React 18 + TypeScript + Tailwind CSS v4 + Convex dependencies
- `vite.config.ts` — Vite config with `@vitejs/plugin-react` and `@tailwindcss/vite` plugins
- `tsconfig.json` — TypeScript config (ES2020, bundler module resolution, strict, includes `src` and `convex`)
- `tsconfig.node.json` — Node-specific TS config for `vite.config.ts`
- `index.html` — HTML entry point pointing to `src/main.tsx`
- `.env.local.example` — Template for `VITE_CONVEX_URL` environment variable
- `README.md` — Setup and project structure documentation (overwrote template README)

### src/ (React Admin UI)
- `src/index.css` — Tailwind CSS v4 import (`@import "tailwindcss"`)
- `src/main.tsx` — App entry: `ConvexProvider` wrapping `<App />`, reads `VITE_CONVEX_URL`
- `src/App.tsx` — Minimal admin UI: lists offices from `api.offices.list` with active status badges

### convex/ (Convex Backend)
- `convex/schema.ts` — Full schema with 6 tables: `offices`, `services`, `sources`, `static_items`, `feed_runs`, `settings`
- `convex/offices.ts` — `list` query: returns all offices ordered by active status
- `convex/services.ts` — `list` query: returns all services ordered by active status
- `convex/seed.ts` — `seed` internal mutation: idempotent seed with 5 offices, 4 services, 5 sources, 2 static items, 3 settings

---

## Schema Details

### Tables and Indexes

| Table | Key Fields | Indexes |
|---|---|---|
| `offices` | name, slug, city, state, active | by_slug, by_active |
| `services` | name, slug, description, active | by_slug, by_active |
| `sources` | url, title, type, scope, officeId?, serviceId?, ttlMinutes, active, lastFetchedAt?, lastFetchError? | by_scope, by_type, by_active, by_office, by_service |
| `static_items` | title, url, description, type, sourceId, publishedAt | by_source, by_type |
| `feed_runs` | officeId, serviceId, status, itemCount?, error?, startedAt, completedAt? | by_office_service, by_status |
| `settings` | key, value | by_key |

### Type Enums (as `v.union(v.literal(...))`)
- `sources.type`: `"brand"` | `"authority"` | `"freshness"`
- `sources.scope`: `"global"` | `"service"` | `"office"` | `"office-service"`
- `feed_runs.status`: `"running"` | `"success"` | `"error"`

### Deviations from Plan

1. **`lastFetchError` added to schema early** — The plan adds this field in Phase 2, but it was included in Phase 1's schema to avoid a schema migration later. No functional impact.

2. **Flat `convex/` structure used instead of `convex/queries/` and `convex/mutations/` subdirs** — The prompt specified `convex/offices.ts` and `convex/services.ts` at the top level. The plan's subdirectory structure (`convex/queries/offices.ts`) will be adopted from Phase 2 onward when the full query/mutation set is built.

3. **`seed.ts` at `convex/seed.ts`** (not `convex/mutations/seed.ts`) — The prompt specified this path explicitly. The run command is `npx convex run seed:seed`.

4. **`static_items` table named with underscore** — The schema uses `static_items` (matching the plan's intent for static/authority items). The plan called this `feedItems` in later phases — reconciliation needed in Phase 2 when `feedItems` is added as a separate table for fetched items.

---

## Seed Data

### Offices (5)
- Atlanta, GA
- Nashville, TN
- Dallas, TX
- Charlotte, NC
- Indianapolis, IN

### Services (4)
- Wildlife Removal
- Raccoon Removal
- Squirrel Removal
- Bat Removal

### Sources (5 — one per scope type)
| Scope | Type | URL |
|---|---|---|
| global | brand | AAAC YouTube channel |
| global | freshness | NWF News feed |
| service (wildlife-removal) | authority | USDA Wildlife Damage |
| office (atlanta) | freshness | Georgia Wildlife Resources |
| office-service (atlanta + wildlife-removal) | brand | AAAC Atlanta YouTube |

### Static Items (2)
- USDA authority item (linked to service authority source)
- AAAC About page brand item (linked to global brand source)

### Settings (3)
- `feedTitle`, `defaultTtlMinutes`, `websubHub`

---

## Manual Steps Required Before Development

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Initialize Convex** (creates `.env.local` with `VITE_CONVEX_URL`):
   ```bash
   npx convex dev
   ```
   Follow the CLI prompts to create or link a Convex project.

3. **Run the seed**:
   ```bash
   npx convex run seed:seed
   ```

4. **Start the dev server** (two terminals):
   ```bash
   # Terminal 1
   npx convex dev
   # Terminal 2
   npm run dev
   ```

---

## Ready for Phase 2: YES

### What Phase 2 needs from Phase 1
- Schema deployed and verified (no errors on `npx convex dev`)
- Seed data present in Convex DB (offices and services have real IDs)
- `convex/_generated/` folder created by Convex CLI (needed for typed API)

### Phase 2 build targets
- `convex/actions/fetchSource.ts` — RSS parser action (`"use node"`)
- `convex/actions/aggregation.ts` — fan-out orchestration
- `convex/queries/sources.ts` — 4-scope resolution with TTL filtering
- `convex/queries/feeds.ts` — office×service combination query
- `convex/mutations/sources.ts` — `storeFeedItems`, `markFetchError`
- `convex/mutations/feedRuns.ts` — `createFeedRun`, `updateFeedRun`
- `convex/lib/r2Client.ts` — R2 S3 client utility (`"use node"`)
- Schema update: add `feedItems` table (for fetched RSS items, separate from `static_items`)

### Notes for Phase 2
- The `static_items` table holds manually curated authority/brand items
- Phase 2 needs a new `feedItems` table for dynamically fetched RSS items (different schema — needs `guid`, `videoId`, `channelId`, `thumbnailUrl`, `schemaType`, etc.)
- `officeId` and `serviceId` on `feedItems` will be needed for authority items without a `sourceId`
- Use exact `@aws-sdk/client-s3` version `3.726.0` (pinned — see research Risk 1)
- Two `pLimit` instances: `feedLimit = pLimit(5)` outer, `sourceLimit = pLimit(3)` inner — never nested
