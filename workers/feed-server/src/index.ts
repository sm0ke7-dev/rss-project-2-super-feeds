export interface Env {
  FEED_BUCKET: R2Bucket;
}

// Valid feed key pattern: feeds/{office-slug}/{service-slug}/feed.xml or feed.html
const VALID_KEY_RE = /^feeds\/[a-z0-9-]+\/[a-z0-9-]+\/feed\.(xml|html)$/;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
} as const;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // Only allow GET
    if (request.method !== "GET") {
      return new Response("Method not allowed", { status: 405 });
    }

    const url = new URL(request.url);
    // Strip leading slash to get the R2 key
    const key = url.pathname.slice(1);

    // Validate key format
    if (!VALID_KEY_RE.test(key)) {
      return new Response("Not found", { status: 404 });
    }

    // Fetch from R2
    const object = await env.FEED_BUCKET.get(key);

    if (!object) {
      return new Response("Feed not found", { status: 404 });
    }

    // Build response headers from R2 object metadata
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);
    headers.set("Cache-Control", "public, max-age=1800"); // 30 minutes
    headers.set("Access-Control-Allow-Origin", "*");

    return new Response(object.body, { headers });
  },
} satisfies ExportedHandler<Env>;
