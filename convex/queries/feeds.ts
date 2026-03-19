import { internalQuery } from "../_generated/server";

// Returns all active office x service combinations (cartesian product)
export const getAllOfficeServiceCombinations = internalQuery({
  args: {},
  handler: async (ctx) => {
    const offices = await ctx.db
      .query("offices")
      .withIndex("by_active", (q) => q.eq("active", true))
      .collect();
    const services = await ctx.db
      .query("services")
      .withIndex("by_active", (q) => q.eq("active", true))
      .collect();

    const combinations: Array<{
      officeId: string;
      serviceId: string;
      officeSlug: string;
      serviceSlug: string;
    }> = [];

    for (const office of offices) {
      for (const service of services) {
        combinations.push({
          officeId: office._id,
          serviceId: service._id,
          officeSlug: office.slug,
          serviceSlug: service.slug,
        });
      }
    }

    return combinations;
  },
});
