# RSS Super Feed — Implementation Plan

## Plan Date: 2026-03-19
## Based On: Research from 001-rss-super-feed-research
## Scope: Working prototype

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CONVEX BACKEND                               │
│                                                                     │
│  crons.ts (every 30 min)                                            │
│      │                                                              │
│      ▼                                                              │
│  aggregation.ts [action, "use node"]                                │
│    runAggregationCycle()                                            │
│      │  pLimit(5) fan-out                                           │
│      ▼                                                              │
│  aggregation.ts                                                     │
│    aggregateFeed(officeId, serviceId)  ×96 combinations             │
│      │                                                              │
│      ├──[1] ctx.runQuery(getSourcesForFeed)                         │
│      │       scope: global + service + office + office-service      │
│      │       filtered to stale (TTL check)                          │
│      │       deduplicated by URL                                    │
│      │                                                              │
│      ├──[2] fetchSource.ts [action, "use node"]                     │
│      │       pLimit(3) per source                                   │
│      │       rss-parser → items                                     │
│      │       ctx.runMutation(storeFeedItems)                        │
│      │       Promise.allSettled (per-feed isolation)                │
│      │                                                              │
│      └──[3] generateFeed.ts [action, "use node"]                    │
│              ctx.runQuery(getFeedItems for office+service)           │
│              generateRss2() → feed.xml string                       │
│              generateFeedHtml() → feed.html string                  │
│              R2 PutObject via @aws-sdk/client-s3                    │
│              pingWebSubHub() (best-effort)                          │
│              ctx.runMutation(writeFeedRun status)                   │
│                                                                     │
│  schema.ts: offices, services, sources, feedItems, feedRuns         │
└─────────────────────────────────────────────────────────────────────┘
                               │
                    R2 PutObject (feed.xml, feed.html)
                    Key: feeds/{office-slug}/{service-slug}/feed.{ext}
                               │
