# Integrations Reference

## External Services

### 1. Convex
- **Role**: Backend platform, database, HTTP server, scheduled cron jobs, and feed file storage.
- **Client setup**: `ConvexReactClient` initialized in `src/main.tsx` using `VITE_CONVEX_URL`.
- **Server-side**: Convex actions, queries, and mutations in `convex/` directory.
- **HTTP layer**: `convex/http.ts` exposes a public HTTP router at the Convex site URL serving pre-generated feed files stored in the `generated_feeds` table.
- **Feed URL pattern**: `https://<deployment>.convex.site/feeds/{office-slug}/{location-slug}/{service-slug}/feed.xml` and `/feed.html`
- **Cache-Control**: 30 minutes (`public, max-age=1800`) on feed responses.

### 2. Cloudflare R2 (optional / legacy path)
- **Role**: Object storage for generated feed files (XML + HTML).
- **Status**: Currently bypassed — feed files are stored in Convex instead (see comment in `convex/actions/generateFeed.ts`). The R2 client code (`convex/lib/r2Client.ts`) and Cloudflare Worker (`workers/feed-server/`) remain in the codebase as an alternative delivery path.
- **SDK**: AWS SDK v3 (`@aws-sdk/client-s3`) pointed at the Cloudflare R2 S3-compatible endpoint: `https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
- **Bucket name**: `aaac-super-feeds`
- **Worker**: `workers/feed-server/` — a Cloudflare Worker that reads from R2 and serves feed files with CORS headers.
- **Custom domain** (prepared but not yet active): `feeds.aaacwildlife.com`

### 3. Cloudflare Pages
- **Role**: Hosts the admin UI (Vite SPA build output from `dist/`).
- **Connection to backend**: Single env var `VITE_CONVEX_URL` set in Cloudflare Pages project settings.

### 4. WebSub / PubSubHubbub
- **Role**: Push notification protocol to alert feed aggregators when a feed is updated.
- **Hub**: `https://pubsubhubbub.appspot.com/` (Google's public WebSub hub)
- **Implementation**: `convex/lib/webSub.ts` — POSTs `hub.mode=publish` after each feed generation.
- **Trigger**: Called at the end of `generateFeedFiles` (best-effort; failures are non-fatal).
- **Env var required**: `FEED_BASE_URL` must be set for the topic URL to be constructed correctly.

---

## RSS Feed Integrations

### Feed Parsing
- **Library**: `rss-parser` ^3.13.0
- **Two parser instances** (configured in `convex/actions/fetchSource.ts`):
  - `youtubeParser` — includes custom field extraction for `yt:videoId`, `yt:channelId`, `media:group` (thumbnail URLs, view counts). Items tagged as `schemaType: "VideoObject"`.
  - `genericParser` — standard RSS/Atom parser. Items tagged as `schemaType: "Article"`.
- **Detection**: YouTube feeds identified by URL containing `youtube.com/feeds`.
- **Timeout**: 10 seconds per fetch.
- **Retry**: Up to 3 attempts with 500ms base delay (exponential via `convex/lib/retry.ts`).

### Source Types
Sources in the `sources` table carry a `type` field:
- `brand` — owned content (fetched via RSS pipeline)
- `freshness` — third-party news/content (fetched via RSS pipeline)
- `authority` — authoritative reference content (NOT fetched via RSS; excluded from fetch pipeline)

### Source Scopes
Sources can be scoped to control which feed combinations they appear in:
- `global` — appears in all feeds
- `service` — scoped to one service
- `office` — scoped to one office
- `office-service` — scoped to office + service combination
- `location` — scoped to one location
- `location-service` — scoped to location + service combination

