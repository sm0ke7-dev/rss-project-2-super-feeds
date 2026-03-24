# Testing Strategy

This document describes the current state of testing and validation in the RSS Super Feed project, identifies gaps, and provides actionable suggestions.

---

## What Testing Infrastructure Exists

**None.** There are zero automated tests in this codebase.

Confirmed absence:
- No test runner configured (`vitest`, `jest`, `mocha` — none present in `package.json` dependencies or devDependencies)
- No `*.test.ts`, `*.spec.ts`, or `*.test.tsx` files anywhere in the project
- No `tests/` or `__tests__/` directories
- No test scripts in the `scripts` section of `package.json` (only `dev`, `build`, `lint`, `preview`)
- No CI configuration files (`.github/workflows/`, etc.)

The only quality tooling present is:
- TypeScript compiler (`tsc -b`) run as part of `npm run build`
- ESLint configured via the project root (`npm run lint`), though no project-level `.eslintrc` or `eslint.config.*` file was found — only inherited config from devDependencies

---

## How the System Is Currently Validated

Validation is entirely manual and observation-based, relying on:

### 1. Convex Dashboard
The primary validation tool. After triggering a feed run (via cron or the Manual Trigger page), the developer checks:
- The `feed_runs` table for `status: "success"` or `status: "error"`
- The `error` field on failed runs for root cause information
- The `feedItems` table for item count and content
- The `generated_feeds` table to confirm `xmlContent` and `htmlContent` were written

The Convex dashboard also surfaces real-time logs from `console.log` and `console.error` calls in action handlers, which provide visibility into the aggregation pipeline (e.g., "Fetched 12 items from https://...", "Content extraction: 8/10 succeeded").

### 2. Admin UI (Feed Browser tab)
The `FeedBrowserPage` allows the developer to browse generated feed items and inspect titles, links, and metadata directly in the React admin UI. This provides a human-readable sanity check.

### 3. Direct Feed URL inspection
Generated feeds are served at `/feeds/{officeSlug}/{locationSlug}/{serviceSlug}/feed.xml` and `/feed.html`. Developers can open these URLs in a browser or RSS reader to verify structure and content.

### 4. Manual Trigger page
The `ManualTriggerPage` allows single-feed or all-feed aggregation to be triggered on demand. The developer checks the `Feed Runs` tab afterward for status. This is the primary workflow for verifying changes to the pipeline.

### 5. TypeScript compilation as a proxy for correctness
`npm run build` runs `tsc -b` before Vite bundling. Because `strict: true`, `noUnusedLocals`, and `noUnusedParameters` are enabled, TypeScript compilation catches a meaningful class of bugs. Convex's validator system (`v.string()`, `v.id("tableName")`, etc.) also provides schema-level type safety between the backend and frontend at code-generation time.

---

## Key Areas That Lack Test Coverage

### High risk — core pipeline logic

**1. Six-scope source resolution (`queries/sources.ts`, `queries/feedItems.ts`)**
The logic that determines which sources and feed items belong to a given `(office, location, service)` triple is complex and duplicated across two files. A bug here silently produces wrong feed content — items may be missing or incorrectly included. This is the highest-risk untested area.

**2. Feed item deduplication (`queries/feedItems.ts`)**
After merging items from all applicable sources, deduplication by `guid` is performed with a preference for the most recent `isoDate`. The date comparison uses string lexicographic ordering (`localeCompare`) on ISO strings. This works for well-formed ISO dates but silently fails or produces wrong ordering for items with missing or non-ISO `pubDate`-only dates.

**3. TTL staleness filtering (`queries/sources.ts` — `getSourcesForFeed`)**
The TTL check `nowMs - s.lastFetchedAt > s.ttlMinutes * 60 * 1000` controls whether sources are re-fetched. An off-by-one or unit error here would cause over-fetching (performance impact) or under-fetching (stale feeds). There is no test verifying the boundary condition.

**4. RSS item parsing and normalization (`actions/fetchSource.ts`)**
YouTube vs generic feed parsing follows different code paths. YouTube's `media:group`, `media:thumbnail`, and `yt:videoId` extraction involves several nested optional chain accesses against untyped parsed XML. A change in feed format would silently produce `undefined` thumbnail URLs or missing video IDs.

### Medium risk — output generation

**5. XML/HTML escaping (`lib/generateRss.ts` — `escapeXml`)**
All output uses `escapeXml()` for user-controlled strings. If a new code path adds an unescaped interpolation, it creates both a malformed XML feed and a potential XSS vector in the HTML output. The function itself is simple and correct, but its consistent application is not verified.

**6. RSS 2.0 structure (`lib/generateRss.ts` — `generateRss2`)**
The generated XML must be valid RSS 2.0. There are no tests asserting the presence of required elements (`<channel>`, `<title>`, `<link>`, `<item>`) or that the output is parseable by an RSS reader. A template string regression could produce structurally invalid XML.

**7. JSON-LD dispatch logic (`lib/generateJsonLd.ts` — `dispatchJsonLd`)**
The `schemaType` value on each item determines which JSON-LD builder is called. The timezone normalization for `VideoObject.uploadDate` (appending `Z` when no timezone suffix is present) uses a regex that could miss edge cases. Invalid JSON-LD blocks in the HTML page would affect SEO silently.