┌──────────────────────────────▼──────────────────────────────────────┐
│                    CLOUDFLARE R2 BUCKET                             │
│                    aaac-super-feeds                                 │
│                                                                     │
│  feeds/atlanta-ga/wildlife-removal/feed.xml                         │
│  feeds/atlanta-ga/wildlife-removal/feed.html                        │
│  feeds/atlanta-ga/raccoon-removal/feed.xml  ... (×96 total pairs)  │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ native R2 binding (no credentials)
┌──────────────────────────────▼──────────────────────────────────────┐
│                  CLOUDFLARE WORKER                                  │
│                  workers/feed-server/                               │
│                                                                     │
│  GET /feeds/{office-slug}/{service-slug}/feed.xml                   │
│  GET /feeds/{office-slug}/{service-slug}/feed.html                  │
│      → env.FEED_BUCKET.get(key)                                     │
│      → object.writeHttpMetadata(headers)                            │
│      → Cache-Control: public, max-age=1800                          │
│      → Access-Control-Allow-Origin: *                               │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│               CLOUDFLARE PAGES (Admin UI)                           │
│               admin/  — Vite + React 18 + Tailwind CSS             │
│                                                                     │
│  Tabs: Offices | Sources | Feed Runs | Manual Trigger              │
│  useQuery(api.queries.feeds.listFeedRuns) → live status            │
│  useMutation(api.mutations.admin.triggerFeed) → manual run         │
└─────────────────────────────────────────────────────────────────────┘
```

### Data Flow Summary

1. Convex cron fires every 30 minutes and calls `runAggregationCycle`.
2. That action queries all active office×service combinations (up to 96) and fans out to `aggregateFeed` per pair using `pLimit(5)`.
3. Each `aggregateFeed` action resolves applicable sources across all 4 scopes (global, service, office, office-service), filters to stale sources (TTL check), deduplicates by URL, then calls `fetchRssSource` per source using `pLimit(3)` + `Promise.allSettled`.
4. Each `fetchRssSource` action parses the feed with `rss-parser`, upserts items into `feedItems`, and updates `lastFetchedAt` on the source.
5. After all fetches settle, `generateFeedFiles` reads all items for that office×service pair, generates `feed.xml` (RSS 2.0) and `feed.html` (with Schema.org JSON-LD), and writes both to R2 under `feeds/{office-slug}/{service-slug}/`.
6. The Cloudflare Worker serves public requests by reading from R2 via native binding. No credentials in the Worker.
7. The Admin UI on Cloudflare Pages uses Convex reactive queries (`useQuery`) to show live status of feed runs, sources, and last-fetch timestamps.

---

## Architectural Decisions

### Decision 1: Scope Resolution Query Pattern

**Decision**: Use a single Convex query (`getSourcesForFeed`) that runs four separate `ctx.db.query()` calls internally — one per scope — then merges and deduplicates the results in JavaScript before returning.

**Reasoning**: Convex does not support `OR` across index conditions in a single query chain. Running four small indexed queries and merging in JS is idiomatic Convex. The result is deduped by `url` (not `_id`) because the same URL could theoretically be added at two scopes. Return only `isActive: true` sources.

**Implementation**:
```typescript
// convex/queries/feeds.ts
// Four queries, merged and deduped:
const [globals, serviceScoped, officeScoped, officeServiceScoped] = await Promise.all([
  ctx.db.query("sources").withIndex("by_scope", q => q.eq("scope", "global")).filter(q => q.eq(q.field("isActive"), true)).collect(),
  ctx.db.query("sources").withIndex("by_service", q => q.eq("serviceId", serviceId)).filter(q => q.eq(q.field("scope"), "service").and(q.eq(q.field("isActive"), true))).collect(),
  ctx.db.query("sources").withIndex("by_office", q => q.eq("officeId", officeId)).filter(q => q.eq(q.field("scope"), "office").and(q.eq(q.field("isActive"), true))).collect(),
  ctx.db.query("sources").withIndex("by_office_service", q => q.eq("officeId", officeId).eq("serviceId", serviceId)).filter(q => q.eq(q.field("isActive"), true)).collect(),
]);
const all = [...globals, ...serviceScoped, ...officeScoped, ...officeServiceScoped];
const seen = new Set<string>();
return all.filter(s => { if (seen.has(s.url)) return false; seen.add(s.url); return true; });
```

### Decision 2: Feed Generation Action Structure

**Decision**: Three separate action files, each with `"use node"`, connected in a pipeline:
- `convex/actions/fetchSource.ts` — fetches and parses one RSS/Atom source
- `convex/actions/generateFeed.ts` — reads items from DB, generates XML/HTML, writes to R2
- `convex/actions/aggregation.ts` — orchestrates the full cycle for one or all feeds

**Reasoning**: Convex's `"use node"` isolation rule requires that files with `"use node"` cannot also export queries or mutations. Splitting into three focused files keeps each concern clean and avoids the isolation constraint. It also makes each action independently testable and triggerable from the Admin UI.

### Decision 3: Cron Orchestration

**Decision**: One cron entry in `crons.ts` running every 30 minutes. It calls `runAggregationCycle` which uses `pLimit(5)` to fan out to per-feed `aggregateFeed` actions. Each `aggregateFeed` in turn uses `pLimit(3)` for its source fetches.

**Reasoning**: A single mega-action processing all 96 feeds is risky — it could approach the 10-minute timeout. Fan-out to separate per-feed actions means each is small, independently timed out, and isolated. With `pLimit(5)` at the outer level, 96 feeds run in batches of 5, well within the timeout even if each feed takes 30 seconds.

**Separate concurrency limiters**: Use `const feedLimit = pLimit(5)` in `aggregation.ts` and `const sourceLimit = pLimit(3)` in `fetchSource.ts`. Never nest the same limiter instance to avoid deadlocks.

### Decision 4: R2 Key Structure

**Decision**: `feeds/{office-slug}/{service-slug}/feed.xml` and `feeds/{office-slug}/{service-slug}/feed.html`.

**Reasoning**: The `feeds/` prefix namespace isolates feed files from any other future objects in the bucket. The office/service slug hierarchy is human-readable, matches the URL pattern in the Worker, and the trailing filename makes content type explicit. Slugs are lowercase-alphanumeric-with-hyphens (validated at source creation time).

**Example**: `feeds/atlanta-ga/raccoon-removal/feed.xml`

### Decision 5: Admin UI Real-Time Status

**Decision**: Admin UI uses Convex reactive queries (`useQuery`) on `feedRuns` table. The `feedRuns` table has a `status` field (`pending | running | complete | error`) updated by mutations inside each `aggregateFeed` action. The React UI re-renders automatically when any feed run changes state.

**Decision on YouTube duration**: Omit `duration` from VideoObject JSON-LD for the prototype. The free YouTube Atom feed does not include it. VideoObject still qualifies for Google rich results without it (only `name`, `thumbnailUrl`, `uploadDate` are required). A YouTube Data API v3 integration can be added post-prototype.

### Decision 6: Authority Source Handling

**Decision**: Authority sources (`.edu/.gov` PDF/article URLs) are stored directly as manual `feedItems` records by an admin. They are NOT fetched/parsed. The source type `"authority"` triggers no RSS parsing — items are inserted via admin UI mutation, not the fetch pipeline. TTL does not apply; they are refreshed only on manual admin action.

---

## Phase 1: Project Scaffolding + Convex Schema + Seed Data

**Objective**: Stand up the monorepo structure, initialize Convex with the full schema, and seed the database with representative test data for 3 offices, 4 services, and sample sources at each scope.

**Dependencies**: None (greenfield start).

**Tasks**:

1. Initialize the monorepo root with a `package.json` (private workspace) and three workspace packages.
   - File: `package.json` — root workspace config pointing to `convex/`, `workers/feed-server/`, `admin/`
   - File: `tsconfig.base.json` — shared TypeScript config (target ES2022, moduleResolution bundler, strict)

2. Initialize Convex in the `convex/` directory.
   - Run `npx convex dev` once to bootstrap. This creates `convex/_generated/` and links to a Convex project.
   - File: `convex/package.json` — dependencies: `convex`, `rss-parser@^3.13.0`, `@aws-sdk/client-s3@3.726.0`, `p-limit@^6.1.0`
   - File: `convex/tsconfig.json` — extends `../tsconfig.base.json`, includes `"use node"` runtime support

3. Write the full Convex schema.
   - File: `convex/schema.ts`
   - Tables: `offices` (slug, name, city, state, isActive), `services` (slug, name, description), `sources` (type, scope, officeId?, serviceId?, url, label?, ttlMinutes, lastFetchedAt?, isActive), `feedItems` (sourceId, guid, title, link, description?, pubDate?, isoDate?, videoId?, channelId?, thumbnailUrl?, duration?, viewCount?, schemaType), `feedRuns` (officeId, serviceId, status, startedAt, completedAt?, errorMessage?, itemCount?)
   - All indexes as specified in research: `by_slug`, `by_scope`, `by_office`, `by_service`, `by_office_service`, `by_guid`, `by_source`, `by_status`

4. Write the seed mutation.
   - File: `convex/mutations/seed.ts` — `internalMutation` that inserts 3 offices, 4 services, and 8 sources:
     - 2 global sources (one brand YouTube channel, one freshness RSS feed)
     - 1 service-scoped source for "wildlife-removal" (a freshness RSS feed)
     - 1 office-scoped source for office 1 (a brand YouTube channel specific to that office)
     - 1 office-service source for office 1 + wildlife-removal
     - 3 authority sources (one per-office as `feedItems` inserted directly — no `sources` row needed for authority items)

5. Write the seed script runner.
   - File: `convex/mutations/runSeed.ts` — a public mutation that calls `internal.mutations.seed.seedDatabase` (wraps the internal version so it can be called via dashboard during dev)

6. Write stub queries and mutations needed by later phases so the schema is immediately testable.
   - File: `convex/queries/offices.ts` — `listOffices`, `getOfficeBySlug`
   - File: `convex/queries/services.ts` — `listServices`, `getServiceBySlug`
   - File: `convex/queries/sources.ts` — `listSources`, `getSourcesForFeed` (the 4-scope merge query)
   - File: `convex/queries/feedRuns.ts` — `listFeedRuns`, `getFeedRunsForOfficeService`
   - File: `convex/mutations/sources.ts` — `createSource`, `updateSource`, `toggleSourceActive`, `storeFeedItems`, `markFetchError`
   - File: `convex/mutations/feedRuns.ts` — `createFeedRun`, `updateFeedRun`

**Files to Create/Modify**:
- `package.json` — root workspace
- `tsconfig.base.json` — shared TS config
- `convex/package.json` — Convex dependencies
- `convex/tsconfig.json` — Convex TS config
- `convex/schema.ts` — full schema with all tables and indexes
- `convex/mutations/seed.ts` — seed data
- `convex/mutations/runSeed.ts` — callable seed wrapper
- `convex/mutations/sources.ts` — source and feed item mutations
- `convex/mutations/feedRuns.ts` — feed run status mutations
- `convex/queries/offices.ts` — office queries
- `convex/queries/services.ts` — service queries
- `convex/queries/sources.ts` — source queries including 4-scope resolution
- `convex/queries/feedRuns.ts` — feed run queries

**Key Decisions**:
- Schema uses `v.optional()` on `officeId` and `serviceId` in `sources` to handle global/service scoped sources (no office) and global/office scoped sources (no service)
- `feedItems.schemaType` is a required union field — set at insert time based on source type and presence of `videoId`
- `feedRuns` status uses a string union, not an enum, to stay within Convex's type system
- Authority items are stored directly as `feedItems` (no `sources` row) — the seeder inserts them directly

**Code Patterns to Use**:
- Schema pattern from research Area 1 (complete schema definition code example)
- `defineTable` + `.index()` chaining
- `v.union(v.literal(...))` for discriminated unions

**Deliverables**:
- [ ] `convex/schema.ts` pushes successfully (`npx convex dev` shows no schema errors)
- [ ] All 5 tables visible in Convex dashboard
- [ ] Seed mutation runs without error and populates test data
- [ ] All stub queries return data (verifiable via Convex dashboard query runner)
- [ ] TypeScript compiles with no errors (`tsc --noEmit`)

**Verification Steps**:
1. Run `npx convex dev` — confirm no schema validation errors
2. Open Convex dashboard → Data tab → confirm `offices`, `services`, `sources`, `feedItems`, `feedRuns` tables exist with correct fields
3. Run the seed via dashboard Functions tab → call `mutations/runSeed:runSeed`
4. Open dashboard → Data → `sources` → confirm rows exist at each scope type
5. Call `queries/sources:getSourcesForFeed` with a valid officeId+serviceId — confirm it returns merged sources from multiple scopes
6. Run `tsc --noEmit` in project root — zero errors

**Estimated Complexity**: Medium

---

## Phase 2: Feed Fetching Engine

**Objective**: Implement the full source-fetching pipeline — RSS parsing, scope resolution, TTL filtering, per-feed error isolation, and item persistence — as three Convex action files.

**Dependencies**: Phase 1 (schema, queries, mutations must exist).

**Tasks**:

1. Create the R2 client utility (used in Phase 3, defined now as a dependency).
   - File: `convex/lib/r2Client.ts`
   - `"use node"` at top
   - Export `getR2Client()` and `putR2Object(key, body, contentType)`
   - Uses `@aws-sdk/client-s3@3.726.0` — do NOT use ACL options
   - R2 endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
   - Region: `"auto"` (required by SDK, ignored by R2)

2. Create the source fetch action.
   - File: `convex/actions/fetchSource.ts`
   - `"use node"` at top
   - Export `fetchRssSource` as `internalAction`
   - Args: `sourceId: v.id("sources")`, `url: v.string()`, `sourceType: v.union(v.literal("brand"), v.literal("freshness"))`
   - For `brand` type: use YouTube custom parser (`customFields` for `yt:videoId`, `yt:channelId`, `media:group`)
   - For `freshness` type: use generic parser
   - `authority` sources are NOT fetched here — skip if called with type `"authority"` (should not happen by design)
   - On parse success: call `ctx.runMutation(internal.mutations.sources.storeFeedItems, { sourceId, items })`
   - On parse failure: call `ctx.runMutation(internal.mutations.sources.markFetchError, { sourceId, error })` and return (do not re-throw)
   - Parser constructor: set `timeout: 10000`
   - Use separate parser instances for YouTube vs generic (different `customFields`)
   - Map items to normalized shape: `guid`, `title`, `link`, `description`, `pubDate`, `isoDate`, `videoId?`, `channelId?`, `thumbnailUrl?`, `viewCount?`, `schemaType`
   - GUID fallback chain: `item.guid ?? item.link ?? item["yt:videoId"] ?? item.title ?? ""`

3. Create the `getSourcesForFeed` query (4-scope resolution).
   - File: `convex/queries/sources.ts` (already stubbed in Phase 1 — implement fully here)
   - Args: `officeId: v.id("offices")`, `serviceId: v.id("services")`
   - Run four parallel queries with `Promise.all` (inside the query handler)
   - Merge arrays, deduplicate by `url`, filter `isActive: true`
   - Return full source documents
   - Additionally filter by `staleOnly: v.optional(v.boolean())` — if true, only return sources where `lastFetchedAt` is undefined or `Date.now() - lastFetchedAt > ttlMinutes * 60 * 1000`
   - Note: `Date.now()` is frozen in queries — pass a `nowMs: v.number()` argument from the calling action so TTL comparison is accurate

4. Create the per-feed aggregation action.
   - File: `convex/actions/aggregation.ts`
   - `"use node"` at top
   - Export `aggregateFeed` as `internalAction`
   - Args: `officeId: v.id("offices")`, `serviceId: v.id("services")`
   - Steps:
     a. Call `ctx.runMutation(internal.mutations.feedRuns.createFeedRun, { officeId, serviceId })` — sets status to `"running"`, records `startedAt`
     b. Call `ctx.runQuery(internal.queries.sources.getSourcesForFeed, { officeId, serviceId, nowMs: Date.now(), staleOnly: true })`
     c. Filter out `type: "authority"` sources (handled separately)
     d. Create `const sourceLimit = pLimit(3)` — NOT the same instance as the outer feed limiter
     e. Map sources to `sourceLimit(() => ctx.runAction(internal.actions.fetchSource.fetchRssSource, { sourceId, url, sourceType: type }))`
     f. `const results = await Promise.allSettled(fetchTasks)`
     g. Count successes and failures, log them
     h. Call `ctx.runAction(internal.actions.generateFeed.generateFeedFiles, { officeId, serviceId })` — proceeds even if some sources failed
     i. On overall success: call `ctx.runMutation(internal.mutations.feedRuns.updateFeedRun, { runId, status: "complete", completedAt: Date.now() })`
     j. On catch: call `ctx.runMutation(internal.mutations.feedRuns.updateFeedRun, { runId, status: "error", errorMessage: String(err) })`

5. Create the orchestration action (fan-out entry point).
   - File: `convex/actions/aggregation.ts` (same file, second export)
   - Export `runAggregationCycle` as `internalAction`
   - Args: `{}`
   - Query all active office×service combinations: `ctx.runQuery(internal.queries.feeds.getAllOfficeServiceCombinations)`
   - Create `const feedLimit = pLimit(5)` — separate from `sourceLimit`
   - Fan out: `combinations.map(({ officeId, serviceId }) => feedLimit(() => ctx.runAction(internal.actions.aggregation.aggregateFeed, { officeId, serviceId })))`
   - `await Promise.allSettled(tasks)`
   - Log total success/failure counts

6. Create `getAllOfficeServiceCombinations` query.
   - File: `convex/queries/feeds.ts`
   - Returns `{ officeId, serviceId, officeSlug, serviceSlug }[]` for all active offices × all services
   - Two queries: `listOffices` (active only) × `listServices` → cartesian product in JS

7. Write the `markFetchError` mutation.
   - File: `convex/mutations/sources.ts` (add to existing file)
   - `internalMutation`
   - Args: `sourceId: v.id("sources")`, `error: v.string()`
   - `ctx.db.patch(sourceId, { lastFetchError: error, lastFetchedAt: Date.now() })` — patch with error info but still update `lastFetchedAt` so it doesn't immediately retry on next cycle
   - Add `lastFetchError: v.optional(v.string())` to the `sources` table in schema (schema update required)

**Files to Create/Modify**:
- `convex/lib/r2Client.ts` — R2 client utility (Node.js only)
- `convex/actions/fetchSource.ts` — RSS source fetcher
- `convex/actions/aggregation.ts` — per-feed and orchestration actions
- `convex/queries/sources.ts` — complete 4-scope resolution with TTL filtering
- `convex/queries/feeds.ts` — office×service combination query
- `convex/mutations/sources.ts` — add `markFetchError`
- `convex/schema.ts` — add `lastFetchError` field to sources table

**Key Decisions**:
- `nowMs` is passed from the action into the query so TTL comparison is deterministic (queries cannot call real `Date.now()`)
- `sourceLimit` and `feedLimit` are always separate `pLimit()` instances — never nested with same instance
- `authority` sources are excluded from the fetch pipeline by design
- Errors in individual source fetches do not abort the feed aggregation — `Promise.allSettled` ensures isolation
- Feed generation still runs even if all sources fail (to write an empty/stale feed rather than no feed)

**Code Patterns to Use**:
- `p-limit + Promise.allSettled` pattern from research Area 5
- `"use node"` + `rss-parser` custom fields from research Area 3
- TTL check pattern from research Area 5
- Fan-out pattern from research Area 5
- `ctx.runMutation` / `ctx.runQuery` / `ctx.runAction` chaining from research Area 1

**Deliverables**:
- [ ] `fetchRssSource` action parses a real YouTube Atom feed and stores items in `feedItems`
- [ ] `fetchRssSource` action parses a generic RSS feed and stores items in `feedItems`
- [ ] `getSourcesForFeed` returns correctly merged sources across all 4 scopes for a test office+service pair
- [ ] `aggregateFeed` runs to completion without throwing, even if one source returns a 404
- [ ] `feedItems` table populated with real data after one `aggregateFeed` run
- [ ] `feedRuns` table shows a `"complete"` record after a successful run

**Verification Steps**:
1. Via Convex dashboard → Functions, run `actions/aggregation:aggregateFeed` with a real `officeId` and `serviceId` from seed data
2. Open dashboard → Data → `feedItems` — confirm rows exist with correct `guid`, `title`, `videoId`, `thumbnailUrl` for YouTube sources
3. Open dashboard → Data → `sources` — confirm `lastFetchedAt` was updated
4. Open dashboard → Data → `feedRuns` — confirm a `"complete"` record exists
5. Manually break a source URL (set to a 404) → re-run `aggregateFeed` → confirm the run still shows `"complete"` with a partial result (not `"error"`)
6. Confirm `getSourcesForFeed` does NOT return the same URL twice when the same source exists at two scope levels (dedup test)

**Estimated Complexity**: High

---

## Phase 3: Feed Generation (RSS 2.0 + HTML with JSON-LD)

**Objective**: Implement feed file generation — reading items from Convex DB, building RSS 2.0 XML and HTML+JSON-LD strings, and writing both to Cloudflare R2.

**Dependencies**: Phase 1 (schema), Phase 2 (items in DB, R2 client utility).

**Tasks**:

1. Create the feed generation library functions (pure, no Convex dependencies).
   - File: `convex/lib/generateRss.ts`
   - Export `escapeXml(str: string): string` — replaces `&`, `<`, `>`, `"`, `'` with XML entities
   - Export `generateRss2(meta: FeedMeta, items: FeedItem[]): string`
     - Uses `<![CDATA[...]]>` for title and description
     - Includes `<atom:link rel="self">` pointing to `https://feeds.aaacwildlife.com/feeds/{officeSlug}/{serviceSlug}/feed.xml`
     - Includes `xmlns:media` namespace declaration
     - Includes `<media:thumbnail>` element for items with `thumbnailUrl`
     - Includes `<pubDate>` when available
     - `<guid isPermaLink="false">` for YouTube items (has `videoId`), `isPermaLink="true"` for articles
   - Define TypeScript interfaces: `FeedMeta`, `FeedItem` in this file

