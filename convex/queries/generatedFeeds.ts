import { internalQuery } from "../_generated/server";
import { v } from "convex/values";

export const getBySlug = internalQuery({
  args: {
    officeSlug: v.string(),
    locationSlug: v.string(),
    serviceSlug: v.string(),
  },
  handler: async (ctx, { officeSlug, locationSlug, serviceSlug }) => {
    return await ctx.db
      .query("generated_feeds")
      .withIndex("by_slugs", (q) =>
        q
          .eq("officeSlug", officeSlug)
          .eq("locationSlug", locationSlug)
          .eq("serviceSlug", serviceSlug)
      )
      .first();
  },
});

export const listAll = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("generated_feeds").collect();
  },
});
