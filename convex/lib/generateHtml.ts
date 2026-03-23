import { escapeXml } from "./generateRss";
import { dispatchJsonLd, FeedPageItem } from "./generateJsonLd";

export function generateFeedHtml(
  _officeName: string,
  locationName: string,
  serviceName: string,
  officeSlug: string,
  locationSlug: string,
  serviceSlug: string,
  feedBaseUrl: string,
  items: FeedPageItem[]
): string {
  const feedXmlUrl = `${feedBaseUrl}/feeds/${officeSlug}/${locationSlug}/${serviceSlug}/feed.xml`;
  const pageTitle = `AAAC ${locationName} — ${serviceName} Super Feed`;
  const metaDescription = `Aggregated wildlife removal resources for ${locationName}, ${serviceName}.`;

  const jsonLdBlocks = items.map(item => {
    const ld = dispatchJsonLd(item);
    // JSON.stringify handles escaping — prevents </script> injection
    return `<script type="application/ld+json">\n${JSON.stringify(ld, null, 2)}\n</script>`;
  }).join("\n");

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

    const descHtml = item.description
      ? `
    <div class="sf-item-body">
      ${escapeXml(item.description)}
    </div>`
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
    <span class="sf-item-badge">${escapeXml(badgeLabel)}</span>
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
    ${itemsHtml}
  </section>
</body>
</html>`;
}
