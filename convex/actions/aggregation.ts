"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";
import pLimit from "p-limit";

export const aggregateFeed = internalAction({
  args: {
    officeId: v.id("offices"),
    locationId: v.id("locations"),
    serviceId: v.id("services"),
    forceRefresh: v.optional(v.boolean()),
  },
  handler: async (ctx, { officeId, locationId, serviceId, forceRefresh }) => {
    const runId = await ctx.runMutation(
      internal.mutations.feedRuns.createFeedRun,
      { officeId, locationId, serviceId }
    );

    try {
      const sources = await ctx.runQuery(
        internal.queries.sources.getSourcesForFeed,
        {
          officeId,
          locationId,
          serviceId,
          nowMs: Date.now(),
          staleOnly: forceRefresh ? false : true,
        }
      );

      // Filter out authority sources (not fetched via RSS pipeline)
      const fetchableSources = sources.filter(
        (s): s is typeof s & { type: "brand" | "freshness" } =>
          s.type !== "authority"
      );

      // Max 3 simultaneous source fetches
      const sourceLimit = pLimit(3);

      const fetchTasks = fetchableSources.map((source) =>
        sourceLimit(() =>
          ctx.runAction(internal.actions.fetchSource.fetchRssSource, {
            sourceId: source._id,
            url: source.url,
            sourceType: source.type,
          })
        )
      );

      const results = await Promise.allSettled(fetchTasks);
      const successes = results.filter((r) => r.status === "fulfilled").length;
      const failures = results.filter((r) => r.status === "rejected").length;
      console.log(
        `Feed ${officeId}x${locationId}x${serviceId}: ${successes} sources fetched, ${failures} failed`
      );

      // Extract full content for new Article items (non-blocking — don't let extraction failures kill the feed run)
      try {
        await ctx.runAction(internal.actions.extractContent.extractContentBatch, {});
      } catch (extractErr) {
        console.error("Content extraction failed (non-fatal):", extractErr);
      }

      // Generate feed files (proceeds even if some sources failed)
      await ctx.runAction(internal.actions.generateFeed.generateFeedFiles, {
        officeId,
        locationId,
        serviceId,
      });

      await ctx.runMutation(internal.mutations.feedRuns.updateFeedRun, {
        runId,
        status: "success",
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error(
        `aggregateFeed failed for ${officeId}x${locationId}x${serviceId}: ${errorMessage}`
      );
      await ctx.runMutation(internal.mutations.feedRuns.updateFeedRun, {
        runId,
        status: "error",
        error: errorMessage,
      });
    }
  },
});

export const runAggregationCycle = internalAction({
  args: {},
  handler: async (ctx) => {
    const combinations = await ctx.runQuery(
      internal.queries.feeds.getAllFeedCombinations
    );

    console.log(
      `Starting aggregation cycle for ${combinations.length} feed combinations`
    );

    // Max 5 simultaneous feed aggregations
    const feedLimit = pLimit(5);

    const tasks = combinations.map((combo) =>
      feedLimit(() =>
        ctx.runAction(internal.actions.aggregation.aggregateFeed, {
          officeId: combo.officeId as Id<"offices">,
          locationId: combo.locationId as Id<"locations">,
          serviceId: combo.serviceId as Id<"services">,
        })
      )
    );

    const results = await Promise.allSettled(tasks);
    const successes = results.filter((r) => r.status === "fulfilled").length;
    const failures = results.filter((r) => r.status === "rejected").length;
    console.log(
      `Aggregation cycle complete: ${successes} feeds succeeded, ${failures} failed`
    );
  },
});

export const runFullRefresh = internalAction({
  args: {},
  handler: async (ctx) => {
    const combinations = await ctx.runQuery(
      internal.queries.feeds.getAllFeedCombinations
    );

    console.log(
      `Starting FULL REFRESH for ${combinations.length} combinations (ignoring TTL)`
    );

    const feedLimit = pLimit(5);

    const tasks = combinations.map((combo) =>
      feedLimit(() =>
        ctx.runAction(internal.actions.aggregation.aggregateFeed, {
          officeId: combo.officeId as Id<"offices">,
          locationId: combo.locationId as Id<"locations">,
          serviceId: combo.serviceId as Id<"services">,
          forceRefresh: true,
        })
      )
    );

    const results = await Promise.allSettled(tasks);
    const successes = results.filter((r) => r.status === "fulfilled").length;
    const failures = results.filter((r) => r.status === "rejected").length;
    console.log(
      `Full refresh complete: ${successes} succeeded, ${failures} failed`
    );
  },
});
