# Custom Domain Plan for Feed URLs

Status: Pending boss approval — drafted 2026-03-26.

---

## Current State

Feed URLs currently use the Convex deployment subdomain:
```
https://judicious-robin-411.convex.site/feeds/tx-gulf-coast/baytown/bat-removal/feed.html
```

## Goal

Replace with a branded domain, e.g.:
```
https://feeds.aaacwildliferemoval.com/feeds/tx-gulf-coast/baytown/bat-removal/feed.html
```

## Recommended Approach: Cloudflare Worker Proxy (Free)

A lightweight Cloudflare Worker (~10 lines) that proxies all `/feeds/...` requests
to the Convex deployment. No Convex plan upgrade needed.

**Alternative:** Convex native custom domain — simpler setup but requires Convex Pro (~$25/month).

---

## Steps

### One-time manual steps (browser, ~10 min + DNS wait)
1. Add `aaacwildliferemoval.com` to Cloudflare account (if not already there)
2. Update nameservers at domain registrar to Cloudflare's nameservers
3. Wait for DNS propagation (2–24 hours)

### Terminal steps (Claude handles these, ~10 min)
1. Write and deploy Cloudflare Worker script
2. Add DNS route: `feeds.aaacwildliferemoval.com → Worker`
3. Update `FEED_BASE_URL` env var in Convex to `https://feeds.aaacwildliferemoval.com`
4. Trigger full feed refresh to regenerate all feed files with new URLs

---

## Cost

- Cloudflare Worker: **Free** (100,000 requests/day on free plan)
- Domain: already owned
- Convex: no plan change needed

---

## Notes

- Confirm exact subdomain with boss (e.g. `feeds.` vs `rss.` vs `content.`)
- Confirm domain registrar so nameserver update can be planned
- DNS propagation is the only waiting period — everything else is fast
