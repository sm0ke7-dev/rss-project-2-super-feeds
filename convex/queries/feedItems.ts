import { internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { Id } from "../_generated/dataModel";

export const getItemsNeedingScoring = internalQuery({
  args: {},
  handler: async (ctx) => {
    const articles = await ctx.db
      .query("feedItems")
      .withIndex("by_schema_type", (q) => q.eq("schemaType", "Article"))
      .filter((q) => q.eq(q.field("relevanceScoredAt"), undefined))
      .take(5);
    const videos = await ctx.db
      .query("feedItems")
      .withIndex("by_schema_type", (q) => q.eq("schemaType", "VideoObject"))
      .filter((q) => q.eq(q.field("relevanceScoredAt"), undefined))
      .take(5);
    return [...articles, ...videos].map((item) => ({
      _id: item._id,
      title: item.title,
      description: item.description ?? "",
    }));
  },
});

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

// Round-robin interleave: Article → DigitalDocument → VideoObject
function roundRobinInterleave<T extends { schemaType: string }>(items: T[]): T[] {
  const buckets: Record<string, T[]> = {
    Article: [],
    DigitalDocument: [],
    VideoObject: [],
  };
  for (const item of items) {
    const key = item.schemaType in buckets ? item.schemaType : "Article";
    buckets[key].push(item);
  }
  const order = ["Article", "DigitalDocument", "VideoObject"];
  const interleaved: T[] = [];
  let remaining = true;
  let i = 0;
  while (remaining) {
    remaining = false;
    for (const type of order) {
      if (i < buckets[type].length) {
        interleaved.push(buckets[type][i]);
        remaining = true;
      }
    }
    i++;
  }
  return interleaved;
}

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

    // Build a Set of IDs for location-service scoped sources (featured bucket)
    const locationServiceSourceIds = new Set(locationServiceScoped.map((s) => s._id));

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

    // Fetch static authority documents (PDFs etc) — split by service scope
    const staticItems = await ctx.db.query("static_items").collect();

    const serviceScopedStaticItems = staticItems.filter(s => s.serviceId === serviceId);
    const globalStaticItems = staticItems.filter(s => !s.serviceId);

    const toFeedItem = (s: typeof staticItems[0]) => ({
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
    });

    const serviceScopedStaticFeedItems = serviceScopedStaticItems.map(toFeedItem);
    const globalStaticFeedItems = globalStaticItems.map(toFeedItem);

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

    // Exclude score-3 (unrelated) items from feeds.
    // Unscored items pass through (fail-open per D001).
    const scoredItems = [...guidMap.values()].filter(
      (item) => item.relevanceScore !== 3
    );

    // Split deduplicated dynamic items into featured (location-service scoped) and general
    const featuredDynamic: (typeof dynamicItems)[0][] = [];
    const generalDynamic: (typeof dynamicItems)[0][] = [];

    for (const item of scoredItems) {
      if (item.sourceId && locationServiceSourceIds.has(item.sourceId as Id<"sources">)) {
        featuredDynamic.push(item);
      } else {
        generalDynamic.push(item);
      }
    }

    // Fisher-Yates shuffle for random selection each refresh
    const shuffle = <T>(arr: T[]): T[] => {
      const a = [...arr];
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    };

    // Randomly pick up to 5 featured and 20 general dynamic items
    const shuffledFeatured = shuffle(featuredDynamic).slice(0, 5);
    const shuffledGeneral = shuffle(generalDynamic).slice(0, 20);

    // Service-scoped static items go into featured (up to 5 total), global static into general
    const featuredAll = shuffle([...shuffledFeatured, ...serviceScopedStaticFeedItems]).slice(0, 5);
    const generalAll = shuffle([...shuffledGeneral, ...globalStaticFeedItems]);

    // Apply round-robin interleave to each bucket separately
    const featured = roundRobinInterleave(featuredAll);
    const general = roundRobinInterleave(generalAll);

    return { featured, general };
  },
});
