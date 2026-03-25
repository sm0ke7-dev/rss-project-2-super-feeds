import { internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { Id } from "../_generated/dataModel";

export const getItemsNeedingContent = internalQuery({
  args: {},
  handler: async (ctx) => {
    const articles = await ctx.db
      .query("feedItems")
      .withIndex("by_schema_type", (q) => q.eq("schemaType", "Article"))
      .filter((q) => q.eq(q.field("contentExtractedAt"), undefined))
      .take(10);
    return articles.map(item => ({ _id: item._id, link: item.link }));
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

    // Fetch static authority documents (PDFs etc) — global scope, included in all feeds
    const staticItems = await ctx.db.query("static_items").collect();

    const staticFeedItems = staticItems.map(s => ({
      _id: s._id as unknown as Id<"feedItems">,
      _creationTime: s._creationTime,
      sourceId: s.sourceId,
      guid: s.url,
      title: s.title,
      link: s.url,
      description: s.description,
      pubDate: new Date(s.publishedAt).toUTCString(),
      isoDate: new Date(s.publishedAt).toISOString(),
      schemaType: "DigitalDocument" as const,
      videoId: undefined,
      channelId: undefined,
      thumbnailUrl: undefined,
      viewCount: undefined,
      officeId: undefined,
      serviceId: undefined,
      locationId: undefined,
      fullContent: undefined,
      contentExtractedAt: undefined,
    }));

    const dynamicItems = [...itemArrays.flat(), ...authorityItems];

    // Deduplicate dynamic items by guid — keep the one with the most recent isoDate
    const guidMap = new Map<string, (typeof dynamicItems)[0]>();
    for (const item of dynamicItems) {
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

    // Sort dynamic items by isoDate descending, cap at 50
    const sortedDynamic = [...guidMap.values()]
      .sort((a, b) => {
        const aDate = a.isoDate ?? "";
        const bDate = b.isoDate ?? "";
        return bDate.localeCompare(aDate);
      })
      .slice(0, 50);

    // Static items (PDFs/documents) are always included regardless of cap
    return [...sortedDynamic, ...staticFeedItems];
  },
});
