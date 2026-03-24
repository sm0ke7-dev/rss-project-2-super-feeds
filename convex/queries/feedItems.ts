import { internalQuery } from "../_generated/server";
import { v } from "convex/values";

export const getItemsNeedingContent = internalQuery({
  args: {},
  handler: async (ctx) => {
    const items = await ctx.db.query("feedItems").collect();
    return items
      .filter(item => item.schemaType === "Article" && item.contentExtractedAt === undefined)
      .slice(0, 10)
      .map(item => ({ _id: item._id, link: item.link }));
  },
});

export const getFeedItemsForOfficeService = internalQuery({
  args: {
    officeId: v.id("offices"),
    locationId: v.id("locations"),
    serviceId: v.id("services"),
  },
  handler: async (ctx, { officeId, locationId, serviceId }) => {
    // Get all sources applicable to this location+service (all 6 scopes)
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
          q.and(q.eq(q.field("scope"), "service"), q.eq(q.field("active"), true))
        )
        .collect(),
      ctx.db
        .query("sources")
        .withIndex("by_office", (q) => q.eq("officeId", officeId))
        .filter((q) =>
          q.and(q.eq(q.field("scope"), "office"), q.eq(q.field("active"), true))
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

    const allSources = [
      ...globals,
      ...serviceScoped,
      ...officeScoped,
      ...officeServiceScoped,
      ...locationScoped,
      ...locationServiceScoped,
    ];
    const sourceIdSet = new Set(allSources.map((s) => s._id));

    // Collect feedItems for all applicable sources
    const itemArrays = await Promise.all(
      [...sourceIdSet].map((sourceId) =>
        ctx.db
          .query("feedItems")
          .withIndex("by_source", (q) => q.eq("sourceId", sourceId))
          .collect()
      )
    );

    // Also collect authority items directly scoped to this location+service
    const authorityItems = await ctx.db
      .query("feedItems")
      .withIndex("by_location_service", (q) =>
        q.eq("locationId", locationId).eq("serviceId", serviceId)
      )
      .collect();

    const allItems = [...itemArrays.flat(), ...authorityItems];

    // Deduplicate by guid — keep the one with the most recent isoDate
    const guidMap = new Map<string, (typeof allItems)[0]>();
    for (const item of allItems) {
      const existing = guidMap.get(item.guid);
      if (!existing) {
        guidMap.set(item.guid, item);
      } else {
        const existingDate = existing.isoDate ?? "";
        const itemDate = item.isoDate ?? "";
        if (itemDate > existingDate) {
          guidMap.set(item.guid, item);
        }
      }
    }

    // Sort by isoDate descending, cap at 50
    return [...guidMap.values()]
      .sort((a, b) => {
        const aDate = a.isoDate ?? "";
        const bDate = b.isoDate ?? "";
        return bDate.localeCompare(aDate);
      })
      .slice(0, 50);
  },
});
