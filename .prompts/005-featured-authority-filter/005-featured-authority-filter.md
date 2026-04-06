# Prompt 005 — Featured Section: Authority Sources + Animal Relevance Filter

<prompt_metadata>
<prompt_id>005-featured-authority-filter</prompt_id>
<prompt_type>do</prompt_type>
<project>RSS Super Feed — AAAC Wildlife Removal</project>
<created>2026-04-06</created>
<chain_position>standalone</chain_position>
<depends_on>004-branded-section (already implemented)</depends_on>
<output_directory>Project root (code files)</output_directory>
</prompt_metadata>

<role>
You are a senior full-stack developer modifying the Featured section logic in the RSS Super Feed. You understand the Convex backend, the source type system (brand/authority/freshness), and how feed items flow from queries to HTML output.
</role>

<context>
## Current State (after Prompt 004)

The HTML feed has **three sections**: Branded → Featured Resources → More Resources.

### How Featured Items Are Currently Selected (`convex/queries/feedItems.ts`, lines 240-335)

Currently, items enter the Featured pool via two paths:
1. **Brand source items** — `brandDedupedItems` (items from sources where `source.type === "brand"`)
2. **Location-service scored items** — items from `locationServiceScoped` sources with `relevanceScore === 1`
3. **All VideoObjects** — any video not scored as irrelevant (score !== 3)

After the Branded section claims its 4 items, the remaining Featured pool goes through bucket-by-type, shuffle, cap, and cycle-interleave to produce up to 10 items.

### What Needs to Change

The Featured section should be **redefined** to contain:
- **.gov and .edu content** — Articles and Documents from government/educational sources (authority content)
- **Filtered by animal relevance** — Only items related to the feed's specific service animal

