# RSS Super Feed — Research Findings

## Research Date: 2026-03-19
## Status: complete

---

## Area 1: Convex Backend Patterns

### Key Findings

- Convex schema lives in `convex/schema.ts` using `defineSchema()` + `defineTable()`. Every document automatically gets `_id` and `_creationTime` fields.
- **Actions** are the correct primitive for external HTTP calls (fetching RSS/YouTube feeds). They can call `ctx.runMutation()` and `ctx.runQuery()` to persist results. They do NOT have direct DB access.
- **Mutations** are for transactional writes. **Queries** are for reads. Both must be deterministic and have a 1-second execution cap.
- **Actions** have a 10-minute execution timeout, 64MB memory (Convex runtime) or 512MB (Node.js runtime). Up to 1000 concurrent operations per action.
- Cron jobs are defined in `convex/crons.ts` and support interval, cron syntax, hourly, daily, weekly, monthly schedules.
- Environment variables accessed via `process.env.KEY`. Max 100 per deployment; names max 40 chars; values max 8KB.
- HTTP actions require a file named exactly `http.ts`. They use `httpRouter()` + `httpAction()` and are served from the `.convex.site` domain (not `.convex.cloud`).
- The Convex runtime is similar to Cloudflare Workers — no Node.js APIs by default. Add `"use node"` at the top of a file to use Node.js; that file cannot also contain queries or mutations.
- `Date.now()` is frozen to execution start time in queries/mutations (determinism requirement). Actions do not have this restriction.

### Code Examples

#### Complete Schema Definition

```typescript
// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  offices: defineTable({
    slug: v.string(),
    name: v.string(),
    isActive: v.boolean(),
  })
    .index("by_slug", ["slug"]),

  services: defineTable({
    slug: v.string(),
    name: v.string(),
  })
    .index("by_slug", ["slug"]),

  sources: defineTable({
    type: v.union(
      v.literal("brand"),
      v.literal("authority"),
      v.literal("freshness")
    ),
    scope: v.union(
      v.literal("global"),
      v.literal("service"),
      v.literal("office"),
      v.literal("office-service")
    ),
    officeId: v.optional(v.id("offices")),
    serviceId: v.optional(v.id("services")),
    url: v.string(),
    label: v.optional(v.string()),
    ttlMinutes: v.number(),
    lastFetchedAt: v.optional(v.number()), // Unix ms timestamp
    isActive: v.boolean(),
  })
    .index("by_scope", ["scope"])
    .index("by_office", ["officeId"])
    .index("by_service", ["serviceId"])
    .index("by_office_service", ["officeId", "serviceId"]),

  feedItems: defineTable({
    sourceId: v.id("sources"),
    guid: v.string(),
    title: v.string(),
    link: v.string(),
    description: v.optional(v.string()),
    pubDate: v.optional(v.string()),
    isoDate: v.optional(v.string()),
    // YouTube-specific
    videoId: v.optional(v.string()),
    channelId: v.optional(v.string()),
    thumbnailUrl: v.optional(v.string()),
    duration: v.optional(v.string()),
    viewCount: v.optional(v.string()),
    // Schema.org type hint
    schemaType: v.union(
      v.literal("VideoObject"),
      v.literal("DigitalDocument"),
      v.literal("Article")
    ),
  })
    .index("by_source", ["sourceId"])
    .index("by_guid", ["guid"]),

  feedRuns: defineTable({
    officeId: v.id("offices"),
    serviceId: v.id("services"),
    status: v.union(
      v.literal("pending"),
      v.literal("running"),
      v.literal("complete"),
      v.literal("error")
    ),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
    itemCount: v.optional(v.number()),
  })
    .index("by_office_service", ["officeId", "serviceId"])
    .index("by_status", ["status"]),
});
```

#### Action That Fetches External URL and Stores via Mutation

```typescript
// convex/actions/fetchSource.ts
"use node"; // Needed if using Node.js libraries (e.g. rss-parser)

import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import Parser from "rss-parser";

type CustomItem = {
  "yt:videoId"?: string;
  "yt:channelId"?: string;
  "media:group"?: {
    "media:thumbnail"?: { $?: { url: string; width: string; height: string } };
    "media:statistics"?: { $?: { views: string } };
  };
};

const parser = new Parser<Record<string, unknown>, CustomItem>({
  customFields: {
    item: [
      ["yt:videoId", "yt:videoId"],
      ["yt:channelId", "yt:channelId"],
      ["media:group", "media:group"],
    ],
  },
});

export const fetchRssSource = internalAction({
  args: {
    sourceId: v.id("sources"),
    url: v.string(),
  },
  handler: async (ctx, args) => {
    let feed;
    try {
      feed = await parser.parseURL(args.url);
    } catch (err) {
      // Log error but don't throw — per-feed isolation
      console.error(`Failed to fetch source ${args.sourceId}:`, err);
      await ctx.runMutation(internal.mutations.sources.markFetchError, {
        sourceId: args.sourceId,
        error: String(err),
      });
      return;
    }

    const items = feed.items.map((item) => ({
      guid: item.guid ?? item.link ?? item.title ?? "",
      title: item.title ?? "",
      link: item.link ?? "",
      description: item.contentSnippet ?? item.content ?? "",
      pubDate: item.pubDate,
      isoDate: item.isoDate,
      videoId: item["yt:videoId"],
      channelId: item["yt:channelId"],
      thumbnailUrl: item["media:group"]?.["media:thumbnail"]?.["$"]?.url,
      viewCount: item["media:group"]?.["media:statistics"]?.["$"]?.views,
    }));

    await ctx.runMutation(internal.mutations.sources.storeFeedItems, {
      sourceId: args.sourceId,
      items,
    });
  },
});
```

