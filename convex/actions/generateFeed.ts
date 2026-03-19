"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { generateRss2, FeedItem, FeedMeta } from "../lib/generateRss";
import { generateFeedHtml } from "../lib/generateHtml";
import { FeedPageItem } from "../lib/generateJsonLd";
import { pingWebSubHub } from "../lib/webSub";

const FEED_BASE_URL = process.env.FEED_BASE_URL ?? "";
const WEBSUB_HUB = "https://pubsubhubbub.appspot.com/";

export const generateFeedFiles = internalAction({
  args: {
    officeId: v.id("offices"),
    serviceId: v.id("services"),
  },
  handler: async (ctx, { officeId, serviceId }) => {
    const [office, service] = await Promise.all([
      ctx.runQuery(internal.queries.offices.getById, { officeId }),
      ctx.runQuery(internal.queries.services.getById, { serviceId }),
    ]);

    if (!office || !service) {
      throw new Error(`Office or service not found: ${officeId}, ${serviceId}`);
    }

    const rawItems = await ctx.runQuery(
      internal.queries.feedItems.getFeedItemsForOfficeService,
      { officeId, serviceId }
    );

    const feedItems: FeedItem[] = rawItems.map(item => ({
      guid: item.guid,
      title: item.title,
      link: item.link,
      description: item.description,
      pubDate: item.pubDate,
      isoDate: item.isoDate,
      videoId: item.videoId,
      thumbnailUrl: item.thumbnailUrl,
      schemaType: item.schemaType,
    }));

    const feedPageItems: FeedPageItem[] = feedItems;

    const meta: FeedMeta = {
      officeSlug: office.slug,
      serviceSlug: service.slug,
      officeName: office.name,
      serviceName: service.name,
      feedBaseUrl: FEED_BASE_URL,
      lastBuildDate: new Date().toUTCString(),
    };

    const xmlContent = generateRss2(meta, feedItems);
    const htmlContent = generateFeedHtml(
      office.name,
      service.name,
      office.slug,
      service.slug,
      FEED_BASE_URL,
      feedPageItems
    );

    // Store in Convex instead of R2
    await ctx.runMutation(internal.mutations.generatedFeeds.upsertFeed, {
      officeSlug: office.slug,
      serviceSlug: service.slug,
      xmlContent,
      htmlContent,
      itemCount: feedItems.length,
    });

    console.log(`Generated feed for ${office.slug}/${service.slug} (${feedItems.length} items)`);

    // Ping WebSub hub (best-effort)
    if (FEED_BASE_URL) {
      const topicUrl = `${FEED_BASE_URL}/feeds/${office.slug}/${service.slug}/feed.xml`;
      await pingWebSubHub(WEBSUB_HUB, topicUrl);
    }

    return { itemCount: feedItems.length };
  },
});
