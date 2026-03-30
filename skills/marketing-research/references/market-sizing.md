# Market Sizing Methodology

## TAM Calculation Methods

### Top-Down Approach

Start with total industry size, filter down.

**Formula:**
```
TAM = Total Industry Revenue × % Relevant to Your Category
```

**Example: Project Management SaaS**
1. Global enterprise software market: $783B (Gartner 2024)
2. Collaboration software segment: 8% = $62.6B
3. Project management subset: 15% of collaboration = $9.4B
4. TAM = $9.4B

**Pros:** Fast, uses established data
**Cons:** May overestimate, depends on report accuracy

### Bottom-Up Approach

Build from unit economics upward.

**Formula:**
```
TAM = # of Potential Customers × Average Revenue Per Customer
```

**Example: Project Management SaaS**
1. Total businesses globally: ~400M
2. Businesses needing PM tools (10+ employees): ~40M
3. Average spend on PM tools: $2,400/year
4. TAM = 40M × $2,400 = $96B

**Convergence check:** Top-down ($9.4B) vs Bottom-up ($96B) gap signals:
- Definition mismatch (TAM vs total spend)
- Segment boundaries different
- Need to refine assumptions

**Resolution:** Narrow bottom-up to "formal PM software" users (~10M), yielding $24B. Closer to top-down. Use midpoint or explain divergence.

## SAM Calculation

**Formula:**
```
SAM = TAM × Geographic Filter × Segment Filter × Product Fit Filter
```

**Example continuation:**
- TAM: $24B (global PM software)
- Geographic: US + Europe only = 45% = $10.8B
- Segment: SMB focus (exclude enterprise) = 60% = $6.5B
- Product fit: Cloud-native only = 80% = $5.2B
- SAM = $5.2B

## SOM Calculation

**Formula:**
```
SOM = SAM × Realistic Market Share
```

**Market share benchmarks:**
- New entrant Year 1: 0.1-0.5%
- Growth stage: 1-3%
- Established player: 5-15%
- Market leader: 20-40%

**Example:**
- SAM: $5.2B
- Target share (Year 3, growth stage): 1%
- SOM = $52M

## Growth Rate Sources

| Metric | Source | Update Frequency |
|--------|--------|------------------|
| CAGR by industry | Statista, IBISWorld | Annual |
| Tech growth rates | Gartner Magic Quadrants | Annual |
| GDP correlation | World Bank, IMF | Quarterly |
| Venture funding trends | PitchBook, Crunchbase | Real-time |

## Presentation Format

**For investors:**
```
TAM: $X billion [Source, Year]
├── Methodology: [Top-down/Bottom-up]
├── Growth: X% CAGR through 20XX

SAM: $X billion (XX% of TAM)
├── Filters applied: [List constraints]
├── Rationale: [Why these constraints]

SOM: $X million (X% of SAM by Year X)
├── Basis: [Competitive position, go-to-market]
├── Assumptions: [Key variables]
```

## Common Errors

1. **Mixing TAM definitions** - Revenue vs units vs users
2. **Ignoring addressability** - Not everyone is a viable customer
3. **Static snapshots** - Markets grow; include CAGR
4. **Single source reliance** - Cross-reference 2-3 sources
5. **Round number bias** - $10B TAM signals guessing
