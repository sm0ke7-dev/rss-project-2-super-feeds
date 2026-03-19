import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {},
  handler: async (ctx) => await ctx.db.query("services").collect(),
});

export const update = mutation({
  args: {
    id: v.id("services"),
    name: v.string(),
    slug: v.string(),
    description: v.string(),
    active: v.boolean(),
  },
  handler: async (ctx, args) => {
    const { id, ...fields } = args;
    await ctx.db.patch(id, fields);
  },
});
