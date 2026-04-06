import { internalMutation } from "../_generated/server";
import { v } from "convex/values";

export const storeFeedItems = internalMutation({
  args: {
    sourceId: v.optional(v.id("sources")),
    items: v.array(
      v.object({
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
      })
    ),
  },
  handler: async (ctx, { sourceId, items }) => {
    // Upsert by guid: check if exists, insert if not
    for (const item of items) {
      const existing = await ctx.db
        .query("feedItems")
        .withIndex("by_guid", (q) => q.eq("guid", item.guid))
        .first();
      if (!existing) {
        await ctx.db.insert("feedItems", { sourceId, ...item });
      } else {
        // Update sourceId and schemaType if they changed (e.g. brand source
        // taking ownership, or schemaType detection fix applied after initial ingest)
        const needsUpdate =
          (sourceId && existing.sourceId !== sourceId) ||
          existing.schemaType !== item.schemaType;
        if (needsUpdate) {
          await ctx.db.patch(existing._id, {
            ...(sourceId ? { sourceId } : {}),
            schemaType: item.schemaType,
          });
        }
      }
    }
    // Update lastFetchedAt and clear any previous error
    if (sourceId) {
      await ctx.db.patch(sourceId, {
        lastFetchedAt: Date.now(),
        lastFetchError: undefined,
      });
    }
  },
});

export const markFetchSuccess = internalMutation({
  args: {
    sourceId: v.id("sources"),
  },
  handler: async (ctx, { sourceId }) => {
    await ctx.db.patch(sourceId, {
      lastFetchedAt: Date.now(),
      lastFetchError: undefined,
    });
  },
});

export const updateItemContent = internalMutation({
  args: {
    itemId: v.id("feedItems"),
    fullContent: v.optional(v.string()),
  },
  handler: async (ctx, { itemId, fullContent }) => {
    await ctx.db.patch(itemId, {
      fullContent,
      contentExtractedAt: Date.now(),
    });
  },
});

export const updateItemRelevanceScore = internalMutation({
  args: {
    itemId: v.id("feedItems"),
    relevanceScore: v.number(),
  },
  handler: async (ctx, { itemId, relevanceScore }) => {
    await ctx.db.patch(itemId, {
      relevanceScore,
      relevanceScoredAt: Date.now(),
    });
  },
});

export const markFetchError = internalMutation({
  args: {
    sourceId: v.id("sources"),
    error: v.string(),
  },
  handler: async (ctx, { sourceId, error }) => {
    // Still update lastFetchedAt so we don't immediately retry on next cycle
    await ctx.db.patch(sourceId, {
      lastFetchedAt: Date.now(),
      lastFetchError: error,
    });
  },
});
