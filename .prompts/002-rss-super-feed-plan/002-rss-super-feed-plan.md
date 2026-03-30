# Prompt 002 — RSS Super Feed Plan

<prompt_metadata>
<prompt_id>002-rss-super-feed-plan</prompt_id>
<prompt_type>plan</prompt_type>
<project>RSS Super Feed — AAAC Wildlife Removal</project>
<created>2026-03-19</created>
<chain_position>2 of 3</chain_position>
<previous_prompt>001-rss-super-feed-research</previous_prompt>
<next_prompt>003-rss-super-feed-do</next_prompt>
<research_input>@.prompts/001-rss-super-feed-research/rss-super-feed-research.md</research_input>
<output_directory>.prompts/002-rss-super-feed-plan/</output_directory>
</prompt_metadata>

<role>
You are a senior software architect creating a phased implementation roadmap for a greenfield full-stack project. Your job is to take research findings and produce a detailed, executable plan where each phase is a self-contained prompt that a coding agent can follow without ambiguity.
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

<instructions>

## Step 1: Read Research Findings

Read the research output at `.prompts/001-rss-super-feed-research/rss-super-feed-research.md` thoroughly. Pay special attention to:
- Gotchas and limitations discovered
- Code examples and patterns validated
- Open questions that need resolution
- Package recommendations

<efficiency>
Read the research file and SUMMARY.md in parallel.
</efficiency>

## Step 2: Resolve Open Questions

Review any open questions from the research phase. Make architectural decisions based on the research findings. Document your reasoning using extended thinking for complex trade-offs.

Consider these architectural decisions carefully:
- How should scope resolution work? (query pattern for global + service + office + office-service sources)
- Should feed generation be one big action or multiple smaller ones?
- How should the cron job orchestrate across ~96 feed combinations?
- What's the R2 key structure? (e.g., `feeds/{office-slug}/{service-slug}/feed.xml`)
- How should the admin UI communicate feed run status in real-time?

## Step 3: Create Phased Implementation Plan

Break the project into 6 phases (refine based on research findings). Each phase must be a self-contained unit that a coding agent can execute as a single prompt.

<phase_template>
For each phase, document:

### Phase N: [Name]

**Objective**: One sentence describing what this phase achieves.

**Dependencies**: Which prior phases must be complete.

**Tasks**:
1. [Specific task with enough detail to execute]
2. [Another task]
   - Sub-task detail if needed
   - File path: `convex/schema.ts`

**Files to Create/Modify**:
- `path/to/file.ts` — [what it contains]
- `path/to/other.ts` — [what it contains]

**Key Decisions**:
- [Decision made and why, referencing research findings]

**Code Patterns to Use**:
- [Reference specific patterns from research]

**Deliverables**:
- [ ] [Concrete, verifiable outcome]
- [ ] [Another outcome]

**Verification Steps**:
1. [How to verify this phase is complete]
2. [Another verification step]

**Estimated Complexity**: [Low / Medium / High]
</phase_template>

## Suggested Phase Breakdown

Use this as a starting point — refine based on research findings:

### Phase 1: Project Scaffolding + Convex Schema + Seed Data
- Initialize Vite + React + TypeScript project
- Set up Convex with schema for all tables
- Create seed data script
- Verify schema deploys and data populates

### Phase 2: Feed Fetching Engine
- Convex actions for fetching RSS/Atom feeds
- RSS parsing (YouTube Atom + generic RSS)
- Source resolution by scope (the 4-layer query)
- TTL caching check before fetch
- p-limit concurrency control
- Error isolation per source

### Phase 3: Feed Generation
- RSS 2.0 XML generation from aggregated items
- HTML page generation with Schema.org JSON-LD
- JSON-LD for VideoObject, DigitalDocument, Article
- Template system for feed.html

### Phase 4: Cloudflare Integration
- R2 upload from Convex actions
- Workers script for serving feeds
- R2 key structure and Content-Type mapping
- wrangler.toml configuration
- CORS headers if needed

### Phase 5: Admin UI
- React component structure
- Convex reactive queries for real-time data
- Dashboard tab (status grid, run controls)
- CRUD tabs (Offices, Services, Sources, Static Items)
- Feed Browser tab
- Tailwind CSS styling

### Phase 6: Automation & Polish
- Convex cron job for scheduled feed generation
- WebSub pinging after feed updates
- Error handling and retry logic
- Feed run logging and status tracking
- Edge cases and cleanup

## Step 4: Document Metadata

Include at the end of the plan:

**Plan Confidence**: [High / Medium / Low] with reasoning
**Critical Path**: Which phases are on the critical path
**Risk Areas**: Where things are most likely to go wrong
**Assumptions**: What assumptions are baked into this plan
**Open Questions**: Anything unresolved that may affect execution

</instructions>

<output_format>
Write the complete plan to: `.prompts/002-rss-super-feed-plan/rss-super-feed-plan.md`

Structure:

```markdown
# RSS Super Feed — Implementation Plan

## Plan Date: [date]
## Based On: Research from 001-rss-super-feed-research
## Scope: Working prototype

## Architecture Overview
[High-level architecture diagram in text/ASCII]
[Data flow description]

## Phase 1: [Name]
[Full phase detail per template]

## Phase 2: [Name]
[Full phase detail per template]

... (all 6 phases)

## Dependency Graph
[Which phases depend on which]

## Metadata
[Confidence, risks, assumptions, open questions]
```
</output_format>

<summary_requirement>
## SUMMARY.md

When the plan is complete, create `.prompts/002-rss-super-feed-plan/SUMMARY.md` with:

- One-paragraph overview of the plan
- Phase list with one-line descriptions
- Critical path identification
- Top 3 risk areas
- Key architectural decisions made
- Total estimated phases and their complexity ratings
- List of all output files created
</summary_requirement>

<success_criteria>
The plan is complete when:
1. All phases are documented with the full template (objective, tasks, files, deliverables, verification)
2. Each phase is self-contained enough to be a standalone prompt
3. Dependencies between phases are clear and correct
4. Research findings are incorporated (not ignored)
5. Gotchas from research are addressed in the relevant phases
6. File paths are specific (not vague)
7. Verification steps are concrete and testable
8. The plan is written to `.prompts/002-rss-super-feed-plan/rss-super-feed-plan.md`
9. SUMMARY.md is created
10. A coding agent could pick up any phase and execute it without asking clarifying questions
</success_criteria>

<quality_assurance>
Before marking the plan complete, verify:
- Does every phase have clear entry and exit criteria?
- Are there any circular dependencies between phases?
- Could phase 1 be executed right now with no prior work? (it should be yes)
- Are file paths consistent across phases (no conflicts)?
- Did you account for all tables in the schema, all UI tabs, all feed types?
- Is the scope realistic for a "working prototype"?
</quality_assurance>
