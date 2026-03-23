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
    // Cascade: delete sources scoped directly to this office
    const sources = await ctx.db
      .query("sources")
      .withIndex("by_office", (q) => q.eq("officeId", args.id))
      .collect();
    for (const s of sources) await ctx.db.delete(s._id);

    // Cascade: delete locations belonging to this office (and their cascades)
    const locations = await ctx.db
      .query("locations")
      .withIndex("by_office", (q) => q.eq("officeId", args.id))
      .collect();

    for (const location of locations) {
      // Delete sources scoped to this location
      const locationSources = await ctx.db
        .query("sources")
        .withIndex("by_location", (q) => q.eq("locationId", location._id))
        .collect();
      for (const s of locationSources) await ctx.db.delete(s._id);

      // Delete feed runs for this location
      const locationRuns = await ctx.db
        .query("feed_runs")
        .withIndex("by_location_service")
        .collect();
      for (const r of locationRuns) {
        if (r.locationId === location._id) await ctx.db.delete(r._id);
      }

      // Delete feed items for this location
      const locationItems = await ctx.db
        .query("feedItems")
        .withIndex("by_location_service")
        .collect();
      for (const i of locationItems) {
        if (i.locationId === location._id) await ctx.db.delete(i._id);
      }

      // Delete generated feeds for this location
      const feeds = await ctx.db.query("generated_feeds").collect();
      for (const f of feeds) {
        if (f.locationSlug === location.slug) await ctx.db.delete(f._id);
      }

      await ctx.db.delete(location._id);
    }

    // Cascade: delete generated feeds for this office (any remaining)
    const office = await ctx.db.get(args.id);
    if (office) {
      const feeds = await ctx.db.query("generated_feeds").collect();
      for (const f of feeds) {
        if (f.officeSlug === office.slug) await ctx.db.delete(f._id);
      }
    }

    await ctx.db.delete(args.id);
  },
});
