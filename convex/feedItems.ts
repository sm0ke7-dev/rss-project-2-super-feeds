import { mutation, query } from "./_generated/server";

export const purgeOrphaned = mutation({
  args: {},
  handler: async (ctx) => {
    const allItems = await ctx.db.query("feedItems").collect();
    let deleted = 0;
    for (const item of allItems) {
      // If sourceId is missing or the source no longer exists, delete the item
      if (!item.sourceId) {
        await ctx.db.delete(item._id);
        deleted++;
        continue;
      }
      const source = await ctx.db.get(item.sourceId);
      if (!source) {
        await ctx.db.delete(item._id);
        deleted++;
      }
    }
    return { deleted };
  },
});

export const count = query({
  args: {},
  handler: async (ctx) => {
    const items = await ctx.db.query("feedItems").collect();
    return items.length;
  },
});
