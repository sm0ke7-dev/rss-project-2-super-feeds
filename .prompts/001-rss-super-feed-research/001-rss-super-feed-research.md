# Prompt 001 — RSS Super Feed Research

<prompt_metadata>
<prompt_id>001-rss-super-feed-research</prompt_id>
<prompt_type>research</prompt_type>
<project>RSS Super Feed — AAAC Wildlife Removal</project>
<created>2026-03-19</created>
<chain_position>1 of 3</chain_position>
<next_prompt>002-rss-super-feed-plan</next_prompt>
<output_directory>.prompts/001-rss-super-feed-research/</output_directory>
</prompt_metadata>

<session_initialization>
Before beginning any work, verify the current date. If today is NOT 2026-03-19 or later, STOP and inform the user that this prompt was designed for a specific date context.

Read the project's `CLAUDE.md` for global rules and the task management workflow. Follow those rules throughout this session.
</session_initialization>

<role>
You are a senior technical researcher preparing foundational research for a greenfield full-stack project. Your job is to investigate every technology in the stack, gather working code patterns, identify pitfalls, and produce a research document that a planning agent can use to create a detailed implementation roadmap.
</role>

<context>
## Project Overview

Build a multi-office, multi-service RSS aggregation system for AAAC Wildlife Removal (~24 franchise offices, 4 services each: Wildlife Removal, Raccoon Removal, Squirrel Removal, Bat Removal).

Each office x service combination produces a "Super Feed" aggregating 3 source types:
- **Brand** — YouTube channel RSS feeds (free Atom endpoint at `https://www.youtube.com/feeds/videos.xml?channel_id=CHANNEL_ID`)
- **Authority** — .edu/.gov PDF/article URLs treated as static items
- **Freshness** — Third-party RSS feeds (wildlife orgs, conservation news)

Sources use a 4-scope layering system:
- **global** — applies to all offices + all services
- **service** — one service + all offices
- **office** — one office + all services
- **office-service** — one specific office x service combo

Two outputs per feed:
- `feed.xml` — RSS 2.0 for feed readers and embedding
- `feed.html` — Embeddable HTML page with Schema.org JSON-LD (VideoObject, DigitalDocument, Article)

## Tech Stack
- **Convex** — Database (offices, services, sources, static items, feed runs, settings), reactive queries for admin UI, scheduled functions (cron), actions (HTTP fetching/aggregation)
- **Cloudflare R2** — Object storage for generated feed.xml and feed.html files
- **Cloudflare Workers** — Serves public feed endpoints: `/{office-slug}/{service-slug}/feed.xml|html`
- **Cloudflare Pages** — Hosts the React admin UI (Vite + React 18 + TypeScript + Tailwind CSS)

## Admin UI Tabs
Dashboard (status grid + run controls), Offices, Services, Sources, Static Items, Feed Browser

## Key Behaviors
Source TTL caching, per-feed error isolation, p-limit(3) concurrency, WebSub pinging, Convex scheduled cron runs

## Scope
Working prototype (functional but rough edges acceptable). Greenfield start.
</context>

<efficiency>
You have access to WebFetch and WebSearch tools. Use them aggressively and in parallel wherever possible. When you need to research multiple independent topics, fire off multiple tool calls simultaneously rather than sequentially. Time is valuable — maximize parallel research.
</efficiency>

<research_areas>

## Area 1: Convex Backend Patterns

Research the following Convex patterns and gather working code examples for each:

<research_tasks>
- Schema design using `defineTable`, validators (`v.string()`, `v.optional()`, `v.union()`, `v.literal()`), and indexes
- Difference between actions, mutations, and queries — when to use each
- HTTP actions for external API calls (fetching RSS feeds from within Convex)
- Scheduled functions and cron jobs (syntax, limitations, error handling)
- Error handling patterns in Convex (try/catch in actions, error propagation)
- Environment variables in Convex (how to store R2 credentials, API keys)
- Pagination patterns for large result sets
- File/module organization best practices
</research_tasks>

<sources_to_fetch>
- WebFetch: https://docs.convex.dev/database/schemas
- WebFetch: https://docs.convex.dev/functions/actions
- WebFetch: https://docs.convex.dev/functions/mutation-functions
- WebFetch: https://docs.convex.dev/functions/query-functions
- WebFetch: https://docs.convex.dev/scheduling/cron-jobs
- WebFetch: https://docs.convex.dev/scheduling/scheduled-functions
- WebFetch: https://docs.convex.dev/production/environment-variables
- WebFetch: https://docs.convex.dev/functions/http
</sources_to_fetch>

<search_queries>
- "convex defineTable schema example typescript"
- "convex action fetch external api example"
- "convex cron job scheduled function"
- "convex http actions external fetch"
</search_queries>

