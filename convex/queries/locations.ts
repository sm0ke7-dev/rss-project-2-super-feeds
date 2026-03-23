import { internalQuery } from "../_generated/server";
import { v } from "convex/values";

export const getById = internalQuery({
  args: { locationId: v.id("locations") },
  handler: async (ctx, { locationId }) => await ctx.db.get(locationId),
});
