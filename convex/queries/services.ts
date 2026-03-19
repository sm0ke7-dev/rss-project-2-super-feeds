import { internalQuery } from "../_generated/server";
import { v } from "convex/values";

export const getById = internalQuery({
  args: { serviceId: v.id("services") },
  handler: async (ctx, { serviceId }) => {
    return await ctx.db.get(serviceId);
  },
});

export const listActive = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("services")
      .withIndex("by_active", q => q.eq("active", true)).collect();
  },
});