2. Create the Schema.org JSON-LD builder functions.
   - File: `convex/lib/generateJsonLd.ts`
   - Export `buildVideoObjectLd(item: VideoObjectLdInput): object`
     - Required: `name`, `thumbnailUrl`, `uploadDate` (ISO 8601 with timezone)
     - Recommended: `description`, `embedUrl`, `contentUrl`
     - Omit `duration` — not available from free YouTube Atom feed
   - Export `buildDigitalDocumentLd(item: DigitalDocumentLdInput): object`
     - Fields: `name`, `url`, `encodingFormat: "application/pdf"`, optional `description`, `author`, `datePublished`, `publisher`
   - Export `buildArticleLd(item: ArticleLdInput): object`
     - Fields: `headline`, `url`, optional `description`, `datePublished`, `author`, `publisherName`
   - Export `dispatchJsonLd(item: FeedPageItem): object` — selects the right builder based on `schemaType`
   - Use `JSON.stringify()` for all JSON-LD values — never template-literal the JSON values directly (XSS/injection risk with `</script>` in content)

3. Create the HTML feed page generator.
   - File: `convex/lib/generateHtml.ts`
   - Export `generateFeedHtml(officeName, serviceName, officeSlug, serviceSlug, items: FeedPageItem[]): string`
   - Embed one `<script type="application/ld+json">` block per item (not a single `@graph` — simpler and equally valid)
   - Include `<link rel="alternate" type="application/rss+xml">` pointing to the corresponding `feed.xml` URL
   - Include minimal inline CSS (system-ui font, max-width, feed-item border)
   - Include `<meta name="description">` with office+service copy
   - Escape HTML attribute values (use `escapeXml` from `generateRss.ts` for href attributes)

