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
    // Guard: reject if already running for this combo
    const existing = await ctx.db
      .query("feed_runs")
      .withIndex("by_location_service", (q) =>
        q.eq("locationId", locationId).eq("serviceId", serviceId)
      )
      .filter((q) => q.eq(q.field("status"), "running"))
      .first();
    if (existing) {
      throw new Error("A feed run is already in progress for this combination.");
    }

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

export const triggerBackfillScoring = mutation({
  args: {},
  handler: async (ctx) => {
    await ctx.scheduler.runAfter(
      0,
      internal.actions.scoreRelevance.backfillAllScores,
      {}
    );
  },
});

export const cancelFeedRun = mutation({
  args: { runId: v.id("feed_runs") },
  handler: async (ctx, { runId }) => {
    const run = await ctx.db.get(runId);
    if (!run || run.status !== "running") {
      throw new Error("Run not found or not running.");
    }
    await ctx.db.patch(runId, {
      status: "error" as const,
      error: "Cancelled by user",
      completedAt: Date.now(),
    });
  },
});

export const triggerRegenerateOnly = mutation({
  args: {
    officeId: v.id("offices"),
    locationId: v.id("locations"),
    serviceId: v.id("services"),
  },
  handler: async (ctx, args) => {
    await ctx.scheduler.runAfter(0, internal.actions.generateFeed.generateFeedFiles, {
      officeId: args.officeId,
      locationId: args.locationId,
      serviceId: args.serviceId,
    });
  },
});
