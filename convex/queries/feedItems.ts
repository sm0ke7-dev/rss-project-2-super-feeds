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

// Round-robin interleave: Article → DigitalDocument → VideoObject → AudioObject
function roundRobinInterleave<T extends { schemaType: string }>(items: T[]): T[] {
  const buckets: Record<string, T[]> = {
    Article: [],
    DigitalDocument: [],
    VideoObject: [],
    AudioObject: [],
  };
  for (const item of items) {
    const key = item.schemaType in buckets ? item.schemaType : "Article";
    buckets[key].push(item);
  }
  const order = ["Article", "VideoObject", "DigitalDocument", "AudioObject"];
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

// Animal-keyword exclusion lists per service
const EXCLUDE_ANIMALS: Record<string, string[]> = {
  "raccoon-removal": ["squirrel", "bat", "bats", "snake", "rodent", "rat", "mouse", "mice", "opossum", "skunk", "bird", "pigeon"],
  "squirrel-removal": ["raccoon", "bat", "bats", "snake", "rodent", "rat", "mouse", "mice", "opossum", "skunk", "bird", "pigeon"],
  "bat-removal": ["raccoon", "squirrel", "snake", "rodent", "rat", "mouse", "mice", "opossum", "skunk", "bird", "pigeon"],
};

function isRelevantToService(
  item: { title: string; description?: string; link: string },
  serviceSlug: string
): boolean {
  if (serviceSlug === "wildlife-removal") return true;
  const excludeList = EXCLUDE_ANIMALS[serviceSlug];
  if (!excludeList) return true;
  const textToCheck = `${item.title} ${item.description ?? ""}`.toLowerCase();
  for (const animal of excludeList) {
    const regex = new RegExp(`\\b${animal}s?\\b`, "i");
    if (regex.test(textToCheck)) return false;
  }
  return true;
}

function isGovEdu(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return hostname.endsWith(".gov") || hostname.endsWith(".edu");
  } catch {
    return false;
  }
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
      ...locationServiceScoped,
      ...locationScoped,
      ...officeServiceScoped,
      ...officeScoped,
      ...serviceScoped,
      ...globals,
    ];

    // Build a Set of IDs for brand-type sources — brand items always go to Featured
    const brandSourceIds = new Set(
      allSources.filter((s) => s.type === "brand").map((s) => s._id)
    );

    // Build a Set of IDs for authority-type sources
    const authoritySourceIds = new Set(
      allSources.filter((s) => s.type === "authority").map((s) => s._id)
    );

    // Look up service to get slug for animal relevance filtering
    const service = await ctx.db.get(serviceId);
    const serviceSlug = service?.slug ?? "wildlife-removal";

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

    // Split static items: brand → branded pool, authority .gov/.edu → featured, rest → general
    const allStaticItems = [...serviceScopedStaticItems, ...globalStaticItems];
    const brandStaticItems = allStaticItems.filter(s => s.type === "brand").map(toFeedItem);

    const authorityStaticFeatured = allStaticItems
      .filter(s => s.type === "authority" && isGovEdu(s.url) && isRelevantToService({ title: s.title, description: s.description, link: s.url }, serviceSlug))
      .map(toFeedItem);

    const nonFeaturedStaticItems = allStaticItems
      .filter(s => s.type !== "brand" && !(s.type === "authority" && isGovEdu(s.url) && isRelevantToService({ title: s.title, description: s.description, link: s.url }, serviceSlug)))
      .map(toFeedItem);

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

    // Separate brand items FIRST — they bypass score filtering entirely
    const allDeduped = [...guidMap.values()];
    const brandDedupedItems: (typeof dynamicItems)[0][] = [];
    const nonBrandItems: (typeof dynamicItems)[0][] = [];

    for (const item of allDeduped) {
      const isBrand = item.sourceId && brandSourceIds.has(item.sourceId as Id<"sources">);
      if (isBrand) {
        brandDedupedItems.push(item);
      } else {
        nonBrandItems.push(item);
      }
    }

    // Exclude score-3 (unrelated) items from non-brand items only.
    // Unscored items pass through (fail-open per D001).
    const scoredItems = nonBrandItems.filter(
      (item) => item.relevanceScore !== 3
    );

    // Brand items always go to featured; split the rest into featured vs general
    const featuredDynamic: (typeof dynamicItems)[0][] = [...brandDedupedItems];
    const generalDynamic: (typeof dynamicItems)[0][] = [];

    for (const item of scoredItems) {
      // Check if this item is from an authority source OR has a .gov/.edu link
      const isAuthority = item.sourceId && authoritySourceIds.has(item.sourceId as Id<"sources">);
      const isGovEduLink = isGovEdu(item.link);

      if (isAuthority || isGovEduLink) {
        // Authority/.gov/.edu content → Featured, but only if relevant to this service's animal
        if (isRelevantToService(item, serviceSlug)) {
          featuredDynamic.push(item);
        } else {
          generalDynamic.push(item);  // irrelevant authority → demote to general
        }
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

    // --- Featured: strict slot-fill cycling ---
    // Merge dynamic featured pool with brand statics into one pool, then
    // bucket by type → cap each bucket → interleave in type order.
    // This prevents any single type from dominating 10 slots regardless of pool size.
    const allFeaturedPool = [...featuredDynamic, ...brandStaticItems, ...authorityStaticFeatured] as (typeof featuredDynamic)[0][];

    // --- Branded: pick exactly 1 brand item per schema type ---
    const brandedTypeOrder = ["VideoObject", "AudioObject", "DigitalDocument", "Article"] as const;
    const brandPool = allFeaturedPool.filter(
      (item) =>
        (item.sourceId && brandSourceIds.has(item.sourceId as Id<"sources">)) ||
        brandStaticItems.some((bs) => bs.guid === item.guid)
    );

    const branded: (typeof featuredDynamic)[0][] = [];
    const brandedGuids = new Set<string>();
    for (const type of brandedTypeOrder) {
      const candidates = brandPool
        .filter((item) => item.schemaType === type && !brandedGuids.has(item.guid))
        .sort((a, b) => (b.isoDate ?? "").localeCompare(a.isoDate ?? ""));
      if (candidates.length > 0) {
        branded.push(candidates[0]);
        brandedGuids.add(candidates[0].guid);
      }
    }

    // Remove branded items from featured pool
    const featuredPoolMinusBranded = allFeaturedPool.filter(
      (item) => !brandedGuids.has(item.guid)
    );

    const featuredTypeOrder = ["Article", "VideoObject", "DigitalDocument", "AudioObject"] as const;
    const featuredBuckets: Record<string, (typeof featuredDynamic)[0][]> = {
      Article: [],
      VideoObject: [],
      DigitalDocument: [],
      AudioObject: [],
    };
    for (const item of featuredPoolMinusBranded) {
      const key = item.schemaType in featuredBuckets ? item.schemaType : "Article";
      featuredBuckets[key].push(item);
    }

    const typesPresent = featuredTypeOrder.filter((t) => featuredBuckets[t].length > 0).length;
    const perTypeCap = typesPresent > 0 ? Math.ceil(10 / typesPresent) : 10;

    // Shuffle each bucket and cap it
    const cappedBuckets: Record<string, (typeof featuredDynamic)[0][]> = {};
    for (const type of featuredTypeOrder) {
      cappedBuckets[type] = shuffle(featuredBuckets[type]).slice(0, perTypeCap);
    }

    // Cycle through type order, skip empty buckets, stop at 10 slots
    const featured: (typeof featuredDynamic)[0][] = [];
    let cycleIdx = 0;
    while (featured.length < 10) {
      let advanced = false;
      for (const type of featuredTypeOrder) {
        if (cappedBuckets[type].length > cycleIdx) {
          featured.push(cappedBuckets[type][cycleIdx]);
          if (featured.length >= 10) break;
          advanced = true;
        }
      }
      if (!advanced) break; // all buckets exhausted
      cycleIdx++;
    }

    // --- General: unchanged ---
    const shuffledGeneral = shuffle(generalDynamic).slice(0, 20);
    const generalAll = shuffle([...shuffledGeneral, ...nonFeaturedStaticItems]);
    const general = roundRobinInterleave(generalAll);

    return { branded, featured, general };
  },
});