4. Create the feed query that returns all items for an office×service pair.
   - File: `convex/queries/feedItems.ts`
   - Export `getFeedItemsForOfficeService` as `internalQuery`
   - Args: `officeId: v.id("offices")`, `serviceId: v.id("services")`
   - Steps:
     a. Get all sources for this office×service via the 4-scope merge (call `getSourcesForFeed` logic inline, or factor it into a shared helper)
     b. For each sourceId, collect `feedItems` by `by_source` index
     c. Also collect any authority `feedItems` directly associated with this office+service (stored without a `sources` row — query by `officeId` and `serviceId` fields added to `feedItems` table)
     d. Merge all items, deduplicate by `guid`
     e. Sort by `isoDate` descending (most recent first)
     f. Return max 50 items (slice after sort)
   - Note: Add `officeId: v.optional(v.id("offices"))` and `serviceId: v.optional(v.id("services"))` to `feedItems` schema to support authority items without a `sourceId`; add corresponding indexes

5. Create the feed generation action.
   - File: `convex/actions/generateFeed.ts`
   - `"use node"` at top
   - Export `generateFeedFiles` as `internalAction`
   - Args: `officeId: v.id("offices")`, `serviceId: v.id("services")`
   - Steps:
     a. `ctx.runQuery` to get office details (name, slug) and service details (name, slug)
     b. `ctx.runQuery(internal.queries.feedItems.getFeedItemsForOfficeService, { officeId, serviceId })`
     c. Build `FeedMeta` object with office name, service name, slugs, and `lastBuildDate: new Date().toUTCString()`
     d. Call `generateRss2(meta, items)` → `xmlString`
     e. Call `generateFeedHtml(officeName, serviceName, officeSlug, serviceSlug, items)` → `htmlString`
     f. Call `putR2Object(\`feeds/${officeSlug}/${serviceSlug}/feed.xml\`, xmlString, "application/rss+xml; charset=utf-8")`
     g. Call `putR2Object(\`feeds/${officeSlug}/${serviceSlug}/feed.html\`, htmlString, "text/html; charset=utf-8")`
     h. Log the R2 key written and item count
     i. Call `pingWebSubHub` (best-effort, wrapped in try/catch that only warns on failure)
   - Export `pingWebSubHub(topicUrl: string): Promise<void>` helper in this file (or in `convex/lib/webSub.ts`)

