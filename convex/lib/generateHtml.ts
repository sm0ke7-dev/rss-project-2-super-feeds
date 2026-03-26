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

export function generateFeedHtml(
  _officeName: string,
  locationName: string,
  serviceName: string,
  officeSlug: string,
  locationSlug: string,
  serviceSlug: string,
  feedBaseUrl: string,
  items: FeedPageItem[],
  nap?: NapInfo,
  termsUrl?: string,
  privacyUrl?: string
): string {
  const feedXmlUrl = `${feedBaseUrl}/feeds/${officeSlug}/${locationSlug}/${serviceSlug}/feed.xml`;
  const pageTitle = `AAAC ${locationName} — ${serviceName} Super Feed`;
  const metaDescription = `Aggregated wildlife removal resources for ${locationName}, ${serviceName}.`;

  const jsonLdBlocks = items.map(item => {
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

  const itemsHtml = items.map(item => {
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
                       item.schemaType === "DigitalDocument" ? "Document" : "Article";

    const bodyText = item.fullContent ?? item.description;
    const descHtml = bodyText
      ? `\n    <div class="sf-item-body">\n      ${escapeXml(bodyText)}\n    </div>`
      : "";

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
  }).join("\n");

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
        <a href="${escapeXml(feedXmlUrl)}">RSS Feed</a> · ${escapeXml(String(items.length))} items
      </p>
    </header>
    ${napHtml}
    ${policyLinksHtml}
    ${itemsHtml}
  </section>
</body>
</html>`;
}
