---
name: marketing-research
description: Marketing research and competitive intelligence. Use for TAM/SAM/SOM, competitor analysis, SWOT, Porter's Five Forces, customer personas, market sizing, industry trends, or positioning research.
---

# Marketing Research

Execute structured marketing research using proven frameworks from McKinsey, BCG, and Bain methodologies.

## Shortcut Commands

```
/market [industry]     - Full market analysis with sizing
/competitor [company]  - Deep competitor profile
/tam [product/service] - TAM/SAM/SOM calculation
/swot [company/product]- SWOT analysis
/porter [industry]     - Porter's Five Forces
/persona [segment]     - Customer persona development
/trends [industry]     - Industry trend analysis
/position [product]    - Positioning map and analysis
/battlecard [competitor] - Sales battlecard generation
/quick                 - Fast mode, essential insights only
/deep                  - Comprehensive research mode
```

## Execution Framework

### Phase 1: Scope Definition

Before research, clarify:
1. What decision does this research inform?
2. Geographic scope (global, regional, local)
3. Time horizon (current state vs. projections)
4. Primary vs. secondary research needs

If unclear, ask one focused question. Do not proceed with ambiguous scope.

### Phase 2: Research Execution

Use web search aggressively. Marketing research requires current data. Search for:
- Industry reports (Statista, IBISWorld, Gartner, Forrester)
- Company filings (SEC, annual reports, investor presentations)
- News sources (trade publications, major business press)
- Expert analysis (analyst reports, research papers)

Tag source quality:
- `[PRIMARY]` - Company filings, official data
- `[ANALYST]` - Professional research firms
- `[NEWS]` - Journalistic sources
- `[ESTIMATE]` - Derived calculations

### Phase 3: Framework Application

Select framework(s) based on research question:

| Question Type | Primary Framework | Supporting |
|--------------|-------------------|------------|
| Market opportunity | TAM/SAM/SOM | Growth Share Matrix |
| Competitive position | Strategic Groups | Perceptual Map |
| Industry dynamics | Porter's Five Forces | PESTEL |
| Company assessment | SWOT | Value Chain |
| Customer understanding | Persona Development | Jobs-to-be-Done |
| Pricing decisions | Competitive Pricing | Value-Based Pricing |

### Phase 4: Synthesis and Recommendations

End every analysis with:
1. **Key Findings** - 3-5 bullet points, data-backed
2. **Implications** - What this means for the decision
3. **Confidence Level** - High/Medium/Low with reasoning
4. **Gaps** - What data would strengthen conclusions

## Core Frameworks

### TAM/SAM/SOM Market Sizing

```
TAM (Total Addressable Market)
├── Top-down: Industry reports → filter to category
└── Bottom-up: # customers × avg revenue per customer

SAM (Serviceable Addressable Market)
└── TAM filtered by: geography, segments you can serve, product fit

SOM (Serviceable Obtainable Market)
└── SAM × realistic market share (based on competitive position)
```

**Calculation checklist:**
- [ ] Define market boundaries precisely
- [ ] Use both top-down and bottom-up (they should converge)
- [ ] Cite data sources for each number
- [ ] Include growth rates (CAGR)
- [ ] State assumptions explicitly

### Competitor Analysis

**Tiering system:**
- Tier 1: Direct competitors (same product, same customer)
- Tier 2: Adjacent competitors (similar product, different segment)
- Tier 3: Emerging threats (new entrants, substitutes)

**Per-competitor profile:**
1. Company overview (size, funding, key facts)
2. Product/service comparison
3. Pricing and positioning
4. Go-to-market strategy
5. Strengths and weaknesses
6. Recent strategic moves

### Porter's Five Forces

Rate each force: **Strong / Moderate / Weak**

1. **Threat of New Entrants** - Barriers: capital, regulation, brand, scale
2. **Supplier Power** - Concentration, switching costs, differentiation
3. **Buyer Power** - Concentration, price sensitivity, switching costs
4. **Threat of Substitutes** - Availability, price-performance, switching costs
5. **Competitive Rivalry** - Number, diversity, growth, differentiation

Conclude with: Industry attractiveness rating and strategic implications.

### SWOT Analysis

| Internal | |
|----------|---|
| **Strengths** | What creates competitive advantage? |
| **Weaknesses** | What limits competitiveness? |

| External | |
|----------|---|
| **Opportunities** | What market changes favor growth? |
| **Threats** | What market changes create risk? |

**Quality standard:** Each item must be specific and evidence-based. "Good brand" is weak. "Brand recognition 3x competitor average per Brandwatch data" is strong.

### Customer Persona Development

**Persona structure:**
```
Name: [Representative name]
Role: [Job title / demographic]
Goals: [Primary objectives, 3 max]
Pain Points: [Key frustrations, 3 max]
Behaviors: [How they buy, research, decide]
Channels: [Where they consume information]
Objections: [Common concerns about your solution]
Quote: [Representative statement capturing mindset]
```

**Data sources for personas:**
- Customer interviews (primary)
- Support ticket analysis
- Review mining (G2, Capterra, Trustpilot)
- Social listening
- Survey data

## Output Standards

### For Executive Audiences
- Lead with insight, not methodology
- One page max for summary
- Data visualizations over tables
- Clear recommendations

### For Technical Audiences
- Include methodology details
- Show calculations
- Provide raw data access
- Document assumptions

### For Sales Teams (Battlecards)
- Comparison tables (us vs. them)
- Winning messages per competitor
- Objection handling scripts
- Pricing competitive positioning

## Quality Validation

Before finalizing, verify:

| Criterion | Check |
|-----------|-------|
| Data currency | Sources from past 12 months? |
| Source diversity | Multiple independent sources? |
| Calculation validity | Math checks out? Assumptions stated? |
| Actionability | Clear "so what"? |
| Competitor fairness | Acknowledges their strengths? |

## Common Pitfalls

1. **Vanity TAM** - Using largest possible number without realistic filtering
2. **Competitor blind spots** - Ignoring indirect competitors or emerging threats
3. **Stale data** - Markets change; verify recency
4. **Confirmation bias** - Seeking data that supports desired conclusion
5. **Analysis paralysis** - Researching indefinitely without synthesis

## References

For detailed methodology, see:
- `references/market-sizing.md` - TAM/SAM/SOM calculations with examples
- `references/competitor-templates.md` - Battlecard and profile templates
- `references/data-sources.md` - Where to find reliable market data