6. Create the WebSub ping utility.
   - File: `convex/lib/webSub.ts`
   - `"use node"` at top (uses `fetch` — available in Node.js 18+)
   - Export `pingWebSubHub(hubUrl: string, topicUrl: string): Promise<void>`
   - Hub URL default: `"https://pubsubhubbub.appspot.com/"`
   - POST with `application/x-www-form-urlencoded` body: `hub.mode=publish&hub.url={topicUrl}&hub.topic={topicUrl}`
   - Log warning (not throw) if response is not 200 or 204

**Files to Create/Modify**:
- `convex/lib/generateRss.ts` — RSS 2.0 XML generator
- `convex/lib/generateJsonLd.ts` — Schema.org JSON-LD builders
- `convex/lib/generateHtml.ts` — HTML feed page generator
- `convex/lib/webSub.ts` — WebSub ping utility
- `convex/actions/generateFeed.ts` — orchestrating action that calls generators + R2 + WebSub
- `convex/queries/feedItems.ts` — query returning merged, deduped, sorted items for a feed
- `convex/schema.ts` — add `officeId?` and `serviceId?` to `feedItems` table; add corresponding indexes

**Key Decisions**:
- Content-Type set explicitly on every R2 PUT (`application/rss+xml; charset=utf-8` and `text/html; charset=utf-8`) — never rely on R2 inference
- No ACL options passed to R2 (R2 does not support ACLs — SDK options would be silently ignored or cause errors)
- `duration` omitted from VideoObject JSON-LD — not available from free YouTube Atom feed
- `uploadDate` uses the item's `isoDate` field — must include timezone (append `Z` if not present, or parse and re-serialize)
- Maximum 50 items per feed — prevents R2 object size from growing unbounded
- WebSub ping failure is non-fatal — wrapped in try/catch, logs warning, does not re-throw

**Code Patterns to Use**:
- `generateRss2` template literal pattern from research Area 3
- `escapeXml` helper from research Area 3
- `buildVideoObjectLd` / `buildDigitalDocumentLd` / `buildArticleLd` from research Area 4
- `JSON.stringify()` for JSON-LD values (never template-literal)
- `putR2Object` from research Area 2
- `pingWebSubHub` from research Area 3

**Deliverables**:
- [ ] `generateFeedFiles` action completes without error for a seeded office+service pair
- [ ] `feeds/{office-slug}/{service-slug}/feed.xml` exists in R2 with valid RSS 2.0 XML
- [ ] `feeds/{office-slug}/{service-slug}/feed.html` exists in R2 with valid HTML and `<script type="application/ld+json">` blocks
- [ ] RSS XML validates at `https://validator.w3.org/feed/`
- [ ] HTML JSON-LD validates at `https://search.google.com/test/rich-results` for at least one VideoObject item
- [ ] YouTube items in feed.xml include `<media:thumbnail>` element
- [ ] Items are sorted most-recent-first

**Verification Steps**:
1. Set Convex env vars: `npx convex env set R2_ACCOUNT_ID '...'`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`
2. Via Convex dashboard → Functions, run `actions/generateFeed:generateFeedFiles` with a real officeId+serviceId
3. Open Cloudflare dashboard → R2 → bucket → confirm `feeds/{slug}/{slug}/feed.xml` and `feed.html` exist
4. Download `feed.xml` from R2 → paste into `https://validator.w3.org/feed/` → 0 errors
5. Download `feed.html` from R2 → inspect source → confirm `<script type="application/ld+json">` blocks are present and valid JSON
6. Confirm Content-Type on R2 objects is `application/rss+xml` and `text/html` respectively (visible in R2 object details)

**Estimated Complexity**: Medium

---

## Phase 4: Cloudflare Integration (Worker + R2 Serving)

**Objective**: Deploy a Cloudflare Worker that serves feed files from R2 via native binding, with correct Content-Type headers, CORS, and caching.

**Dependencies**: Phase 3 (feed files must exist in R2 to test serving).

**Tasks**:

1. Initialize the Worker package.
   - Run `npm create cloudflare@latest workers/feed-server -- --type=worker --lang=ts --no-deploy` or manually scaffold.
   - File: `workers/feed-server/package.json` — dependencies: `wrangler@^3`, `typescript`
   - File: `workers/feed-server/tsconfig.json` — extends `../../tsconfig.base.json`, adds `"lib": ["ES2022"]`, `"types": ["@cloudflare/workers-types"]`

2. Write the wrangler configuration.
   - File: `workers/feed-server/wrangler.toml`
   - Worker name: `aaac-feed-server`
   - Main: `src/index.ts`
   - Compatibility date: `2024-01-01`
   - R2 binding: `FEED_BUCKET` → `aaac-super-feeds`
   - Optional custom route: `feeds.aaacwildlife.com/*` (comment out if domain not yet configured)
   - Do NOT add ACL-related configuration

3. Write the Worker request handler.
   - File: `workers/feed-server/src/index.ts`
   - Define `Env` interface with `FEED_BUCKET: R2Bucket`
   - URL pattern: `GET /feeds/{office-slug}/{service-slug}/feed.xml` or `/feed.html`
   - Validation regex: `/^feeds\/[a-z0-9-]+\/[a-z0-9-]+\/feed\.(xml|html)$/`
   - Parse `url.pathname.slice(1)` as R2 key
   - Call `env.FEED_BUCKET.get(key)`
   - If null: return `Response("Feed not found", { status: 404 })`
   - If found:
     - `const headers = new Headers()`
     - `object.writeHttpMetadata(headers)` — copies Content-Type from R2 object metadata
     - `headers.set("etag", object.httpEtag)`
     - `headers.set("Cache-Control", "public, max-age=1800")` — 30 minutes
     - `headers.set("Access-Control-Allow-Origin", "*")`
     - Return `new Response(object.body, { headers })`
   - Handle CORS preflight: `if (request.method === "OPTIONS") return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS" }, status: 204 })`
   - Reject non-GET/OPTIONS methods: return 405

4. Add TypeScript types for Cloudflare Workers.
   - Run `npm install --save-dev @cloudflare/workers-types` in `workers/feed-server/`
   - Ensure `tsconfig.json` references `@cloudflare/workers-types` in `compilerOptions.types`

5. Test locally with `wrangler dev`.
   - Note from research: S3 SDK does NOT work locally, but this Worker uses native R2 binding — `wrangler dev` CAN work with R2 binding in preview mode (reads from `preview_bucket_name`)
   - Add preview bucket to `wrangler.toml`: `preview_bucket_name = "aaac-super-feeds-dev"` (create this bucket in Cloudflare dashboard)
   - Or test against production bucket directly: `wrangler dev --remote`

6. Deploy the Worker.
   - Run `wrangler deploy` from `workers/feed-server/`
   - Confirm the Worker is reachable at `https://aaac-feed-server.{account}.workers.dev/feeds/{slug}/{slug}/feed.xml`

**Files to Create/Modify**:
- `workers/feed-server/package.json` — Worker dependencies
- `workers/feed-server/tsconfig.json` — Worker TS config
- `workers/feed-server/wrangler.toml` — R2 binding, name, route
- `workers/feed-server/src/index.ts` — main Worker handler

