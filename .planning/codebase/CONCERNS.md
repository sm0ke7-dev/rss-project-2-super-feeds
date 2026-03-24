# Codebase Concerns

Status: written 2026-03-24. Reflects codebase as of commit fd92911.

---

## Performance Concerns

### Full table scans

Several queries load entire tables into memory with no filter or limit:

- `feedItems.count` — `ctx.db.query("feedItems").collect()` with no index. Grows linearly with item count.
- `feedItems.listAll` — same pattern, returns all items to the client. At scale this is a very large payload.
- `feedItems.findByTitle` — full collect then in-memory `.filter()`. No search index. Gets slow past a few thousand items.
- `feedItems.purgeOrphaned` — full collect of all feedItems, then a `ctx.db.get(sourceId)` for every single item. Classic N+1. At 10,000 items this is 10,000 individual Convex reads.
- `feedItems.resetContentExtraction` — full collect, then patches every matching item one-by-one inside the mutation. No batching.
- `static_items.list` — full collect, in-memory sort. Fine now, problematic if static items grow.
- `sources.list` — full collect of all sources with no pagination.
- `getAllFeedCombinations` (queries/feeds.ts) — full collect of locations and services, then per-location `ctx.db.get(officeId)` lookup inside a loop. N+1 on offices.

### N+1 in feed generation

`generateFeedFiles` iterates `sourceIds` and issues one `ctx.runQuery(getSourceById)` per source to build the `sourceMap`. This is N sequential round-trips inside an action for every feed generation. Should be batched or replaced with a single query.

### Feed query fan-out

`getFeedItemsForOfficeService` issues 6 parallel source queries plus one feedItems query per source. With many global sources this can expand to dozens of DB reads per feed generation cycle. At 5 concurrent feed aggregations × N sources, this multiplies quickly.

### xmlContent and htmlContent stored in Convex

`generated_feeds` stores both the full XML and full HTML as strings in a single row. For feeds with 50 items and extracted article content (up to 10,000 chars each), a single feed row could be hundreds of KB. Convex document size limit is 1 MB. This becomes a hard limit if content is verbose. It also means every `upsertFeed` write replaces a large document.

---

## Reliability Concerns

### extractSingleArticle silently swallows failures

On extraction error, the catch block logs but does NOT set `contentExtractedAt`. This means the item stays in the "needs extraction" queue and will be retried on every aggregation cycle forever — even if the URL is permanently blocked, 404'd, or paywalled. There is no "failed permanently" state. Over time this produces a growing backlog of perpetually-retried items.

### extractContentBatch processes only 10 items per run

`getItemsNeedingContent` uses `.take(10)`, so each aggregation cycle drains at most 10 items from the extraction backlog. If sources produce many new articles at once, the backlog grows faster than it drains. The 30-minute cron cycle compounds this — new items sit unextracted for multiple cycles.

### Content extraction never marks YouTube or PDF URLs as done

`extractSingleArticle` correctly skips YouTube and PDF URLs but still calls `updateItemContent` with `fullContent: undefined`. The mutation presumably sets `contentExtractedAt`, marking these as "processed." This is correct behavior but relies on the mutation implementation — if `updateItemContent` only sets `contentExtractedAt` when `fullContent` is defined, these items would be retried indefinitely. Worth verifying.

### No retry budget or circuit breaker per source

`fetchRssSource` is called via `pLimit(3)` but if a source URL is consistently failing (DNS failure, 429, etc.), it still fires on every aggregation cycle. `lastFetchError` is stored but nothing acts on it. A source that fails every 30 minutes accumulates error logs but is never automatically deactivated or backed off.

### `aggregateFeed` catches top-level errors but not extraction errors individually

Content extraction is already wrapped in a try/catch (non-fatal). Feed generation errors bubble up to the outer catch and mark the feed run as `error`. However, if `generateFeedFiles` throws (e.g., office/location/service not found), the run fails but the previously-fetched RSS items have already been written to the DB — they just never get assembled into a feed. The next successful run will pick them up, but the error message may not make the root cause obvious.

### Feed runs table has no cleanup / TTL

`feed_runs` accumulates every run forever. No purge mechanism. Will grow indefinitely.

---

## Scalability Concerns

### Cartesian product of locations x services

`getAllFeedCombinations` returns every active-location × active-service combination. This is the feed count. At 10 offices × 5 locations each × 5 services = 250 feeds. Each feed run triggers: 6 source queries + N feedItem queries + N source lookups + XML/HTML generation + DB upsert. At 5 concurrent aggregations, 250 feeds take 50 batches of 5. The 30-minute cron window may be tight if sources are slow.