#### Cron Job Definition

```typescript
// convex/crons.ts
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Aggregate all feeds every 30 minutes
crons.interval(
  "aggregate-all-feeds",
  { minutes: 30 },
  internal.actions.aggregation.runAggregationCycle,
);

// Daily full refresh at 2am UTC
crons.daily(
  "daily-full-refresh",
  { hourUTC: 2, minuteUTC: 0 },
  internal.actions.aggregation.runFullRefresh,
);

export default crons;
```

#### Internal Mutation to Store Feed Items

```typescript
// convex/mutations/sources.ts
import { internalMutation } from "../_generated/server";
import { v } from "convex/values";

export const storeFeedItems = internalMutation({
  args: {
    sourceId: v.id("sources"),
    items: v.array(
      v.object({
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
      })
    ),
  },
  handler: async (ctx, args) => {
    // Upsert each item by guid
    for (const item of args.items) {
      const existing = await ctx.db
        .query("feedItems")
        .withIndex("by_guid", (q) => q.eq("guid", item.guid))
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, item);
      } else {
        await ctx.db.insert("feedItems", {
          ...item,
          sourceId: args.sourceId,
          schemaType: item.videoId ? "VideoObject" : "Article",
        });
      }
    }

    // Update lastFetchedAt on the source
    await ctx.db.patch(args.sourceId, { lastFetchedAt: Date.now() });
  },
});
```

#### Environment Variable Access

```typescript
// In any action/mutation
const r2AccountId = process.env.R2_ACCOUNT_ID;
const r2AccessKeyId = process.env.R2_ACCESS_KEY_ID;
const r2SecretKey = process.env.R2_SECRET_ACCESS_KEY;
const r2BucketName = process.env.R2_BUCKET_NAME;

// Set via CLI:
// npx convex env set R2_ACCOUNT_ID 'your-account-id'
// npx convex env set R2_ACCESS_KEY_ID 'your-key'
// npx convex env set R2_SECRET_ACCESS_KEY 'your-secret'
```

#### Pagination Pattern

```typescript
// In a query
import { paginationOptsValidator } from "convex/server";

export const listFeedItems = query({
  args: {
    sourceId: v.id("sources"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("feedItems")
      .withIndex("by_source", (q) => q.eq("sourceId", args.sourceId))
      .paginate(args.paginationOpts);
  },
});
```

### Gotchas & Limitations

- **Cron skipping**: If a cron execution runs longer than its interval, subsequent runs are skipped. For a 30-minute aggregation cycle, ensure the action completes well within 30 minutes.
- **No auto-retry for actions**: Unlike mutations, actions are not retried on failure. Build explicit error handling and retry logic.
- **Dangling promises**: All promises inside an action must be awaited. Unresolved async tasks may not complete.
- **Multiple DB calls in actions are non-transactional**: Each `ctx.runMutation()` call is a separate transaction. Batch writes into a single mutation when consistency matters.
- **`"use node"` isolation**: A file with `"use node"` cannot also export Convex queries or mutations. Split into separate files.
- **Node.js runtime argument size**: 5MiB limit (vs 16MiB for Convex runtime). Avoid passing large payloads to Node.js actions.
- **`Date.now()` is frozen in mutations/queries**: Always use actions if you need real current time.
- **HTTP actions served from `.convex.site`**: Not `.convex.cloud`. These are different domains and different security contexts.
- **Environment variable exports**: Never conditionally export functions based on `process.env`. The function registry is static at deploy time.
- **Schema validation on push**: If existing documents fail new validators, deployment is blocked. Plan migrations.
- **Record keys**: `v.record()` only accepts `v.string()` keys (ASCII only). Cannot use `v.literal()` for record keys.
- **Circular ID references**: If two tables reference each other, one reference must be `v.optional()` to break the cycle during initial inserts.

### Checklist Status

- [x] Schema design (defineTable, validators, indexes)
- [x] Actions vs mutations vs queries
- [x] HTTP actions (httpRouter, httpAction)
- [x] Cron jobs (syntax, limitations)
- [x] Error handling in actions
- [x] Environment variables
- [x] Pagination patterns

---

## Area 2: Cloudflare Integration

### Key Findings

- R2 is S3-compatible using SigV4 authentication. The endpoint is `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`. Region must always be set to `"auto"`.
- `@aws-sdk/client-s3` works with R2 out of the box. PutObject, GetObject, DeleteObject, ListObjects, and multipart uploads are all supported.
- **Critical limitation**: Cannot use the S3-compatible API during local `wrangler dev` — only works in production or preview deployments. For local testing, use the Workers R2 binding API instead.
- **Workers R2 binding** (`env.BUCKET.put/get/delete`) is the native approach when running logic inside a Worker. The S3 SDK approach is for calling R2 from *outside* Workers (e.g. from a Convex action).
- `object.writeHttpMetadata(headers)` is the correct way to transfer stored Content-Type and other metadata to the response when serving from Workers.
- Cloudflare Pages for Vite+React: build command `npm run build`, output directory `dist`. Deploys automatically on every git push.
- R2 does NOT support: ACLs, object tagging, versioning, bucket policies, object locking, KMS encryption, website redirects.

### Code Examples

#### R2 PutObject via @aws-sdk/client-s3 (from Convex action)

