"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import * as cheerio from "cheerio";
import Parser from "rss-parser";

/** Paths that are unlikely to be article links. */
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

export const scrapeUrl = action({
  args: { url: v.string() },
  handler: async (_ctx, { url }) => {
    // --- Validate URL ---
    const trimmed = url.trim();
    if (!trimmed) {
      return { items: [], warnings: ["URL cannot be empty."] };
    }

    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      return { items: [], warnings: ["Invalid URL format."] };
    }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return {
        items: [],
        warnings: ["Only http and https URLs are supported."],
      };
    }

    // --- YouTube playlist detection ---
    // Matches both /playlist?list=X and /watch?v=Y&list=X forms
    const isYouTube =
      (parsed.hostname === "youtube.com" || parsed.hostname === "www.youtube.com") &&
      parsed.searchParams.get("list") !== null;

    if (isYouTube) {
      const listId = parsed.searchParams.get("list")!;
      const atomUrl = `https://www.youtube.com/feeds/videos.xml?playlist_id=${listId}`;

      try {
        const feed = await youtubeParser.parseURL(atomUrl);
        const items = feed.items.slice(0, MAX_ITEMS).map(mapYouTubeItem);
        const warnings: string[] = [];
        if (items.length === 0) {
          warnings.push("YouTube playlist has no videos.");
        }
        return { items, warnings, feedType: "youtube" as const };
      } catch (err: unknown) {
        const msg = `Failed to fetch YouTube playlist: ${err instanceof Error ? err.message : String(err)}`;
        return { items: [], warnings: [msg] };
      }
    }

    // --- SoundCloud playlist detection ---
    const isSoundCloudPlaylist =
      parsed.hostname === "soundcloud.com" &&
      parsed.pathname.includes("/sets/");

    if (isSoundCloudPlaylist) {
      try {
        const oembedUrl = `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(trimmed)}`;
        const res = await fetch(oembedUrl, { headers: { Accept: "application/json" } });
        if (!res.ok) {
          return { items: [], warnings: [`SoundCloud oEmbed failed: HTTP ${res.status}`] };
        }
        const data = await res.json() as {
          title?: string;
          description?: string;
          thumbnail_url?: string;
          author_name?: string;
        };

        // Store the playlist as a single AudioObject item
        const title = data.title ?? "SoundCloud Playlist";
        const items = [{
          title,
          link: trimmed,
          thumbnailUrl: data.thumbnail_url,
          description: data.description,
        }];

        return { items, warnings: [], feedType: "soundcloud" as const };
      } catch (err: unknown) {
        const msg = `Failed to fetch SoundCloud playlist: ${err instanceof Error ? err.message : String(err)}`;
        return { items: [], warnings: [msg] };
      }
    }

    // --- Fetch page HTML (non-YouTube path) ---
    let html: string;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);

      const res = await fetch(trimmed, {
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
      html = await res.text();
    } catch (err: unknown) {
      const msg =
        err instanceof DOMException && err.name === "AbortError"
          ? "Request timed out after 10 seconds."
          : `Failed to fetch URL: ${err instanceof Error ? err.message : String(err)}`;
      return { items: [], warnings: [msg] };
    }

    // --- Parse HTML and extract links ---
    let $: cheerio.CheerioAPI;
    try {
      $ = cheerio.load(html);
    } catch {
      return { items: [], warnings: ["Failed to parse page HTML."] };
    }

    const seen = new Set<string>();
    const items: Array<{ title: string; link: string }> = [];

    $("a[href]").each((_i, el) => {
      if (items.length >= MAX_ITEMS) return false; // stop iterating

      const href = $(el).attr("href");
      if (!href) return;

      // Resolve relative URLs
      let resolved: URL;
      try {
        resolved = new URL(href, trimmed);
      } catch {
        return; // skip malformed hrefs
      }

      // Only http(s) links
      if (resolved.protocol !== "http:" && resolved.protocol !== "https:") {
        return;
      }

      // Skip same-page anchors
      if (resolved.hash && resolved.origin === parsed.origin && resolved.pathname === parsed.pathname) {
        return;
      }

      // Skip non-article paths
      const lowerPath = resolved.pathname.toLowerCase();
      if (NON_ARTICLE_PATHS.some((p) => lowerPath.startsWith(p))) {
        return;
      }

      // Skip javascript: and mailto: (belt-and-suspenders; protocol check above handles most)
      if (href.trim().toLowerCase().startsWith("javascript:") || href.trim().toLowerCase().startsWith("mailto:")) {
        return;
      }

      const text = $(el).text().trim();
      if (text.length < 5) return; // skip anchors with only whitespace or very short text

      const canonical = resolved.href;
      if (seen.has(canonical)) return;
      seen.add(canonical);

      items.push({ title: text, link: canonical });
    });

    const warnings: string[] = [];
    if (items.length < 3) {
      warnings.push(
        `Only ${items.length} link(s) found — the page may not contain article listings.`
      );
    }

    return { items, warnings };
  },
});
