"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import * as cheerio from "cheerio";

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

    // --- Fetch page HTML ---
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