**Key Decisions**:
- `object.writeHttpMetadata(headers)` is the correct R2 metadata propagation method — do not manually set Content-Type (it was set at PutObject time)
- Worker uses native R2 binding — no credentials needed in Worker, no S3 SDK in Worker
- Cache-Control of 1800 seconds (30 min) matches the cron interval — cached feeds are never more than one cycle stale
- CORS `*` is acceptable for public read-only feed files
- R2 has no public access by default — the Worker is the access control layer

**Code Patterns to Use**:
- Cloudflare Worker + R2 binding pattern from research Area 2
- `object.writeHttpMetadata(headers)` from research Area 2
- `wrangler.toml` configuration from research Area 2

**Deliverables**:
- [ ] Worker deploys successfully (`wrangler deploy` exits 0)
- [ ] `GET https://{worker-url}/feeds/{office-slug}/{service-slug}/feed.xml` returns 200 with `Content-Type: application/rss+xml`
- [ ] `GET https://{worker-url}/feeds/{office-slug}/{service-slug}/feed.html` returns 200 with `Content-Type: text/html`
- [ ] `GET https://{worker-url}/feeds/nonexistent/feed.xml` returns 404
- [ ] Response includes `Cache-Control: public, max-age=1800` header
- [ ] Response includes `Access-Control-Allow-Origin: *` header
- [ ] TypeScript in Worker compiles with no errors

**Verification Steps**:
1. Run `wrangler deploy` — confirm zero errors
2. `curl -I https://aaac-feed-server.{account}.workers.dev/feeds/{slug}/{slug}/feed.xml` → check 200, Content-Type, Cache-Control, CORS headers
3. `curl https://aaac-feed-server.{account}.workers.dev/feeds/badslug/badservice/feed.xml` → confirm 404
4. `curl -X POST https://aaac-feed-server.{account}.workers.dev/feeds/{slug}/{slug}/feed.xml` → confirm 405
5. Paste the Worker feed URL into an RSS reader (e.g. Feedly) — confirm it loads as a valid feed

**Estimated Complexity**: Low

---

## Phase 5: Admin UI (React + Convex Reactive Queries)

**Objective**: Build the Admin UI as a Vite + React 18 + Tailwind CSS app on Cloudflare Pages with four tabs: Offices, Sources, Feed Runs, and Manual Trigger.

**Dependencies**: Phase 1 (Convex schema and queries), Phase 2 (feed runs data), Phase 4 (Worker URL for feed links).

**Tasks**:

1. Initialize the Admin app.
   - Run `npm create vite@latest admin -- --template react-ts` from project root
   - File: `admin/package.json` — add dependencies: `convex@latest`, `react@^18.3.0`, `react-dom@^18.3.0`; devDeps: `tailwindcss@^3`, `postcss`, `autoprefixer`, `@types/react`, `@types/react-dom`, `vite@^5`
   - Run `npx tailwindcss init -p` inside `admin/`
   - File: `admin/tailwind.config.js` — content: `["./index.html", "./src/**/*.{ts,tsx}"]`
   - File: `admin/src/index.css` — Tailwind directives (`@tailwind base; @tailwind components; @tailwind utilities;`)

2. Configure Convex client.
   - File: `admin/src/main.tsx` — wrap `<App />` in `<ConvexProvider client={convex}>` where `convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL)`
   - File: `admin/.env.local` — `VITE_CONVEX_URL=https://{your-deployment}.convex.cloud`
   - File: `admin/vite.config.ts` — standard Vite config with `react()` plugin

3. Create the app shell with tab navigation.
   - File: `admin/src/App.tsx` — renders `<TabNav>` and the active tab component
   - File: `admin/src/components/TabNav.tsx` — four tabs: Offices, Sources, Feed Runs, Manual Trigger
   - File: `admin/src/components/Layout.tsx` — page wrapper with header ("AAAC Super Feed Admin") and main content area
   - Use Tailwind for all styling — no external component library

4. Build the Offices tab.
   - File: `admin/src/pages/OfficesPage.tsx`
   - `useQuery(api.queries.offices.listOffices)` → renders a table of office name, slug, city, state, active status
   - Each row links to a filtered view of feed runs for that office

5. Build the Sources tab.
   - File: `admin/src/pages/SourcesPage.tsx`
   - Filters: scope dropdown (global / service / office / office-service), office selector, service selector
   - `useQuery(api.queries.sources.listSources)` with filter args
   - Table columns: URL, type (brand/authority/freshness), scope, TTL, last fetched, active toggle
   - Active toggle calls `useMutation(api.mutations.sources.toggleSourceActive)`
   - "Add Source" button → inline form or modal with fields: URL, type, scope, officeId (optional), serviceId (optional), TTL minutes, label

6. Build the Feed Runs tab.
   - File: `admin/src/pages/FeedRunsPage.tsx`
   - `useQuery(api.queries.feedRuns.listFeedRuns)` — reactive, auto-updates as runs complete
   - Table columns: office, service, status (color-coded badge: pending=gray, running=blue, complete=green, error=red), started, completed, item count, error message (truncated)
   - Convex reactivity means status updates appear without polling
   - Pagination: show latest 50 runs

7. Build the Manual Trigger tab.
   - File: `admin/src/pages/ManualTriggerPage.tsx`
   - Office selector + service selector → "Trigger Feed" button
   - "Trigger All Feeds" button (calls `runAggregationCycle`)
   - On click: `useMutation(api.mutations.admin.triggerFeed)({ officeId, serviceId })` — this mutation schedules the action
   - Show last feed run status for the selected pair (reactive query)

8. Create the admin trigger mutation.
   - File: `convex/mutations/admin.ts`
   - Export `triggerFeed` as a public mutation (so admin UI can call it)
   - Args: `officeId: v.id("offices")`, `serviceId: v.id("services")`
   - Uses `ctx.scheduler.runAfter(0, internal.actions.aggregation.aggregateFeed, { officeId, serviceId })` — schedules action immediately
   - Export `triggerAllFeeds` — schedules `runAggregationCycle` immediately via scheduler

9. Deploy to Cloudflare Pages.
   - In Cloudflare Pages dashboard: new project → connect GitHub repo → build command `npm run build` → build output directory `dist` → root directory `admin`
   - Set environment variable `VITE_CONVEX_URL` in Pages settings

**Files to Create/Modify**:
- `admin/package.json`
- `admin/vite.config.ts`
- `admin/tailwind.config.js`
- `admin/postcss.config.js`
- `admin/index.html`
- `admin/src/main.tsx`
- `admin/src/App.tsx`
- `admin/src/index.css`
- `admin/src/components/TabNav.tsx`
- `admin/src/components/Layout.tsx`
- `admin/src/pages/OfficesPage.tsx`
- `admin/src/pages/SourcesPage.tsx`
- `admin/src/pages/FeedRunsPage.tsx`
- `admin/src/pages/ManualTriggerPage.tsx`
- `convex/mutations/admin.ts` — trigger mutations
- `convex/queries/sources.ts` — add `listSources` with filter args

**Key Decisions**:
- Convex reactive queries (`useQuery`) power the Feed Runs tab — no polling, no WebSocket setup needed
- `ctx.scheduler.runAfter(0, ...)` is used in mutations to schedule actions (mutations cannot call actions directly)
- Admin UI is read-only for feed runs and offices; writes are limited to source management and manual triggers
- No authentication for prototype — add Convex auth in a post-prototype pass
- Tailwind only for styling — no component library added to minimize dependencies