```typescript
// convex/lib/r2Client.ts
"use node";

import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";

export function getR2Client() {
  const accountId = process.env.R2_ACCOUNT_ID!;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID!;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY!;

  return new S3Client({
    region: "auto", // Required by SDK but ignored by R2
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
}

export async function putR2Object(
  key: string,
  body: string,
  contentType: string
) {
  const client = getR2Client();
  const bucket = process.env.R2_BUCKET_NAME!;

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
}

// Usage from a Convex action:
// await putR2Object(`${officeSlug}/${serviceSlug}/feed.xml`, xmlString, "application/rss+xml");
// await putR2Object(`${officeSlug}/${serviceSlug}/feed.html`, htmlString, "text/html");
```

#### Cloudflare Worker: Serve R2 Objects by URL Path

```typescript
// workers/feed-server/src/index.ts
export interface Env {
  FEED_BUCKET: R2Bucket;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Expected pattern: /{office-slug}/{service-slug}/feed.xml or /feed.html
    const key = url.pathname.slice(1); // Remove leading slash

    // Validate path pattern
    const validPattern = /^[a-z0-9-]+\/[a-z0-9-]+\/feed\.(xml|html)$/;
    if (!validPattern.test(key)) {
      return new Response("Not Found", { status: 404 });
    }

    const object = await env.FEED_BUCKET.get(key);

    if (object === null) {
      return new Response("Feed not found", { status: 404 });
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers); // Copies Content-Type, Cache-Control, etc.
    headers.set("etag", object.httpEtag);
    headers.set("Cache-Control", "public, max-age=1800"); // 30 min cache

    // CORS for embedding
    headers.set("Access-Control-Allow-Origin", "*");

    return new Response(object.body, { headers });
  },
};
```

#### wrangler.toml for Worker with R2 Binding

```toml
# workers/feed-server/wrangler.toml
name = "aaac-feed-server"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[[r2_buckets]]
binding = "FEED_BUCKET"
bucket_name = "aaac-super-feeds"

# For preview/local development (uses a separate bucket)
[[r2_buckets]]
binding = "FEED_BUCKET"
bucket_name = "aaac-super-feeds-dev"
preview_bucket_name = "aaac-super-feeds-dev"

[vars]
ENVIRONMENT = "production"
```

#### Cloudflare Pages — Deploy Vite+React Admin UI

Build settings (set in Cloudflare Pages dashboard or `pages.dev`):
- **Build command**: `npm run build`
- **Build output directory**: `dist`
- **Root directory**: `admin/` (if monorepo)

No `wrangler.toml` needed for basic Pages deployment. For Pages Functions (if needed):

```toml
# admin/wrangler.toml (only needed for Pages Functions)
name = "aaac-admin"
pages_build_output_dir = "dist"
compatibility_date = "2024-01-01"
```

#### wrangler.toml for Worker with R2 (complete example with routes)

```toml
name = "aaac-feed-server"
main = "src/index.ts"
compatibility_date = "2024-01-01"

# Custom domain routing (optional)
routes = [
  { pattern = "feeds.aaacwildlife.com/*", zone_name = "aaacwildlife.com" }
]

[[r2_buckets]]
binding = "FEED_BUCKET"
bucket_name = "aaac-super-feeds"
```

### Gotchas & Limitations

- **S3 SDK + local dev**: The `@aws-sdk/client-s3` pointing to R2 does NOT work with `wrangler dev` local emulation. It only works against the real R2 API. For integration tests locally, mock the S3 client or use the Workers R2 binding directly.
- **`@aws-sdk/client-s3` version breakage**: v3.729.0 introduced a regression breaking PutObject and UploadPart against R2. Pin to a known-good version (e.g. `3.726.0` or verify latest changelog before upgrading).
- **R2 has no public access by default**: Objects are private. The Worker acts as the access layer — do not enable public bucket access unless intentional.
- **Content-Type inference**: R2 will auto-infer Content-Type from the body if not specified in PutObject. Always set it explicitly for `feed.xml` (`application/rss+xml`) and `feed.html` (`text/html; charset=utf-8`).
- **No ACLs in R2**: Ignore any ACL-related options from the S3 SDK — R2 will reject them.
- **R2 egress is free**: No data transfer cost for outbound reads from Workers. Cost is only for operations (Class A: write/list, Class B: read).
- **Pages vs Workers**: Admin UI goes on Pages (static hosting). Feed server goes on Workers (dynamic request handling with R2 binding).

### Checklist Status

- [x] R2 S3-compatible API (PutObject, auth, endpoint)
- [x] Workers routing + R2 binding (wrangler.toml, env.BUCKET.get/put)
- [x] Pages deployment (Vite + React)
- [x] wrangler.toml configuration

---

## Area 3: RSS/Atom Feed Handling

### Key Findings

- **rss-parser** is the right choice for this project: it handles both RSS 2.0 and Atom, normalizes output, and has built-in `customFields` support for YouTube's `yt:` and `media:` namespaces. It supports Node.js (and browser with CORS proxy).
- **fast-xml-parser** is a lower-level XML parser requiring manual RSS/Atom mapping. Better for performance-critical parsing of arbitrary XML. More configuration overhead. Not ideal here since rss-parser already covers the use cases.
- YouTube Atom feeds use 3 namespaces: `xmlns:yt` (YouTube-specific), `xmlns:media` (MRSS), and the standard Atom namespace. Each entry has rich video metadata including thumbnail, view count, and star ratings.
- RSS 2.0 generation is simplest via template literals — no library required for output.
- WebSub (formerly PubSubHubbub) ping is a simple HTTP POST to a hub URL with `application/x-www-form-urlencoded` data.

### Code Examples

#### Parsing a YouTube Atom Feed with rss-parser

