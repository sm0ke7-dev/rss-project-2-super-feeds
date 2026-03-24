# Codebase Conventions

This document describes the coding patterns, naming conventions, and architectural choices observed in the RSS Super Feed project. It is intended as a reference for contributors and for planning future work.

---

## TypeScript Usage Patterns

**Compiler settings** (`tsconfig.json`):
- `strict: true` — full strict mode is enforced
- `noUnusedLocals: true` and `noUnusedParameters: true` — dead code is a compile error
- `noFallthroughCasesInSwitch: true`
- `target: ES2020`, `module: ESNext`, `moduleResolution: bundler`
- Both `src/` and `convex/` are included in the same TypeScript project

**Type sourcing**:
- Convex-generated types are imported from `convex/_generated/dataModel` (`Id<"tableName">`, typed doc shapes)
- `Id<"tableName">` is used consistently for all foreign key fields, both in Convex backend and React frontend
- Discriminated unions use `v.union(v.literal(...))` in Convex validators and are mirrored as TypeScript union types in the UI (e.g., `type SourceType = "brand" | "authority" | "freshness"`)

**Inline type annotations**:
- Function arguments to handlers are typically destructured with inferred types from Convex validators — explicit parameter types are not duplicated
- Intermediate array items with complex shapes are typed inline using `Array<{...}>` anonymous object types rather than named interfaces (see `fetchRssSource` in `convex/actions/fetchSource.ts`)
- Named interfaces are used for shared cross-file contracts: `FeedMeta`, `FeedItem`, `FeedPageItem`, `VideoObjectLdInput`, etc. (in `convex/lib/`)

**Type assertions**:
- `as const` is used for literal type narrowing in array `.map()` returns (e.g., `schemaType: "VideoObject" as const`)
- Type casts using `as Id<"tableName">` appear in the React UI when converting string form state to Convex IDs — this is intentional and acknowledged as a weak point
- `as unknown as Id<"feedItems">` appears in one place where `static_items` records are adapted into the `feedItems` shape for query output; this is a deliberate shape-compatibility workaround

---

## Convex Patterns

### Action vs internalAction

| Decorator | Visibility | Usage in this codebase |
|---|---|---|
| `action` | Public (callable from client) | Not used — all actions are internal |
| `internalAction` | Internal only (cron, scheduler, other actions) | All pipeline actions: `aggregateFeed`, `runAggregationCycle`, `runFullRefresh`, `fetchRssSource`, `generateFeedFiles`, `extractContentBatch`, `extractSingleArticle` |
| `mutation` | Public | Admin CRUD operations called directly from the React UI: `sources.create`, `sources.update`, `sources.remove`, `feedItems.purgeOrphaned`, `mutations/admin.triggerFeed`, etc. |
| `internalMutation` | Internal only | Data-writing helpers called from actions: `storeFeedItems`, `markFetchError`, `markFetchSuccess`, `updateItemContent`, `createFeedRun`, `updateFeedRun`, `upsertFeed`, `purgeBySource`, `seedDocuments` |
| `query` | Public | Simple read queries for the admin UI: `sources.list`, `offices.list`, `feedRuns.list`, `generatedFeeds.list`, `feedItems.count`, etc. |
| `internalQuery` | Internal only | Complex queries called from actions: `getSourcesForFeed`, `getFeedItemsForOfficeService`, `getItemsNeedingContent`, `getById` lookups, `getAllFeedCombinations` |

**Key convention**: The admin UI only ever calls public `mutation` and `query` functions. All heavy pipeline logic lives in `internalAction` functions. Public `mutation` handlers that need to kick off pipeline work use `ctx.scheduler.runAfter(0, internal.actions.*, args)` rather than calling actions directly — this keeps mutations fast and non-blocking.

### Node.js Runtime

Actions that use Node.js-only packages (rss-parser, @extractus/article-extractor, p-limit, aws-sdk) must declare `"use node";` as the first line of the file. All three action files (`aggregation.ts`, `fetchSource.ts`, `extractContent.ts`, `generateFeed.ts`) carry this directive. Convex library files (`retry.ts`, `generateRss.ts`, etc.) do not, as they contain only pure functions.

### Database Query Pattern

All database reads use index-based queries with `.withIndex("index_name", q => q.eq(...))` rather than full table scans. Secondary `.filter()` is used for additional conditions that cannot be expressed in the index predicate. The six-scope source resolution logic in `queries/sources.ts` and `queries/feedItems.ts` demonstrates this clearly: six parallel index queries are issued with `Promise.all`, then merged in memory.

