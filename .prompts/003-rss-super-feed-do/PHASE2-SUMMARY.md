# Phase 2 Summary — Feed Fetching Engine

## Files Created

| File | Purpose |
|------|---------|
| `convex/lib/r2Client.ts` | R2/S3 client factory + `putR2Object` helper |
| `convex/queries/sources.ts` | 4-scope source resolution query + `listSources` public query |
| `convex/queries/feeds.ts` | Cartesian product query for all active office×service combos |
| `convex/mutations/feedRuns.ts` | `createFeedRun` + `updateFeedRun` internal mutations |
| `convex/mutations/sources.ts` | `storeFeedItems`, `markFetchSuccess`, `markFetchError` |
| `convex/mutations/admin.ts` | `triggerFeed` + `triggerAllFeeds` public mutations (for admin UI) |
| `convex/actions/fetchSource.ts` | `fetchRssSource` action — parses RSS/YouTube feeds, upserts to feedItems |
| `convex/actions/aggregation.ts` | `aggregateFeed` + `runAggregationCycle` orchestration actions |

## Schema Changes

Added `feedItems` table to `convex/schema.ts` (between `static_items` and `feed_runs`):

```typescript
feedItems: defineTable({
  sourceId: v.id("sources"),
  guid: v.string(),
  title: v.string(),
  link: v.string(),
  description: v.optional(v.string()),
  pubDate: v.optional(v.string()),
  isoDate: v.optional(v.string()),
  videoId: v.optional(v.string()),
  channelId: v.optional(v.string()),
  thumbnailUrl: v.optional(v.string()),
  viewCount: v.optional(v.string()),
  schemaType: v.union(
    v.literal("VideoObject"),
    v.literal("Article"),
    v.literal("DigitalDocument")
  ),
})
  .index("by_source", ["sourceId"])
  .index("by_guid", ["guid"]),
```

This table was not in Phase 1's schema but is required for Phase 2 to persist parsed RSS items.

## Packages Installed

| Package | Version | Notes |
|---------|---------|-------|
| `rss-parser` | latest | RSS/Atom feed parsing with YouTube custom fields |
| `p-limit` | latest | Concurrency limiter for parallel fetch tasks |
| `@aws-sdk/client-s3` | **3.726.0 (pinned)** | R2 uploads — 3.729.0+ has an R2 regression, must stay pinned |

## Deviations from Plan

1. **feedItems table added to schema** — The plan referenced storing parsed items in `feedItems` but that table wasn't in Phase 1's schema. Rather than defer or stub it out, the table was added as part of Phase 2 since it's required for the fetching engine to actually work end-to-end.

2. **`storeFeedItems` uses upsert-by-guid** — Checks `by_guid` index before inserting to prevent duplicates on re-runs. The guid dedup is global (not per-source), which is correct since guids should be globally unique per RSS spec.

3. **`markFetchSuccess` kept as a standalone export** — Even though `storeFeedItems` handles the timestamp update internally, `markFetchSuccess` is kept as a separate export for any future flows that need to mark success without storing items.

## Architecture Notes

- All `convex/actions/` files and `convex/lib/r2Client.ts` have `"use node"` at top (required for Node.js runtime)
- Queries and mutations do NOT have `"use node"`
- Imports use `"../_generated/server"` and `"../_generated/api"` (two dots up from subdirectories)
- Authority-type sources are skipped in `aggregateFeed` — they are manually curated and not fetched via RSS
- Per-feed isolation: if individual source fetches fail, the feed run still completes with `"success"` status (failure is recorded per-source via `markFetchError`)
- `p-limit(3)` for source fetches within a feed, `p-limit(5)` for concurrent feeds in a full cycle

## Verifying via Convex Dashboard

1. **Check schema deployed**: Go to Convex dashboard > Data — you should see a `feedItems` table appear after `npx convex dev` picks up the schema change.

2. **Seed sources if you haven't**: Run `seed` mutation from the Functions panel if sources aren't populated yet.

3. **Trigger a single feed run**: In Functions panel, run `mutations/admin:triggerFeed` with a valid `officeId` and `serviceId` from your seeded data.

4. **Watch feed_runs table**: A new row should appear with `status: "running"` then flip to `status: "success"`.

5. **Check feedItems table**: Should populate with parsed RSS items from any non-authority sources attached to that office/service combination.

6. **Check sources table**: `lastFetchedAt` fields should be populated; any failed sources will have `lastFetchError` set.

7. **Trigger full cycle**: Run `mutations/admin:triggerAllFeeds` to exercise the full cartesian product aggregation.

## R2 Environment Variables (not yet needed until Phase 3 feed generation)

The `r2Client.ts` file is created but not yet called by Phase 2 code. Set these in Convex dashboard > Settings > Environment Variables when ready:
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET_NAME`
