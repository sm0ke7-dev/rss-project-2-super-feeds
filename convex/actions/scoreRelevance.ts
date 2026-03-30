"use node";

import OpenAI from "openai";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import pLimit from "p-limit";
import { requireEnv } from "../lib/env";

const SYSTEM_PROMPT = `You are a content classifier for a nuisance wildlife removal company. 
Score each article for relevance on a 1-3 scale:

1 = RELATED — Directly about nuisance wildlife removal, pest control, or animals commonly removed from homes/buildings. Includes: raccoons, squirrels, bats, opossums, skunks, birds (in structures), mice, rats, snakes, groundhogs, moles, beavers, coyotes (in residential areas), foxes, armadillos, and general wildlife removal/control/trapping services.

2 = SEMI-RELATED — About wildlife but NOT specifically nuisance wildlife removal. Includes: deer, bears, wolves, moose, elk, endangered species, wildlife conservation, hunting, fishing, general animal news, wildlife rehabilitation, zoos, marine wildlife.

3 = UNRELATED — Not about wildlife at all. Includes: politics, sports, entertainment, technology, business, weather (unless wildlife-related), crime (unless wildlife-related), human interest stories.

Respond with JSON: {"score": N} where N is 1, 2, or 3. Nothing else.`;

export const scoreSingleItem = internalAction({
  args: {
    itemId: v.id("feedItems"),
    title: v.string(),
    description: v.string(),
  },
  handler: async (ctx, { itemId, title, description }) => {
    const apiKey = requireEnv("OPENAI_API_KEY");
    const client = new OpenAI({ apiKey });

    const userMessage = description
      ? `Title: ${title}\nDescription: ${description}`
      : `Title: ${title}`;

    try {
      const completion = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
        response_format: { type: "json_object" },
        temperature: 0,
        max_tokens: 20,
      });

      const content = completion.choices[0]?.message?.content;
      if (!content) {
        console.error(`scoreRelevance: empty response for item ${itemId}`);
        return;
      }

      const parsed = JSON.parse(content);
      const score = parsed.score;

      if (score !== 1 && score !== 2 && score !== 3) {
        console.error(
          `scoreRelevance: unexpected score ${score} for item ${itemId}, raw: ${content}`
        );
        return;
      }

      await ctx.runMutation(internal.mutations.sources.updateItemRelevanceScore, {
        itemId,
        relevanceScore: score,
      });
    } catch (error) {
      console.error(
        `scoreRelevance: failed for item ${itemId}:`,
        error instanceof Error ? error.message : error
      );
    }
  },
});

export const scoreRelevanceBatch = internalAction({
  args: {},
  handler: async (ctx) => {
    const items = await ctx.runQuery(
      internal.queries.feedItems.getItemsNeedingScoring
    );

    if (!items || items.length === 0) {
      console.log("scoreRelevanceBatch: no items need scoring");
      return;
    }

    console.log(`scoreRelevanceBatch: scoring ${items.length} items`);

    const limit = pLimit(5);
    const results = await Promise.allSettled(
      items.map((item: { _id: string; title: string; description: string }) =>
        limit(() =>
          ctx.runAction(internal.actions.scoreRelevance.scoreSingleItem, {
            itemId: item._id,
            title: item.title,
            description: item.description,
          })
        )
      )
    );

    const succeeded = results.filter(
      (r: PromiseSettledResult<unknown>) => r.status === "fulfilled"
    ).length;
    const failed = results.filter(
      (r: PromiseSettledResult<unknown>) => r.status === "rejected"
    ).length;
    console.log(
      `scoreRelevanceBatch: ${succeeded}/${items.length} succeeded, ${failed} failed`
    );
  },
});

export const backfillAllScores = internalAction({
  args: {},
  handler: async (ctx) => {
    let totalScored = 0;
    let batchNum = 0;

    while (true) {
      const items = await ctx.runQuery(
        internal.queries.feedItems.getItemsNeedingScoring
      );

      if (!items || items.length === 0) {
        console.log(
          `backfillAllScores: complete. ${totalScored} items scored total.`
        );
        return;
      }

      batchNum++;
      console.log(
        `backfillAllScores: batch ${batchNum}, scoring ${items.length} items`
      );

      const limit = pLimit(5);
      const results = await Promise.allSettled(
        items.map((item: { _id: string; title: string; description: string }) =>
          limit(() =>
            ctx.runAction(internal.actions.scoreRelevance.scoreSingleItem, {
              itemId: item._id,
              title: item.title,
              description: item.description,
            })
          )
        )
      );

      const succeeded = results.filter(
        (r: PromiseSettledResult<unknown>) => r.status === "fulfilled"
      ).length;
      totalScored += succeeded;
    }
  },
});
