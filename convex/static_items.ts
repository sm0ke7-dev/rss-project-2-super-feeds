import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const items = await ctx.db.query("static_items").collect();
    return items.sort((a, b) => b.publishedAt - a.publishedAt);
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    url: v.string(),
    description: v.string(),
    type: v.union(v.literal("brand"), v.literal("authority"), v.literal("freshness")),
    serviceId: v.optional(v.id("services")),
    publishedAt: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("static_items", {
      title: args.title,
      url: args.url,
      description: args.description,
      type: args.type,
      serviceId: args.serviceId,
      publishedAt: args.publishedAt,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("static_items"),
    title: v.string(),
    url: v.string(),
    description: v.string(),
    type: v.union(v.literal("brand"), v.literal("authority"), v.literal("freshness")),
    serviceId: v.optional(v.id("services")),
    publishedAt: v.number(),
  },
  handler: async (ctx, { id, ...fields }) => {
    await ctx.db.patch(id, fields);
  },
});

export const remove = mutation({
  args: { id: v.id("static_items") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});
