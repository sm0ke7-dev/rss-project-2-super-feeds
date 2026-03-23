import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const http = httpRouter();

const FEED_PATH_RE = /^\/feeds\/([a-z0-9-]+)\/([a-z0-9-]+)\/([a-z0-9-]+)\/(feed\.xml|feed\.html)$/;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// CORS preflight
http.route({
  pathPrefix: "/feeds/",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, { status: 204, headers: corsHeaders });
  }),
});

// Serve feed files
http.route({
  pathPrefix: "/feeds/",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const match = url.pathname.match(FEED_PATH_RE);

    if (!match) {
      return new Response("Not found", { status: 404 });
    }

    const [, officeSlug, locationSlug, serviceSlug, filename] = match;

    const feed = await ctx.runQuery(internal.queries.generatedFeeds.getBySlug, {
      officeSlug,
      locationSlug,
      serviceSlug,
    });

    if (!feed) {
      return new Response("Feed not yet generated", {
        status: 404,
        headers: { "Content-Type": "text/plain" },
      });
    }

    const isXml = filename === "feed.xml";
    const content = isXml ? feed.xmlContent : feed.htmlContent;
    const contentType = isXml
      ? "application/rss+xml; charset=utf-8"
      : "text/html; charset=utf-8";

    return new Response(content, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=1800",
        ...corsHeaders,
      },
    });
  }),
});

export default http;
