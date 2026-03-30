---
name: seo-meta-writer
description: >
  Generates SEO-optimized title tags and meta descriptions that fit Yoast/Rank Math character and pixel limits. Use this skill whenever the user asks for SEO titles, meta descriptions, title tags, SERP snippets, or any metadata for web pages. Also trigger when the user mentions Yoast, Rank Math, SERP optimization, or asks to write/rewrite page titles and descriptions for search engines. Handles bulk generation for multiple pages/keywords.
---

# SEO Meta Writer

Generate high-performing SEO title tags and meta descriptions that pass Yoast SEO and Rank Math validation, include target keywords, optional location terms, and compelling hooks.

---

## Character & Pixel Limits (Critical)

These limits ensure titles and descriptions display fully in Google SERPs without truncation.

### Title Tag
- **Hard character limit:** 50–60 characters (Google truncates around 600px / ~60 chars)
- **Sweet spot:** 55–60 characters (maximize real estate without truncation)
- **Yoast green light:** ≤ 60 characters
- **Rank Math green:** ≤ 60 characters

### Meta Description
- **Hard character limit:** 140–160 characters (Google truncates around 920px / ~160 chars)
- **Sweet spot:** 150–160 characters (maximize real estate without truncation)
- **Yoast green light:** 120–156 characters
- **Rank Math green:** ≤ 160 characters
- **Target for universal safety:** 120–155 characters (green on both Yoast AND Rank Math)

---

## Required Inputs

Before generating, collect or confirm these from the user:

| Input | Required? | Notes |
|---|---|---|
| Target keyword | ✅ Yes | Primary keyword to rank for |
| Page type | ✅ Yes | Blog post, service page, landing page, product page, homepage, category page |
| Location term | ⚠️ If local SEO | City, state, region — for local/service-area pages |
| Brand name | ⚠️ Optional | Appended to title with ` \| Brand` or ` - Brand` separator |
| Tone/angle | ⚠️ Optional | Urgency, trust, curiosity, benefit-driven, etc. |
| Secondary keywords | ⚠️ Optional | LSI/supporting terms to weave into the meta description |

If the user hasn't specified these, ask before generating. If they've provided enough context to infer, proceed and note your assumptions.

---

## Title Tag Formula

Use one of these proven structures. Always front-load the target keyword.

### Structures (pick the best fit):

1. **Keyword + Benefit:**  
   `{Keyword}: {Benefit or Hook}` → "Raccoon Removal Dallas: Same-Day Service Guaranteed"

2. **Keyword + Year/Freshness:**  
   `{Keyword} ({Year}) - {Qualifier}` → "Best Pest Control Phoenix (2025) - Licensed & Insured"

3. **How-To / Guide:**  
   `How to {Keyword}: {Promise}` → "How to Remove Squirrels From Attic: Safe DIY Methods"

4. **Listicle:**  
   `{Number} {Keyword} {Promise}` → "7 Wildlife Removal Tips That Actually Work"

5. **Location-First (Local SEO):**  
   `{Location} {Keyword} \| {Brand}` → "Dallas Wildlife Removal \| Critter Control Pro"

### Title Tag Rules:
- [ ] Target keyword appears in the **first half** of the title
- [ ] 50–60 characters total (including spaces and separators)
- [ ] Location term included if local SEO page
- [ ] Contains a hook element (benefit, number, urgency, curiosity, trust signal)
- [ ] Brand name at the end with ` \| ` or ` - ` separator (if included, budget ~8-15 chars for it)
- [ ] No keyword stuffing — reads naturally
- [ ] Title case (capitalize major words)

---

## Meta Description Formula

### Structure:
```
[Hook / Pain point / Question] + [Value proposition with target keyword] + [CTA or trust signal].
```

### Templates by Page Type:

**Service Page (Local):**
```
Need {keyword} in {location}? {Value prop}. {Trust signal}. {CTA}.
```
→ "Need wildlife removal in Dallas? Our licensed team removes raccoons, squirrels & bats safely. 5-star rated. Call for a free quote today." (149 chars ✅)

