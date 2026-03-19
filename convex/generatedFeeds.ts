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
