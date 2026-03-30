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
    skipFetch: v.optional(v.boolean()),
  },
  handler: async (ctx, { officeId, locationId, serviceId, forceRefresh, skipFetch }) => {
    const runId = await ctx.runMutation(
      internal.mutations.feedRuns.createFeedRun,
      { officeId, locationId, serviceId }
    );

    try {
      if (!skipFetch) {
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

        // Max 3 simultaneous source fetches
        const sourceLimit = pLimit(3);

        const fetchTasks = sources.map((source) =>
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
      }

      // Extract full content for new Article items (non-blocking — don't let extraction failures kill the feed run)
      try {
        await ctx.runAction(internal.actions.extractContent.extractContentBatch, {});
      } catch (extractErr) {
        console.error("Content extraction failed (non-fatal):", extractErr);
      }

      // Score new items for relevance (non-blocking — don't let scoring failures kill the feed run)
      try {
        await ctx.runAction(internal.actions.scoreRelevance.scoreRelevanceBatch, {});
      } catch (scoreErr) {
        console.error("Relevance scoring failed (non-fatal):", scoreErr);
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
    const [combinations, allSources] = await Promise.all([
      ctx.runQuery(internal.queries.feeds.getAllFeedCombinations),
      ctx.runQuery(internal.queries.sources.getAllActiveSources),
    ]);

    console.log(
      `Starting FULL REFRESH: ${allSources.length} unique sources, ${combinations.length} feed combinations`
    );

    // Phase 1: Fetch each unique source exactly once (eliminates write conflicts)
    const sourceLimit = pLimit(5);
    const sourceTasks = allSources.map((source) =>
      sourceLimit(() =>
        ctx.runAction(internal.actions.fetchSource.fetchRssSource, {
          sourceId: source._id,
          url: source.url,
          sourceType: source.type,
        })
      )
    );
    const sourceResults = await Promise.allSettled(sourceTasks);
    const sourceFails = sourceResults.filter((r) => r.status === "rejected").length;
    console.log(
      `Sources fetched: ${allSources.length - sourceFails} ok, ${sourceFails} failed`
    );

    // Phase 2: Extract full content for new articles (once, shared across all feeds)
    try {
      await ctx.runAction(internal.actions.extractContent.extractContentBatch, {});
    } catch (extractErr) {
      console.error("Content extraction failed (non-fatal):", extractErr);
    }

    // Phase 2.5: Score new items for relevance (once, shared across all feeds)
    try {
      await ctx.runAction(internal.actions.scoreRelevance.scoreRelevanceBatch, {});
    } catch (scoreErr) {
      console.error("Relevance scoring failed (non-fatal):", scoreErr);
    }

    // Phase 3: Generate all feeds via aggregateFeed with skipFetch=true (creates feed run records)
    const feedLimit = pLimit(10);
    const feedTasks = combinations.map((combo) =>
      feedLimit(() =>
        ctx.runAction(internal.actions.aggregation.aggregateFeed, {
          officeId: combo.officeId as Id<"offices">,
          locationId: combo.locationId as Id<"locations">,
          serviceId: combo.serviceId as Id<"services">,
          skipFetch: true,
        })
      )
    );
    const feedResults = await Promise.allSettled(feedTasks);
    const feedSuccesses = feedResults.filter((r) => r.status === "fulfilled").length;
    const feedFailures = feedResults.filter((r) => r.status === "rejected").length;
    console.log(
      `Full refresh complete: ${feedSuccesses} feeds generated, ${feedFailures} failed`
    );
  },
});
