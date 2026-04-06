import { internalQuery, query } from "../_generated/server";
import { v } from "convex/values";

// 6-scope source resolution with optional TTL filtering
export const getSourcesForFeed = internalQuery({
  args: {
    officeId: v.id("offices"),
    locationId: v.id("locations"),
    serviceId: v.id("services"),
    nowMs: v.number(),
    staleOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, { officeId, locationId, serviceId, nowMs, staleOnly }) => {
    const [
      globals,
      serviceScoped,
      officeScoped,
      officeServiceScoped,
      locationScoped,
      locationServiceScoped,
    ] = await Promise.all([
      ctx.db
        .query("sources")
        .withIndex("by_scope", (q) => q.eq("scope", "global"))
        .filter((q) => q.eq(q.field("active"), true))
        .collect(),
      ctx.db
        .query("sources")
        .withIndex("by_service", (q) => q.eq("serviceId", serviceId))
        .filter((q) =>
          q.and(
            q.eq(q.field("scope"), "service"),
            q.eq(q.field("active"), true)
          )
        )
        .collect(),
      ctx.db
        .query("sources")
        .withIndex("by_office", (q) => q.eq("officeId", officeId))
        .filter((q) =>
          q.and(
            q.eq(q.field("scope"), "office"),
            q.eq(q.field("active"), true)
          )
        )
        .collect(),
      ctx.db
        .query("sources")
        .withIndex("by_office", (q) => q.eq("officeId", officeId))
        .filter((q) =>
          q.and(
            q.eq(q.field("scope"), "office-service"),
            q.eq(q.field("serviceId"), serviceId),
            q.eq(q.field("active"), true)
          )
        )
        .collect(),
      ctx.db
        .query("sources")
        .withIndex("by_location", (q) => q.eq("locationId", locationId))
        .filter((q) =>
          q.and(
            q.eq(q.field("scope"), "location"),
            q.eq(q.field("active"), true)
          )
        )
        .collect(),
      ctx.db
        .query("sources")
        .withIndex("by_location", (q) => q.eq("locationId", locationId))
        .filter((q) =>
          q.and(
            q.eq(q.field("scope"), "location-service"),
            q.eq(q.field("serviceId"), serviceId),
            q.eq(q.field("active"), true)
          )
        )
        .collect(),
    ]);

    const all = [
      ...locationServiceScoped,
      ...locationScoped,
      ...officeServiceScoped,
      ...officeScoped,
      ...serviceScoped,
      ...globals,
    ];

    // Deduplicate by URL
    const seen = new Set<string>();
    const deduped = all.filter((s) => {
      if (seen.has(s.url)) return false;
      seen.add(s.url);
      return true;
    });

    if (!staleOnly) return deduped;

    // Filter to stale sources only (TTL check)
    return deduped.filter((s) => {
      if (s.lastFetchedAt === undefined) return true;
      return nowMs - s.lastFetchedAt > s.ttlMinutes * 60 * 1000;
    });
  },
});

// Look up a single source by ID (used for source name labelling in feed output)
export const getSourceById = internalQuery({
  args: { sourceId: v.id("sources") },
  handler: async (ctx, { sourceId }) => {
    return await ctx.db.get(sourceId);
  },
});

// Get all active sources (used by full refresh to deduplicate fetching)
export const getAllActiveSources = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("sources")
      .filter((q) => q.eq(q.field("active"), true))
      .collect();
  },
});

// List all sources (for admin UI)
export const listSources = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("sources").collect();
  },
});