### `generated_feeds` grows unbounded

One row per unique (officeSlug, locationSlug, serviceSlug) triple. These rows are upserted (updated in place), so row count is bounded by the number of feed combinations. This is fine. But each row's document size scales with item count and content length — see performance concern above.

### Static items included in every feed globally

`getFeedItemsForOfficeService` fetches all `static_items` with no filter: `ctx.db.query("static_items").collect()`. Every feed includes every static item. If static items grow to dozens of entries, they consume feed slots (capped at 50 total) and dilute location-specific content in every feed regardless of relevance.

### No sub-location support yet

The schema has `locations` as a single level under `offices`. The approved Phase 2 plan includes sub-locations. Adding a sub-location level will require changes to: schema, all 6-scope source queries, feed combination generation, URL structure, and the HTML/XML generators. The current architecture assumes exactly two geographic levels.

---

## Security Concerns

### No authentication on the admin UI

`src/App.tsx` and all Convex `query`/`mutation` exports are public. The admin UI has no login. Anyone who can reach the Convex deployment URL can call mutations (create/update/delete sources, trigger feed runs, purge data). This is currently acceptable for an internal tool, but must be addressed before any public exposure.

### HTTP endpoints unauthenticated

`convex/http.ts` (not reviewed in detail here) likely serves generated feeds publicly. This is intentional for RSS consumers, but if it also exposes any admin endpoints, those need review.

### Input validation on source URLs

The `sources.create` mutation accepts any `url: v.string()` with no format validation. A malformed or malicious URL would be stored and then fetched by the RSS pipeline. `fetchRssSource` passes this URL directly to `rss-parser`. No scheme validation (e.g., rejecting `file://`, `javascript:`, internal IPs) is performed.

### Content injection via RSS items

RSS item titles, descriptions, and links are passed through `escapeXml()` before being written into HTML output, which is correct. However:
- `fullContent` is also passed through `escapeXml()` before inclusion — this is correct for XML-safe output.
- The JSON-LD generation via `dispatchJsonLd` uses `JSON.stringify` which safely escapes the data. No injection risk there.
- The `generateFeedHtml` function uses `JSON.stringify(ld, null, 2)` inside a `<script>` tag. The comment notes this prevents `</script>` injection, which is true for the JSON-LD block itself. If any item data contained `</script>`, `JSON.stringify` would not escape the `/` character. This is a low-severity edge case but worth noting.

### `@aws-sdk/client-s3` still in dependencies

`package.json` lists `@aws-sdk/client-s3: 3.726.0` as a production dependency. The project has moved feed storage from R2 to Convex (comment in `generateFeed.ts`: "Store in Convex instead of R2"). The S3 client appears to be dead code. Unused dependencies increase bundle size and attack surface.

---

## Technical Debt

### ~~Debug/seed mutations left in production~~ ✅ Fixed 2026-03-24

~~Four functions in `convex/feedItems.ts` are development artifacts that remain in the deployed codebase~~

- ~~`seedDocuments` (internalMutation)~~ — **Removed**
- `purgeBySource` (internalMutation) — kept, useful operational tool, internal only
- ~~`debugContentState` (internalQuery)~~ — **Removed**
- ~~`resetContentExtraction` (mutation — PUBLIC)~~ — **Made `internalMutation`**, no longer callable externally

### ~~`feedItems.count` and `feedItems.listAll` — no purpose~~ ✅ Fixed 2026-03-24

~~These two public queries were dead code left over from the Feed Browser refactor.~~ — **Removed** along with `findByTitle`.

### `feedItems.sourceId` is optional

`sourceId: v.optional(v.id("sources"))` in the schema. This was presumably done for backward compatibility. The `purgeOrphaned` mutation explicitly handles `!item.sourceId` as a reason for deletion. Any item without a sourceId is orphaned by definition. New inserts via `seedDocuments` do provide a `sourceId`, but the optional field allows invalid data to exist. Should be made required once orphaned records are cleaned up.

### Schema optional fields for backward compat

Several `feedItems` fields are optional where they arguably should not be:
- `description` — optional, but every consumer falls back to empty
- `pubDate` / `isoDate` — both optional; date sorting degrades silently when missing
- `officeId`, `serviceId`, `locationId` — optional on feedItems, but authority items scoped by these fields need them

These were left optional during iterative schema development. They create silent data quality holes.

