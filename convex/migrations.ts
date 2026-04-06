import { internalMutation, internalQuery } from "./_generated/server";

// Diagnostic: find sources with "youtube", "yt", or "soundcloud" in title/url and show schemaTypes
export const diagnoseMediaSources = internalQuery({
  args: {},
  handler: async (ctx) => {
    const allSources = await ctx.db.query("sources").collect();
    const mediaSources = allSources.filter((s) => {
      const title = s.title?.toLowerCase() ?? "";
      const url = s.url?.toLowerCase() ?? "";
      return title.includes("youtube") || title.includes(" yt ") ||
        title.endsWith(" yt") || title.startsWith("yt ") ||
        url.includes("youtube") || title.includes("soundcloud") ||
        url.includes("soundcloud");
    });
    const result = [];
    for (const source of mediaSources) {
      const items = await ctx.db
        .query("feedItems")
        .withIndex("by_source", (q) => q.eq("sourceId", source._id))
        .collect();
      const typeCounts: Record<string, number> = {};
      for (const item of items) {
        typeCounts[item.schemaType] = (typeCounts[item.schemaType] ?? 0) + 1;
      }
      result.push({ title: source.title, url: source.url, itemCount: items.length, typeCounts });
    }
    return result;
  },
});

// One-time fix: transfer SoundCloud playlist item to brand source
export const fixSoundCloudPlaylistOwnership = internalMutation({
  args: {},
  handler: async (ctx) => {
    const brandSourceId = "jn76b7ex302qc6ftbfsasnr7jd84aszp" as any;
    const itemId = "jx72yd6xvjk05c35v0ked3nvs984ajkr" as any;
    await ctx.db.patch(itemId, { sourceId: brandSourceId });
    const patched = await ctx.db.get(itemId);
    return { patched: { id: patched?._id, sourceId: patched?.sourceId, schemaType: patched?.schemaType, title: patched?.title } };
  },
});

// Diagnostic: find feedItems for specific source IDs
export const diagnoseFeedItemsBySource = internalQuery({
  args: {},
  handler: async (ctx) => {
    // Check both SoundCloud sources
    const globalSourceId = "jn73cdan424p7egnrzggqzhwhx84b3sg";
    const brandSourceId = "jn76b7ex302qc6ftbfsasnr7jd84aszp";

    const allItems = await ctx.db.query("feedItems").collect();
    const globalItems = allItems.filter(i => i.sourceId === globalSourceId);
    const brandItems = allItems.filter(i => i.sourceId === brandSourceId);
    const soundcloudItems = allItems.filter(i => i.link?.includes("soundcloud.com/aaactxgulfcoast/sets/"));

    return {
      globalSourceItems: globalItems.map(i => ({ id: i._id, title: i.title, schemaType: i.schemaType, sourceId: i.sourceId, relevanceScore: i.relevanceScore })),
      brandSourceItems: brandItems.map(i => ({ id: i._id, title: i.title, schemaType: i.schemaType, sourceId: i.sourceId, relevanceScore: i.relevanceScore })),
      soundcloudPlaylistItems: soundcloudItems.map(i => ({ id: i._id, title: i.title, schemaType: i.schemaType, sourceId: i.sourceId, guid: i.guid, relevanceScore: i.relevanceScore })),
    };
  },
});

// One-time migration: fix feedItems whose link points to YouTube but were stored as "Article",
// and SoundCloud items stored as "Article" instead of "AudioObject".
export const fixMediaSchemaTypes = internalMutation({
  args: {},
  handler: async (ctx) => {
    const allItems = await ctx.db.query("feedItems").collect();
    let fixedVideo = 0;
    let fixedAudio = 0;
    for (const item of allItems) {
      const isYouTubeLink =
        item.link?.includes("youtube.com/watch") ||
        item.link?.includes("youtu.be/") ||
        item.link?.includes("youtube.com/shorts");
      const isSoundCloudLink = item.link?.includes("soundcloud.com/");
      if (isYouTubeLink && item.schemaType !== "VideoObject") {
        await ctx.db.patch(item._id, { schemaType: "VideoObject" });
        fixedVideo++;
      } else if (isSoundCloudLink && item.schemaType !== "AudioObject") {
        await ctx.db.patch(item._id, { schemaType: "AudioObject" });
        fixedAudio++;
      }
    }
    console.log(`fixMediaSchemaTypes: scanned ${allItems.length} items, fixed ${fixedVideo} video, ${fixedAudio} audio`);
    return { scanned: allItems.length, fixedVideo, fixedAudio };
  },
});