### Lower risk — operational concerns

**8. Content extraction filtering (`actions/extractContent.ts`)**
YouTube and PDF URLs are filtered before extraction is attempted. A URL that looks like a YouTube URL but is actually an article (e.g., a blog post about YouTube) would be skipped. The URL pattern check (`url.includes("youtube.com/feeds")` in `fetchSource`, `url.includes("youtube.com") || url.includes("youtu.be")` in `extractContent`) uses different predicates in the two places.

**9. `withRetry` retry logic (`lib/retry.ts`)**
The list of retryable error message substrings is a hardcoded set. There is no test verifying that a new error type from rss-parser would be correctly classified as retryable or non-retryable.

**10. Static items shape adapter (`queries/feedItems.ts`)**
`static_items` records are adapted into the `feedItems` shape using `as unknown as Id<"feedItems">` for the `_id` field. If the `static_items` schema changes, this adapter would silently produce mismatched shapes.

---

## Suggestions: What to Test

### Suggested test setup

Given the existing stack (Vite, TypeScript, no existing test runner), Vitest is the natural choice — it reuses the same TypeScript config and Vite plugins with zero additional configuration.

```
npm install --save-dev vitest
```

Add to `package.json` scripts:
```json
"test": "vitest run",
"test:watch": "vitest"
```

Pure utility functions in `convex/lib/` can be tested directly without any Convex runtime mock.

### Priority 1: Pure utility functions (zero mocking required)

These are the easiest wins and cover the highest-risk output correctness issues.

**`lib/generateRss.ts`**
- `escapeXml` handles all five special characters (`& < > " '`)
- `escapeXml` handles empty string, already-escaped content, and Unicode
- `generateRss2` output contains required RSS 2.0 structure elements
- `generateRss2` output is parseable (round-trip through an RSS parser)
- Items with `fullContent` produce `<content:encoded>` blocks
- Items without `pubDate` omit the `<pubDate>` element cleanly

**`lib/generateHtml.ts`**
- Output contains correct `<link rel="alternate">` pointing to the feed XML URL
- `VideoObject` items produce an iframe embed
- Items without a thumbnail omit the `<figure>` element
- `escapeXml` is applied to all user-controlled values in attributes

**`lib/generateJsonLd.ts`**
- `dispatchJsonLd` routes correctly to `buildVideoObjectLd` for `VideoObject` items
- `dispatchJsonLd` routes to `buildArticleLd` for `Article` and as default
- `buildVideoObjectLd` appends `Z` when `uploadDate` has no timezone suffix
- `buildVideoObjectLd` does not append `Z` when suffix is already present
- `buildArticleLd` truncates `articleBody` at 5000 characters

**`lib/retry.ts`**
- `withRetry` returns successfully on first attempt if no error
- `withRetry` retries on ECONNRESET/timeout errors and succeeds on the second attempt
- `withRetry` does not retry on a 404-style error message
- `withRetry` throws after `maxAttempts` with retryable errors
- Delay is linear: `baseDelayMs * attempt`

### Priority 2: Source resolution and deduplication logic

These require mocking the Convex `ctx.db` interface. The scope resolution and deduplication logic in `queries/sources.ts` and `queries/feedItems.ts` is stateless enough to test with a minimal in-memory mock.

Key scenarios to cover:
- A `global` source is included for every `(office, location, service)` combination
- A `service`-scoped source is included only when `serviceId` matches
- An `office-service`-scoped source is included only when both `officeId` and `serviceId` match
- A `location-service`-scoped source takes priority over `office-service` (both may appear; dedup by URL)
- A source URL appearing in both `global` and `service` scopes is deduplicated to one entry
- TTL filtering: a source with `lastFetchedAt = nowMs - (ttlMinutes * 60 * 1000) - 1` is considered stale
- TTL filtering: a source with `lastFetchedAt = nowMs - 1` is not stale
- A source with `lastFetchedAt = undefined` is always considered stale

Feed item deduplication:
- Two items with the same `guid` from different sources: the one with the more recent `isoDate` wins
- Items with no `isoDate` are sorted after items with dates
- Output is capped at 50 items

### Priority 3: Integration smoke tests (manual checklist until automated)

Until action-level tests are practical, a manual checklist run after each pipeline change:

1. Trigger a single feed run for one `(office, location, service)` combination
2. Confirm `feed_runs` record shows `status: "success"`
3. Open `/feeds/{officeSlug}/{locationSlug}/{serviceSlug}/feed.xml` — confirm valid RSS loads in browser
4. Open `/feeds/{officeSlug}/{locationSlug}/{serviceSlug}/feed.html` — confirm items render with correct badges (Video/Article/Document)
5. Confirm at least one `Article` item has `fullContent` extracted (check `feedItems` table in Convex dashboard)
6. Add a new `global` source, trigger a feed run, confirm items from the new source appear in the feed output
7. Deactivate a source, run `purgeOrphaned`, confirm item count drops

---

## Summary

The system has no automated tests. Correctness is currently validated by running the pipeline and visually inspecting Convex dashboard data and generated feed URLs. The highest-risk gaps are the six-scope resolution logic, feed item deduplication, and RSS/HTML output generation. The pure utility functions in `convex/lib/` are the easiest starting point for adding tests — they require no mocking and cover the critical output correctness surface.
