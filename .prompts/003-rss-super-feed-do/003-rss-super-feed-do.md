# Prompt 003 — RSS Super Feed Do (Phase 1)

<prompt_metadata>
<prompt_id>003-rss-super-feed-do</prompt_id>
<prompt_type>do</prompt_type>
<project>RSS Super Feed — AAAC Wildlife Removal</project>
<created>2026-03-19</created>
<chain_position>3 of 3</chain_position>
<previous_prompt>002-rss-super-feed-plan</previous_prompt>
<phase>Phase 1 — Project Scaffolding + Convex Schema + Seed Data</phase>
<research_input>@.prompts/001-rss-super-feed-research/rss-super-feed-research.md</research_input>
<plan_input>@.prompts/002-rss-super-feed-plan/rss-super-feed-plan.md</plan_input>
<output_directory>Project root (code files)</output_directory>
</prompt_metadata>

<role>
You are a senior full-stack developer executing Phase 1 of the RSS Super Feed project. You are building the project foundation: scaffolding, database schema, and seed data. Follow the implementation plan precisely, referencing research findings for correct patterns and syntax.
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
- **Convex** — Database, reactive queries, scheduled functions, actions
- **Cloudflare R2** — Object storage for generated feeds
- **Cloudflare Workers** — Serves public feed endpoints
- **Cloudflare Pages** — Hosts React admin UI (Vite + React 18 + TypeScript + Tailwind CSS)
</context>

<instructions>

## Pre-Flight

1. Read the research findings at `.prompts/001-rss-super-feed-research/rss-super-feed-research.md`
2. Read the implementation plan at `.prompts/002-rss-super-feed-plan/rss-super-feed-plan.md`
3. Focus on Phase 1 tasks only — do NOT work ahead into Phase 2+

<efficiency>
Read both reference files in parallel. They are independent reads.
</efficiency>

## Task 1: Initialize Project

Create the Vite + React + TypeScript project and set up Convex.

<task_steps>
1. Run `npm create vite@latest . -- --template react-ts` (or equivalent for current directory)
2. Run `npm install`
3. Run `npx convex init` to initialize Convex in the project
4. Install additional dependencies:
   - `tailwindcss @tailwindcss/vite` (Tailwind CSS with Vite plugin)
   - `convex` (should already be there from init)
5. Configure Tailwind CSS:
   - Add the Tailwind Vite plugin to `vite.config.ts`
   - Add `@import "tailwindcss"` to `src/index.css`
6. Set up the Convex provider in `src/main.tsx`:
   - Import `ConvexProvider` and `ConvexReactClient`
   - Wrap the App component
7. Verify the dev server starts: `npm run dev`
</task_steps>

<expected_files>
- `package.json` — with all dependencies
- `vite.config.ts` — with Tailwind plugin
- `tsconfig.json` — TypeScript config
- `src/main.tsx` — with ConvexProvider
- `src/index.css` — with Tailwind import
- `convex/` — Convex directory (created by init)
</expected_files>

## Task 2: Define Convex Schema

Create the complete database schema in `convex/schema.ts`.

<schema_definition>

### Table: offices
| Field | Type | Notes |
|-------|------|-------|
| name | string | e.g., "Atlanta" |
| slug | string | e.g., "atlanta" (URL-safe) |
| city | string | |
| state | string | 2-letter code |
| active | boolean | |

Indexes: `by_slug` on `slug`, `by_active` on `active`

### Table: services
| Field | Type | Notes |
|-------|------|-------|
| name | string | e.g., "Wildlife Removal" |
| slug | string | e.g., "wildlife-removal" |
| description | string | |
| active | boolean | |

Indexes: `by_slug` on `slug`, `by_active` on `active`

### Table: sources
| Field | Type | Notes |
|-------|------|-------|
| url | string | Feed URL or document URL |
| title | string | Human-readable name |
| type | string | `"brand"` \| `"authority"` \| `"freshness"` |
| scope | string | `"global"` \| `"service"` \| `"office"` \| `"office-service"` |
| officeId | optional id("offices") | Required for office and office-service scope |
| serviceId | optional id("services") | Required for service and office-service scope |
| ttlMinutes | number | Cache TTL in minutes |
| active | boolean | |
| lastFetchedAt | optional number | Timestamp of last successful fetch |

Indexes: `by_scope` on `scope`, `by_type` on `type`, `by_active` on `active`, `by_office` on `officeId`, `by_service` on `serviceId`

### Table: static_items
| Field | Type | Notes |
|-------|------|-------|
| title | string | |
| url | string | Link to the resource |
| description | string | |
| type | string | `"brand"` \| `"authority"` \| `"freshness"` |
| sourceId | id("sources") | Parent source |
| publishedAt | number | Timestamp |

Indexes: `by_source` on `sourceId`, `by_type` on `type`

### Table: feed_runs
| Field | Type | Notes |
|-------|------|-------|
| officeId | id("offices") | |
| serviceId | id("services") | |
| status | string | `"running"` \| `"success"` \| `"error"` |
| itemCount | optional number | Total items in generated feed |
| error | optional string | Error message if failed |
| startedAt | number | Timestamp |
| completedAt | optional number | Timestamp |

Indexes: `by_office_service` on `[officeId, serviceId]`, `by_status` on `status`

### Table: settings
| Field | Type | Notes |
|-------|------|-------|
| key | string | Setting name |
| value | string | Setting value (JSON-encoded if complex) |

Indexes: `by_key` on `key`

</schema_definition>

<implementation_notes>
- Use `v.union(v.literal("brand"), v.literal("authority"), v.literal("freshness"))` for type enums
- Use `v.union(v.literal("global"), v.literal("service"), v.literal("office"), v.literal("office-service"))` for scope enums
- Use `v.optional()` for nullable fields
- Use `v.id("tableName")` for foreign key references
- Reference the research findings for exact Convex schema syntax
</implementation_notes>