### Upsert Pattern

Upserts are done manually — Convex has no native upsert. The pattern used is:
```ts
const existing = await ctx.db
  .query("feedItems")
  .withIndex("by_guid", q => q.eq("guid", item.guid))
  .first();
if (!existing) {
  await ctx.db.insert("feedItems", { ... });
}
```
Feed items are insert-only: once stored they are not updated (except `fullContent` and `contentExtractedAt` via `updateItemContent`). This makes the data append-only for freshness and avoids overwriting manually corrected records.

### Env Variable Access

Environment variables are accessed via `process.env[key]` in action files. `convex/lib/env.ts` provides a `requireEnv(key)` helper that throws a descriptive error for missing variables. `FEED_BASE_URL` uses a fallback to empty string (`?? ""`) rather than `requireEnv`, so the action degrades gracefully when the env var is not set.

---

## Naming Conventions

### Files

- Convex backend files are organized by layer:
  - `convex/actions/` — Node.js actions (pipeline steps)
  - `convex/mutations/` — internalMutation and public mutation helpers
  - `convex/queries/` — internalQuery and public query helpers
  - `convex/lib/` — pure utility functions (no Convex context)
  - Root `convex/*.ts` — public-facing CRUD modules (one per entity: `sources.ts`, `offices.ts`, `feedItems.ts`, etc.)
- React pages are in `src/pages/` with `PascalCase` names ending in `Page` (e.g., `SourcesPage.tsx`, `FeedRunsPage.tsx`)
- Shared React components are in `src/components/` (e.g., `Layout.tsx`, `TabNav.tsx`, `Badge.tsx`)

### Functions

- Convex handler exports use `camelCase` and are descriptive: `storeFeedItems`, `markFetchError`, `aggregateFeed`, `runAggregationCycle`, `generateFeedFiles`
- React page components are named to match their file (`export default function SourcesPage()`)
- Event handler functions in React components use the `handle` prefix: `handleSubmit`, `handleDelete`, `handleTriggerOne`, `handleFullRefresh`
- Modal/UI state toggles use the `open`/`close` prefix: `openAdd()`, `openEdit()`, `closeModal()`

### Variables

- Boolean flags use plain `active` (not `isActive` or `enabled`)
- Timestamps stored as Unix milliseconds use the `At` suffix: `lastFetchedAt`, `startedAt`, `completedAt`, `contentExtractedAt`, `generatedAt`, `publishedAt`
- Error strings stored in the database use the `Error` suffix: `lastFetchError`
- Slug fields are named `slug` on every entity (offices, locations, services)
- Feed combination keys in memory use the pattern `officeId:serviceId` or `officeId:locationId:serviceId` as string map keys

### CSS / Tailwind

All UI styling uses Tailwind utility classes directly in JSX. No custom CSS files exist in `src/`. Color-coded badges for source types and scopes use `Record<string, string>` lookup maps (`TYPE_COLORS`, `SCOPE_COLORS`) with Tailwind class strings as values.

---

## React Component Patterns

### Page components

All pages are functional components using React hooks. Pages are "fat" — they own their own data fetching (via `useQuery`) and mutations (via `useMutation`) directly, rather than using a state management layer or context. There is no Redux, Zustand, or React Query.

### Convex hooks

```tsx
const sources = useQuery(api.sources.list);          // returns undefined while loading
const createSource = useMutation(api.sources.create);
```

Loading state is handled inline: `{!sources ? <p>Loading...</p> : <table>...}`. There is no shared loading spinner component.

### Modal pattern

Forms for add/edit use a local `modal` state object with a `{ mode: "add" | "edit", source?: Source }` discriminated union. A single `form` state object (`FormState`) is shared between add and edit modes. The `EMPTY_FORM` constant initializes new forms. Modals render inline in the page JSX as a fixed-overlay div, not via a portal.

### Prop drilling for navigation

The app uses simple prop-drilling for navigation between drill-down views (Dashboard -> OfficeDetail -> LocationDetail). No router library is used. Navigation callbacks (`onSelectOffice`, `onSelectLocation`, `onBack`, `onBackToRoot`) are passed as props. `App.tsx` owns all navigation state (`activeTab`, `selectedOfficeId`, `selectedLocationId`).

### Error display

Inline form errors are not validated field-by-field. Submission guards check required fields (`if (!form.title.trim() || !form.url.trim()) return;`). Async mutation errors are caught and shown as string status messages (see `ManualTriggerPage` pattern). `lastFetchError` on sources is shown inline in table rows.

---