```typescript
"use node"; // Required in Convex for npm packages with Node.js dependencies

import Parser from "rss-parser";

type YouTubeItem = {
  "yt:videoId"?: string;
  "yt:channelId"?: string;
  "media:group"?: {
    "media:title"?: string;
    "media:content"?: {
      $?: { url: string; type: string; width: string; height: string };
    };
    "media:thumbnail"?: {
      $?: { url: string; width: string; height: string };
    };
    "media:description"?: string;
    "media:community"?: {
      "media:starRating"?: {
        $?: { count: string; average: string; min: string; max: string };
      };
      "media:statistics"?: { $?: { views: string } };
    };
  };
};

const youtubeParser = new Parser<Record<string, unknown>, YouTubeItem>({
  customFields: {
    item: [
      ["yt:videoId", "yt:videoId"],
      ["yt:channelId", "yt:channelId"],
      ["media:group", "media:group"],
    ],
  },
  timeout: 10000, // 10 second timeout
});

export async function parseYouTubeFeed(channelId: string) {
  const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
  const feed = await youtubeParser.parseURL(url);

  return feed.items.map((item) => {
    const mediaGroup = item["media:group"];
    return {
      guid: `yt:video:${item["yt:videoId"]}`,
      title: item.title ?? "",
      link: item.link ?? `https://www.youtube.com/watch?v=${item["yt:videoId"]}`,
      description: mediaGroup?.["media:description"] ?? item.contentSnippet ?? "",
      pubDate: item.pubDate,
      isoDate: item.isoDate,
      videoId: item["yt:videoId"],
      channelId: item["yt:channelId"],
      thumbnailUrl: mediaGroup?.["media:thumbnail"]?.["$"]?.url,
      viewCount: mediaGroup?.["media:community"]?.["media:statistics"]?.["$"]?.views,
      schemaType: "VideoObject" as const,
    };
  });
}
```

#### Parsing a Generic Third-Party RSS Feed (Freshness sources)

```typescript
import Parser from "rss-parser";

const genericParser = new Parser({
  timeout: 10000,
});

export async function parseGenericFeed(url: string) {
  const feed = await genericParser.parseURL(url);

  return feed.items.map((item) => ({
    guid: item.guid ?? item.link ?? `${url}:${item.title}`,
    title: item.title ?? "(no title)",
    link: item.link ?? url,
    description: item.contentSnippet ?? item.content ?? "",
    pubDate: item.pubDate,
    isoDate: item.isoDate,
    schemaType: "Article" as const,
  }));
}
```

#### Generating RSS 2.0 XML

```typescript
function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

interface FeedItem {
  title: string;
  link: string;
  description: string;
  guid: string;
  pubDate?: string;
  thumbnailUrl?: string;
  videoId?: string;
}

interface FeedMeta {
  title: string;
  link: string;
  description: string;
  officeSlug: string;
  serviceSlug: string;
  lastBuildDate: string;
}

