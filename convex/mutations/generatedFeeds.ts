import { internalMutation } from "../_generated/server";
import { v } from "convex/values";

export const upsertFeed = internalMutation({
  args: {
    officeSlug: v.string(),
    serviceSlug: v.string(),
    xmlContent: v.string(),
    htmlContent: v.string(),
    itemCount: v.number(),
  },
  handler: async (ctx, { officeSlug, serviceSlug, xmlContent, htmlContent, itemCount }) => {
    const existing = await ctx.db
      .query("generated_feeds")
      .withIndex("by_slugs", q =>
        q.eq("officeSlug", officeSlug).eq("serviceSlug", serviceSlug)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        xmlContent,
        htmlContent,
        generatedAt: Date.now(),
        itemCount,
      });
    } else {
      await ctx.db.insert("generated_feeds", {
        officeSlug,
        serviceSlug,
        xmlContent,
        htmlContent,
        generatedAt: Date.now(),
        itemCount,
      });
    }
  },
});