### `r2Client.ts` and R2 infrastructure likely orphaned

The migration from R2 to Convex document storage is noted in code comments. `convex/lib/r2Client.ts` may be unused. The `@aws-sdk/client-s3` dependency confirms this was once used. Neither the S3 client nor R2 client appear to be imported by any active code path.

---

## Data Quality Concerns

### Competitor content risk

Per project memory (`feedback_no_competitors.md`): competitor wildlife/pest control feeds must never be included. There is no automated enforcement of this rule. Source URLs are entered manually by admins. A mis-categorized authority source or a global feed that aggregates competitor content would silently appear in all feeds. There is no blocklist, domain allowlist, or post-ingestion content filter.

### Content extraction hit rate

Prior to the user-agent fix, content extraction success rate was approximately 23%. The current rate after adding a browser-like User-Agent header is unknown — no monitoring exists to track it. `debugContentState` can be called manually to inspect state, but there is no automated alert or dashboard metric tracking extraction success rate over time.

### isoDate as string comparison for deduplication

In `getFeedItemsForOfficeService`, deduplication picks the "most recent" item by comparing `isoDate` strings lexicographically (`itemDate > existingDate`). ISO 8601 dates do compare correctly as strings when they use the same format, but mixed formats (e.g., some sources using `2025-03-01T00:00:00Z` and others using `2025-03-01T00:00:00+00:00`) could produce incorrect ordering. The `rss-parser` library normalizes dates, but edge cases in source feeds are not validated.

### 50-item feed cap may exclude relevant items

All feeds are hard-capped at 50 items sorted by `isoDate` descending. Static items (all of them, always included) consume slots from this cap. If there are 10 static items and a location has 45 RSS items, the 5 oldest RSS items are silently dropped. There is no signal to the operator that items are being truncated.

---

## Missing Features

### No update mutation for static_items

`convex/static_items.ts` has `create`, `remove`, and `list` but no `update`. To correct a static item's title, URL, or description, an operator must delete and recreate it. This loses the original `_creationTime` and any future audit trail.

### No pagination anywhere

No query in the system uses cursor-based pagination. All lists (sources, feedItems, static_items, feed_runs, generated_feeds) are full collects. The admin UI renders all records in one pass. As data grows, this will cause slow page loads and eventually hit Convex query execution limits.

### No feed health monitoring

There is no dashboard view showing:
- Which sources consistently fail (lastFetchError is stored but not surfaced in UI)
- Content extraction success rate per source
- Feed run failure rate over time
- Feeds that have 0 items or only static items

Feed health is currently invisible unless an operator manually inspects `feed_runs` or reads Convex logs.

### No source deduplication guard

Two sources with the same URL can be created without error. If both are in scope for the same feed, their items will be fetched twice, stored with identical GUIDs (deduplicated at query time), but double the fetch load occurs every cycle.

### No authority source RSS fetching

Sources with `type: "authority"` are explicitly filtered out of the fetch pipeline in `aggregateFeed`. Authority items are expected to come from `static_items` or be directly inserted via `seedDocuments`. There is no UI or pipeline to automatically populate authority items from a URL, even though the source `type` field accepts `"authority"` and sources can have URLs. This creates an implicit expectation gap.

---

## Known Issues

### static_items `_id` type cast in getFeedItemsForOfficeService

When static_items are mapped into the feed item shape, the code does:

```ts
_id: s._id as unknown as Id<"feedItems">,
```

This is a deliberate type cast to fit the shared return type. The actual value is a `static_items` document ID, not a `feedItems` ID. Any code downstream that receives this array and attempts to use `_id` to look up a `feedItems` record will silently receive a wrong-type ID. Currently the `_id` field is unused downstream (generateFeedFiles does not use it), but this is a latent bug waiting for a consumer that trusts the type.

### `getAllFeedCombinations` returns string IDs, requires casting in aggregateFeed

The `combinations` type returned by `getAllFeedCombinations` uses `officeId: string`, `locationId: string`, `serviceId: string`. At the call site in `aggregateFeed` and `runFullRefresh`, these are cast with `as Id<"offices">` etc. This bypasses type safety — if the query ever returns a malformed ID, the cast hides the error until the downstream mutation fails.

### `purgeOrphaned` is O(n) with unbounded execution time

`feedItems.purgeOrphaned` does a full collect then deletes items one-by-one in a single mutation. Convex mutations have a 1-second execution time limit. With many feedItems this mutation will time out. No batching or pagination is implemented.
