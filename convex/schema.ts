import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  offices: defineTable({
    name: v.string(),
    slug: v.string(),
    city: v.string(),
    state: v.string(),
    active: v.boolean(),
    phone: v.optional(v.string()),
    address: v.optional(v.string()),
    zip: v.optional(v.string()),
    contactUrl: v.optional(v.string()),
  })
    .index("by_slug", ["slug"])
    .index("by_active", ["active"]),

  locations: defineTable({
    name: v.string(),
    slug: v.string(),
    officeId: v.id("offices"),
    active: v.boolean(),
  })
    .index("by_slug", ["slug"])
    .index("by_office", ["officeId"])
    .index("by_active", ["active"]),

  services: defineTable({
    name: v.string(),
    slug: v.string(),
    description: v.string(),
    active: v.boolean(),
  })
    .index("by_slug", ["slug"])
    .index("by_active", ["active"]),

  sources: defineTable({
    url: v.string(),
    title: v.string(),
    type: v.union(
      v.literal("brand"),
      v.literal("authority"),
      v.literal("freshness")
    ),
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
    lastFetchedAt: v.optional(v.number()),
    lastFetchError: v.optional(v.string()),
  })
    .index("by_scope", ["scope"])
    .index("by_type", ["type"])
    .index("by_active", ["active"])
    .index("by_office", ["officeId"])
    .index("by_service", ["serviceId"])
    .index("by_location", ["locationId"]),

  static_items: defineTable({
    title: v.string(),
    url: v.string(),
    description: v.string(),
    type: v.union(
      v.literal("brand"),
      v.literal("authority"),
      v.literal("freshness")
    ),
    sourceId: v.optional(v.id("sources")),
    serviceId: v.optional(v.id("services")),
    publishedAt: v.number(),
  })
    .index("by_source", ["sourceId"])
    .index("by_type", ["type"]),

  feedItems: defineTable({
    sourceId: v.optional(v.id("sources")),
    guid: v.string(),
    title: v.string(),
    link: v.string(),
    description: v.optional(v.string()),
    pubDate: v.optional(v.string()),
    isoDate: v.optional(v.string()),
    videoId: v.optional(v.string()),
    channelId: v.optional(v.string()),
    thumbnailUrl: v.optional(v.string()),
    viewCount: v.optional(v.string()),
    schemaType: v.union(
      v.literal("VideoObject"),
      v.literal("Article"),
      v.literal("DigitalDocument"),
      v.literal("AudioObject")
    ),
    artworkUrl: v.optional(v.string()),
    duration: v.optional(v.string()),
    officeId: v.optional(v.id("offices")),
    serviceId: v.optional(v.id("services")),
    locationId: v.optional(v.id("locations")),
    fullContent: v.optional(v.string()),
    contentExtractedAt: v.optional(v.number()),
    relevanceScore: v.optional(v.number()),
    relevanceScoredAt: v.optional(v.number()),
  })
    .index("by_source", ["sourceId"])
    .index("by_guid", ["guid"])
    .index("by_location_service", ["locationId", "serviceId"])
    .index("by_schema_type", ["schemaType"]),

  feed_runs: defineTable({
    officeId: v.id("offices"),
    locationId: v.optional(v.id("locations")),
    serviceId: v.id("services"),
    status: v.union(
      v.literal("running"),
      v.literal("success"),
      v.literal("error")
    ),
    itemCount: v.optional(v.number()),
    error: v.optional(v.string()),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_location_service", ["locationId", "serviceId"])
    .index("by_status", ["status"]),

  settings: defineTable({
    key: v.string(),
    value: v.string(),
  }).index("by_key", ["key"]),

  generated_feeds: defineTable({
    officeSlug: v.string(),
    locationSlug: v.optional(v.string()),
    serviceSlug: v.string(),
    xmlContent: v.string(),
    htmlContent: v.string(),
    generatedAt: v.number(),
    itemCount: v.number(),
  })
    .index("by_slugs", ["officeSlug", "locationSlug", "serviceSlug"]),

  web_feeds: defineTable({
    url: v.string(),
    title: v.string(),
    feedType: v.optional(v.union(v.literal("youtube"), v.literal("soundcloud"))),
    items: v.array(
      v.object({
        title: v.string(),
        link: v.string(),
        videoId: v.optional(v.string()),
        thumbnailUrl: v.optional(v.string()),
        description: v.optional(v.string()),
        publishedAt: v.optional(v.string()),
      })
    ),
    lastScrapedAt: v.number(),
    scrapedItemCount: v.number(),
    sourceId: v.optional(v.id("sources")),
  })
    .index("by_url", ["url"]),
});
