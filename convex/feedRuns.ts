import { query } from "./_generated/server";

export const list = query({
  args: {},
  handler: async (ctx) => {
    // Return latest 100 runs, sorted by startedAt descending
    const runs = await ctx.db.query("feed_runs").collect();
    return runs.sort((a, b) => b.startedAt - a.startedAt).slice(0, 100);
  },
});
