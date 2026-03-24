import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {},
  handler: async (ctx) => await ctx.db.query("sources").collect(),
});

export const create = mutation({
  args: {
    url: v.string(),
    title: v.string(),
    type: v.union(v.literal("brand"), v.literal("authority"), v.literal("freshness")),
    scope: v.union(
      v.literal("global"),
      v.literal("service"),
      v.literal("office"),
      v.literal("office-service"),
      v.literal("location"),
      v.literal("location-service")
    ),
    officeId: v.optional(v.id("offices")),
    serviceId: v.optional(v.id("services")),
    locationId: v.optional(v.id("locations")),
    ttlMinutes: v.number(),
    active: v.boolean(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("sources", {
      url: args.url,
      title: args.title,
      type: args.type,
      scope: args.scope,
      officeId: args.officeId,
      serviceId: args.serviceId,
      locationId: args.locationId,
      ttlMinutes: args.ttlMinutes,
      active: args.active,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("sources"),
    url: v.string(),
    title: v.string(),
    type: v.union(v.literal("brand"), v.literal("authority"), v.literal("freshness")),
    scope: v.union(
      v.literal("global"),
      v.literal("service"),
      v.literal("office"),
      v.literal("office-service"),
      v.literal("location"),
      v.literal("location-service")
    ),
    officeId: v.optional(v.id("offices")),
    serviceId: v.optional(v.id("services")),
    locationId: v.optional(v.id("locations")),
    ttlMinutes: v.number(),
    active: v.boolean(),
  },
  handler: async (ctx, args) => {
    const { id, ...fields } = args;
    await ctx.db.patch(id, fields);
  },
});

export const patch = mutation({
  args: {
    id: v.id("sources"),
    type: v.optional(v.union(v.literal("brand"), v.literal("authority"), v.literal("freshness"))),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { id, ...fields } = args;
    await ctx.db.patch(id, fields);
  },
});

export const remove = mutation({
  args: { id: v.id("sources") },
  handler: async (ctx, args) => {
    // Cascade: delete all feedItems belonging to this source before removing the source
    const items = await ctx.db
      .query("feedItems")
      .withIndex("by_source", (q) => q.eq("sourceId", args.id))
      .collect();
    for (const item of items) {
      await ctx.db.delete(item._id);
    }

    await ctx.db.delete(args.id);
  },
});
