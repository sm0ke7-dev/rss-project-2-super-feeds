import { escapeXml } from "./generateRss";
import { dispatchJsonLd, FeedPageItem } from "./generateJsonLd";

interface NapInfo {
  name: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  phone?: string;
  contactUrl?: string;
}

function stripHtml(text: string): string {
  return text.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

function renderItem(item: FeedPageItem): string {
  const dateStr = item.isoDate
    ? new Date(item.isoDate).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
    : "";
  const datetimeAttr = item.isoDate ? ` datetime="${escapeXml(item.isoDate)}"` : "";

  const thumbHtml = item.thumbnailUrl
    ? `
    <figure class="sf-item-thumb">
      <img src="${escapeXml(item.thumbnailUrl)}" alt="${escapeXml(item.title)}" loading="lazy" />
    </figure>`
    : "";

  // For videos, include a lazy-loaded YouTube iframe embed below the thumbnail
  const videoEmbedHtml = item.schemaType === "VideoObject" && item.videoId
    ? `
    <div class="sf-item-video">
      <iframe
        src="https://www.youtube.com/embed/${escapeXml(item.videoId)}"
        title="${escapeXml(item.title)}"
        loading="lazy"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowfullscreen
      ></iframe>
    </div>`
    : "";

  const badgeLabel = item.schemaType === "VideoObject" ? "Video" :
                     item.schemaType === "DigitalDocument" ? "Document" :
                     item.schemaType === "AudioObject" ? "Audio" : "Article";

  const rawBodyText = item.fullContent ?? item.description;
  const bodyText = rawBodyText ? stripHtml(rawBodyText) : undefined;
  let descHtml = "";
  if (bodyText) {
    const words = bodyText.split(/\s+/).filter(Boolean);
    if (words.length <= 50) {
      descHtml = `\n    <div class="sf-item-body">\n      ${escapeXml(bodyText)}\n    </div>`;
    } else {
      const truncated = words.slice(0, 50).join(" ") + "\u2026";
      descHtml = `
    <div class="sf-item-body">
      <span class="sf-excerpt-short">${escapeXml(truncated)}</span>
      <span class="sf-excerpt-full" hidden>${escapeXml(bodyText)}</span>
      <button class="sf-toggle-btn">Read more</button>
    </div>`;
    }
  }

  const metaHtml = dateStr
    ? `
    <p class="sf-item-meta">
      <time${datetimeAttr}>${escapeXml(dateStr)}</time>
    </p>`
    : "";

  return `
  <article class="sf-item">
    ${thumbHtml}
    ${videoEmbedHtml}
    <span class="sf-item-badge">${escapeXml(badgeLabel)}</span>${item.sourceName ? `<span class="sf-item-source">${escapeXml(item.sourceName)}</span>` : ""}
    <h2 class="sf-item-title"><a href="${escapeXml(item.link)}">${escapeXml(item.title)}</a></h2>
    ${metaHtml}
    ${descHtml}
  </article>`;
}

export function generateFeedHtml(
  _officeName: string,
  locationName: string,
  serviceName: string,
  officeSlug: string,
  locationSlug: string,
  serviceSlug: string,
  feedBaseUrl: string,
  featuredItems: FeedPageItem[],
  generalItems: FeedPageItem[],
  nap?: NapInfo,
  termsUrl?: string,
  privacyUrl?: string
): string {
  const feedXmlUrl = `${feedBaseUrl}/feeds/${officeSlug}/${locationSlug}/${serviceSlug}/feed.xml`;
  const pageTitle = `AAAC ${locationName} — ${serviceName} Super Feed`;
  const metaDescription = `Aggregated wildlife removal resources for ${locationName}, ${serviceName}.`;

  const allItems = [...featuredItems, ...generalItems];

  const jsonLdBlocks = allItems.map(item => {
    const ld = dispatchJsonLd(item);
    // JSON.stringify handles escaping — prevents </script> injection
    return `<script type="application/ld+json">\n${JSON.stringify(ld, null, 2)}\n</script>`;
  }).join("\n");

  // LocalBusiness JSON-LD — only emitted when we have at least address or phone
  let localBusinessLd = "";
  if (nap && (nap.address || nap.phone)) {
    const ld: Record<string, unknown> = {
      "@context": "https://schema.org",
      "@type": "LocalBusiness",
      name: nap.name,
    };
    if (nap.address) {
      ld.address = {
        "@type": "PostalAddress",
        streetAddress: nap.address,
        ...(nap.city ? { addressLocality: nap.city } : {}),
        ...(nap.state ? { addressRegion: nap.state } : {}),
        ...(nap.zip ? { postalCode: nap.zip } : {}),
        addressCountry: "US",
      };
    }
    if (nap.phone) {
      ld.telephone = nap.phone;
    }
    if (nap.contactUrl) {
      ld.url = nap.contactUrl;
    }
    localBusinessLd = `<script type="application/ld+json">\n${JSON.stringify(ld, null, 2)}\n</script>`;
  }

  // NAP block HTML
  let napHtml = "";
  if (nap) {
    const addressPart = nap.address
      ? ` — ${escapeXml(nap.address)}, ${escapeXml(nap.city ?? "")}, ${escapeXml(nap.state ?? "")} ${escapeXml(nap.zip ?? "")}`.trimEnd()
      : "";
    const phonePart = nap.phone
      ? ` · <a href="tel:${escapeXml(nap.phone)}">${escapeXml(nap.phone)}</a>`
      : "";
    napHtml = `
    <div class="sf-nap">
      <strong>${escapeXml(nap.name)}</strong>${addressPart}${phonePart}
    </div>`;
  }

  // Policy links HTML
  const policyLinks: string[] = [];
  if (termsUrl) policyLinks.push(`<a href="${escapeXml(termsUrl)}">Terms &amp; Conditions</a>`);
  if (privacyUrl) policyLinks.push(`<a href="${escapeXml(privacyUrl)}">Privacy Policy</a>`);
  if (nap?.contactUrl) policyLinks.push(`<a href="${escapeXml(nap.contactUrl)}">Contact Us</a>`);
  const policyLinksHtml = policyLinks.length > 0
    ? `
    <nav class="sf-policy-links">
      ${policyLinks.join("\n      ")}
    </nav>`
    : "";

  // Section 1: Featured (location-service scoped), capped at 5
  const featuredSectionHtml = featuredItems.length > 0
    ? `
    <h2 class="sf-section-heading">Featured Resources</h2>
    ${featuredItems.slice(0, 5).map(renderItem).join("\n")}`
    : "";

  // Section 2: More Resources (all other items)
  const generalSectionHtml = `
    <h2 class="sf-section-heading">More Resources</h2>
    ${generalItems.slice(0, 20).map(renderItem).join("\n")}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="robots" content="noindex" />
  <title>${escapeXml(pageTitle)}</title>
  <meta name="description" content="${escapeXml(metaDescription)}" />
  <link rel="alternate" type="application/rss+xml" title="${escapeXml(pageTitle)}" href="${escapeXml(feedXmlUrl)}" />
  ${localBusinessLd}
  ${jsonLdBlocks}
  <style>
    :root {
      --sf-font: system-ui, -apple-system, sans-serif;
      --sf-max-width: 800px;
      --sf-text-color: #1a1a1a;
      --sf-link-color: #1a0dab;
      --sf-meta-color: #666;
      --sf-border-color: #e5e7eb;
      --sf-badge-bg: #f3f4f6;
      --sf-badge-text: #374151;
    }

    .sf-feed {
      font-family: var(--sf-font);
      max-width: var(--sf-max-width);
      margin: 0 auto;
      padding: 24px 16px;
      color: var(--sf-text-color);
      background: #fff;
    }

    .sf-feed-header {
      margin-bottom: 24px;
    }

    .sf-feed-header h1 {
      font-size: 22px;
      color: var(--sf-text-color);
      margin: 0 0 4px;
    }

    .sf-feed-header p {
      font-size: 14px;
      color: var(--sf-meta-color);
      margin: 0;
    }

    .sf-feed-header a {
      color: var(--sf-link-color);
    }

    .sf-section-heading {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--sf-meta-color);
      margin: 24px 0 12px;
      padding-bottom: 6px;
      border-bottom: 1px solid var(--sf-border-color);
    }

    .sf-item {
      border: 1px solid var(--sf-border-color);
      border-radius: 6px;
      padding: 16px;
      margin-bottom: 16px;
    }

    .sf-item-thumb {
      margin: 0 0 12px;
      padding: 0;
    }

    .sf-item-thumb img {
      max-width: 100%;
      height: auto;
      display: block;
      border-radius: 4px;
    }

    .sf-item-video {
      margin-bottom: 12px;
      position: relative;
      padding-bottom: 56.25%;
      height: 0;
      overflow: hidden;
      border-radius: 4px;
    }

    .sf-item-video iframe {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      border: 0;
    }

    .sf-item-badge {
      display: inline-block;
      background: var(--sf-badge-bg);
      color: var(--sf-badge-text);
      font-size: 11px;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 12px;
      margin-bottom: 8px;
    }

    .sf-item-source {
      font-size: 0.7rem;
      color: #888;
      margin-left: 0.5rem;
      font-style: italic;
    }

    .sf-item-title {
      font-size: 16px;
      margin: 0 0 4px;
      font-weight: 600;
    }

    .sf-item-title a {
      color: var(--sf-link-color);
      text-decoration: none;
    }

    .sf-item-title a:hover {
      text-decoration: underline;
    }

    .sf-item-meta {
      margin: 0 0 8px;
      font-size: 12px;
      color: var(--sf-meta-color);
    }

    .sf-item-body {
      font-size: 14px;
      line-height: 1.6;
      color: var(--sf-text-color);
      margin-top: 8px;
    }

    .sf-excerpt-full[hidden] { display: none; }

    .sf-toggle-btn {
      background: none;
      border: none;
      color: var(--sf-link-color);
      cursor: pointer;
      font-size: 13px;
      padding: 0;
      margin-top: 4px;
      display: block;
    }

    .sf-toggle-btn:hover {
      text-decoration: underline;
    }

    .sf-nap {
      font-size: 13px;
      color: var(--sf-meta-color);
      margin-bottom: 8px;
    }

    .sf-nap a {
      color: var(--sf-link-color);
      text-decoration: none;
    }

    .sf-nap a:hover {
      text-decoration: underline;
    }

    .sf-policy-links {
      font-size: 12px;
      color: var(--sf-meta-color);
      margin-bottom: 20px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--sf-border-color);
    }

    .sf-policy-links a {
      color: var(--sf-link-color);
      text-decoration: none;
      margin-right: 12px;
    }

    .sf-policy-links a:hover {
      text-decoration: underline;
    }

    @media (max-width: 600px) {
      .sf-feed {
        padding: 16px 12px;
      }

      .sf-item {
        padding: 12px;
      }

      .sf-item-title {
        font-size: 15px;
      }
    }
  </style>
</head>
<body>
  <section class="sf-feed" aria-label="${escapeXml(pageTitle)}">
    <header class="sf-feed-header">
      <h1>${escapeXml(pageTitle)}</h1>
      <p>
        <a href="${escapeXml(feedXmlUrl)}">RSS Feed</a> · ${escapeXml(String(allItems.length))} items
      </p>
    </header>
    ${napHtml}
    ${policyLinksHtml}
    ${featuredSectionHtml}
    ${generalSectionHtml}
  </section>
  <script>
    document.querySelector('.sf-feed').addEventListener('click', function(e) {
      var btn = e.target.closest('.sf-toggle-btn');
      if (!btn) return;
      var body = btn.closest('.sf-item-body');
      if (!body) return;
      var short = body.querySelector('.sf-excerpt-short');
      var full = body.querySelector('.sf-excerpt-full');
      if (!short || !full) return;
      var isExpanded = !full.hidden;
      short.hidden = !isExpanded;
      full.hidden = isExpanded;
      btn.textContent = isExpanded ? 'Read more' : 'Show less';
    });
  </script>
</body>
</html>`;
}
