# Debug: Raccoon Feed — Missing VideoObject / AudioObject Items

## Problem

The raccoon HTML feed output never shows video or audio items — it's always articles only, and the content is the same no matter how many times the feed is regenerated. The other three services (wildlife-removal, squirrel-removal, bat-removal) correctly display YouTube and SoundCloud items.

## What I Already Know From Code Analysis

### The pipeline (simplified)

1. `aggregateFeed` → calls `fetchRssSource` per source → stores items in `feedItems` table
2. `generateFeedFiles` → calls `getFeedItemsForOfficeService` → selects and buckets items → renders HTML

### How schemaType is assigned (fetchSource.ts)

URL-based detection at fetch time:
- `url.includes("youtube.com/feeds")` → `VideoObject`
- `url.includes("feeds.soundcloud.com")` → `AudioObject`
- `url.includes(".convex.site/generated/")` → detects per-item by link URL (YouTube/SoundCloud/Article)
- Everything else → `genericParser` → `Article` (with one exception: item links to soundcloud.com → AudioObject)

### The upsert (mutations/sources.ts: storeFeedItems)

Existing items only get their schemaType corrected if the NEW fetch gives a different type:
```ts
if (existing.schemaType !== item.schemaType) patch.schemaType = item.schemaType;
```
So if a source URL still falls to the generic parser, the schemaType stays wrong forever.

### What isRelevantToService does for raccoon (queries/feedItems.ts)

Excludes items that mention: squirrel, bat, bats, snake, rodent, rat, mouse, mice, opossum, skunk, bird, pigeon.
BUT this only applies to FEATURED section authority/.gov/.edu items. Brand items and general items bypass this filter entirely.

### Why "same content every regen"

`generateFeedFiles` re-renders from whatever is already in the DB — it does NOT re-fetch sources. Only `aggregateFeed` fetches. If the admin "regen" button only triggers `generateFeedFiles`, nothing changes.

---

## Investigation Steps

### Step 1 — Check raccoon source URLs in the Convex dashboard

Go to the Convex dashboard → Data → `sources` table. Filter by:
- `serviceId` matching raccoon-removal
- OR global sources (scope = "global")

For each source that should produce video/audio, check:
- Does the URL contain `youtube.com/feeds/videos.xml`? → Will be correctly detected
- Does it use a YouTube channel page URL (not the feed URL)? → Falls to generic parser → Article
- Does the URL contain `feeds.soundcloud.com`? → Correct
- Does it contain `.convex.site/generated/`? → Correct (uses enriched parser)
- Any other URL format → Articles only

### Step 2 — Check feedItems for raccoon sources

In Convex dashboard → Data → `feedItems`. Filter by sourceId for raccoon sources. Check:
- Are there items with `schemaType: "VideoObject"` or `"AudioObject"`?
- If ALL items show `schemaType: "Article"` for a YouTube source → the source URL is wrong format
- If items DO have VideoObject/AudioObject → the issue is in the selection/filtering logic

### Step 3 — Check if the global brand YouTube source has correct items

The global brand source (`AAAC Wildlife Removal YouTube`) uses `youtube.com/feeds/videos.xml?channel_id=UCsT0YIqwnpJCM-mx7-gSA4Q`. Items from this source should have `schemaType: "VideoObject"`. These brand items appear in ALL services including raccoon. If they're showing as Article, the source fetch is broken.

### Step 4 — Check whether raccoon-specific YouTube/SoundCloud sources exist

If raccoon only has generic web feed sources (no YouTube/SoundCloud sources), video/audio will never appear. Compare the source list for raccoon vs squirrel/bat — squirrel and bat likely have service-scoped YouTube or SoundCloud sources that raccoon is missing.

---

## Likely Root Causes (ranked)

1. **Raccoon has no service-scoped YouTube/SoundCloud sources** — other services do. Fix: add sources for raccoon in the admin UI with the correct YouTube feed URL format.

2. **Raccoon's YouTube/SoundCloud sources use wrong URL format** — e.g., `https://www.youtube.com/channel/UCXXX` instead of `https://www.youtube.com/feeds/videos.xml?channel_id=UCXXX`. Fix: update the source URL in admin UI to use the feed format.

3. **Items are stale from before fix caa409b** — stored as Article, not yet re-fetched. Fix: trigger a full refresh (not just feed regen) from the admin UI.

4. **`isRelevantToService` over-filtering raccoon** — unlikely to cause COMPLETE absence since brand items bypass it, but could cause featured section to be thin.

---

## Fixes Required

### Fix A — If source URLs are wrong format

In the Convex dashboard or admin UI, update the raccoon YouTube source URL from:
```
https://www.youtube.com/channel/CHANNEL_ID
```
to:
```
https://www.youtube.com/feeds/videos.xml?channel_id=CHANNEL_ID
```

And SoundCloud from:
```
https://soundcloud.com/user-name  (wrong — falls to generic)
```
to:
```
https://feeds.soundcloud.com/users/soundcloud:users:USER_ID/sounds.rss  (correct)
```

### Fix B — Backfill stale schemaTypes (already available)

`convex/migrations.ts` already has `fixMediaSchemaTypes` and `diagnoseMediaSources`. Run them:

```bash
# First diagnose
npx convex run migrations:diagnoseMediaSources

# Then fix stale Article schemaTypes
npx convex run migrations:fixMediaSchemaTypes
```

### Fix C — Prevent future misclassification (already applied to code)

Two bugs were fixed in `fetchSource.ts`:
1. **Generic parser branch** now detects YouTube watch URLs as VideoObject (previously all non-SoundCloud was Article)
2. **generatedFeedParser branch** now detects YouTube watch/youtu.be links as VideoObject even when `yt:videoId` is absent from the XML (the main feed XML generated by `generateRss2` doesn't emit `yt:videoId`, only `media:thumbnail`)

Deploy the updated backend: `npx convex dev --once`

---

## Key Files

- `convex/actions/fetchSource.ts` — source type detection and schemaType assignment
- `convex/mutations/sources.ts` — `storeFeedItems` upsert logic
- `convex/queries/feedItems.ts` — `getFeedItemsForOfficeService`, `isRelevantToService`
- `convex/migrations.ts` — add backfill mutation here
- `convex/actions/aggregation.ts` — `runFullRefresh` for forcing a complete re-fetch

## Verification

After applying fixes:
1. Trigger a full refresh (not just regen) from admin UI
2. Check that raccoon feedItems now include VideoObject and AudioObject entries
3. Regenerate the raccoon feed HTML
4. Confirm video iframes and audio players appear in the output