export function generateRss2(meta: FeedMeta, items: FeedItem[]): string {
  const itemsXml = items
    .map(
      (item) => `
    <item>
      <title><![CDATA[${item.title}]]></title>
      <link>${escapeXml(item.link)}</link>
      <description><![CDATA[${item.description}]]></description>
      <guid isPermaLink="${item.videoId ? "false" : "true"}">${escapeXml(item.guid)}</guid>
      ${item.pubDate ? `<pubDate>${item.pubDate}</pubDate>` : ""}
      ${
        item.thumbnailUrl
          ? `<media:thumbnail url="${escapeXml(item.thumbnailUrl)}" xmlns:media="http://search.yahoo.com/mrss/"/>`
          : ""
      }
    </item>`
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:media="http://search.yahoo.com/mrss/"
  xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title><![CDATA[${meta.title}]]></title>
    <link>${escapeXml(meta.link)}</link>
    <description><![CDATA[${meta.description}]]></description>
    <lastBuildDate>${meta.lastBuildDate}</lastBuildDate>
    <atom:link href="https://feeds.aaacwildlife.com/${meta.officeSlug}/${meta.serviceSlug}/feed.xml"
      rel="self" type="application/rss+xml"/>
    ${itemsXml}
  </channel>
</rss>`;
}
```

#### WebSub Ping HTTP Request

```typescript
// Ping a WebSub hub when a feed is updated
export async function pingWebSubHub(
  hubUrl: string,
  topicUrl: string
): Promise<void> {
  const body = new URLSearchParams({
    "hub.mode": "publish",
    "hub.url": topicUrl, // Some hubs use hub.url; others use hub.topic
    "hub.topic": topicUrl,
  });

  const response = await fetch(hubUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (response.status !== 200 && response.status !== 204) {
    console.warn(`WebSub ping to ${hubUrl} returned status ${response.status}`);
  }
}

// Usage:
// await pingWebSubHub(
//   "https://pubsubhubbub.appspot.com/",
//   `https://feeds.aaacwildlife.com/${officeSlug}/${serviceSlug}/feed.xml`
// );
```

#### YouTube Atom Feed XML Structure Reference

Raw fields available per entry (from live feed inspection):

```
Feed-level:
  <yt:channelId>          Channel ID
  <title>                  Channel name
  <author><name>          Channel display name
  <author><uri>           Channel URL

Per entry:
  <id>                    yt:video:{videoId}
  <yt:videoId>            Video ID (e.g. "dQw4w9WgXcQ")
  <yt:channelId>          Channel ID
  <title>                 Video title
  <link rel="alternate">  YouTube watch URL
  <author><name>          Channel name
  <published>             ISO 8601 publish date
  <updated>               ISO 8601 last update

  <media:group>
    <media:title>         Video title (duplicate of <title>)
    <media:content url= type= width= height=>  Video embed URL + dims
    <media:thumbnail url= width= height=>      Thumbnail URL + dims
    <media:description>   Full description text
    <media:community>
      <media:starRating count= average= min= max=>  Ratings
      <media:statistics views=>                     View count
```

### Gotchas & Limitations

- **rss-parser is CJS**: Works fine in Node.js and Convex Node.js actions. If used in browser or ESM-only environment, use `import Parser from 'rss-parser'` with a bundler.
- **CORS on YouTube feeds**: YouTube RSS endpoints do NOT include CORS headers, so fetching from browsers fails. Always fetch from server-side (Convex action or Worker). This is fine for this project.
- **rss-parser timeout**: Add `timeout` to constructor options (in ms). Default has no timeout, which can stall Convex actions.
- **YouTube `media:group` nesting**: The `media:group` element is a nested object. Access sub-elements like `item["media:group"]["media:thumbnail"]["$"]["url"]` — always use optional chaining.
- **fast-xml-parser for authority sources**: For `.edu/.gov` PDFs that are just plain URLs (not actual RSS feeds), no parsing is needed — treat them as static items. Only use a parser for actual RSS/Atom feeds.
- **RSS 2.0 CDATA**: Always wrap title/description in `<![CDATA[...]]>` to avoid XML escaping issues with special characters in wildlife content.
- **`guid` uniqueness**: For YouTube, use `yt:video:{videoId}` format. For other sources, use the item's `link` URL as fallback guid if no explicit guid element exists.
- **WebSub hub options**: Google's hub is `https://pubsubhubbub.appspot.com/`. For self-hosted or Superfeedr, use their respective hub URLs. The ping is best-effort — failure should not block feed generation.

### Checklist Status

- [x] rss-parser vs fast-xml-parser comparison
- [x] YouTube Atom feed structure (all fields documented)
- [x] RSS 2.0 generation (template literal approach)
- [x] WebSub ping mechanism

---

## Area 4: Schema.org Structured Data

### Key Findings

- **VideoObject** (for YouTube items): Google requires `name`, `thumbnailUrl`, and `uploadDate` for rich results eligibility. Strongly recommended: `description`, `contentUrl` or `embedUrl`, `duration`.
- **DigitalDocument** (for .edu/.gov PDFs): No Google-specific required fields. Use `name`, `url`, `description`, `author`, `datePublished`, `encodingFormat` ("application/pdf").
- **Article** (for news/RSS items): Use `headline`, `url`, `datePublished`, `author`, `description`, `publisher`.
- Multiple JSON-LD blocks can be embedded in a single HTML page — one per item, or as an array in a single `@graph` block.
- JSON-LD blocks go in `<script type="application/ld+json">` tags anywhere in `<head>` or `<body>`.

### Code Examples

#### JSON-LD for VideoObject (YouTube)

```typescript
interface VideoObjectLd {
  title: string;
  description: string;
  thumbnailUrl: string;
  uploadDate: string; // ISO 8601
  videoId: string;
  duration?: string; // ISO 8601 duration e.g. "PT3M45S"
  viewCount?: string;
}

function buildVideoObjectLd(item: VideoObjectLd): object {
  return {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: item.title,
    description: item.description,
    thumbnailUrl: item.thumbnailUrl,
    uploadDate: item.uploadDate,
    embedUrl: `https://www.youtube.com/embed/${item.videoId}`,
    contentUrl: `https://www.youtube.com/watch?v=${item.videoId}`,
    ...(item.duration && { duration: item.duration }),
    ...(item.viewCount && {
      interactionStatistic: {
        "@type": "InteractionCounter",
        interactionType: "https://schema.org/WatchAction",
        userInteractionCount: item.viewCount,
      },
    }),
  };
}
```

#### JSON-LD for DigitalDocument (.edu/.gov PDF)

```typescript
interface DigitalDocumentLd {
  title: string;
  url: string;
  description?: string;
  author?: string;
  datePublished?: string;
  publisher?: string;
}

function buildDigitalDocumentLd(item: DigitalDocumentLd): object {
  return {
    "@context": "https://schema.org",
    "@type": "DigitalDocument",
    name: item.title,
    url: item.url,
    encodingFormat: "application/pdf",
    ...(item.description && { description: item.description }),
    ...(item.author && {
      author: {
        "@type": "Organization",
        name: item.author,
      },
    }),
    ...(item.datePublished && { datePublished: item.datePublished }),
    ...(item.publisher && {
      publisher: {
        "@type": "Organization",
        name: item.publisher,
      },
    }),
  };
}
```

#### JSON-LD for Article (third-party RSS)

```typescript
interface ArticleLd {
  headline: string;
  url: string;
  description?: string;
  datePublished?: string;
  author?: string;
  publisherName?: string;
}

function buildArticleLd(item: ArticleLd): object {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: item.headline,
    url: item.url,
    ...(item.description && { description: item.description }),
    ...(item.datePublished && { datePublished: item.datePublished }),
    ...(item.author && {
      author: {
        "@type": "Person",
        name: item.author,
      },
    }),
    ...(item.publisherName && {
      publisher: {
        "@type": "Organization",
        name: item.publisherName,
      },
    }),
  };
}
```

#### HTML Page Template with Embedded JSON-LD Blocks

```typescript
interface FeedPageItem {
  title: string;
  link: string;
  description: string;
  pubDate?: string;
  thumbnailUrl?: string;
  videoId?: string;
  schemaType: "VideoObject" | "DigitalDocument" | "Article";
  author?: string;
  publisherName?: string;
}

