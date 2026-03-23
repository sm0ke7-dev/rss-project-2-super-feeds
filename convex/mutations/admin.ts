import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";

export const triggerFeed = mutation({
  args: {
    officeId: v.id("offices"),
    locationId: v.id("locations"),
    serviceId: v.id("services"),
  },
  handler: async (ctx, { officeId, locationId, serviceId }) => {
    await ctx.scheduler.runAfter(
      0,
      internal.actions.aggregation.aggregateFeed,
      { officeId, locationId, serviceId }
    );
  },
});

export const triggerAllFeeds = mutation({
  args: {},
  handler: async (ctx) => {
    await ctx.scheduler.runAfter(
      0,
      internal.actions.aggregation.runAggregationCycle,
      {}
    );
  },
});

export const triggerFullRefresh = mutation({
  args: {},
  handler: async (ctx) => {
    await ctx.scheduler.runAfter(0, internal.actions.aggregation.runFullRefresh, {});
  },
});
