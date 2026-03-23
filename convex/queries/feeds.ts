import { internalQuery } from "../_generated/server";

// Returns all active location x service combinations (cartesian product)
export const getAllFeedCombinations = internalQuery({
  args: {},
  handler: async (ctx) => {
    const locations = await ctx.db.query("locations").collect();
    const activeLocations = locations.filter((l) => l.active);
    const services = await ctx.db.query("services").collect();
    const activeServices = services.filter((s) => s.active);

    // Need office slugs for URL generation
    const officeMap = new Map<string, { slug: string }>();
    for (const loc of activeLocations) {
      if (!officeMap.has(loc.officeId)) {
        const office = await ctx.db.get(loc.officeId);
        if (office) officeMap.set(loc.officeId, { slug: office.slug });
      }
    }

    const combinations: Array<{
      officeId: string;
      locationId: string;
      serviceId: string;
      officeSlug: string;
      locationSlug: string;
      serviceSlug: string;
    }> = [];

    for (const location of activeLocations) {
      const office = officeMap.get(location.officeId);
      if (!office) continue;
      for (const service of activeServices) {
        combinations.push({
          officeId: location.officeId,
          locationId: location._id,
          serviceId: service._id,
          officeSlug: office.slug,
          locationSlug: location.slug,
          serviceSlug: service.slug,
        });
      }
    }

    return combinations;
  },
});