### Source Type System
- Sources have `type`: `"brand"` | `"authority"` | `"freshness"`
- Sources have a `url` field that can be checked for `.gov` or `.edu` domains
- Feed items have a `link` field (the item's URL) which can also be checked for `.gov`/`.edu`
- Static items (from `static_items` table) also have `type` and `url` fields

### Service → Animal Mapping
The 4 services and their animal keywords:
| Service Slug | Service Name | Target Animal(s) | Exclude Animals |
|---|---|---|---|
| `wildlife-removal` | Wildlife Removal | ALL (general) | None — this is the catch-all |
| `raccoon-removal` | Raccoon Removal | raccoon, raccoons | squirrel, bat, snake, rodent, rat, mouse, opossum, skunk, bird, pigeon |
| `squirrel-removal` | Squirrel Removal | squirrel, squirrels | raccoon, bat, snake, rodent, rat, mouse, opossum, skunk, bird, pigeon |
| `bat-removal` | Bat Removal | bat, bats | raccoon, squirrel, snake, rodent, rat, mouse, opossum, skunk, bird, pigeon |

**Wildlife Removal** is the catch-all — it allows ALL animals and should not filter anything out.

### Key Files
- `convex/queries/feedItems.ts` — Main query, lines 67-342 (`getFeedItemsForOfficeService`)
- `convex/schema.ts` — `sources` table has `type` and `url` fields; `feedItems` has `link`, `title`, `description`
- `convex/actions/generateFeed.ts` — Orchestrator (already passes `serviceId` to query)
- No changes needed to `generateHtml.ts` — Featured section rendering stays the same
</context>

<goal>
Redefine the Featured section so it contains **authority content from .gov/.edu sources**, filtered to only show items **relevant to the feed's specific service animal**. Items that don't match go to More Resources instead.
</goal>

<instructions>

## Step 1: Look Up the Service to Get the Animal Keyword

The query already receives `serviceId`. Add a DB lookup at the top of the handler (after the existing office/location/service source queries) to get the service record:

```typescript
const service = await ctx.db.get(serviceId);
const serviceSlug = service?.slug ?? "wildlife-removal";
```

## Step 2: Build the Animal Relevance Filter

Create a helper function (inside or above the handler) that determines if an item is relevant to the feed's service animal:

```typescript
// Animal-keyword exclusion lists per service
const EXCLUDE_ANIMALS: Record<string, string[]> = {
  "raccoon-removal": ["squirrel", "bat", "bats", "snake", "rodent", "rat", "mouse", "mice", "opossum", "skunk", "bird", "pigeon"],
  "squirrel-removal": ["raccoon", "bat", "bats", "snake", "rodent", "rat", "mouse", "mice", "opossum", "skunk", "bird", "pigeon"],
  "bat-removal": ["raccoon", "squirrel", "snake", "rodent", "rat", "mouse", "mice", "opossum", "skunk", "bird", "pigeon"],
};

function isRelevantToService(
  item: { title: string; description?: string; link: string },
  serviceSlug: string
): boolean {
  // Wildlife Removal is the catch-all — everything is relevant
  if (serviceSlug === "wildlife-removal") return true;

  const excludeList = EXCLUDE_ANIMALS[serviceSlug];
  if (!excludeList) return true; // unknown service, fail-open

  // Check title + description for excluded animal keywords
  const textToCheck = `${item.title} ${item.description ?? ""}`.toLowerCase();
  for (const animal of excludeList) {
    // Word-boundary-ish check: look for the animal keyword as a standalone word
    const regex = new RegExp(`\\b${animal}s?\\b`, "i");
    if (regex.test(textToCheck)) return false;
  }
  return true;
}
```

## Step 3: Build an Authority Source ID Set

After `allSources` is built (line 139), create a Set of source IDs for authority-type sources:

```typescript
const authoritySourceIds = new Set(
  allSources.filter((s) => s.type === "authority").map((s) => s._id)
);
```

## Step 4: Create a .gov/.edu Detection Helper

```typescript
function isGovEdu(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return hostname.endsWith(".gov") || hostname.endsWith(".edu");
  } catch {
    return false;
  }
}
```

## Step 5: Redefine the Featured Pool

**Replace the current featured selection logic** (lines 243-257, the block that starts with `// Brand items always go to featured; split the rest into featured vs general`).

The NEW logic for splitting `scoredItems` into featured vs general:

```typescript
// Authority/.gov/.edu items go to Featured (if relevant to service animal)
// Brand items go to Featured (already handled above in brandDedupedItems)
// Everything else → General
const featuredDynamic: (typeof dynamicItems)[0][] = [...brandDedupedItems];
const generalDynamic: (typeof dynamicItems)[0][] = [];

for (const item of scoredItems) {
  // Check if this item is from an authority source OR has a .gov/.edu link
  const isAuthority = item.sourceId && authoritySourceIds.has(item.sourceId as Id<"sources">);
  const isGovEduLink = isGovEdu(item.link);

  if (isAuthority || isGovEduLink) {
    // Authority/.gov/.edu content → Featured, but only if relevant to this service's animal
    if (isRelevantToService(item, serviceSlug)) {
      featuredDynamic.push(item);
    } else {
      generalDynamic.push(item);  // irrelevant authority → demote to general
    }
  } else {
    generalDynamic.push(item);
  }
}
```

This replaces the old logic that promoted items based on `locationServiceSourceIds` scoring and VideoObject type.

## Step 6: Also Filter Static Items for Featured

The static items split (around line 201-204) currently puts brand statics into featured. Update this to also promote authority `.gov/.edu` statics into featured if they pass the animal filter:

```typescript
// Split static items: brand → branded pool, authority .gov/.edu → featured, rest → general
const allStaticItems = [...serviceScopedStaticItems, ...globalStaticItems];
const brandStaticItems = allStaticItems.filter(s => s.type === "brand").map(toFeedItem);

const authorityStaticFeatured = allStaticItems
  .filter(s => s.type === "authority" && isGovEdu(s.url) && isRelevantToService({ title: s.title, description: s.description, link: s.url }, serviceSlug))
  .map(toFeedItem);

const nonFeaturedStaticItems = allStaticItems
  .filter(s => s.type !== "brand" && !(s.type === "authority" && isGovEdu(s.url) && isRelevantToService({ title: s.title, description: s.description, link: s.url }, serviceSlug)))
  .map(toFeedItem);
```

Then update the `allFeaturedPool` merge (around line 273) to include `authorityStaticFeatured`:

```typescript
const allFeaturedPool = [...featuredDynamic, ...brandStaticItems, ...authorityStaticFeatured] as (typeof featuredDynamic)[0][];
```

And update the general merge (around line 338-339) to use `nonFeaturedStaticItems` instead of `nonBrandStaticItems`:

```typescript
const generalAll = shuffle([...shuffledGeneral, ...nonFeaturedStaticItems]);
```

## Step 7: Verify No Other Files Need Changes

- `generateFeed.ts` — NO changes needed (it already passes serviceId to the query)
- `generateHtml.ts` — NO changes needed (Featured section rendering is unchanged)
- `schema.ts` — NO changes needed

## Constraints

- Do NOT change the Branded section logic (already working from Prompt 004)
- Do NOT change the XML feed output
- Do NOT change the database schema
- Do NOT modify the HTML generator
- The Featured section cap (10 items) and type-diversity interleave stays the same
- `wildlife-removal` service is the catch-all — NO animal filtering for that service
- Items that fail the animal relevance check go to More Resources, they are NOT deleted
- The `isRelevantToService` function should use word-boundary matching to avoid false positives (e.g., "bat" shouldn't match "batch" or "combat")

## Testing

After implementation, verify:
- [ ] A raccoon-removal feed's Featured section contains only .gov/.edu items about raccoons/wildlife (not squirrels, bats, snakes)
- [ ] A wildlife-removal feed's Featured section contains ALL .gov/.edu items (no filtering)
- [ ] Items filtered out of Featured still appear in More Resources
- [ ] Branded section is unchanged (still shows 1 per type from brand sources)
- [ ] No duplicate items between Branded and Featured
- [ ] The type-diversity interleave still works in Featured
- [ ] Static authority items from .gov/.edu domains appear in Featured when relevant
</instructions>

<verification>
Run `npx convex dev --once` to deploy, then generate a test feed and check:
1. Featured section has .gov/.edu authority content
2. No off-topic animals appear in Featured for animal-specific services
3. Branded section unchanged
4. More Resources still contains the demoted items
5. Build the admin UI with `npx vite build` to confirm no TS regressions
</verification>
