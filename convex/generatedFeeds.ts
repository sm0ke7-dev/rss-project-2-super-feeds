import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("generated_feeds").collect();
  },
});

export const remove = mutation({
  args: { id: v.id("generated_feeds") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});

export const clearAll = mutation({
  args: {},
  handler: async (ctx) => {
    const feeds = await ctx.db.query("generated_feeds").collect();
    for (const feed of feeds) await ctx.db.delete(feed._id);
    return { deleted: feeds.length };
  },
});
