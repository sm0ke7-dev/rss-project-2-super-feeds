"use node";

import { extract } from "@extractus/article-extractor";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import pLimit from "p-limit";

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

export const extractSingleArticle = internalAction({
  args: {
    itemId: v.id("feedItems"),
    url: v.string(),
  },
  handler: async (ctx, { itemId, url }) => {
    // Skip YouTube URLs
    if (url.includes("youtube.com") || url.includes("youtu.be")) {
      await ctx.runMutation(internal.mutations.sources.updateItemContent, {
        itemId,
        fullContent: undefined,
      });
      return;
    }

    // Skip PDF URLs
    if (url.toLowerCase().endsWith(".pdf")) {
      await ctx.runMutation(internal.mutations.sources.updateItemContent, {
        itemId,
        fullContent: undefined,
      });
      return;
    }

    try {
      const article = await Promise.race([
        extract(url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
          },
        }),
        new Promise<null>((_, reject) =>
          setTimeout(() => reject(new Error(`Extraction timed out for ${url}`)), 10_000)
        ),
      ]);
      let plainText: string | undefined;

      if (article?.content) {
        const stripped = stripHtml(article.content);
        plainText = stripped.slice(0, 10000);
      }

      await ctx.runMutation(internal.mutations.sources.updateItemContent, {
        itemId,
        fullContent: plainText,
      });
    } catch (error) {
      console.error(`Failed to extract content for ${url}:`, error);
      // Don't update DB — leave contentExtractedAt unset so it will be retried
    }
  },
});

export const extractContentBatch = internalAction({
  args: {},
  handler: async (ctx) => {
    const items = await ctx.runQuery(
      internal.queries.feedItems.getItemsNeedingContent
    );

    if (!items || items.length === 0) {
      return;
    }

    const limit = pLimit(5);
    const results = await Promise.allSettled(
      items.map((item) =>
        limit(() =>
          ctx.runAction(internal.actions.extractContent.extractSingleArticle, {
            itemId: item._id,
            url: item.link,
          })
        )
      )
    );

    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    console.log(`Content extraction: ${succeeded}/${items.length} succeeded`);
  },
});
