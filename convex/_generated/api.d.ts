/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as actions_aggregation from "../actions/aggregation.js";
import type * as actions_extractContent from "../actions/extractContent.js";
import type * as actions_fetchSource from "../actions/fetchSource.js";
import type * as actions_generateFeed from "../actions/generateFeed.js";
import type * as actions_scoreRelevance from "../actions/scoreRelevance.js";
import type * as crons from "../crons.js";
import type * as feedItems from "../feedItems.js";
import type * as feedRuns from "../feedRuns.js";
import type * as generatedFeeds from "../generatedFeeds.js";
import type * as http from "../http.js";
import type * as lib_env from "../lib/env.js";
import type * as lib_generateHtml from "../lib/generateHtml.js";
import type * as lib_generateJsonLd from "../lib/generateJsonLd.js";
import type * as lib_generateRss from "../lib/generateRss.js";
import type * as lib_r2Client from "../lib/r2Client.js";
import type * as lib_retry from "../lib/retry.js";
import type * as lib_webSub from "../lib/webSub.js";
import type * as locations from "../locations.js";
import type * as mutations_admin from "../mutations/admin.js";
import type * as mutations_feedRuns from "../mutations/feedRuns.js";
import type * as mutations_generatedFeeds from "../mutations/generatedFeeds.js";
import type * as mutations_sources from "../mutations/sources.js";
import type * as offices from "../offices.js";
import type * as queries_feedItems from "../queries/feedItems.js";
import type * as queries_feeds from "../queries/feeds.js";
import type * as queries_generatedFeeds from "../queries/generatedFeeds.js";
import type * as queries_locations from "../queries/locations.js";
import type * as queries_offices from "../queries/offices.js";
import type * as queries_services from "../queries/services.js";
import type * as queries_sources from "../queries/sources.js";
import type * as seed from "../seed.js";
import type * as services from "../services.js";
import type * as sources from "../sources.js";
import type * as static_items from "../static_items.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "actions/aggregation": typeof actions_aggregation;
  "actions/extractContent": typeof actions_extractContent;
  "actions/fetchSource": typeof actions_fetchSource;
  "actions/generateFeed": typeof actions_generateFeed;
  "actions/scoreRelevance": typeof actions_scoreRelevance;
  crons: typeof crons;
  feedItems: typeof feedItems;
  feedRuns: typeof feedRuns;
  generatedFeeds: typeof generatedFeeds;
  http: typeof http;
  "lib/env": typeof lib_env;
  "lib/generateHtml": typeof lib_generateHtml;
  "lib/generateJsonLd": typeof lib_generateJsonLd;
  "lib/generateRss": typeof lib_generateRss;
  "lib/r2Client": typeof lib_r2Client;
  "lib/retry": typeof lib_retry;
  "lib/webSub": typeof lib_webSub;
  locations: typeof locations;
  "mutations/admin": typeof mutations_admin;
  "mutations/feedRuns": typeof mutations_feedRuns;
  "mutations/generatedFeeds": typeof mutations_generatedFeeds;
  "mutations/sources": typeof mutations_sources;
  offices: typeof offices;
  "queries/feedItems": typeof queries_feedItems;
  "queries/feeds": typeof queries_feeds;
  "queries/generatedFeeds": typeof queries_generatedFeeds;
  "queries/locations": typeof queries_locations;
  "queries/offices": typeof queries_offices;
  "queries/services": typeof queries_services;
  "queries/sources": typeof queries_sources;
  seed: typeof seed;
  services: typeof services;
  sources: typeof sources;
  static_items: typeof static_items;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
