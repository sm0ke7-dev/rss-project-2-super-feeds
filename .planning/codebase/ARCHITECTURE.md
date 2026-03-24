# Architecture — AAAC Super Feed

## High-Level System Overview

The system is a managed RSS aggregation platform with three main layers:

1. **Admin UI** — React SPA (Vite + TypeScript), deployed to Cloudflare Pages. Used exclusively for configuration and monitoring. No public-facing traffic.
2. **Convex Backend** — Serverless database + functions platform. Hosts all business logic (cron jobs, RSS fetching, content extraction, feed generation) and persists all data.
3. **HTTP Feed Endpoints** — Convex's built-in HTTP router serves generated feeds at `/feeds/{officeSlug}/{locationSlug}/{serviceSlug}/feed.xml` and `feed.html`. No separate server or CDN layer is required; feeds are served directly from Convex with a `Cache-Control: public, max-age=1800` header.

```
[Cloudflare Pages]          [External RSS Sources]
     Admin SPA          →       RSS / YouTube feeds
        |                              |
        | Convex Client SDK            | HTTP fetch (rss-parser)
        ↓                              ↓
   [Convex Platform]  ←───────────────┘
   ┌─────────────────────────────────────────────────────┐
   │  Cron Scheduler  →  Actions  →  Mutations/Queries   │
   │  HTTP Router     →  Queries  →  DB Read             │
   │  Database (tables: offices, locations, services,    │
   │    sources, feedItems, static_items, feed_runs,     │
   │    settings, generated_feeds)                       │
   └─────────────────────────────────────────────────────┘
        ↓
   Public Feed Consumers (RSS readers, search crawlers, etc.)
   GET /feeds/{office}/{location}/{service}/feed.xml
   GET /feeds/{office}/{location}/{service}/feed.html
```

---

## Data Flow: End-to-End Pipeline

### Step 1 — Configuration (via Admin UI)

An operator creates:
- **Offices** (e.g. "Atlanta") with a slug and city/state
- **Locations** (sub-areas under an office, e.g. "Marietta GA") linked to an office by `officeId`
- **Services** (e.g. "Squirrel Removal") globally defined
- **Sources** — RSS/YouTube feed URLs, each tagged with a `type` (brand/authority/freshness) and a `scope` (see below)
- **Static Items** — manually entered documents (PDFs etc.) that appear in all feeds

### Step 2 — Feed Combination Matrix

`queries/feeds.ts::getAllFeedCombinations` computes the full cartesian product of `activeLocations × activeServices`. Each combination `(officeId, locationId, serviceId)` is one feed unit. This is the set that cron jobs iterate over.

### Step 3 — Aggregation Trigger

Either automatically via cron, or manually via the Admin UI trigger page.

**Cron schedule:**
- Every 30 minutes: `runAggregationCycle` — fetches sources that have exceeded their TTL
- Daily at 2:00 UTC: `runFullRefresh` — ignores TTL, forces all sources to re-fetch

Both call `aggregateFeed` for each combination, with up to 5 concurrent feed aggregations (`pLimit(5)`).

### Step 4 — Source Resolution (6-Scope System)

For each feed combination, `queries/sources.ts::getSourcesForFeed` resolves all applicable sources across six scopes simultaneously:

| Scope | Key fields used | Description |
|---|---|---|
| `global` | (none) | Applies to every feed, every location, every service |
| `service` | `serviceId` | Applies to all locations for a given service |
| `office` | `officeId` | Applies to all locations under a given office |
| `office-service` | `officeId` + `serviceId` | An office-specific override for one service |
| `location` | `locationId` | Applies to a specific location, all services |
| `location-service` | `locationId` + `serviceId` | Most specific: one location + one service |

All six scope queries run in parallel. Results are merged and deduplicated by URL. If `staleOnly: true` (normal cycle), only sources where `now - lastFetchedAt > ttlMinutes * 60000` are returned.

**Important:** `authority`-type sources are excluded from the fetch pipeline. Authority items are expected to be inserted via `feedItems.seedDocuments` or created as `static_items`.

### Step 5 — RSS Fetching

`actions/fetchSource.ts::fetchRssSource` handles each source:

- Detects YouTube URLs via `url.includes("youtube.com/feeds")` and uses a custom parser with `yt:videoId`, `yt:channelId`, and `media:group` fields — items get `schemaType: "VideoObject"`
- All other URLs use a generic parser — items get `schemaType: "Article"`
- Retries up to 3 times on network-level errors (ECONNRESET, timeout, fetch failed) with linear back-off (500ms, 1000ms, 1500ms)
- On success: calls `mutations/sources.ts::storeFeedItems` — upserts items by `guid` (skips duplicates), updates `lastFetchedAt`
- On failure: calls `mutations/sources.ts::markFetchError` — records the error string in `lastFetchError`, still updates `lastFetchedAt` to avoid immediate retry

Up to 3 sources are fetched concurrently per feed run (`pLimit(3)`).

### Step 6 — Content Extraction

After all sources are fetched, `actions/extractContent.ts::extractContentBatch` runs:

