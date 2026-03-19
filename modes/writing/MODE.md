# MODE.md — Content Writing Workflow

> Load this file when the task involves writing articles, landing pages, social media content, or any client content.
> Then load the relevant `clients/[client]/CLIENT.md` for client-specific voice, format, and rules.

## Workflow

### Content Planning
- Always create an outline first and get approval before drafting
- Identify these before writing: target keyword, search intent, word count, tone, and deliverable format
- For batch content (e.g., same service across multiple locations), maintain variation so no two pieces feel like copies

### Verification Before Done
- Check the final draft against the brief
- Run through the banned words list (see below)
- Verify word count meets target (±50 words)
- Confirm all SEO elements: title tag, meta description, H-tag hierarchy, internal links
- Ask yourself: "Would this pass a senior editor's review?"

### Autonomous Revisions
- When given revision notes: just fix it. Don't ask for hand-holding
- If told "make it less AI-sounding" — rewrite with varied sentence structure, colloquial phrasing, and specific examples
- Apply revision patterns to ALL similar content in the batch, not just the flagged piece

## Global Banned Words/Phrases

Never use these unless the client brief explicitly allows them:
- "Whether"
- "Boost"
- "But" at the start of sentences
- "In the world of"
- "Explore"
- "Tapestry"
- "Pivotal"
- "Journey"
- "Narrative"
- "In the realm of"
- "Genuinely"
- "Straightforward"
- Em-dashes (—)

> **Note**: Individual CLIENT.md files can override this list. Some clients may allow em-dashes or have their own additions.

## Default Writing Style

These are fallback defaults. CLIENT.md always takes priority.

- **Paragraph length**: Max 3 sentences unless brief says otherwise
- **Structure**: Inverted Triangle — lead with value, follow with context and support
- **Sentence variety**: Mix short punchy sentences with longer informative ones
- **Readability**: Grade 8 or lower
- **Fluff tolerance**: Zero. Every sentence must earn its place
- **NLP-friendly**: Clear entities, logical structure, natural keyword placement
- **Transitions**: Use connectors between sections to maintain flow

## Default Tone

Override per client via CLIENT.md:
- Conversational and friendly
- Positive and inspiring
- Informative and factual
- Engaging and well-emphasized
- Specific over generic
- A bit disruptive, cheeky, or irreverent when fitting

## SEO Defaults

- **Title tag**: Under 60 characters, primary keyword front-loaded
- **Meta description**: Under 155 characters, includes primary keyword and CTA
- **H1**: One per page, contains primary keyword
- **H2s**: Supporting keywords, logically structured
- **Internal links**: Minimum 2-3 per article using keyword-rich anchor text
- **Schema**: Include when the client brief requires it (FAQ, Service, LocalBusiness)

## AI Detection Awareness

- Vary sentence structure and length naturally
- Use colloquial phrasing where appropriate
- Include specific examples, data points, and local details
- Avoid perfectly parallel sentence constructions
- Content should read like a human subject matter expert wrote it

## Client-Specific Config

Before starting any writing task, read both files for the relevant client:
```
modes/writing/clients/[client-name]/CLIENT.md
modes/writing/clients/[client-name]/lessons.md
```

`CLIENT.md` contains: brand voice, format rules, content types, templates, and any overrides to the defaults above.
`lessons.md` contains: corrections and rules specific to that client — load this to avoid repeating past mistakes.

Only load the files for the active client. Do not load other clients' lessons.

## New Client Setup

When onboarding a new client, copy both template files into a new folder under `clients/[client-name]/`:
- `clients/_template/CLIENT.md` — fill in brand, voice, format, and compliance details
- `clients/_template/lessons.md` — starts blank, grows as corrections come in

At minimum, capture in CLIENT.md:
1. Brand voice and tone
2. Content types they need
3. Any banned or required words/phrases
4. SEO requirements
5. Formatting preferences
6. Compliance rules (if any)
