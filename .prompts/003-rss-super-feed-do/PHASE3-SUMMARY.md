# Phase 3 Summary — Feed Generation (RSS 2.0 + HTML with JSON-LD)

## Files Modified

### `convex/schema.ts`
- `feedItems.sourceId`: changed from `v.id("sources")` (required) to `v.optional(v.id("sources"))` — allows authority items with no source row
- Added `officeId: v.optional(v.id("offices"))` to `feedItems`
- Added `serviceId: v.optional(v.id("services"))` to `feedItems`
- Added `.index("by_office_service", ["officeId", "serviceId"])` to `feedItems`

### `convex/mutations/sources.ts`
- `storeFeedItems` args: changed `sourceId: v.id("sources")` to `sourceId: v.optional(v.id("sources"))` — keeps validator in sync with schema

### `convex/actions/aggregation.ts`
- Added call to `internal.actions.generateFeed.generateFeedFiles` after `Promise.allSettled` results logging and before `updateFeedRun` success call

---

## Files Created

### `convex/lib/generateRss.ts`
- Pure TypeScript (no `"use node"`)
- Exports `FeedMeta`, `FeedItem` interfaces
- Exports `escapeXml(str)` — XML entity escaping
- Exports `generateRss2(meta, items)` — produces a valid RSS 2.0 feed string with `atom:link` self-reference and `media:thumbnail` support

### `convex/lib/generateJsonLd.ts`
- Pure TypeScript (no `"use node"`)
- Exports builder functions: `buildVideoObjectLd`, `buildDigitalDocumentLd`, `buildArticleLd`
- Exports `dispatchJsonLd(item)` — selects the correct schema.org type and returns a JSON-LD object ready for `JSON.stringify`
- `FeedPageItem` type exported for use in HTML generator

### `convex/lib/generateHtml.ts`
- Pure TypeScript (no `"use node"`)
- Imports `escapeXml` from `generateRss` and `dispatchJsonLd`/`FeedPageItem` from `generateJsonLd`
- Exports `generateFeedHtml(...)` — produces a full HTML page with: embedded JSON-LD blocks per item, RSS autodiscovery `<link>`, thumbnail images, type badges, truncated descriptions

### `convex/lib/webSub.ts`
- `"use node"` directive (uses `fetch`)
- Exports `pingWebSubHub(hubUrl, topicUrl)` — sends a WebSub publish ping; all errors are caught and logged as warnings (non-fatal)

### `convex/queries/feedItems.ts`
- No `"use node"`
- Exports `getFeedItemsForOfficeService` (internalQuery)
- Resolves all 4 source scopes (global, service, office, office-service) for a given office+service pair
- Also collects authority items via `by_office_service` index
- Deduplicates by guid (keeps most recent isoDate), sorts descending, caps at 50 items

### `convex/queries/offices.ts`
- No `"use node"`
- Exports `getById` (internalQuery) — used by `generateFeed` action to look up office name/slug
- Exports `listActive` (internalQuery) — lists all active offices

### `convex/queries/services.ts`
- No `"use node"`
- Exports `getById` (internalQuery) — used by `generateFeed` action to look up service name/slug
- Exports `listActive` (internalQuery) — lists all active services

### `convex/actions/generateFeed.ts`
- `"use node"` directive (calls R2, calls WebSub)
- Exports `generateFeedFiles` (internalAction)
- Orchestrates: fetch office+service details → get feed items → generate XML + HTML → write both to R2 → ping WebSub hub
- R2 keys follow the pattern: `feeds/{officeSlug}/{serviceSlug}/feed.xml` and `feeds/{officeSlug}/{serviceSlug}/feed.html`
- Reads `FEED_BASE_URL` from env (defaults to `https://feeds.aaacwildlife.com`)
- WebSub hub is hardcoded to `https://pubsubhubbub.appspot.com/`

---

## Key Implementation Notes

- **No circular "use node" contamination**: Pure lib files (`generateRss`, `generateJsonLd`, `generateHtml`) have NO `"use node"` — they can be imported anywhere
- **webSub.ts has `"use node"`** because it uses `fetch` directly in module scope (technically it's a helper, but it's only ever called from Node actions so this is safe)
- **generateHtml.ts imports from lib siblings** using `./generateRss` and `./generateJsonLd` relative paths — this works because all three are pure (no runtime environment mismatch)
- **JSON-LD security**: `JSON.stringify` is used for the entire ld object — no template-literal JSON, no `</script>` injection risk
- **uploadDate timezone normalization**: `dispatchJsonLd` appends `Z` if the isoDate string has no timezone suffix, satisfying schema.org VideoObject requirements
- **feedItems.sourceId is now optional** — existing records with a sourceId continue to work; new authority items can be inserted with `officeId`+`serviceId` instead

---

## How to Verify Phase 3

### 1. Check Convex dashboard — schema deployed
- Go to the Convex dashboard > Data > feedItems table
- Confirm the table has columns: `sourceId` (optional), `officeId` (optional), `serviceId` (optional), `by_office_service` index

### 2. Run generateFeedFiles manually in the dashboard
- Go to Functions > `actions/generateFeed:generateFeedFiles`
- Run with valid `officeId` and `serviceId` values from your `offices` and `services` tables
- Check logs for: `Written to R2: feeds/{officeSlug}/{serviceSlug}/feed.xml and feed.html (N items)`
- Check logs for: `WebSub ping sent for ...` (or a non-fatal warn if hub rejects)

### 3. Check R2 bucket
- In Cloudflare R2, navigate to your bucket
- Confirm `feeds/{officeSlug}/{serviceSlug}/feed.xml` exists and is valid RSS 2.0
- Confirm `feeds/{officeSlug}/{serviceSlug}/feed.html` exists with JSON-LD blocks

### 4. Run full aggregation cycle
- Run `actions/aggregation:runAggregationCycle` from the dashboard
- Confirm feed_runs table shows `status: "success"` entries
- Confirm R2 files are updated after the cycle completes

### 5. Validate RSS
- Download `feed.xml` from R2 public URL
- Paste into https://validator.w3.org/feed/ — should pass with no errors
- Check `<media:thumbnail>` appears for YouTube items

### 6. Validate JSON-LD
- Download `feed.html` from R2 public URL
- Paste into https://search.google.com/test/rich-results
- VideoObject, Article, and DigitalDocument items should validate correctly