1. Queries up to 10 `Article`-type feed items where `contentExtractedAt` is unset
2. For each item, calls `extractSingleArticle`:
   - Skips YouTube URLs and PDF URLs (marks them as processed with `fullContent: undefined`)
   - Uses `@extractus/article-extractor` to fetch and parse the full article text
   - Strips HTML tags, trims to 10,000 characters
   - Stores result in `feedItems.fullContent`, sets `feedItems.contentExtractedAt = Date.now()`
   - On failure: leaves `contentExtractedAt` unset so the item is retried next cycle
3. Maximum 2 concurrent extractions (`pLimit(2)`)
4. This step is non-blocking — failure does not abort the feed run

### Step 7 — Feed Item Assembly

`queries/feedItems.ts::getFeedItemsForOfficeService` gathers items for a feed:

1. Resolves all 6 scopes of applicable sources (same logic as Step 4)
2. Collects all `feedItems` belonging to those sources via `by_source` index
3. Also collects any `feedItems` directly scoped to the `(locationId, serviceId)` pair via `by_location_service` index — these are authority items
4. Fetches all `static_items` (treated as `DigitalDocument`) — these are global across all feeds
5. Deduplicates by `guid`, keeping the entry with the most recent `isoDate`
6. Sorts descending by `isoDate`, caps at **50 items**

### Step 8 — Feed File Generation

`actions/generateFeed.ts::generateFeedFiles`:

1. Looks up office/location/service names by ID
2. Builds a `sourceId → title` map for labelling items
3. Calls `lib/generateRss.ts::generateRss2` → produces RSS 2.0 XML with:
   - Atom self-link
   - `media:thumbnail` for videos
   - `content:encoded` for articles with extracted full content
4. Calls `lib/generateHtml.ts::generateFeedHtml` → produces a self-contained HTML page with:
   - Per-item JSON-LD structured data (`VideoObject`, `Article`, or `DigitalDocument` from `lib/generateJsonLd.ts`)
   - YouTube iframe embeds for video items
   - Inline CSS (no external dependencies)
   - `<meta name="robots" content="noindex">` (not intended for direct indexing)
5. Upserts the XML and HTML strings to `generated_feeds` table via `mutations/generatedFeeds.ts::upsertFeed`
6. Pings the WebSub hub at `https://pubsubhubbub.appspot.com/` with the feed URL (best-effort, non-fatal)

### Step 9 — Feed Serving

`http.ts` defines a Convex HTTP router. Requests to `/feeds/{office}/{location}/{service}/feed.xml` or `feed.html` are matched by regex, the feed is read from `generated_feeds` via `queries/generatedFeeds.ts::getBySlug`, and returned with appropriate `Content-Type` and CORS headers.

---

## The 6-Scope Source Resolution System

This is the core mechanism that gives the system its flexibility. A single source can be shared across many feeds (global/service/office scope) or pinned to a very specific context (location-service scope). The system always applies all applicable scopes for a feed — there is no priority or override; all matching sources are included (subject to deduplication by URL).

```
Breadth                                    Specificity
<----------------------------------------->
global  service  office  office-  location  location-
                         service            service
```

Scope fields required on the `sources` table:

| Scope | `officeId` | `serviceId` | `locationId` |
|---|---|---|---|
| `global` | — | — | — |
| `service` | — | required | — |
| `office` | required | — | — |
| `office-service` | required | required | — |
| `location` | — | — | required |
| `location-service` | — | required | required |

---

## Feed Matrix (Location × Service Cartesian Product)

Every active location is paired with every active service to produce a distinct feed. If there are 20 locations and 5 services, 100 feeds exist. Each has its own URL, its own `generated_feeds` record, and its own `feed_runs` history.

Feed URL pattern: `/feeds/{officeSlug}/{locationSlug}/{serviceSlug}/feed.xml`

The matrix is recomputed on each aggregation cycle — adding or activating a location/service automatically expands it; deactivating one stops updates to affected feeds.

---

## Content Extraction Pipeline

The extraction pipeline runs after every batch of RSS fetches. It is designed to be:
- **Non-blocking**: failure during extraction does not fail the feed run
- **Idempotent**: items without `contentExtractedAt` are retried automatically
- **Deferred**: only up to 10 items are processed per aggregation cycle (batch-10 cap)
- **Conservative**: 2 concurrent HTTP requests maximum to avoid hammering target servers

Extracted text (plain, HTML stripped) is stored in `feedItems.fullContent` and surfaced in:
- `content:encoded` in the RSS XML
- `articleBody` in Article JSON-LD (capped at 5,000 chars)
- The item body in the HTML page

---

## Cron Job / Scheduling

Defined in `convex/crons.ts`:

| Name | Schedule | Action | Behavior |
|---|---|---|---|
| `aggregate-all-feeds` | Every 30 minutes | `runAggregationCycle` | Only fetches sources whose TTL has expired |
| `daily-full-refresh` | Daily at 02:00 UTC | `runFullRefresh` | Fetches all sources regardless of TTL |

Manual triggers (via Admin UI) call `mutations/admin.ts::triggerFeed`, `triggerAllFeeds`, or `triggerFullRefresh`, which use `ctx.scheduler.runAfter(0, ...)` to enqueue the action immediately.

Feed runs are tracked in the `feed_runs` table with `running`/`success`/`error` status and item count.
