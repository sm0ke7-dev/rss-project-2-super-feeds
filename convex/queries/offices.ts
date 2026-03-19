import { internalQuery } from "../_generated/server";
import { v } from "convex/values";

export const getById = internalQuery({
  args: { officeId: v.id("offices") },
  handler: async (ctx, { officeId }) => {
    return await ctx.db.get(officeId);
  },
});

export const listActive = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("offices")
      .withIndex("by_active", q => q.eq("active", true)).collect();
  },
});
