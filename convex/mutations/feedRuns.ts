import { internalMutation } from "../_generated/server";
import { v } from "convex/values";

export const createFeedRun = internalMutation({
  args: {
    officeId: v.id("offices"),
    locationId: v.id("locations"),
    serviceId: v.id("services"),
  },
  handler: async (ctx, { officeId, locationId, serviceId }) => {
    return await ctx.db.insert("feed_runs", {
      officeId,
      locationId,
      serviceId,
      status: "running",
      startedAt: Date.now(),
    });
  },
});

export const updateFeedRun = internalMutation({
  args: {
    runId: v.id("feed_runs"),
    status: v.union(
      v.literal("running"),
      v.literal("success"),
      v.literal("error")
    ),
    itemCount: v.optional(v.number()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, { runId, status, itemCount, error }) => {
    await ctx.db.patch(runId, {
      status,
      completedAt: Date.now(),
      ...(itemCount !== undefined ? { itemCount } : {}),
      ...(error !== undefined ? { error } : {}),
    });
  },
});
