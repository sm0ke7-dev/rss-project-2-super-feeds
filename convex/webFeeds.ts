import { query, mutation, internalQuery } from "./_generated/server";
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
    items: v.array(
      v.object({
        title: v.string(),
        link: v.string(),
      })
    ),
    scrapedItemCount: v.number(),
    lastScrapedAt: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("web_feeds", {
      url: args.url,
      title: args.title,
      items: args.items,
      scrapedItemCount: args.scrapedItemCount,
      lastScrapedAt: args.lastScrapedAt,
    });
  },
});

export const remove = mutation({
  args: { id: v.id("web_feeds") },
  handler: async (ctx, { id }) => {
    await ctx.db.delete(id);
  },
});
