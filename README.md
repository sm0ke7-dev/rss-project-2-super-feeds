# RSS Super Feed

An RSS aggregation platform that collects feeds from multiple sources, enriches them with full-text content extraction, and generates combined RSS/HTML feeds per location×service combination. Built for **AAAC Wildlife** franchise operations.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18 + TypeScript 5.6 + Tailwind CSS 4 + Vite 6 |
| **Backend** | Convex (serverless DB + functions + HTTP + crons) |
| **Hosting (UI)** | Cloudflare Pages |
| **Feed Delivery** | Convex HTTP Router (serves XML/HTML from DB) |
| **Legacy** | Cloudflare Worker + R2 (retained, not active) |

## Architecture

```
[Cloudflare Pages — Admin SPA]
         ↕ Convex SDK
[Convex Platform — DB + Actions + Crons + HTTP]
         ↕ RSS fetch / article extraction
[External RSS/YouTube Sources]
         ↓
[Public Feed Consumers — GET /feeds/{office}/{location}/{service}/feed.xml]
```

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Initialize Convex (first time only):
   ```bash
   npx convex dev
   ```
   Follow the prompts to create a Convex project. This creates `.env.local` with `VITE_CONVEX_URL`.

3. Start development:
   ```bash
   npm run dev
   ```
   In a separate terminal, keep Convex running:
   ```bash
   npx convex dev
   ```

4. Seed the database:
   ```bash
   npx convex run seed:seed
   ```

## Directory Structure

```
├── src/                          # React Admin SPA
│   ├── App.tsx                   # Root: tab routing + drill-down state
│   ├── main.tsx                  # Entry point, ConvexProvider
│   ├── index.css                 # Global styles
│   ├── pages/                    # One file per admin view (11 pages)
│   │   ├── DashboardPage.tsx     # Office overview + drill-down
│   │   ├── OfficeDetailPage.tsx  # Locations under an office
│   │   ├── LocationDetailPage.tsx # Feed runs + links for a location
│   │   ├── OfficesPage.tsx       # CRUD offices
│   │   ├── LocationsPage.tsx     # CRUD locations
│   │   ├── ServicesPage.tsx      # CRUD services
│   │   ├── SourcesPage.tsx       # CRUD RSS sources (scope/type)
│   │   ├── StaticItemsPage.tsx   # CRUD static documents
│   │   ├── FeedRunsPage.tsx      # Aggregation run history
│   │   ├── FeedBrowserPage.tsx   # Preview generated feeds
│   │   └── ManualTriggerPage.tsx # Trigger feed runs manually
│   └── components/               # Layout, TabNav, Badge
│
├── convex/                       # Backend (Convex serverless)
│   ├── schema.ts                 # DB schema (9 tables)
│   ├── crons.ts                  # 30-min cycle + daily 2AM refresh
│   ├── http.ts                   # Public feed HTTP router
│   ├── actions/                  # Pipeline steps (Node.js runtime)
│   │   ├── aggregation.ts        # Orchestrator: feed matrix iteration
│   │   ├── fetchSource.ts        # RSS/YouTube parsing (rss-parser)
│   │   ├── extractContent.ts     # Full-text extraction (article-extractor)
│   │   └── generateFeed.ts       # XML + HTML generation + WebSub ping
│   ├── mutations/                # DB writes (internal)
│   │   ├── sources.ts            # storeFeedItems, markFetchError, etc.
│   │   ├── feedRuns.ts           # create/update feed_runs
│   │   ├── generatedFeeds.ts     # upsertFeed
│   │   └── admin.ts              # triggerFeed, triggerAllFeeds
│   ├── queries/                  # DB reads (internal)
│   │   ├── sources.ts            # 6-scope source resolution
│   │   ├── feedItems.ts          # Feed item assembly (all scopes + static)
│   │   ├── feeds.ts              # getAllFeedCombinations (location×service)
│   │   ├── generatedFeeds.ts     # getBySlug (for HTTP serving)
│   │   └── offices/locations/services.ts
│   ├── lib/                      # Pure helpers (no Convex runtime)
│   │   ├── generateRss.ts        # RSS 2.0 XML builder
│   │   ├── generateHtml.ts       # HTML page builder + JSON-LD
│   │   ├── generateJsonLd.ts     # Schema.org structured data
│   │   ├── retry.ts              # Network retry with backoff
│   │   ├── webSub.ts             # PubSubHubbub ping
│   │   ├── env.ts                # requireEnv helper
│   │   └── r2Client.ts           # Legacy R2 client (unused)
│   ├── offices.ts / locations.ts / services.ts / sources.ts / static_items.ts
│   │                             # Public CRUD (called by Admin UI)
│   ├── feedItems.ts / feedRuns.ts / generatedFeeds.ts / seed.ts
│   └── _generated/               # Auto-generated (do not edit)
│
├── workers/feed-server/          # Legacy Cloudflare Worker (R2 path)
├── .planning/codebase/           # Architecture docs (7 files)
├── modes/                        # Mode configs (coding + writing clients)
├── tasks/                        # todo.md + lessons.md
└── functions/_middleware.ts       # Cloudflare Pages middleware
```

## Database Schema (9 tables)

| Table | Purpose | Key Indexes |
|-------|---------|-------------|
| `offices` | Franchise regions (city/state/slug) | `by_slug`, `by_active` |
| `locations` | Sub-areas under office | `by_office`, `by_slug` |
| `services` | Global service types | `by_slug`, `by_active` |
| `sources` | RSS/YouTube URLs + scope/type/TTL | `by_scope`, `by_type`, `by_office`, `by_service`, `by_location` |
| `static_items` | Manual docs (PDFs) | `by_source`, `by_type` |
| `feedItems` | Cached RSS items + extracted content | `by_source`, `by_guid`, `by_location_service`, `by_schema_type` |
| `feed_runs` | Aggregation audit log | `by_location_service`, `by_status` |
| `generated_feeds` | Stored XML + HTML output | `by_slugs` |
| `settings` | Key-value config | `by_key` |

## Core Data Model: 6-Scope Source Resolution

```
global → service → office → office-service → location → location-service
(broadest)                                              (most specific)
```

All scopes are merged (not overridden) for each feed. Sources have 3 types: `brand`, `authority` (manual-only), `freshness`.

## Pipeline Flow

1. **Cron** (30min / daily) → `runAggregationCycle`
2. **Matrix** → cartesian product of active locations × services
3. **Resolve** → 6-scope source query (parallel)
4. **Fetch** → rss-parser (3 concurrent per feed, 3 retries)
5. **Extract** → article-extractor (2 concurrent, 10/batch cap)
6. **Generate** → RSS XML + HTML w/ JSON-LD → `generated_feeds` table
7. **Serve** → Convex HTTP router at `/feeds/{office}/{location}/{service}/feed.xml`

## Key Patterns

- **No auth** on admin UI (internal tool)
- **No router** — tab navigation via React state in `App.tsx`
- **Fat page components** — each page owns its data fetching
- **All actions are `internalAction`** — UI only calls public mutations/queries
- **Mutations schedule actions** via `ctx.scheduler.runAfter(0, ...)`
- **Promise.allSettled** for failure isolation
- **p-limit** for concurrency control (3/5/2 caps)
- **Upsert by guid** (insert-only, append-friendly)
- Timestamps as Unix ms with `At` suffix
- Tailwind utility classes only (no custom CSS)
