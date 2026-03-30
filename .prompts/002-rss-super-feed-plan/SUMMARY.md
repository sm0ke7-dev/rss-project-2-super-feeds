# RSS Super Feed — Implementation Plan Summary

## Plan Date: 2026-03-19
## Status: Complete

---

## One-Paragraph Overview

This plan implements a multi-office, multi-service RSS aggregation system for AAAC Wildlife Removal across 6 sequential phases. Convex cron jobs fan out to per-feed actions that resolve sources across a 4-scope hierarchy (global, service, office, office-service), fetch RSS/Atom feeds using `rss-parser` with `pLimit(3)` concurrency and `Promise.allSettled` isolation, store normalized items in Convex DB, and generate `feed.xml` (RSS 2.0) and `feed.html` (Schema.org JSON-LD) files uploaded to Cloudflare R2 via `@aws-sdk/client-s3`. A Cloudflare Worker serves those files publicly via native R2 binding with correct headers and caching. A Vite + React 18 + Tailwind CSS Admin UI on Cloudflare Pages provides real-time feed run monitoring via Convex reactive queries and manual trigger capabilities.

---

## Phase List

| # | Phase | One-Line Description | Complexity |
|---|-------|---------------------|------------|
| 1 | Project Scaffolding + Convex Schema + Seed Data | Initialize monorepo, define all Convex tables and indexes, seed 3 offices with representative sources | Medium |
| 2 | Feed Fetching Engine | Implement 4-scope source resolution, TTL filtering, rss-parser with YouTube custom fields, p-limit fan-out, and per-source error isolation | High |
| 3 | Feed Generation (RSS + HTML) | Generate RSS 2.0 XML and HTML+JSON-LD files from Convex items and write to R2 | Medium |
| 4 | Cloudflare Worker (Feed Serving) | Deploy a Worker that serves feed files from R2 with correct headers, CORS, and caching | Low |
| 5 | Admin UI | Build four-tab React admin with real-time feed run status, source management, and manual trigger | Medium |
| 6 | Automation, WebSub, Error Handling, Polish | Wire up cron schedules, retry logic, WebSub pinging, env validation, dedup hardening, and smoke tests | Medium |

---

## Critical Path

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 6
```

Phase 5 (Admin UI) can begin after Phase 1 and run in parallel with Phases 2–4. Phase 6 requires all prior phases.

The bottleneck is **Phase 2** — the feed fetching engine contains the most architectural complexity and is the dependency for everything downstream. Phase 2 must be solid before Phase 3 will have real data to generate files from.

---

## Top 3 Risk Areas

**1. `@aws-sdk/client-s3` v3.729.0 regression**
This version breaks PutObject against R2. Pinning to exactly `3.726.0` (no caret, no tilde) is mandatory from day one. Any upgrade must be tested against real R2 before deploying.

**2. Convex 10-minute action timeout with 96 feeds**
The full aggregation cycle (96 feeds × N sources) runs inside a 10-minute budget. The fan-out pattern (pLimit(5) per feed, pLimit(3) per source) keeps each tier small, but slow external feeds could accumulate. Individual feed timeouts appear as stuck `"running"` feed run records — a cleanup mechanism is needed in Phase 6.

**3. `"use node"` file isolation in Convex**
Files with `"use node"` cannot also export queries or mutations. Any accidental co-location of Node.js library imports (`rss-parser`, `p-limit`, `@aws-sdk/client-s3`) with Convex query/mutation exports will cause deployment failures. The three-file action structure (`fetchSource.ts`, `generateFeed.ts`, `aggregation.ts`) enforces this separation; pure utility libraries (`generateRss.ts`, `generateHtml.ts`, `generateJsonLd.ts`) must NOT use `"use node"`.

---

## Key Architectural Decisions Made

| Decision | Choice | Reason |
|----------|--------|--------|
| Scope resolution | Four separate indexed queries merged in JS | Convex does not support OR across index conditions; four small indexed queries + JS merge is idiomatic |
| Feed generation location | Convex action → R2 static files | Simpler than on-demand Worker generation; R2 files are cached and always available even if Convex is slow |
| R2 key structure | `feeds/{office-slug}/{service-slug}/feed.{ext}` | Human-readable, matches Worker URL pattern, namespaced under `feeds/` prefix |
| Concurrency | pLimit(5) fan-out + pLimit(3) per-source (separate instances) | Two-tier control prevents hammering external servers; separate instances prevent deadlock |
| YouTube duration | Omitted from prototype | Not in free Atom feed; VideoObject is still rich-result-eligible without it |
| Authority sources | Direct feedItems inserts via Admin UI, no RSS parsing | These are static reference items, not RSS feeds; no fetch pipeline needed |
| Admin UI auth | None for prototype | Convex auth added post-prototype |
| R2 access control | Worker-only (no public bucket access) | Worker handles all reads via native binding; no credentials in Worker |
| AWS SDK version | `@aws-sdk/client-s3` pinned to `3.726.0` | v3.729.0 regression breaks PutObject against R2 |
| Error isolation | Promise.allSettled at every tier | Source failures never abort feed generation; feed failures never abort the cycle |

---

## Complexity Ratings Per Phase

| Phase | Complexity | Primary Driver |
|-------|-----------|----------------|
| Phase 1 | Medium | Schema design with multi-table relationships and indexes; seed data spanning all scope types |
| Phase 2 | High | 4-scope query resolution, two-tier p-limit fan-out, TTL caching, per-source isolation, `"use node"` file structure |
| Phase 3 | Medium | Feed XML/HTML generation is well-understood; R2 writes are straightforward once client is set up |
| Phase 4 | Low | Worker is a thin serving layer with native R2 binding; minimal logic |
| Phase 5 | Medium | Standard React patterns; Convex reactive queries simplify real-time status significantly |
| Phase 6 | Medium | Mostly wiring together already-built pieces; retry logic and env validation are simple utilities |

---

## Output Files

| File | Description |
|------|-------------|
| `.prompts/002-rss-super-feed-plan/rss-super-feed-plan.md` | Full implementation plan with all 6 phases |
| `.prompts/002-rss-super-feed-plan/SUMMARY.md` | This file |
