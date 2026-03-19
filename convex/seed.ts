import { internalMutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

export const seed = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Idempotency check
    const existingOffices = await ctx.db.query("offices").collect();
    if (existingOffices.length > 0) {
      console.log("Database already seeded — skipping.");
      return { skipped: true };
    }

    // --- Offices ---
    const officesData = [
      { name: "Atlanta", slug: "atlanta", city: "Atlanta", state: "GA", active: true },
      { name: "Nashville", slug: "nashville", city: "Nashville", state: "TN", active: true },
      { name: "Dallas", slug: "dallas", city: "Dallas", state: "TX", active: true },
      { name: "Charlotte", slug: "charlotte", city: "Charlotte", state: "NC", active: true },
      { name: "Indianapolis", slug: "indianapolis", city: "Indianapolis", state: "IN", active: true },
    ];
    const officeIds: Record<string, Id<"offices">> = {};
    for (const office of officesData) {
      const id = await ctx.db.insert("offices", office);
      officeIds[office.slug] = id;
    }

    // --- Services ---
    const servicesData = [
      { name: "Wildlife Removal", slug: "wildlife-removal", description: "General wildlife removal and exclusion services.", active: true },
      { name: "Raccoon Removal", slug: "raccoon-removal", description: "Humane raccoon trapping and exclusion.", active: true },
      { name: "Squirrel Removal", slug: "squirrel-removal", description: "Squirrel trapping and attic exclusion.", active: true },
      { name: "Bat Removal", slug: "bat-removal", description: "Bat exclusion and guano cleanup.", active: true },
    ];
    const serviceIds: Record<string, Id<"services">> = {};
    for (const service of servicesData) {
      const id = await ctx.db.insert("services", service);
      serviceIds[service.slug] = id;
    }

    // --- Sources ---
    // Global brand: AAAC YouTube channel
    const globalBrandSourceId = await ctx.db.insert("sources", {
      url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCsT0YIqwnpJCM-mx7-gSA4Q",
      title: "AAAC Wildlife Removal YouTube",
      type: "brand",
      scope: "global",
      ttlMinutes: 60,
      active: true,
    });

    // Global freshness: NWF RSS feed
    await ctx.db.insert("sources", {
      url: "https://www.nwf.org/Home/News-and-Magazines/Media-Center/News-by-Topic/Wildlife",
      title: "National Wildlife Federation News",
      type: "freshness",
      scope: "global",
      ttlMinutes: 120,
      active: true,
    });

    // Service scope authority: USDA Wildlife Services (for Wildlife Removal)
    const serviceAuthoritySourceId = await ctx.db.insert("sources", {
      url: "https://www.aphis.usda.gov/wildlife-damage",
      title: "USDA Wildlife Damage Management",
      type: "authority",
      scope: "service",
      serviceId: serviceIds["wildlife-removal"],
      ttlMinutes: 1440,
      active: true,
    });

    // Office scope: Georgia DNR for Atlanta
    await ctx.db.insert("sources", {
      url: "https://georgiawildlife.com/feed",
      title: "Georgia Wildlife Resources Division",
      type: "freshness",
      scope: "office",
      officeId: officeIds["atlanta"],
      ttlMinutes: 120,
      active: true,
    });

    // Office-service scope: Atlanta + Wildlife Removal brand channel
    await ctx.db.insert("sources", {
      url: "https://www.youtube.com/feeds/videos.xml?channel_id=EXAMPLE_ATLANTA_CHANNEL",
      title: "AAAC Atlanta Wildlife YouTube",
      type: "brand",
      scope: "office-service",
      officeId: officeIds["atlanta"],
      serviceId: serviceIds["wildlife-removal"],
      ttlMinutes: 60,
      active: true,
    });

    // --- Static Items ---
    await ctx.db.insert("static_items", {
      title: "USDA Wildlife Damage Management Overview",
      url: "https://www.aphis.usda.gov/wildlife-damage",
      description: "Official USDA resource on wildlife damage management programs and services.",
      type: "authority",
      sourceId: serviceAuthoritySourceId,
      publishedAt: Date.now() - 7 * 24 * 60 * 60 * 1000, // 7 days ago
    });

    await ctx.db.insert("static_items", {
      title: "AAAC Wildlife Removal — About Our Services",
      url: "https://www.aaacwildliferemoval.com/about",
      description: "Overview of AAAC Wildlife Removal's humane removal and exclusion services.",
      type: "brand",
      sourceId: globalBrandSourceId,
      publishedAt: Date.now() - 30 * 24 * 60 * 60 * 1000, // 30 days ago
    });

    // --- Settings ---
    await ctx.db.insert("settings", {
      key: "feedTitle",
      value: "AAAC Wildlife Removal Super Feed",
    });
    await ctx.db.insert("settings", {
      key: "defaultTtlMinutes",
      value: "60",
    });
    await ctx.db.insert("settings", {
      key: "websubHub",
      value: "https://pubsubhubbub.appspot.com/",
    });

    console.log(`Seeded: ${officesData.length} offices, ${servicesData.length} services, 5 sources, 2 static items, 3 settings`);
    return {
      offices: officesData.length,
      services: servicesData.length,
      sources: 5,
      staticItems: 2,
      settings: 3,
    };
  },
});