## Error Handling Patterns

### In Convex actions

The main aggregation pipeline uses a try/catch at the top level of `aggregateFeed`. On failure, the error is caught, logged with `console.error`, and written to the `feed_runs` table via `updateFeedRun({ status: "error", error: errorMessage })`. The pattern for extracting the error message is consistent throughout:

```ts
const errorMessage = err instanceof Error ? err.message : String(err);
```

### Non-fatal sub-steps

Content extraction is intentionally wrapped in a nested try/catch inside `aggregateFeed` so that extraction failures do not abort the feed run:

```ts
try {
  await ctx.runAction(internal.actions.extractContent.extractContentBatch, {});
} catch (extractErr) {
  console.error("Content extraction failed (non-fatal):", extractErr);
}
```

### Retry logic

Network errors during RSS fetching use a `withRetry(fn, maxAttempts, baseDelayMs)` utility in `convex/lib/retry.ts`. It retries on connection errors and timeouts only (ECONNRESET, ECONNREFUSED, ETIMEDOUT, "network", "fetch failed"). It does not retry on 404/403 or parse failures. Retry delay increases linearly: `baseDelayMs * attempt`.

### Failure isolation with Promise.allSettled

Both `runAggregationCycle` (feed-level) and `extractContentBatch` (item-level) use `Promise.allSettled` rather than `Promise.all`, so one failure does not cancel the remaining tasks. Success/failure counts are logged after each batch.

### Concurrency limiting

`p-limit` is used to cap concurrent async tasks:
- Source fetches within a single feed: `pLimit(3)`
- Simultaneous feed aggregations: `pLimit(5)`
- Content extraction per batch: `pLimit(2)`

### In Convex mutations

Simple CRUD mutations do not have try/catch — they let errors propagate naturally to the Convex runtime, which surfaces them to the client as mutation rejections.

### In the React UI

`useMutation` calls are wrapped in `async`/`await` with try/catch in event handlers. Errors are caught and displayed as a string status message. There is no global error boundary.

---

## Scope and Type Model

### Source types (the "why" of a source)

| Type | Meaning |
|---|---|
| `brand` | Content from the company's own properties (own blog, YouTube channel) |
| `authority` | Curated reference content (government/university pages, PDFs); not fetched via RSS pipeline |
| `freshness` | Third-party news/RSS feeds included for recency signals |

Authority sources are filtered out of the RSS fetch pipeline in `aggregateFeed`:
```ts
const fetchableSources = sources.filter(s => s.type !== "authority");
```
They appear in the feed only through `static_items` records manually seeded into the database.

### Source scopes (the "where" of a source)

Six scopes define the geographic/service specificity of a source:

| Scope | Required FK(s) | Meaning |
|---|---|---|
| `global` | none | Applies to every feed |
| `service` | `serviceId` | Applies to all locations for a given service |
| `office` | `officeId` | Applies to all locations under a given office |
| `office-service` | `officeId`, `serviceId` | One office, one service |
| `location` | `locationId` | One specific location, all services |
| `location-service` | `locationId`, `serviceId` | One location, one service (most specific) |

When building a feed for a `(office, location, service)` triple, all six scopes are queried and merged. The scope resolution logic is duplicated between `queries/sources.ts` (for deciding what to fetch) and `queries/feedItems.ts` (for deciding what to include in feed output). URL-based deduplication is applied after merging.

### Schema types (content classification for JSON-LD and feed rendering)

Each feed item carries a `schemaType`:

| Value | Source | JSON-LD type | Rendered as |
|---|---|---|---|
| `VideoObject` | YouTube RSS feeds | `schema.org/VideoObject` | iframe embed + thumbnail |
| `Article` | Generic RSS/blog feeds | `schema.org/Article` | Article card with extracted full content |
| `DigitalDocument` | `static_items` table (PDFs) | `schema.org/DigitalDocument` | Document card |

### Entity hierarchy

```
offices (region/franchise)
  └── locations (city-level sub-entities)

services (pest/wildlife service categories, global)

sources (RSS feeds) — scoped via type + scope + optional FK references
feedItems (cached RSS items) — linked to sources
static_items (manually curated PDFs/docs) — treated as DigitalDocument feed items
generated_feeds (stored XML + HTML output per office+location+service triple)
feed_runs (audit log of aggregation runs)
settings (key-value config store)
```

Feed output is always identified by an `(officeSlug, locationSlug, serviceSlug)` triple, which maps to a URL path of the form `/feeds/{officeSlug}/{locationSlug}/{serviceSlug}/feed.xml`.
