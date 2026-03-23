import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {},
  handler: async (ctx) => await ctx.db.query("locations").collect(),
});

export const listByOffice = query({
  args: { officeId: v.id("offices") },
  handler: async (ctx, { officeId }) => {
    return await ctx.db
      .query("locations")
      .withIndex("by_office", (q) => q.eq("officeId", officeId))
      .collect();
  },
});

export const create = mutation({
  args: { name: v.string(), slug: v.string(), officeId: v.id("offices") },
  handler: async (ctx, args) => {
    return await ctx.db.insert("locations", { ...args, active: true });
  },
});

export const update = mutation({
  args: {
    id: v.id("locations"),
    name: v.string(),
    slug: v.string(),
    officeId: v.id("offices"),
    active: v.boolean(),
  },
  handler: async (ctx, { id, ...fields }) => {
    await ctx.db.patch(id, fields);
  },
});

export const remove = mutation({
  args: { id: v.id("locations") },
  handler: async (ctx, { id }) => {
    // Cascade: delete sources scoped to this location
    const sources = await ctx.db
      .query("sources")
      .withIndex("by_location", (q) => q.eq("locationId", id))
      .collect();
    for (const s of sources) await ctx.db.delete(s._id);

    // Cascade: delete feed runs for this location
    const runs = await ctx.db
      .query("feed_runs")
      .withIndex("by_location_service")
      .collect();
    for (const r of runs) {
      if (r.locationId === id) await ctx.db.delete(r._id);
    }

    // Cascade: delete feed items for this location
    const items = await ctx.db
      .query("feedItems")
      .withIndex("by_location_service")
      .collect();
    for (const i of items) {
      if (i.locationId === id) await ctx.db.delete(i._id);
    }

    // Cascade: delete generated feeds for this location
    const location = await ctx.db.get(id);
    if (location) {
      const feeds = await ctx.db.query("generated_feeds").collect();
      for (const f of feeds) {
        if (f.locationSlug === location.slug) await ctx.db.delete(f._id);
      }
    }

    await ctx.db.delete(id);
  },
});