<code_examples_needed>
- Complete schema definition with multiple tables, indexes, and validators
- Action that fetches an external URL and stores results via mutation
- Cron job definition and handler
- HTTP action example
- Pagination query example
</code_examples_needed>

<verification_checklist>
- [ ] Can define tables with typed fields and indexes
- [ ] Understand action vs mutation vs query boundaries
- [ ] Know how to make HTTP requests from Convex actions
- [ ] Know cron syntax and scheduling limitations
- [ ] Know how to set and access environment variables
- [ ] Have working pagination pattern
</verification_checklist>

## Area 2: Cloudflare Integration

<research_tasks>
- R2 S3-compatible API: PutObject from Node.js (using aws-sdk or @aws-sdk/client-s3)
- R2 bucket creation and access credentials (Access Key ID, Secret Access Key)
- Workers routing: URL pattern matching, R2 binding, serving files with correct Content-Type
- Pages deployment for Vite + React apps
- Correct Content-Type headers for XML (`application/rss+xml`) and HTML (`text/html`)
- CORS headers if needed for feed embedding
</research_tasks>

<sources_to_fetch>
- WebFetch: https://developers.cloudflare.com/r2/api/s3/
- WebFetch: https://developers.cloudflare.com/r2/examples/aws-sdk-js-v3/
- WebFetch: https://developers.cloudflare.com/workers/runtime-apis/bindings/r2/
- WebFetch: https://developers.cloudflare.com/pages/framework-guides/deploy-a-vite3-project/
</sources_to_fetch>

<search_queries>
- "cloudflare r2 upload file nodejs aws-sdk v3"
- "cloudflare workers serve r2 object content-type"
- "cloudflare pages vite react typescript deploy"
- "cloudflare r2 put object from external server"
</search_queries>

<code_examples_needed>
- R2 PutObject using @aws-sdk/client-s3 with Cloudflare R2 endpoint
- Workers script that serves R2 objects based on URL path
- wrangler.toml configuration for R2 binding
- Pages build configuration for Vite
</code_examples_needed>

<verification_checklist>
- [ ] Know how to upload to R2 from Convex actions (S3-compatible API)
- [ ] Know Workers routing pattern for `/{office}/{service}/feed.xml|html`
- [ ] Know correct Content-Type for RSS XML and HTML
- [ ] Know Pages deployment process for Vite React
- [ ] Understand R2 binding in Workers vs S3 API access from external
</verification_checklist>

## Area 3: RSS/Atom Feed Handling

<research_tasks>
- RSS parsing libraries: `rss-parser` (npm), `fast-xml-parser` — capabilities, bundle size, Convex compatibility
- YouTube Atom feed structure: what fields are available, namespaces (`yt:`, `media:`), example response
- RSS 2.0 XML generation: structure, required elements, optional elements, CDATA for HTML content
- WebSub (formerly PubSubHubbub): hub ping mechanism, when to ping, endpoints
- Feed validation: common pitfalls, encoding issues
</research_tasks>

<sources_to_fetch>
- WebFetch: https://www.youtube.com/feeds/videos.xml?channel_id=UCsT0YIqwnpJCM-mx7-gSA4Q (sample YouTube feed to examine structure)
- WebFetch: https://www.rssboard.org/rss-specification
- WebFetch: https://www.npmjs.com/package/rss-parser
- WebFetch: https://www.npmjs.com/package/fast-xml-parser
</sources_to_fetch>

<search_queries>
- "youtube rss atom feed structure xml namespaces"
- "rss 2.0 xml generation nodejs"
- "websub pubsubhubbub ping notification"
- "rss-parser vs fast-xml-parser nodejs"
- "generate rss xml nodejs template literal"
</search_queries>

<code_examples_needed>
- Parsing a YouTube Atom feed with rss-parser
- Parsing RSS with fast-xml-parser
- Generating RSS 2.0 XML (template literal or builder approach)
- WebSub ping HTTP request
</code_examples_needed>

<verification_checklist>
- [ ] Know which parsing library works in Convex runtime (Node.js action environment)
- [ ] Understand YouTube Atom feed fields and namespaces
- [ ] Have RSS 2.0 XML template/generation pattern
- [ ] Know WebSub ping mechanics
- [ ] Understand feed encoding and CDATA requirements
</verification_checklist>

## Area 4: Schema.org Structured Data

<research_tasks>
- JSON-LD format for VideoObject (YouTube videos)
- JSON-LD format for DigitalDocument (.edu/.gov PDFs)
- JSON-LD format for Article (news/blog items)
- Embedding JSON-LD in HTML pages
- Google requirements for structured data (required vs recommended fields)
- Multiple JSON-LD blocks on one page
</research_tasks>

