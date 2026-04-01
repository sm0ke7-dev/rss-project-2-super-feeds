"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import Parser from "rss-parser";
import { withRetry } from "../lib/retry";

type CustomItemFields = {
  videoId?: string;
  channelId?: string;
  mediaGroup?: Record<string, unknown>;
  itunesImage?: { "$": { href: string } };
  itunesDuration?: string;
};

const youtubeParser = new Parser<Record<string, unknown>, CustomItemFields>({
  timeout: 10000,
  customFields: {
    item: [
      ["yt:videoId", "videoId"],
      ["yt:channelId", "channelId"],
      ["media:group", "mediaGroup"],
    ],
  },
});

const soundcloudParser = new Parser<Record<string, unknown>, CustomItemFields>({
  timeout: 10000,
  customFields: {
    item: [
      ["itunes:image", "itunesImage"],
      ["itunes:duration", "itunesDuration"],
    ],
  },
});

const genericParser = new Parser({ timeout: 10000 });

export const fetchRssSource = internalAction({
  args: {
    sourceId: v.id("sources"),
    url: v.string(),
    sourceType: v.union(v.literal("brand"), v.literal("freshness"), v.literal("authority")),
  },
  handler: async (ctx, { sourceId, url }) => {
    try {
      const isSoundCloud = url.includes("feeds.soundcloud.com");
      const isYouTube = url.includes("youtube.com/feeds");

      let items: Array<{
        guid: string;
        title: string;
        link: string;
        description?: string;
        pubDate?: string;
        isoDate?: string;
        videoId?: string;
        channelId?: string;
        thumbnailUrl?: string;
        viewCount?: string;
        artworkUrl?: string;
        duration?: string;
        schemaType: "VideoObject" | "Article" | "DigitalDocument" | "AudioObject";
      }> = [];

      if (isSoundCloud) {
        const feed = await withRetry(() => soundcloudParser.parseURL(url), 3, 500);
        items = feed.items.map((item) => {
          const guid = item.guid ?? item.link ?? item.title ?? "";
          const artworkUrl = item.itunesImage?.["$"]?.href ?? undefined;
          const duration = item.itunesDuration ?? undefined;
          return {
            guid,
            title: item.title ?? "(untitled)",
            link: item.link ?? "",
            description:
              (item as unknown as { contentSnippet?: string }).contentSnippet ??
              (item as unknown as { content?: string }).content ??
              undefined,
            pubDate: item.pubDate ?? undefined,
            isoDate: item.isoDate ?? undefined,
            artworkUrl,
            duration,
            schemaType: "AudioObject" as const,
          };
        });
      } else if (isYouTube) {
        const feed = await withRetry(() => youtubeParser.parseURL(url), 3, 500);
        items = feed.items.map((item) => {
          const mediaGroup = item.mediaGroup as
            | Record<string, unknown>
            | undefined;
          const mediaThumbnail = mediaGroup?.["media:thumbnail"] as
            | Record<string, unknown>
            | undefined;
          const mediaContent = mediaGroup?.["media:content"] as
            | Record<string, unknown>
            | undefined;
          const thumbnailUrl =
            (mediaThumbnail?.["$"] as Record<string, string> | undefined)
              ?.url ??
            (mediaContent?.["$"] as Record<string, string> | undefined)?.url;

          const guid =
            item.guid ?? item.link ?? item.videoId ?? item.title ?? "";

          return {
            guid,
            title: item.title ?? "(untitled)",
            link: item.link ?? "",
            description:
              (item as unknown as { contentSnippet?: string }).contentSnippet ??
              (item as unknown as { content?: string }).content ??
              undefined,
            pubDate: item.pubDate ?? undefined,
            isoDate: item.isoDate ?? undefined,
            videoId: item.videoId ?? undefined,
            channelId: item.channelId ?? undefined,
            thumbnailUrl,
            schemaType: "VideoObject" as const,
          };
        });
      } else {
        const feed = await withRetry(() => genericParser.parseURL(url), 3, 500);
        items = feed.items.map((item) => {
          const guid = item.guid ?? item.link ?? item.title ?? "";
          return {
            guid,
            title: item.title ?? "(untitled)",
            link: item.link ?? "",
            description: item.contentSnippet ?? item.content ?? undefined,
            pubDate: item.pubDate ?? undefined,
            isoDate: item.isoDate ?? undefined,
            schemaType: "Article" as const,
          };
        });
      }

      await ctx.runMutation(internal.mutations.sources.storeFeedItems, {
        sourceId,
        items,
      });

      console.log(`Fetched ${items.length} items from ${url}`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error(`Failed to fetch ${url}: ${errorMessage}`);
      await ctx.runMutation(internal.mutations.sources.markFetchError, {
        sourceId,
        error: errorMessage,
      });
    }
  },
});