### Full Article Content Extraction
- **Library**: `@extractus/article-extractor` ^8.0.20
- **Implementation**: `convex/actions/extractContent.ts`
- **Behavior**: After RSS items are fetched, `extractContentBatch` runs against `Article`-type items that have no `contentExtractedAt` timestamp. Extracts full article body, strips HTML, truncates to 10,000 characters, stores in `feedItems.fullContent`.
- **Skipped URLs**: YouTube (`youtube.com`, `youtu.be`) and PDFs (`.pdf` extension).
- **Concurrency**: Max 2 simultaneous extractions (`pLimit(2)`).
- **Error handling**: Non-fatal — extraction failures do not block feed generation. Failed items leave `contentExtractedAt` unset so they are retried next cycle.

---

## Authentication Mechanism

There is **no user authentication** on the admin UI. The SPA is an open internal tool — anyone with the Cloudflare Pages URL can access it.

Access control is implicitly limited by:
- The Cloudflare Pages URL not being publicly advertised.
- Convex's deployment-scoped access (the `VITE_CONVEX_URL` points to a private deployment).

The public feed HTTP endpoints (`/feeds/...`) are intentionally open with full CORS (`Access-Control-Allow-Origin: *`).

---

## Environment Variables

### Frontend (set in Cloudflare Pages project settings or `.env.local`)
| Variable | Description |
|----------|-------------|
| `VITE_CONVEX_URL` | Convex deployment URL, e.g. `https://your-deployment.convex.cloud` |

### Convex backend (set via `npx convex env set KEY "value"`)
| Variable | Required | Description |
|----------|----------|-------------|
| `FEED_BASE_URL` | Yes | Public base URL for feed links and WebSub pinging, e.g. `https://<deployment>.convex.site` |
| `R2_ACCOUNT_ID` | No (R2 path only) | Cloudflare account ID for R2 |
| `R2_ACCESS_KEY_ID` | No (R2 path only) | R2 access key |
| `R2_SECRET_ACCESS_KEY` | No (R2 path only) | R2 secret key |
| `R2_BUCKET_NAME` | No (R2 path only) | R2 bucket name (default: `aaac-super-feeds`) |

---

## Data Flow Between Services

### Feed Aggregation Pipeline (automated, every 30 minutes)

```
Convex Cron (every 30 min)
  └─> runAggregationCycle (aggregation.ts)
        └─> For each office × location × service combination:
              aggregateFeed (up to 5 concurrent)
                ├─> fetchRssSource (up to 3 concurrent per feed)
                │     ├─> rss-parser fetches external RSS URL
                │     └─> storeFeedItems mutation → feedItems table
                ├─> extractContentBatch (up to 2 concurrent)
                │     ├─> article-extractor fetches article URLs
                │     └─> updateItemContent mutation → feedItems.fullContent
                └─> generateFeedFiles
                      ├─> Queries feedItems + sources from Convex DB
                      ├─> generateRss2() → XML string
                      ├─> generateFeedHtml() → HTML string (with JSON-LD)
                      ├─> upsertFeed mutation → generated_feeds table
                      └─> pingWebSubHub() → pubsubhubbub.appspot.com
```

### Feed Delivery (on-demand, HTTP GET)

```
Client HTTP GET /feeds/{office}/{location}/{service}/feed.xml
  └─> Convex HTTP Router (http.ts)
        └─> getBySlug query → generated_feeds table
              └─> Returns cached XML or HTML with 30-min Cache-Control
```

### Admin UI Data Flow

```
Browser (Cloudflare Pages)
  └─> ConvexReactClient (VITE_CONVEX_URL)
        ├─> useQuery hooks → real-time subscriptions to Convex DB
        └─> useMutation hooks → write operations
              (offices, locations, services, sources, static_items, etc.)
```

### Manual Trigger Flow

```
Admin UI → ManualTriggerPage
  └─> useMutation / useAction → calls aggregation action directly
        └─> Same pipeline as cron-triggered aggregation
```

### Daily Full Refresh (2 AM UTC)

```
Convex Cron (daily 02:00 UTC)
  └─> runFullRefresh (aggregation.ts)
        └─> Same as runAggregationCycle but forceRefresh: true
              (ignores TTL — fetches all sources regardless of lastFetchedAt)
```
