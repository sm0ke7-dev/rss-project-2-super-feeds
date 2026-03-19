import { mutation, query } from "./_generated/server";

export const list = query({
  args: {},
  handler: async (ctx) => {
    // Return latest 100 runs, sorted by startedAt descending
    const runs = await ctx.db.query("feed_runs").collect();
    return runs.sort((a, b) => b.startedAt - a.startedAt).slice(0, 100);
  },
});

export const clearAll = mutation({
  args: {},
  handler: async (ctx) => {
    const runs = await ctx.db.query("feed_runs").collect();
    for (const run of runs) await ctx.db.delete(run._id);
    return { deleted: runs.length };
  },
});
