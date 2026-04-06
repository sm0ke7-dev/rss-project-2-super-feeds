# Prompt 004 — Add Branded Section to HTML Feed

<prompt_metadata>
<prompt_id>004-branded-section</prompt_id>
<prompt_type>do</prompt_type>
<project>RSS Super Feed — AAAC Wildlife Removal</project>
<created>2026-04-06</created>
<chain_position>standalone</chain_position>
<output_directory>Project root (code files)</output_directory>
</prompt_metadata>

<role>
You are a senior full-stack developer adding a new "Branded" section to the RSS Super Feed HTML output. You understand the Convex backend, the source type system (brand/authority/freshness), and the HTML feed generation pipeline. You will modify the query layer and HTML generator to support a three-section layout.
</role>

<context>
## Current State

The HTML feed (`feed.html`) currently has **two sections**:
1. **Featured Resources** — Up to 10 items, diversified by schema type (Article, VideoObject, DigitalDocument, AudioObject). Brand-type source items are mixed into this pool.
2. **More Resources** — Up to 20 general items, round-robin interleaved by type.

### How Items Flow Today
- `convex/queries/feedItems.ts` → `getFeedItemsForOfficeService` returns `{ featured, general }`
- Brand-type sources (`sources.type === "brand"`) currently get pushed into the `featured` bucket alongside location-service scored items and promoted videos
- `convex/actions/generateFeed.ts` passes `featuredPageItems` and `generalPageItems` to the HTML generator
- `convex/lib/generateHtml.ts` → `generateFeedHtml()` renders the two sections

### Source Type System
Sources have a `type` field: `"brand"` | `"authority"` | `"freshness"`
- **Brand sources** = company-owned content (YouTube channel, SoundCloud, company blog, documents)
- Sources also have a `scope` field for geographic/service targeting

### Schema Types
Feed items have a `schemaType` field: `"VideoObject"` | `"AudioObject"` | `"DigitalDocument"` | `"Article"`

### Service Context
Services are wildlife removal types: Wildlife Removal, Raccoon Removal, Squirrel Removal, Bat Removal. The branded Article should be relevant to whichever animal/service the feed is for.

## Key Files
- `convex/queries/feedItems.ts` — Query that splits items into featured/general buckets (lines 67-319)
- `convex/lib/generateHtml.ts` — HTML page generator with section rendering (lines 105-457)
- `convex/actions/generateFeed.ts` — Orchestrator that calls query + generators (lines 16-142)
- `convex/lib/generateJsonLd.ts` — JSON-LD structured data helpers
- `convex/schema.ts` — Database schema (sources table has `type` field at line 42)
</context>

<goal>
Add a **Branded** section that appears **above** Featured in the HTML feed. The final section order becomes:

1. **Branded** (new) — Exactly 4 company-owned items, one per schema type
2. **Featured Resources** (existing) — Up to 10 items, diverse types
3. **More Resources** (existing) — Up to 20 general items
</goal>

<instructions>

## Branded Section Requirements

### Content Rules
The Branded section contains **exactly 4 items**, one of each schema type:
1. **VideoObject** — A YouTube video from a brand source
2. **AudioObject** — A SoundCloud track from a brand source  
3. **DigitalDocument** — A document from a brand source
4. **Article** — An article from a brand source, ideally relevant to the feed's service (raccoon, squirrel, bat, or general wildlife)

### Selection Logic
- Only items from sources where `source.type === "brand"` are eligible for the Branded section
- Pick one item per schema type — if multiple candidates exist for a type, prefer the most recent (`isoDate` descending)
- If a schema type has zero brand items available, skip that slot (the section can have fewer than 4 items, but never more)
- Brand items placed in the Branded section must be **excluded** from the Featured section to avoid duplication

### Data Flow Changes

#### 1. Query Layer (`convex/queries/feedItems.ts`)
Modify `getFeedItemsForOfficeService` to return **three** buckets instead of two:

```typescript
return { branded, featured, general };
```

**Branded bucket logic:**
- From the existing `brandDedupedItems` + `brandStaticItems` pool, select one item per schema type (VideoObject, AudioObject, DigitalDocument, Article)
- For the Article slot: if the feed has a `serviceId`, prefer brand Articles whose title or description mentions the service animal (raccoon, squirrel, bat). Fall back to any brand Article if no match.
- Sort candidates within each type by `isoDate` descending, pick the first
- Remove these selected items from the pool before building the Featured bucket

#### 2. Action Layer (`convex/actions/generateFeed.ts`)
- Destructure the new `branded` bucket from the query result
- Map branded items through `toPageItem()` 
- Pass `brandedPageItems` as a new parameter to `generateFeedHtml()`
- Update the item count to include all three buckets

#### 3. HTML Generator (`convex/lib/generateHtml.ts`)
- Add `brandedItems: FeedPageItem[]` parameter to `generateFeedHtml()` (insert before `featuredItems`)
- Render a new section above Featured:

```html
<h2 class="sf-section-heading">From AAAC Wildlife Removal</h2>
<!-- branded items rendered with renderItem() -->
```

- The section heading should be "From AAAC Wildlife Removal" (or similar brand-forward label)
- Use the existing `renderItem()` function — no new card styles needed
- Include branded items in the `allItems` array for JSON-LD generation
- If `brandedItems` is empty, omit the section entirely (same pattern as featured)

## Implementation Steps

1. **Modify the query** (`convex/queries/feedItems.ts`):
   - After building `brandDedupedItems` and `brandStaticItems`, create a combined brand pool
   - Select one per schema type (prefer service-relevant for Article)
   - Remove selected items from the featured pool
   - Return `{ branded, featured, general }`

2. **Update the action** (`convex/actions/generateFeed.ts`):
   - Destructure `branded` from query result
   - Map to page items
   - Pass to HTML generator

3. **Update the HTML generator** (`convex/lib/generateHtml.ts`):
   - Add parameter, render section, update allItems

4. **Test**: Generate a feed and verify the HTML output shows three sections with no duplicate items between Branded and Featured.

## Constraints
- Do NOT change the XML feed output — this only affects the HTML page
- Do NOT modify the database schema — brand items are already identified by `source.type === "brand"`
- Do NOT change the Featured or More Resources selection logic beyond removing items that were claimed by Branded
- Keep the existing shuffle/interleave behavior for Featured and General
- Branded section order should be deterministic: VideoObject → AudioObject → DigitalDocument → Article (matching a natural media-first flow)
</instructions>

<verification>
After implementation, confirm:
- [ ] Query returns `{ branded, featured, general }` with branded containing 0-4 items (one per type max)
- [ ] No item appears in both branded and featured arrays
- [ ] HTML output shows "From AAAC Wildlife Removal" section above "Featured Resources"  
- [ ] Branded section items have correct badges (Video, Audio, Document, Article)
- [ ] JSON-LD includes branded items
- [ ] XML feed is unchanged
- [ ] Featured section still works correctly with remaining brand items (if any overflow)
- [ ] Empty branded section (no brand sources) gracefully omits the section
</verification>