**Code Patterns to Use**:
- `useQuery(api.queries.X.Y)` pattern (Convex React hooks)
- `useMutation(api.mutations.X.Y)` pattern
- `ctx.scheduler.runAfter(0, internal.actions.Y, args)` for scheduling from mutations
- Convex `ConvexReactClient` + `ConvexProvider` setup

**Deliverables**:
- [ ] Admin UI builds successfully (`npm run build` in `admin/` exits 0)
- [ ] Offices tab shows all seeded offices
- [ ] Sources tab shows sources filterable by scope, with working active toggle
- [ ] Feed Runs tab shows real-time status updates as a feed run completes (no page refresh)
- [ ] Manual Trigger tab can trigger a single feed run and shows status update
- [ ] App deploys to Cloudflare Pages and is accessible via Pages URL

**Verification Steps**:
1. `cd admin && npm run build` — zero errors
2. Run `npm run dev` locally — all four tabs render without console errors
3. Open Feed Runs tab → manually trigger a feed run via Manual Trigger tab → switch to Feed Runs tab → confirm status updates from `pending` → `running` → `complete` in real time (no refresh)
4. Open Sources tab → toggle a source inactive → confirm the toggle is reflected immediately
5. Deploy to Pages → visit Pages URL → confirm all functionality works in production

**Estimated Complexity**: Medium

---

## Phase 6: Automation, WebSub, Error Handling, and Polish

**Objective**: Wire up the Convex cron, finalize error handling, add feed run logging detail, implement WebSub pinging, and harden the system for reliable unattended operation.

**Dependencies**: All prior phases (Phases 1–5 fully complete).

**Tasks**:

1. Configure the Convex cron.
   - File: `convex/crons.ts`
   - `crons.interval("aggregate-all-feeds", { minutes: 30 }, internal.actions.aggregation.runAggregationCycle)`
   - `crons.daily("daily-full-refresh", { hourUTC: 2, minuteUTC: 0 }, internal.actions.aggregation.runFullRefresh)` — a version that ignores TTL and fetches all sources
   - Export `crons` as default

2. Create the full-refresh variant of the aggregation cycle.
   - File: `convex/actions/aggregation.ts` — add `runFullRefresh` export
   - Identical to `runAggregationCycle` but passes `staleOnly: false` to `getSourcesForFeed` — forces re-fetch of all sources regardless of TTL
   - Useful for the daily 2am run that ensures full freshness

3. Finalize WebSub integration.
   - File: `convex/actions/generateFeed.ts` — confirm `pingWebSubHub` is called after every successful R2 write
   - Topic URL pattern: `https://feeds.aaacwildlife.com/feeds/{officeSlug}/{serviceSlug}/feed.xml`
   - Hub URL: `https://pubsubhubbub.appspot.com/`
   - Log: `"WebSub ping sent for {topicUrl}"` on success, `"WebSub ping failed (non-fatal): {status}"` on failure
   - Failure MUST NOT throw or prevent the feed run from completing

4. Add `feedItems` count to the `feedRuns` record on completion.
   - File: `convex/actions/aggregation.ts` — after `generateFeedFiles` completes, query the item count for the feed and include it in the `updateFeedRun` mutation call
   - File: `convex/mutations/feedRuns.ts` — ensure `updateFeedRun` accepts `itemCount: v.optional(v.number())`

5. Add retry logic for transient source fetch failures.
   - File: `convex/actions/fetchSource.ts` — wrap `parser.parseURL()` in the `withRetry` helper
   - Max 3 attempts, delay: 500ms × attempt number (500ms, 1000ms, 1500ms)
   - Only retry on network errors (timeout, ECONNRESET); do not retry on 404 or 403
   - File: `convex/lib/retry.ts` — export `withRetry<T>(fn, maxAttempts, delayMs)` helper function

6. Validate environment variables on startup.
   - File: `convex/lib/env.ts` — export `requireEnv(key: string): string` that throws a clear error if the variable is missing
   - Use in `r2Client.ts` and anywhere env vars are accessed
   - This surfaces configuration errors early (at action start) rather than mid-flight

7. Add source URL health monitoring.
   - File: `convex/mutations/sources.ts` — update `storeFeedItems` to also clear any previous `lastFetchError` on success
   - File: `convex/schema.ts` — confirm `lastFetchError: v.optional(v.string())` is on `sources` table (added in Phase 2)
   - Admin UI Sources tab: show `lastFetchError` in a tooltip or error column for sources that have errored

8. Add feed deduplication at the item level in the feed query.
   - File: `convex/queries/feedItems.ts` — confirm deduplication by `guid` is applied before returning items (review Phase 3 implementation and harden if needed)
   - If the same GUID appears from two sources at different scopes, keep the one with the most recent `isoDate`

9. Harden the HTML output against XSS.
   - File: `convex/lib/generateHtml.ts` — audit all places where `item.title`, `item.description`, `item.link` are interpolated into HTML attributes or text nodes
   - All text content: use `escapeXml()` for attributes; for text nodes inside HTML tags, use `escapeXml()` as well
   - JSON-LD blocks: confirm all values go through `JSON.stringify()` (already required; double-check in Phase 6)

10. Write a smoke test script for the full pipeline.
    - File: `scripts/smoke-test.ts` — a standalone Node.js script (not Convex) that:
      a. Fetches a known YouTube channel RSS URL directly with `rss-parser` — confirms parsing works
      b. Fetches a feed XML from the live Worker URL — confirms Worker is serving
      c. Validates the feed XML response has `Content-Type: application/rss+xml`
    - Run with `npx ts-node scripts/smoke-test.ts` or `npx tsx scripts/smoke-test.ts`

11. Document environment variables.
    - File: `.env.example` (in root) — list all required Convex env vars:
      ```
      R2_ACCOUNT_ID=
      R2_ACCESS_KEY_ID=
      R2_SECRET_ACCESS_KEY=
      R2_BUCKET_NAME=aaac-super-feeds
      ```
    - File: `admin/.env.example`:
      ```
      VITE_CONVEX_URL=
      ```

**Files to Create/Modify**:
- `convex/crons.ts` — cron schedule definitions
- `convex/actions/aggregation.ts` — add `runFullRefresh`
- `convex/actions/fetchSource.ts` — add retry logic
- `convex/actions/generateFeed.ts` — confirm WebSub + item count
- `convex/lib/retry.ts` — `withRetry` helper
- `convex/lib/env.ts` — `requireEnv` helper
- `convex/mutations/sources.ts` — clear `lastFetchError` on success
- `convex/mutations/feedRuns.ts` — accept `itemCount` in update
- `convex/queries/feedItems.ts` — harden guid deduplication
- `convex/lib/generateHtml.ts` — XSS audit
- `scripts/smoke-test.ts` — end-to-end smoke test
- `.env.example`
- `admin/.env.example`

**Key Decisions**:
- Cron interval of 30 minutes with a 10-minute action timeout budget per feed means the fan-out must complete in <25 minutes total
- Full refresh daily at 2am UTC covers any sources missed by TTL
- WebSub ping is always best-effort — it is not a hard dependency of the feed run success state
- Retry only on transient errors — permanent errors (404, parse failure on malformed XML) are logged and skipped

