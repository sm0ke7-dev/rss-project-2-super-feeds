# Codebase Structure — AAAC Super Feed

## Top-Level Directory Tree

```
rss-project-2-super-feed/
├── convex/                  # All backend logic (Convex serverless platform)
│   ├── _generated/          # Auto-generated API surface (do not edit)
│   ├── actions/             # Long-running Node.js actions (RSS fetch, generation)
│   ├── mutations/           # Database write functions
│   ├── queries/             # Database read functions
│   ├── lib/                 # Pure helper libraries (no Convex runtime dependency)
│   ├── schema.ts            # Full database schema definition
│   ├── crons.ts             # Cron job schedule definitions
│   ├── http.ts              # HTTP router (serves generated feeds to public)
│   ├── feedItems.ts         # Public + internal feed item utilities
│   ├── feedRuns.ts          # Public feed run query
│   ├── generatedFeeds.ts    # (legacy stub — feeds now stored in Convex DB)
│   ├── locations.ts         # Public location CRUD
│   ├── offices.ts           # Public office CRUD
│   ├── services.ts          # Public service CRUD
│   ├── sources.ts           # Public source CRUD
│   ├── static_items.ts      # Public static item CRUD
│   └── seed.ts              # One-time data seed helpers
│
├── src/                     # Frontend Admin SPA (Vite + React + TypeScript)
│   ├── components/          # Shared UI components
│   ├── pages/               # One file per admin tab/view
│   ├── App.tsx              # Root component, tab routing, drill-down state
│   ├── main.tsx             # Vite entry point, Convex provider setup
│   ├── index.css            # Global styles
│   └── vite-env.d.ts        # Vite type declarations
│
├── .planning/               # Planning docs and architecture notes (this folder)
├── .claude/                 # Claude Code settings and worktrees
├── .env.local.example       # Environment variable template
├── CLAUDE.md                # Claude Code project instructions
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## convex/ Subdirectory Breakdown

### convex/schema.ts

The single source of truth for the database. Defines all tables and indexes.

| Table | Purpose |
|---|---|
| `offices` | Top-level geographic groupings (city/state, slug, active flag) |
| `locations` | Sub-areas under an office (linked by `officeId`, has own slug) |
| `services` | Service types (e.g. "Squirrel Removal") — global, not tied to geography |
| `sources` | RSS/YouTube feed URLs with scope, type, TTL, and fetch state |
| `static_items` | Manually managed documents (PDFs etc.) included in all feeds |
| `feedItems` | Cached items fetched from sources; also holds extracted full content |
| `feed_runs` | Audit log of each aggregation run per (location × service) |
| `settings` | Key-value config store |
| `generated_feeds` | Stores final rendered XML and HTML for each feed combination |

Key compound indexes:
- `feedItems.by_location_service` — for collecting authority items
- `feedItems.by_schema_type` — for the content extraction batch query
- `generated_feeds.by_slugs` — for HTTP feed serving lookup

### convex/actions/

Convex "actions" run in a Node.js environment and can make external HTTP requests. All actions here are `internalAction` (not callable from the browser directly).

| File | Exports | Responsibility |
|---|---|---|
| `aggregation.ts` | `aggregateFeed`, `runAggregationCycle`, `runFullRefresh` | Orchestrates an entire feed pipeline run; manages concurrency with `pLimit` |
| `fetchSource.ts` | `fetchRssSource` | Parses a single RSS/YouTube URL using `rss-parser`; upserts items via mutation |
| `extractContent.ts` | `extractContentBatch`, `extractSingleArticle` | Full-text extraction from article URLs using `@extractus/article-extractor` |
| `generateFeed.ts` | `generateFeedFiles` | Assembles final XML + HTML for one feed combination; pings WebSub hub |

### convex/mutations/

Convex mutations are transactional database writes, called from actions or the frontend.

| File | Exports | Responsibility |
|---|---|---|
| `sources.ts` | `storeFeedItems`, `markFetchSuccess`, `updateItemContent`, `markFetchError` | All write paths for the fetch pipeline (upsert items, update fetch timestamps, store extracted content) |
| `feedRuns.ts` | `createFeedRun`, `updateFeedRun` | Create and update `feed_runs` records |
| `generatedFeeds.ts` | `upsertFeed` | Insert or update a `generated_feeds` record by (officeSlug, locationSlug, serviceSlug) |
| `admin.ts` | `triggerFeed`, `triggerAllFeeds`, `triggerFullRefresh` | Public mutations called from the Admin UI to schedule immediate feed runs via `ctx.scheduler.runAfter` |

### convex/queries/

Convex queries are read-only, reactive, and cached.

| File | Exports | Responsibility |
|---|---|---|
| `sources.ts` | `getSourcesForFeed`, `getSourceById`, `listSources` | 6-scope source resolution with optional TTL filtering; single-source lookup |
| `feedItems.ts` | `getItemsNeedingContent`, `getFeedItemsForOfficeService` | Fetch items pending content extraction; assemble all items for a feed (all scopes + static items) |
| `feeds.ts` | `getAllFeedCombinations` | Returns the full active location × service cartesian product |
| `generatedFeeds.ts` | `getBySlug` | Look up a stored feed by its three-part slug (used by HTTP router) |
| `offices.ts` | `getById`, others | Office lookups |
| `locations.ts` | `getById`, others | Location lookups |
| `services.ts` | `getById`, others | Service lookups |

### convex/lib/

Pure helper functions with no Convex runtime dependency. Importable from any action, mutation, or query.

| File | Responsibility |
|---|---|
| `generateRss.ts` | Builds RSS 2.0 XML string. Defines `FeedItem` and `FeedMeta` interfaces. Handles `media:thumbnail` and `content:encoded` extensions. |
| `generateHtml.ts` | Builds full self-contained HTML page string for a feed. Includes inline CSS, YouTube embeds, and JSON-LD blocks. |
| `generateJsonLd.ts` | Builds Schema.org JSON-LD objects for each item type: `VideoObject`, `Article`, `DigitalDocument`. Defines `FeedPageItem` interface. |
| `retry.ts` | `withRetry(fn, maxAttempts, baseDelayMs)` — retries async functions on network-level errors with linear back-off. |
| `webSub.ts` | `pingWebSubHub(hubUrl, topicUrl)` — notifies pubsubhubbub.appspot.com of a feed update. Best-effort, non-fatal. |
| `env.ts` | Environment variable helpers. |
| `r2Client.ts` | Legacy Cloudflare R2 client (feed storage was migrated to Convex DB; this file is retained but not used in the active pipeline). |

### convex/crons.ts

Defines two scheduled jobs:
- `aggregate-all-feeds`: every 30 minutes, calls `runAggregationCycle` (TTL-filtered)
- `daily-full-refresh`: daily at 02:00 UTC, calls `runFullRefresh` (ignores TTL)

### convex/http.ts

Defines the public HTTP router. One GET route: `/feeds/{office}/{location}/{service}/{feed.xml|feed.html}`. Matched by regex, served from `generated_feeds` table. Includes CORS headers (`Access-Control-Allow-Origin: *`) and OPTIONS preflight handler.

### convex/ root-level files (public CRUD modules)

These expose the standard public API consumed by the Admin UI:

| File | Exports | Notes |
|---|---|---|
| `offices.ts` | `list`, `create`, `update`, `remove` | Office CRUD |
| `locations.ts` | `list`, `create`, `update`, `remove` | Location CRUD |
| `services.ts` | `list`, `create`, `update`, `remove` | Service CRUD |
| `sources.ts` | `list`, `create`, `update`, `remove` | Source CRUD; `remove` cascades to delete child `feedItems` |
| `static_items.ts` | `list`, `create`, `update`, `remove` | Static item CRUD |
| `feedItems.ts` | `purgeOrphaned`, `count`, `findByTitle`, `listAll`, `resetContentExtraction`, `purgeBySource`, `seedDocuments`, `debugContentState` | Admin utilities and internal mutation helpers |
| `feedRuns.ts` | `list`, `getRecent` | Feed run history queries |
| `generatedFeeds.ts` | `list` | Lists all generated feeds |
| `seed.ts` | Seed helpers | One-time data seeding |

---

## convex/_generated/ — Generated Files (Do Not Edit)

Auto-generated by `npx convex dev`. Regenerated whenever backend source files change.

| File | Purpose |
|---|---|
| `api.d.ts` | TypeScript declaration of the full API surface (`api.*` public, `internal.*` internal). This is the authoritative map of all callable functions. |
| `api.js` | Runtime implementation of the API reference object |
| `dataModel.d.ts` | TypeScript types inferred from `schema.ts` — used throughout backend and frontend |
| `server.d.ts` | Type declarations for Convex server helpers (`query`, `mutation`, `action`, etc.) |
| `server.js` | Runtime implementation |

These files are checked into source control. They represent the contract between the frontend and backend.

---

## src/ Subdirectory Breakdown

### src/App.tsx

Root component. Manages:
- Active tab state (`TabId`)
- Drill-down navigation state (`selectedOfficeId`, `selectedLocationId`)
- Renders the `DashboardPage`, `OfficeDetailPage`, or `LocationDetailPage` depending on drill-down depth
- All other tabs render their page components directly

### src/pages/

One file per admin tab. Each page is a self-contained React component that calls Convex queries/mutations directly via the Convex React hooks.

| File | Tab | Description |
|---|---|---|
| `DashboardPage.tsx` | Dashboard (root) | Overview of all offices; entry point for drill-down |
| `OfficeDetailPage.tsx` | Dashboard drill-down | Lists locations under a selected office |
| `LocationDetailPage.tsx` | Dashboard drill-down | Shows feed run history and feed links for a location |
| `OfficesPage.tsx` | Offices | CRUD for offices |
| `LocationsPage.tsx` | Locations | CRUD for locations |
| `ServicesPage.tsx` | Services | CRUD for services |
| `StaticItemsPage.tsx` | Static Items | CRUD for static documents |
| `SourcesPage.tsx` | Sources | CRUD for RSS sources with scope/type selectors |
| `FeedRunsPage.tsx` | Feed Runs | Recent aggregation run history |
| `FeedBrowserPage.tsx` | Feed Browser | Browse and preview generated feeds; access XML/HTML URLs |
| `ManualTriggerPage.tsx` | Trigger | Buttons to trigger single feed, all feeds, or full refresh |

### src/components/

| File | Description |
|---|---|
| `Layout.tsx` | Page shell wrapper |
| `TabNav.tsx` | Top navigation bar; defines the `TabId` union type |
| `Badge.tsx` | Reusable status badge component |

---

## Generated Files vs Source Files

### Generated (do not edit manually)
- `convex/_generated/api.d.ts` — regenerated by `npx convex dev`
- `convex/_generated/api.js`
- `convex/_generated/dataModel.d.ts`
- `convex/_generated/server.d.ts`
- `convex/_generated/server.js`
- `tsconfig.tsbuildinfo` — TypeScript incremental build cache

### Source files (edit these)
- Everything in `convex/` outside of `_generated/`
- Everything in `src/`
- `convex/schema.ts` — changing this regenerates `dataModel.d.ts`

### Notes on the legacy r2Client.ts

`convex/lib/r2Client.ts` is a source file retained from a previous architecture where generated feeds were stored in Cloudflare R2. The current pipeline stores XML/HTML directly in the Convex `generated_feeds` table and serves them via the HTTP router. The R2 client is not called anywhere in the active code path but has been kept in case the storage backend is changed again.
