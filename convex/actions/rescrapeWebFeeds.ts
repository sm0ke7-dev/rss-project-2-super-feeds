"use node";

import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import * as cheerio from "cheerio";
import pLimit from "p-limit";
import Parser from "rss-parser";

/** Paths that are unlikely to be article links (mirrored from scrapeUrl.ts). */
const NON_ARTICLE_PATHS = [
  "/login",
  "/signin",
  "/signup",
  "/register",
  "/about",
  "/contact",
  "/privacy",
  "/terms",
  "/cookie",
  "/help",
  "/faq",
  "/careers",
  "/jobs",
];

const MAX_ITEMS = 100;

// --- YouTube Atom feed parser ---

type YouTubeCustomItem = {
  videoId?: string;
  channelId?: string;
  mediaGroup?: Record<string, unknown>;
};

const youtubeParser = new Parser<Record<string, unknown>, YouTubeCustomItem>({
  timeout: 10000,
  customFields: {
    item: [
      ["yt:videoId", "videoId"],
      ["yt:channelId", "channelId"],
      ["media:group", "mediaGroup"],
    ],
  },
});

/** Map a parsed YouTube Atom item to the enriched web-feed item shape. */
function mapYouTubeItem(item: Parser.Item & YouTubeCustomItem): {
  title: string;
  link: string;
  thumbnailUrl?: string;
  description?: string;
  publishedAt?: string;
} {
  const mediaGroup = item.mediaGroup as Record<string, unknown> | undefined;

  // media:thumbnail is parsed as an array of objects by rss-parser
  const mediaThumbnailArr = mediaGroup?.["media:thumbnail"] as
    | Array<{ $?: Record<string, string> }>
    | undefined;
  const thumbnailUrl = mediaThumbnailArr?.[0]?.["$"]?.url;

  // media:description is inside mediaGroup as an array of strings
  const mediaDescriptionArr = mediaGroup?.["media:description"] as
    | string[]
    | undefined;
  const description =
    mediaDescriptionArr?.[0] ??
    (item as unknown as { contentSnippet?: string }).contentSnippet ??
    (item as unknown as { content?: string }).content ??
    undefined;

  return {
    title: item.title ?? "(untitled)",
    link: item.link ?? "",
    thumbnailUrl,
    description,
    publishedAt: item.isoDate ?? item.pubDate ?? undefined,
  };
}

/**
 * Extract article links from raw HTML, resolving relative URLs against baseUrl.
 * Mirrors the logic in scrapeUrl.ts.
 */
function extractItems(
  html: string,
  baseUrl: string
): Array<{ title: string; link: string }> {
  const parsed = new URL(baseUrl);
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const items: Array<{ title: string; link: string }> = [];

  $("a[href]").each((_i, el) => {
    if (items.length >= MAX_ITEMS) return false;

    const href = $(el).attr("href");
    if (!href) return;

    let resolved: URL;
    try {
      resolved = new URL(href, baseUrl);
    } catch {
      return;
    }

    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") {
      return;
    }

    // Skip same-page anchors
    if (
      resolved.hash &&
      resolved.origin === parsed.origin &&
      resolved.pathname === parsed.pathname
    ) {
      return;
    }

    const lowerPath = resolved.pathname.toLowerCase();
    if (NON_ARTICLE_PATHS.some((p) => lowerPath.startsWith(p))) {
      return;
    }

    const hrefTrimmed = href.trim().toLowerCase();
    if (
      hrefTrimmed.startsWith("javascript:") ||
      hrefTrimmed.startsWith("mailto:")
    ) {
      return;
    }

    const text = $(el).text().trim();
    if (text.length < 5) return;

    const canonical = resolved.href;
    if (seen.has(canonical)) return;
    seen.add(canonical);

    items.push({ title: text, link: canonical });
  });

  return items;
}

export const rescrapeWebFeeds = internalAction({
  args: {},
  handler: async (ctx) => {
    const feeds = await ctx.runQuery(internal.webFeeds.listAll);

    if (feeds.length === 0) {
      console.log("rescrapeWebFeeds: no web feeds to rescrape");
      return;
    }

    console.log(`rescrapeWebFeeds: rescaping ${feeds.length} web feed(s)`);

    const limit = pLimit(3);

    const results = await Promise.allSettled(
      feeds.map((feed) =>
        limit(async () => {
          // --- YouTube feeds: use rss-parser on the Atom endpoint ---
          if (feed.feedType === "youtube") {
            const listId = new URL(feed.url).searchParams.get("list");
            if (!listId) {
              throw new Error(
                `YouTube feed ${feed.url} has no list= param; skipping`
              );
            }

            const atomUrl = `https://www.youtube.com/feeds/videos.xml?playlist_id=${listId}`;
            const parsedFeed = await youtubeParser.parseURL(atomUrl);
            const items = parsedFeed.items
              .slice(0, MAX_ITEMS)
              .map(mapYouTubeItem);

            await ctx.runMutation(internal.webFeeds.updateItems, {
              id: feed._id,
              items,
              scrapedItemCount: items.length,
              lastScrapedAt: Date.now(),
            });

            console.log(
              `rescrapeWebFeeds (youtube): ${feed.url} → ${items.length} item(s)`
            );
            return;
          }

          // --- Non-YouTube feeds: HTML scrape via Cheerio ---
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 15_000);

          let html: string;
          try {
            const response = await fetch(feed.url, {
              signal: controller.signal,
              headers: {
                "User-Agent":
                  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
                Accept:
                  "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.5",
              },
              redirect: "follow",
            });
            clearTimeout(timeout);

            if (!response.ok) {
              throw new Error(`HTTP ${response.status} ${response.statusText}`);
            }
            html = await response.text();
          } catch (err) {
            clearTimeout(timeout);
            throw err;
          }

          const items = extractItems(html, feed.url);

          await ctx.runMutation(internal.webFeeds.updateItems, {
            id: feed._id,
            items,
            scrapedItemCount: items.length,
            lastScrapedAt: Date.now(),
          });

          console.log(
            `rescrapeWebFeeds: ${feed.url} → ${items.length} item(s)`
          );
        })
      )
    );

    const ok = results.filter((r) => r.status === "fulfilled").length;
    const fail = results.filter((r) => r.status === "rejected").length;

    if (fail > 0) {
      results.forEach((r, i) => {
        if (r.status === "rejected") {
          console.error(
            `rescrapeWebFeeds: failed to rescrape ${feeds[i].url}:`,
            r.reason instanceof Error ? r.reason.message : r.reason
          );
        }
      });
    }

    console.log(`rescrapeWebFeeds: ${ok} ok, ${fail} failed`);
  },
});
