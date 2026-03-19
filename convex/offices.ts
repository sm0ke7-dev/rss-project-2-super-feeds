import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {},
  handler: async (ctx) => await ctx.db.query("offices").collect(),
});

export const create = mutation({
  args: {
    name: v.string(),
    slug: v.string(),
    city: v.string(),
    state: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("offices", {
      name: args.name,
      slug: args.slug,
      city: args.city,
      state: args.state,
      active: true,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("offices"),
    name: v.string(),
    slug: v.string(),
    city: v.string(),
    state: v.string(),
    active: v.boolean(),
  },
  handler: async (ctx, args) => {
    const { id, ...fields } = args;
    await ctx.db.patch(id, fields);
  },
});

export const remove = mutation({
  args: { id: v.id("offices") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});