export function generateFeedHtml(
  officeName: string,
  serviceName: string,
  officeSlug: string,
  serviceSlug: string,
  items: FeedPageItem[]
): string {
  const ldBlocks = items.map((item) => {
    let ld: object;

    if (item.schemaType === "VideoObject" && item.videoId) {
      ld = buildVideoObjectLd({
        title: item.title,
        description: item.description,
        thumbnailUrl: item.thumbnailUrl ?? "",
        uploadDate: item.pubDate ?? new Date().toISOString(),
        videoId: item.videoId,
      });
    } else if (item.schemaType === "DigitalDocument") {
      ld = buildDigitalDocumentLd({
        title: item.title,
        url: item.link,
        description: item.description,
        datePublished: item.pubDate,
        publisher: item.publisherName,
      });
    } else {
      ld = buildArticleLd({
        headline: item.title,
        url: item.link,
        description: item.description,
        datePublished: item.pubDate,
        author: item.author,
        publisherName: item.publisherName,
      });
    }

    return `<script type="application/ld+json">\n${JSON.stringify(ld, null, 2)}\n</script>`;
  });

  const itemsHtml = items
    .map(
      (item) => `
  <article class="feed-item">
    ${item.thumbnailUrl ? `<img src="${item.thumbnailUrl}" alt="${item.title}" loading="lazy">` : ""}
    <h2><a href="${item.link}" target="_blank" rel="noopener">${item.title}</a></h2>
    ${item.pubDate ? `<time>${item.pubDate}</time>` : ""}
    <p>${item.description}</p>
  </article>`
    )
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${officeName} — ${serviceName} | Wildlife News Feed</title>
  <meta name="description" content="Latest wildlife removal news and resources for ${officeName}">
  <link rel="alternate" type="application/rss+xml"
    title="${officeName} ${serviceName} Feed"
    href="https://feeds.aaacwildlife.com/${officeSlug}/${serviceSlug}/feed.xml">
  ${ldBlocks.join("\n  ")}
  <style>
    body { font-family: system-ui, sans-serif; max-width: 800px; margin: 0 auto; padding: 1rem; }
    .feed-item { border-bottom: 1px solid #eee; padding: 1rem 0; }
    .feed-item img { max-width: 100%; height: auto; }
  </style>
</head>
<body>
  <h1>${officeName} — ${serviceName}</h1>
  <p>Latest wildlife news, resources, and videos.</p>
  ${itemsHtml}
</body>
</html>`;
}
```

#### Using @graph for Multiple Items in One Block (Alternative)

```typescript
function buildGraphBlock(items: FeedPageItem[]): string {
  const graph = {
    "@context": "https://schema.org",
    "@graph": items.map((item) => {
      // Dispatch to appropriate builder...
      if (item.schemaType === "VideoObject" && item.videoId) {
        return buildVideoObjectLd({ /* ... */ });
      }
      return buildArticleLd({ /* ... */ });
    }),
  };
  return `<script type="application/ld+json">\n${JSON.stringify(graph, null, 2)}\n</script>`;
}
```

### Gotchas & Limitations

- **Google VideoObject required fields**: Without `name`, `thumbnailUrl`, AND `uploadDate`, the item is not eligible for Video rich results in Google Search. All three are mandatory.
- **`uploadDate` timezone**: Google recommends including timezone offset in `uploadDate` (e.g. `2024-03-31T08:00:00+08:00`). ISO string without timezone defaults to Googlebot's timezone which can cause indexing inconsistencies.
- **`thumbnailUrl` must be accessible**: Google's crawler must be able to fetch the thumbnail. YouTube thumbnail URLs (`i.ytimg.com`) are publicly accessible — no issue there.
- **`duration` format**: Must be ISO 8601 duration format (`PT1M54S` for 1 minute 54 seconds). YouTube's API provides this; it's NOT in the free Atom feed. Either omit `duration` or use the YouTube Data API v3 (requires API key) to enrich it.
- **DigitalDocument has no Google Search enhancement**: Unlike VideoObject and Article, DigitalDocument does not unlock any specific rich result type in Google Search. It still provides semantic value for other parsers.
- **Multiple `<script type="application/ld+json">` blocks are valid**: Google supports multiple separate JSON-LD blocks per page. No need to merge everything into one `@graph` block, though that's also valid.
- **HTML injection risk**: Always use `JSON.stringify()` for building JSON-LD — never template-literal the JSON-LD values directly, as titles/descriptions could contain `</script>` and break the page.

### Checklist Status

- [x] VideoObject JSON-LD (Google required + recommended fields)
- [x] DigitalDocument JSON-LD
- [x] Article JSON-LD
- [x] HTML page template with embedded JSON-LD blocks

---

## Area 5: Concurrency & Error Handling

### Key Findings

- **p-limit** is ESM-only from v5+. In a Convex Node.js action (`"use node"`), use `import pLimit from 'p-limit'`. With a bundler, this works fine.
- **p-limit v6** is the current major version as of 2024. Install with `npm install p-limit`.
- **`Promise.allSettled` + p-limit** is the canonical pattern for per-feed error isolation: each feed fetch is wrapped, failures are captured as `{ status: 'rejected', reason }` without short-circuiting other feeds.
- **TTL caching**: Store `lastFetchedAt` (Unix ms) on each source document. In the aggregation action, skip sources where `Date.now() - lastFetchedAt < ttlMs`. This prevents hammering external servers and burning Convex action time.
- **Convex action timeouts**: 10 minutes. For ~96 office×service combinations, plan carefully — run aggregation as a fan-out of per-feed actions rather than a single mega-action.

### Code Examples

#### p-limit + Promise.allSettled for Per-Feed Error Isolation

```typescript
"use node";

import pLimit from "p-limit";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";

// Limit to 3 concurrent source fetches to avoid hammering external servers
const limit = pLimit(3);

export const aggregateFeed = internalAction({
  args: { officeId: v.id("offices"), serviceId: v.id("services") },
  handler: async (ctx, args) => {
    // Get all active sources for this office+service combination
    const sources = await ctx.runQuery(
      internal.queries.sources.getSourcesForFeed,
      { officeId: args.officeId, serviceId: args.serviceId }
    );

    // Build limited fetch tasks
    const fetchTasks = sources.map((source) =>
      limit(() =>
        ctx.runAction(internal.actions.fetchSource.fetchRssSource, {
          sourceId: source._id,
          url: source.url,
        })
      )
    );

    // Execute with isolation — one failure doesn't kill the rest
    const results = await Promise.allSettled(fetchTasks);

    // Log failures without throwing
    let successCount = 0;
    let failureCount = 0;

    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        successCount++;
      } else {
        failureCount++;
        console.error(
          `Source ${sources[index]._id} (${sources[index].url}) failed:`,
          result.reason
        );
      }
    });

    console.log(
      `Feed aggregation complete: ${successCount} succeeded, ${failureCount} failed`
    );

    // Proceed to generate feed even if some sources failed
    await ctx.runAction(internal.actions.feedGenerator.generateFeedFiles, {
      officeId: args.officeId,
      serviceId: args.serviceId,
    });
  },
});
```

#### TTL Check Pattern

```typescript
// In a mutation or query — check if a source needs re-fetching
export function isSourceStale(
  lastFetchedAt: number | undefined,
  ttlMinutes: number
): boolean {
  if (lastFetchedAt === undefined) return true; // Never fetched
  const ttlMs = ttlMinutes * 60 * 1000;
  return Date.now() - lastFetchedAt > ttlMs;
}

// In the aggregation action — filter to only stale sources
const staleSources = sources.filter((source) =>
  isSourceStale(source.lastFetchedAt, source.ttlMinutes)
);

console.log(
  `Skipping ${sources.length - staleSources.length} fresh sources, ` +
  `fetching ${staleSources.length} stale sources`
);
```

#### Fan-Out Pattern for Scale (Cron → Multiple Actions)

```typescript
// convex/actions/aggregation.ts
"use node";

import pLimit from "p-limit";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";

// The cron entry point — fans out to per-feed actions
export const runAggregationCycle = internalAction({
  args: {},
  handler: async (ctx) => {
    const allCombinations = await ctx.runQuery(
      internal.queries.feeds.getAllOfficeServiceCombinations
    );

    // Use p-limit to control fan-out — don't fire all 96 at once
    const feedLimit = pLimit(5); // 5 feeds in parallel

    const tasks = allCombinations.map(({ officeId, serviceId }) =>
      feedLimit(() =>
        ctx.runAction(internal.actions.aggregation.aggregateFeed, {
          officeId,
          serviceId,
        })
      )
    );

    const results = await Promise.allSettled(tasks);

    const failed = results.filter((r) => r.status === "rejected");
    if (failed.length > 0) {
      console.error(`${failed.length} feeds failed aggregation`);
    }
  },
});
```

#### Retry Helper for Transient Failures

```typescript
async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  delayMs = 1000
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
      }
    }
  }
  throw lastError;
}

// Usage:
// const feed = await withRetry(() => parser.parseURL(source.url), 3, 500);
```

### Gotchas & Limitations

- **p-limit is ESM-only (v5+)**: If you see `ERR_REQUIRE_ESM`, you're trying to `require()` it in a CJS context. Convex Node.js actions use ESM imports natively — use `import pLimit from 'p-limit'`.
- **Deadlock risk with p-limit**: Never call the same `limit()` instance from within a function already wrapped by that same `limit()`. This creates a deadlock. Use separate limiters for the outer fan-out and inner source fetching.
- **`Promise.allSettled` vs `Promise.all`**: Use `allSettled` for isolation (all promises run regardless of failures). Use `all` only when you want to fail-fast on first error — not appropriate here.
- **Convex cron + 10-min timeout**: A single action processing 96 feeds × N sources each could approach the 10-minute timeout. The fan-out pattern (cron schedules per-feed actions) is safer. Each per-feed action is smaller and faster.
- **p-limit `.clearQueue()`**: Calling this discards pending tasks. Don't use it unless you explicitly want to cancel remaining work (e.g. on shutdown). If `rejectOnClear: true`, pending tasks reject with `AbortError`.
- **TTL for YouTube feeds**: YouTube's public RSS endpoint is not rate-limited, but polling it too frequently (< 5 minutes) is wasteful since YouTube updates feeds every 15-30 minutes. Recommended TTL: 30–60 minutes.
- **TTL for authority sources** (.edu/.gov PDFs): These rarely change. Use a 24-hour TTL.
- **TTL for freshness feeds** (conservation news): Use 1–4 hour TTL depending on source update frequency.

### Checklist Status

- [x] p-limit usage with concurrency: 3
- [x] Promise.allSettled for error isolation
- [x] TTL check pattern (compare timestamps)
- [x] Convex action timeouts and limits

---

## Cross-Cutting Concerns

### Convex + R2 Integration Architecture

The cleanest integration pattern:
1. **Convex cron** triggers an action every 30 minutes
2. **Convex action** (Node.js runtime) fetches RSS sources, stores items in Convex DB
3. **Convex action** reads items from DB, generates `feed.xml` and `feed.html` strings
4. **Convex action** calls R2 via `@aws-sdk/client-s3` to PUT the generated files
5. **Cloudflare Worker** serves public requests from R2 via native binding

This means R2 credentials (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`) live in Convex environment variables. The Worker does NOT need credentials — it uses the native R2 binding.

### Monorepo Structure Recommendation

```
/
├── convex/                    # Convex backend
│   ├── schema.ts
│   ├── crons.ts
│   ├── http.ts                # HTTP actions (admin webhooks if needed)
│   ├── actions/
│   │   ├── fetchSource.ts     # "use node" — rss-parser
│   │   ├── generateFeed.ts    # "use node" — R2 PutObject
│   │   └── aggregation.ts     # "use node" — p-limit, orchestration
│   ├── mutations/
│   │   └── sources.ts
│   └── queries/
│       └── feeds.ts
├── workers/
│   └── feed-server/           # Cloudflare Worker
│       ├── src/index.ts
│       └── wrangler.toml
└── admin/                     # Cloudflare Pages (Vite + React)
    ├── src/
    ├── vite.config.ts
    └── package.json
```

### Key Data Flow

```
Convex Cron (every 30 min)
  → aggregation.ts action
    → per-feed aggregateFeed action (fan-out, p-limit(5))
      → fetchRssSource action per stale source (p-limit(3))
        → rss-parser.parseURL()
        → ctx.runMutation(storeFeedItems)
      → generateFeedFiles action
        → ctx.runQuery(getFeedItems)
        → generateRss2() → XML string
        → generateFeedHtml() → HTML string
        → R2 PutObject (feed.xml, feed.html)
        → pingWebSubHub() (best-effort)

Cloudflare Worker (public requests)
  /{office}/{service}/feed.xml → env.FEED_BUCKET.get(key)
  /{office}/{service}/feed.html → env.FEED_BUCKET.get(key)
```

### Source Scope Resolution Logic

When building a feed for `office=X, service=Y`, collect sources from all applicable scopes:
1. `scope: "global"` — always included
2. `scope: "service"` where `serviceId = Y` — included
3. `scope: "office"` where `officeId = X` — included
4. `scope: "office-service"` where `officeId = X AND serviceId = Y` — included

Deduplicate by URL before fetching to avoid pulling the same source twice.

---

## Open Questions

1. **YouTube Data API v3 for duration**: The free YouTube Atom feed does NOT include video duration. If `duration` is needed for VideoObject JSON-LD (it's Google-recommended), you need the YouTube Data API v3. This requires an API key and separate quota management. **Decision needed**: include duration or omit?

2. **Feed deduplication strategy**: When the same item appears in multiple sources (e.g. a conservation org that also has a YouTube channel), should it be deduplicated by URL/GUID at the feed level? **Recommendation**: Yes, deduplicate within a single feed output by guid.

3. **Admin UI scope for prototype**: The brief mentions a React admin UI on Cloudflare Pages. Minimum viable features: list offices/services, list sources per scope, manually trigger feed regeneration, view last-fetch status. Convex reactive queries make this straightforward.

4. **Convex vs Worker for feed generation**: Feed generation (XML/HTML string building) could happen in either Convex (before R2 write) or in the Worker (on-demand, reading items from Convex). **Recommendation**: Generate in Convex action and store static files in R2 — simpler, cached, and eliminates Worker compute on every request.

5. **`authority` source handling**: .edu/.gov URLs are static items (no RSS parsing). They should be stored directly as manual `feedItems` entries with `schemaType: "DigitalDocument"`. No TTL needed — only refresh when an admin manually updates them.

---

## Recommended Packages

| Package | Version | Purpose | Justification |
|---------|---------|---------|---------------|
| `rss-parser` | `^3.13.0` | Parse RSS 2.0 + Atom feeds including YouTube | Best-in-class feed normalization, custom field support for `yt:` and `media:` namespaces, TypeScript-compatible |
| `@aws-sdk/client-s3` | `^3.726.0` | R2 PutObject from Convex actions | S3-compatible, well-documented R2 support. **Pin to ≤3.726.0** until v3.729.0 regression is confirmed fixed |
| `@aws-sdk/s3-request-presigner` | `^3.726.0` | Presigned URLs for R2 (optional admin upload) | Pair with client-s3, same version pin |
| `p-limit` | `^6.1.0` | Concurrency control for source fetching | ESM-native, battle-tested, minimal footprint |
| `convex` | `^1.x` (latest) | Convex client + server SDK | Core infrastructure |
| `react` | `^18.3.0` | Admin UI | Convex React hooks (`useQuery`, `useMutation`) are React-native |
| `react-dom` | `^18.3.0` | Admin UI renderer | Paired with React |
| `vite` | `^5.x` | Admin UI build tool | Fast HMR, Cloudflare Pages compatible |
| `tailwindcss` | `^3.x` | Admin UI styling | As specified in brief |
| `typescript` | `^5.x` | Type safety across all packages | Convex generates typed APIs |
| `fast-xml-parser` | `^4.x` | Optional: low-level XML parsing fallback | Only needed if rss-parser proves incompatible with specific feed formats |

**Notes**:
- Do not install `@aws-sdk/client-s3` in the Workers package — use the native R2 binding there instead.
- `rss-parser` and `p-limit` must be in the `convex/` package (or a shared workspace package) used by Node.js actions.
- `fast-xml-parser` is optional — evaluate only if rss-parser has issues with specific authority/freshness feeds.
