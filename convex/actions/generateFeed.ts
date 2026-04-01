"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { generateRss2, FeedItem, FeedMeta } from "../lib/generateRss";
import { generateFeedHtml } from "../lib/generateHtml";
import { FeedPageItem } from "../lib/generateJsonLd";
import { pingWebSubHub } from "../lib/webSub";

const FEED_BASE_URL = process.env.FEED_BASE_URL ?? "";
const TERMS_URL = process.env.TERMS_URL ?? "";
const PRIVACY_URL = process.env.PRIVACY_URL ?? "";
const WEBSUB_HUB = "https://pubsubhubbub.appspot.com/";

export const generateFeedFiles = internalAction({
  args: {
    officeId: v.id("offices"),
    locationId: v.id("locations"),
    serviceId: v.id("services"),
  },
  handler: async (ctx, { officeId, locationId, serviceId }) => {
    const [office, location, service] = await Promise.all([
      ctx.runQuery(internal.queries.offices.getById, { officeId }),
      ctx.runQuery(internal.queries.locations.getById, { locationId }),
      ctx.runQuery(internal.queries.services.getById, { serviceId }),
    ]);

    if (!office || !location || !service) {
      throw new Error(
        `Office, location, or service not found: ${officeId}, ${locationId}, ${serviceId}`
      );
    }

    const { featured: featuredRaw, general: generalRaw } = await ctx.runQuery(
      internal.queries.feedItems.getFeedItemsForOfficeService,
      { officeId, locationId, serviceId }
    );

    const rawItems = [...featuredRaw, ...generalRaw];

    // Build sourceId -> title map for labelling items in the HTML output
    const sourceIds = [...new Set(rawItems.map(i => i.sourceId).filter(Boolean))];
    const sourceMap = new Map<string, string>();
    for (const sid of sourceIds) {
      if (sid) {
        const src = await ctx.runQuery(internal.queries.sources.getSourceById, { sourceId: sid });
        if (src) sourceMap.set(sid, src.title);
      }
    }

    const feedItems: FeedItem[] = rawItems.map((item) => ({
      guid: item.guid,
      title: item.title,
      link: item.link,
      description: item.description,
      fullContent: item.fullContent,
      pubDate: item.pubDate,
      isoDate: item.isoDate,
      videoId: item.videoId,
      thumbnailUrl: item.thumbnailUrl,
      artworkUrl: item.artworkUrl,
      duration: item.duration,
      schemaType: item.schemaType,
    }));

    const toPageItem = (item: (typeof rawItems)[0]): FeedPageItem => ({
      guid: item.guid,
      title: item.title,
      link: item.link,
      description: item.description,
      fullContent: item.fullContent,
      isoDate: item.isoDate,
      videoId: item.videoId,
      thumbnailUrl: item.thumbnailUrl,
      artworkUrl: item.artworkUrl,
      duration: item.duration,
      schemaType: item.schemaType,
      sourceName: item.sourceId ? sourceMap.get(item.sourceId) : undefined,
    });

    const featuredPageItems: FeedPageItem[] = featuredRaw.map(toPageItem);
    const generalPageItems: FeedPageItem[] = generalRaw.map(toPageItem);

    const meta: FeedMeta = {
      officeSlug: office.slug,
      locationSlug: location.slug,
      serviceSlug: service.slug,
      officeName: office.name,
      locationName: location.name,
      serviceName: service.name,
      feedBaseUrl: FEED_BASE_URL,
      lastBuildDate: new Date().toUTCString(),
    };

    const xmlContent = generateRss2(meta, feedItems);
    const htmlContent = generateFeedHtml(
      office.name,
      location.name,
      service.name,
      office.slug,
      location.slug,
      service.slug,
      FEED_BASE_URL,
      featuredPageItems,
      generalPageItems,
      {
        name: office.name,
        address: office.address,
        city: office.city,
        state: office.state,
        zip: office.zip,
        phone: office.phone,
        contactUrl: office.contactUrl,
      },
      TERMS_URL,
      PRIVACY_URL
    );

    // Store in Convex instead of R2
    await ctx.runMutation(internal.mutations.generatedFeeds.upsertFeed, {
      officeSlug: office.slug,
      locationSlug: location.slug,
      serviceSlug: service.slug,
      xmlContent,
      htmlContent,
      itemCount: featuredRaw.length + generalRaw.length,
    });

    console.log(
      `Generated feed for ${office.slug}/${location.slug}/${service.slug} (${featuredRaw.length + generalRaw.length} items)`
    );

    // Ping WebSub hub (best-effort)
    if (FEED_BASE_URL) {
      const topicUrl = `${FEED_BASE_URL}/feeds/${office.slug}/${location.slug}/${service.slug}/feed.xml`;
      await pingWebSubHub(WEBSUB_HUB, topicUrl);
    }

    return { itemCount: featuredRaw.length + generalRaw.length };
  },
});
