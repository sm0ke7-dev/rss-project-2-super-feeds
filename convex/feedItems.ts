import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const items = await ctx.db.query("feedItems").order("desc").take(200);
    return items.map((item) => ({
      _id: item._id,
      title: item.title,
      link: item.link,
      schemaType: item.schemaType,
      relevanceScore: item.relevanceScore,
      relevanceScoredAt: item.relevanceScoredAt,
      isoDate: item.isoDate,
      sourceId: item.sourceId,
    }));
  },
});

export const purgeOrphaned = mutation({
  args: {},
  handler: async (ctx) => {
    const allItems = await ctx.db.query("feedItems").collect();
    let deleted = 0;
    for (const item of allItems) {
      // No sourceId means the item has no parent source — delete it
      if (!item.sourceId) {
        await ctx.db.delete(item._id);
        deleted++;
        continue;
      }
      const source = await ctx.db.get(item.sourceId);
      // Delete if source was deleted, OR if source exists but has been deactivated
      // (inactive sources are excluded from feed queries, so their cached items are stale)
      if (!source || !source.active) {
        await ctx.db.delete(item._id);
        deleted++;
      }
    }
    return { deleted };
  },
});

export const resetContentExtraction = internalMutation({
  args: {},
  handler: async (ctx) => {
    const items = await ctx.db.query("feedItems").collect();
    let count = 0;
    for (const item of items) {
      if (item.contentExtractedAt !== undefined && !item.fullContent) {
        await ctx.db.patch(item._id, { contentExtractedAt: undefined });
        count++;
      }
    }
    return { reset: count };
  },
});

export const purgeBySource = internalMutation({
  args: { sourceId: v.id("sources") },
  handler: async (ctx, { sourceId }) => {
    const items = await ctx.db.query("feedItems").withIndex("by_source", q => q.eq("sourceId", sourceId)).collect();
    for (const item of items) {
      await ctx.db.delete(item._id);
    }
    return { deleted: items.length };
  },
});