**Code Patterns to Use**:
- Cron definition from research Area 1
- `withRetry` pattern from research Area 5
- `requireEnv` is a new utility not in research — standard defensive coding pattern
- Fan-out with `pLimit` from research Area 5

**Deliverables**:
- [ ] Cron is active in Convex dashboard and fires every 30 minutes
- [ ] After one cron cycle, all 96 feed combinations have a `"complete"` `feedRuns` record
- [ ] Feed files in R2 have updated `lastBuildDate` timestamps
- [ ] Worker serves updated feeds at correct URLs
- [ ] Smoke test script passes against live deployment
- [ ] Environment variable names documented in `.env.example`
- [ ] `runFullRefresh` works (bypasses TTL) when triggered manually

**Verification Steps**:
1. Check Convex dashboard → Cron Jobs tab — confirm `"aggregate-all-feeds"` is listed and shows last run time
2. Wait 30 minutes (or manually trigger via Admin UI) → check Feed Runs tab → confirm new `"complete"` records appear for multiple office+service pairs
3. Fetch `feed.xml` from Worker → confirm `<lastBuildDate>` is within the last 30 minutes
4. Check a source that previously errored → confirm `lastFetchError` is cleared after successful refetch
5. Run `npx tsx scripts/smoke-test.ts` → all assertions pass
6. Set `R2_ACCOUNT_ID` to an empty string temporarily → trigger a feed run → confirm the action throws a clear error message from `requireEnv`

**Estimated Complexity**: Medium

---

## Dependency Graph

```
Phase 1: Project Scaffolding + Convex Schema + Seed Data
    │
    ├─── Phase 2: Feed Fetching Engine
    │        │
    │        └─── Phase 3: Feed Generation (RSS + HTML)
    │                  │
    │                  └─── Phase 4: Cloudflare Worker (serving)
    │                            │
    │                            └─── Phase 6: Automation & Polish
    │
    └─── Phase 5: Admin UI (can start after Phase 1; reads live as Phases 2-4 complete)
             │
             └─── Phase 6: (Admin UI polish depends on all prior)
```

Phases 1 → 2 → 3 → 4 → 6 are sequential (each depends on the prior).
Phase 5 can begin after Phase 1 and run in parallel with Phases 2–4, since the Admin UI can progressively show more data as the backend fills in.
Phase 6 requires all of Phases 1–5.

---

## Metadata

### Plan Confidence: High

All architectural patterns are directly validated by the research phase. The research covered all five relevant areas (Convex, Cloudflare, RSS, Schema.org, Concurrency) with working code examples gathered from primary sources. Code in each phase references specific, validated patterns from the research document. The main uncertainty is operational: actual performance under load with 96 feeds, and any environment-specific Cloudflare configuration nuances (custom domain routing, Pages environment variables). Both are manageable at prototype scope.

### Critical Path

`Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 6`

The bottleneck is Phase 2 (feed fetching engine), which contains the most architectural complexity: 4-scope query resolution, TTL filtering, two-level p-limit fan-out, and error isolation. If Phase 2 is solid, all downstream phases are straightforward.

### Top 3 Risk Areas

**Risk 1: `@aws-sdk/client-s3` version regression**
Version 3.729.0 introduced a regression breaking PutObject against R2. Pin to exactly `3.726.0` in `convex/package.json`. If the package is ever upgraded, test against a real R2 bucket before deploying.
Mitigation: Pin exact version in `package.json` (`"@aws-sdk/client-s3": "3.726.0"` without caret or tilde).

**Risk 2: Convex 10-minute action timeout with 96 feeds**
The fan-out orchestration must complete all 96 feeds within 10 minutes. At 5 parallel feeds and ~5 sources per feed, each feed taking ~10 seconds → ~96 feeds ÷ 5 parallel × 10 seconds = ~192 seconds (well within 10 minutes). However, slow external servers could increase this. If any individual `aggregateFeed` action hits the timeout, it is abandoned without a `"complete"` status.
Mitigation: Each per-feed `aggregateFeed` action is independent — a timeout on one does not block others. The `feedRuns` table will show the timed-out feed as `"running"` indefinitely; add a cleanup cron or admin action to mark stale-running feeds as `"error"` (Phase 6 polish).

**Risk 3: Convex `"use node"` file isolation**
Any file with `"use node"` cannot export queries or mutations. Cross-importing between node and non-node files for shared utilities requires careful module design. Placing any Convex query/mutation in a file that also uses `rss-parser` or `p-limit` (both require `"use node"`) will cause a deployment error.
Mitigation: The three-file action structure (`fetchSource.ts`, `generateFeed.ts`, `aggregation.ts`) strictly separates node-runtime code. Pure utility functions (`generateRss.ts`, `generateHtml.ts`, `generateJsonLd.ts`) do NOT use `"use node"` — they are pure TypeScript with no Node.js-specific APIs and can be imported by both action files and queries.

### Assumptions

1. A Convex project is already created (or will be created by the developer before Phase 1). `npx convex dev` will link to the correct deployment.
2. A Cloudflare account with R2 enabled exists. The R2 bucket `aaac-super-feeds` will be created manually in the Cloudflare dashboard before Phase 3 verification.
3. The 24 franchise offices and their slugs are known. The seed data in Phase 1 uses 3 representative offices; the full 24 will be populated via the Admin UI or a larger seed script before production.
4. YouTube channel IDs for each office's brand channel are known. Seed data uses a real public YouTube channel ID for testing.
5. Freshness RSS feed URLs (third-party conservation/wildlife news feeds) are known and provided. Seed data uses public wildlife news RSS feeds as placeholders.
6. `duration` is omitted from VideoObject JSON-LD for the prototype. No YouTube Data API v3 key is required.
7. No authentication is required on the Admin UI for the prototype. Convex auth will be added post-prototype.
8. The `feeds.aaacwildlife.com` custom domain for the Worker is optional for the prototype — the default `workers.dev` URL is sufficient.

### Open Questions

1. **YouTube duration**: Confirmed omitted for prototype. Post-prototype decision: integrate YouTube Data API v3 (requires API key + quota management) or permanently omit.

2. **Authority source management workflow**: The plan assumes authority items are inserted via the Admin UI as direct `feedItems` rows. An alternative is a dedicated Admin UI form for "add authority item" that inserts directly into `feedItems` with `schemaType: "DigitalDocument"`. The Admin UI Sources tab should include this form, but the exact UX is left to Phase 5 implementation.

3. **Feed item limit per feed**: The plan uses 50 items max. The actual number that makes sense for SEO and feed reader UX should be confirmed with stakeholders. It's easily configurable.

4. **WebSub hub**: The plan uses `https://pubsubhubbub.appspot.com/` (Google's free hub). If a Superfeedr or self-hosted hub is preferred, the hub URL is a single constant in `convex/lib/webSub.ts`.

5. **Seed data for production**: The 24 real offices, their slugs, and their source URLs need to be compiled before production seeding. A CSV-to-seed-mutation approach or an admin bulk-import feature may be needed for the initial data load.
