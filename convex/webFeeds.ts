import { query, mutation, internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";

export const getById = internalQuery({
  args: { id: v.id("web_feeds") },
  handler: async (ctx, { id }) => {
    return await ctx.db.get(id);
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("web_feeds").collect();
  },
});

export const create = mutation({
  args: {
    url: v.string(),
    title: v.string(),
    feedType: v.optional(v.literal("youtube")),
    items: v.array(
      v.object({
        title: v.string(),
        link: v.string(),
        videoId: v.optional(v.string()),
        thumbnailUrl: v.optional(v.string()),
        description: v.optional(v.string()),
        publishedAt: v.optional(v.string()),
      })
    ),
    scrapedItemCount: v.number(),
    lastScrapedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const feedId = await ctx.db.insert("web_feeds", {
      url: args.url,
      title: args.title,
      feedType: args.feedType,
      items: args.items,
      scrapedItemCount: args.scrapedItemCount,
      lastScrapedAt: args.lastScrapedAt,
    });

    // Derive the Convex site URL (HTTP actions URL)
    const convexSiteUrl =
      process.env.CONVEX_SITE_URL ??
      (process.env.CONVEX_URL?.replace(".convex.cloud", ".convex.site") ?? "");
    const rssUrl = `${convexSiteUrl}/generated/${feedId}/feed.xml`;

    // Create a matching sources row so the feed pipeline can ingest this feed
    const sourceId = await ctx.db.insert("sources", {
      url: rssUrl,
      title: args.title,
      type: "freshness",
      scope: "global",
      ttlMinutes: 60,
      active: true,
    });

    // Link the source back to the web feed
    await ctx.db.patch(feedId, { sourceId });

    return feedId;
  },
});

export const remove = mutation({
  args: { id: v.id("web_feeds") },
  handler: async (ctx, { id }) => {
    const feed = await ctx.db.get(id);
    if (feed?.sourceId) {
      // Cascade: delete feedItems belonging to this source
      const items = await ctx.db
        .query("feedItems")
        .withIndex("by_source", (q) => q.eq("sourceId", feed.sourceId!))
        .collect();
      for (const item of items) {
        await ctx.db.delete(item._id);
      }
      await ctx.db.delete(feed.sourceId);
    }
    await ctx.db.delete(id);
  },
});

export const listAll = internalQuery({
  args: {},
  handler: async (ctx) => ctx.db.query("web_feeds").collect(),
});

export const updateItems = internalMutation({
  args: {
    id: v.id("web_feeds"),
    items: v.array(
      v.object({
        title: v.string(),
        link: v.string(),
        videoId: v.optional(v.string()),
        thumbnailUrl: v.optional(v.string()),
        description: v.optional(v.string()),
        publishedAt: v.optional(v.string()),
      })
    ),
    scrapedItemCount: v.number(),
    lastScrapedAt: v.number(),
  },
  handler: async (ctx, { id, items, scrapedItemCount, lastScrapedAt }) => {
    await ctx.db.patch(id, { items, scrapedItemCount, lastScrapedAt });
  },
});