<sources_to_fetch>
- WebFetch: https://schema.org/VideoObject
- WebFetch: https://schema.org/DigitalDocument
- WebFetch: https://schema.org/Article
- WebFetch: https://developers.google.com/search/docs/appearance/structured-data/video
</sources_to_fetch>

<search_queries>
- "schema.org json-ld VideoObject example"
- "schema.org json-ld DigitalDocument example"
- "schema.org json-ld Article example"
- "multiple json-ld blocks single html page"
</search_queries>

<code_examples_needed>
- JSON-LD block for VideoObject with YouTube data
- JSON-LD block for DigitalDocument
- JSON-LD block for Article
- HTML page template with embedded JSON-LD
</code_examples_needed>

<verification_checklist>
- [ ] Have correct JSON-LD structure for all 3 types
- [ ] Know required vs optional fields for Google
- [ ] Know how to embed multiple JSON-LD blocks in one HTML page
- [ ] Have HTML template pattern for feed.html
</verification_checklist>

## Area 5: Concurrency & Error Handling

<research_tasks>
- `p-limit` library: usage pattern, Convex compatibility
- Per-feed error isolation: how to catch errors for one feed without killing the batch
- TTL caching pattern: storing last-fetch timestamp, skip if within TTL
- Retry strategies: exponential backoff, max retries, dead letter patterns
- Convex action timeouts and limits
</research_tasks>

<sources_to_fetch>
- WebFetch: https://www.npmjs.com/package/p-limit
- WebFetch: https://docs.convex.dev/functions/actions (check timeout/limits section)
</sources_to_fetch>

<search_queries>
- "p-limit concurrency control nodejs example"
- "convex action timeout limits"
- "error isolation pattern promise.allSettled"
- "ttl cache pattern typescript"
</search_queries>

<code_examples_needed>
- p-limit usage with Promise.allSettled for error isolation
- TTL check pattern (compare timestamps)
- Retry wrapper with exponential backoff
</code_examples_needed>

<verification_checklist>
- [ ] Know p-limit API and Convex compatibility
- [ ] Have error isolation pattern (one feed failure doesn't kill others)
- [ ] Have TTL caching pattern
- [ ] Know Convex action timeout limits
- [ ] Have retry strategy pattern
</verification_checklist>

</research_areas>

<incremental_output>
## Writing Research Findings

Do NOT wait until the end to write everything. Write findings incrementally as you discover them:

1. **Create the output file immediately**: Create `.prompts/001-rss-super-feed-research/rss-super-feed-research.md` with a skeleton structure (all 5 areas as headers)
2. **Fill in each area as you complete it**: After researching each area, update the file with findings, code examples, and checklist status
3. **Use clear section headers** so the planning agent can find information quickly
4. **Include code blocks** with language tags for all examples
5. **Note any surprises, limitations, or gotchas** prominently — these are critical for planning

The output file should be structured as:

```markdown
# RSS Super Feed — Research Findings

## Research Date: [date]
## Status: [in-progress | complete]

## Area 1: Convex Backend Patterns
### Key Findings
### Code Examples
### Gotchas & Limitations
### Checklist Status

## Area 2: Cloudflare Integration
[same structure]

## Area 3: RSS/Atom Feed Handling
[same structure]

## Area 4: Schema.org Structured Data
[same structure]

## Area 5: Concurrency & Error Handling
[same structure]

## Cross-Cutting Concerns
[anything that spans multiple areas]

## Open Questions
[unresolved items for the planning phase]

## Recommended Packages
[final list of npm packages with versions and justifications]
```
</incremental_output>

<summary_requirement>
## SUMMARY.md

When research is complete, create `.prompts/001-rss-super-feed-research/SUMMARY.md` with:

- One-paragraph overview of research completeness
- Key findings per area (2-3 bullets each)
- Critical gotchas or blockers discovered
- Confidence level (high/medium/low) for each area
- Recommended next steps for the planning phase
- List of all output files created
</summary_requirement>

<success_criteria>
Research is complete when:
1. All 5 research areas have findings documented with code examples
2. All verification checklists are filled out (checked or noted as unresolved)
3. The research document is written to `.prompts/001-rss-super-feed-research/rss-super-feed-research.md`
4. SUMMARY.md is created
5. No critical blockers remain unresolved (or they are clearly flagged as open questions)
6. Code examples are verified as syntactically correct (not just copied blindly)
7. Package recommendations include version numbers
</success_criteria>

<quality_assurance>
Before marking research complete, verify:
- Are there any areas where documentation was outdated or contradictory? Flag them.
- Did you find Convex-specific limitations that affect the architecture? Document them.
- Are all code examples compatible with each other (same import styles, same patterns)?
- Would a planning agent have enough information to create file-level implementation tasks?
- Are there any "unknown unknowns" you should flag?
</quality_assurance>