## Task 3: Create Seed Data

Create a seed script at `convex/seed.ts` that populates the database with sample data.

<seed_data>

### Offices (create 5):
1. Atlanta, GA — slug: "atlanta"
2. Nashville, TN — slug: "nashville"
3. Dallas, TX — slug: "dallas"
4. Charlotte, NC — slug: "charlotte"
5. Indianapolis, IN — slug: "indianapolis"

### Services (create 4):
1. Wildlife Removal — slug: "wildlife-removal"
2. Raccoon Removal — slug: "raccoon-removal"
3. Squirrel Removal — slug: "squirrel-removal"
4. Bat Removal — slug: "bat-removal"

### Sources (create at least one per scope level):

**Global scope (brand):**
- AAAC Wildlife Removal YouTube channel
- URL: `https://www.youtube.com/feeds/videos.xml?channel_id=UCsT0YIqwnpJCM-mx7-gSA4Q` (use a real or plausible channel ID)
- TTL: 60 minutes

**Global scope (freshness):**
- National Wildlife Federation news
- URL: `https://www.nwf.org/feed` (or similar wildlife RSS feed)
- TTL: 120 minutes

**Service scope (authority) — for Wildlife Removal:**
- USDA Wildlife Services
- URL: `https://www.aphis.usda.gov/wildlife-damage` (example .gov URL)
- TTL: 1440 minutes (24 hours)

**Office scope (freshness) — for Atlanta:**
- Georgia DNR Wildlife news
- URL: `https://georgiawildlife.com/feed` (or similar)
- TTL: 120 minutes

**Office-service scope (brand) — for Atlanta + Wildlife Removal:**
- Atlanta AAAC YouTube channel
- URL: `https://www.youtube.com/feeds/videos.xml?channel_id=EXAMPLE_ATLANTA_ID`
- TTL: 60 minutes

### Static Items (create 2-3):
- A .edu PDF about wildlife management
- A .gov article about bat conservation
- Link them to the authority source

### Settings (create 2):
- `feedTitle`: "AAAC Wildlife Removal Super Feed"
- `defaultTtlMinutes`: "60"

</seed_data>

<seed_implementation>
The seed script should be a Convex mutation (or internalMutation) that:
1. Checks if data already exists (idempotent — don't double-seed)
2. Inserts offices first
3. Inserts services
4. Inserts sources (referencing office/service IDs)
5. Inserts static items (referencing source IDs)
6. Inserts settings
7. Logs what was created

Make it runnable via the Convex dashboard or `npx convex run seed:seed` (or whatever the correct invocation is based on research).
</seed_implementation>

## Task 4: Basic App Shell

Create a minimal App component that proves the Convex connection works.

<app_shell>
1. Update `src/App.tsx` to:
   - Query offices from Convex using `useQuery`
   - Display them in a simple list
   - Show a loading state
   - Include basic Tailwind styling
2. This is a smoke test — it just needs to prove the stack works end-to-end
</app_shell>

## Task 5: Verify Everything

<verification>
Run these checks and confirm each passes:

1. **Schema deploys**: `npx convex dev` starts without schema errors
2. **Seed runs**: Execute the seed script and verify data appears in Convex dashboard
3. **Dev server works**: `npm run dev` shows the React app
4. **Convex queries work**: The App shell displays offices from the database
5. **TypeScript compiles**: No TypeScript errors in the project
6. **Tailwind works**: Tailwind utility classes render correctly

If any check fails, debug and fix before proceeding.
</verification>

</instructions>

<error_handling>
If you encounter errors:
1. Read error messages carefully — Convex errors are usually descriptive
2. Check the research findings for known gotchas
3. Common issues:
   - Schema validation errors: check validator syntax
   - Convex init issues: make sure `convex/` directory exists with `_generated/`
   - Import paths: Convex uses `convex/_generated/api` for function references
4. Fix errors before moving on — do not leave broken code
</error_handling>

<output_files>
When complete, the project should have these files (at minimum):

```
package.json
vite.config.ts
tsconfig.json
tailwind.config.js (if needed, or configured via vite plugin)
src/
  main.tsx          — ConvexProvider wrapper
  App.tsx           — Basic app shell with office list
  index.css         — Tailwind imports
convex/
  _generated/       — Auto-generated by Convex
  schema.ts         — Complete schema (all 6 tables)
  seed.ts           — Seed data script
```
</output_files>

<summary_requirement>
## SUMMARY.md

When Phase 1 is complete, create `.prompts/003-rss-super-feed-do/SUMMARY.md` with:

- One-paragraph summary of what was built
- List of all files created with one-line descriptions
- Verification results (which checks passed/failed)
- Any deviations from the plan and why
- Issues encountered and how they were resolved
- Ready status for Phase 2 (yes/no with explanation)
- List of all output files created
</summary_requirement>

<success_criteria>
Phase 1 is complete when:
1. Project initializes and `npm run dev` works
2. Convex schema deploys with all 6 tables
3. Seed data populates correctly
4. App shell renders offices from Convex
5. TypeScript compiles without errors
6. Tailwind CSS renders correctly
7. SUMMARY.md is created
8. The project is ready for Phase 2 (feed fetching engine)
</success_criteria>

<quality_assurance>
Before marking Phase 1 complete:
- Is the schema exactly as specified? (all tables, all fields, all indexes)
- Is the seed script idempotent? (safe to run multiple times)
- Are all TypeScript types correct? (no `any` types)
- Does the Convex provider use the correct environment variable for the URL?
- Is the file structure clean and organized?
- Would a new developer understand the codebase at a glance?
</quality_assurance>