**Blog Post:**
```
{Question or hook}. Learn {keyword} {benefit}. {Content promise}.
```
→ "Hearing scratching in your attic? Learn how to identify and remove wildlife safely. Step-by-step guide with expert tips for homeowners." (138 chars ✅)

**Product Page:**
```
{Product keyword} — {key benefit}. {Differentiator}. {CTA}.
```
→ "Organic Whey Protein Powder — 25g protein per scoop with zero artificial sweeteners. Lab-tested purity. Shop now with free shipping." (134 chars ✅)

**Landing Page:**
```
{Urgency or benefit hook}. {Keyword + offer}. {CTA}.
```
→ "Limited time: Get 50% off professional pest control in Phoenix. Licensed, insured & guaranteed results. Book your free inspection now." (136 chars ✅)

### Meta Description Rules:
- [ ] Target keyword appears naturally (ideally in first half)
- [ ] 120–155 characters (safe zone for both Yoast and Rank Math green)
- [ ] Location term included if local SEO
- [ ] Contains at least ONE hook type (see Hook Toolkit below)
- [ ] Ends with a CTA or compelling close
- [ ] Active voice, no passive constructions
- [ ] No quotation marks (Google may strip them)
- [ ] No duplicate content from other page metas

---

## Hook Toolkit

Every title and description needs at least one hook element. Mix and match:

| Hook Type | Title Example | Description Example |
|---|---|---|
| **Urgency** | "... Before It's Too Late" | "Don't wait — {problem} gets worse fast." |
| **Benefit** | "... That Saves You $1000s" | "Save time and money with ..." |
| **Curiosity** | "... (Most People Get This Wrong)" | "The #1 mistake homeowners make with ..." |
| **Trust** | "... \| Licensed & Insured" | "Trusted by 10,000+ customers since 2005." |
| **Specificity** | "... in 24 Hours or Less" | "Same-day service with a 100% satisfaction guarantee." |
| **Question** | "Is Your Attic Infested?" | "Wondering if you have wildlife in your attic?" |
| **Number** | "5 Proven Ways to ..." | "Our 3-step process eliminates ..." |
| **Freshness** | "... (2025 Guide)" | "Updated for 2025 with the latest ..." |

---

## Output Format

For each page, output in this format:

```
PAGE: {Page name or URL slug}
TARGET KEYWORD: {keyword}
LOCATION: {location or "N/A"}

TITLE TAG:
{title}
→ {X} characters

META DESCRIPTION:
{description}
→ {X} characters

CHECKLIST:
✅/❌ Keyword in first half of title
✅/❌ Title 50-60 chars
✅/❌ Description 120-155 chars
✅/❌ Location included (if applicable)
✅/❌ Hook element present
✅/❌ CTA in description
✅/❌ Yoast green (title ≤60, desc 120-156)
✅/❌ Rank Math green (title ≤60, desc ≤160)
```

If the user requests multiple pages, generate in bulk using the same format, separated by `---`.

---

## Generating Alternatives

Always provide **2-3 variations** per page unless the user asks for just one. Label them:

- **Option A** — (e.g., benefit-driven)
- **Option B** — (e.g., urgency/curiosity-driven)
- **Option C** — (e.g., trust/authority-driven)

This gives the user strategic choices rather than just rewording.

---

## Common Mistakes to Avoid

1. **Over-length titles** — Count characters precisely, including spaces and separators
2. **Keyword at the end** — Front-load it; Google may truncate the rest
3. **Generic descriptions** — "We offer great service" says nothing. Be specific.
4. **Missing CTA** — Every description should tell the reader what to do next
5. **Duplicate metas** — Each page needs unique title + description
6. **Quotation marks in descriptions** — Google strips them, breaking your snippet
7. **ALL CAPS or excessive punctuation** — Looks spammy, may be rewritten by Google

---

## Workflow

1. Collect inputs (keyword, page type, location, brand, tone)
2. Generate 2-3 title tag options with character counts
3. Generate 2-3 meta description options with character counts
4. Run the checklist on each
5. Present results in the output format above
6. Ask if the user wants refinements or bulk generation for more pages
