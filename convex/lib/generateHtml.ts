import { escapeXml } from "./generateRss";
import { dispatchJsonLd, FeedPageItem } from "./generateJsonLd";

export function generateFeedHtml(
  officeName: string,
  serviceName: string,
  officeSlug: string,
  serviceSlug: string,
  feedBaseUrl: string,
  items: FeedPageItem[]
): string {
  const feedXmlUrl = `${feedBaseUrl}/feeds/${officeSlug}/${serviceSlug}/feed.xml`;
  const pageTitle = `AAAC ${officeName} — ${serviceName} Super Feed`;
  const metaDescription = `Aggregated wildlife removal resources for ${officeName}, ${serviceName}.`;

  const jsonLdBlocks = items.map(item => {
    const ld = dispatchJsonLd(item);
    // JSON.stringify handles escaping — prevents </script> injection
    return `<script type="application/ld+json">\n${JSON.stringify(ld, null, 2)}\n</script>`;
  }).join("\n");

  const itemsHtml = items.map(item => {
    const dateStr = item.isoDate
      ? new Date(item.isoDate).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
      : "";
    const thumbImg = item.thumbnailUrl
      ? `<img src="${escapeXml(item.thumbnailUrl)}" alt="${escapeXml(item.title)}" style="max-width:320px;display:block;margin-bottom:8px;" loading="lazy" />`
      : "";
    const badge = item.schemaType === "VideoObject" ? "Video" :
                  item.schemaType === "DigitalDocument" ? "Document" : "Article";
    const desc = item.description
      ? `<p style="margin:8px 0;color:#555;font-size:14px;">${escapeXml(item.description.slice(0, 200))}${item.description.length > 200 ? "…" : ""}</p>`
      : "";

    return `
  <div style="border:1px solid #e0e0e0;border-radius:6px;padding:16px;margin-bottom:16px;">
    ${thumbImg}
    <span style="display:inline-block;background:#f0f0f0;color:#333;font-size:11px;font-weight:600;padding:2px 8px;border-radius:12px;margin-bottom:8px;">${escapeXml(badge)}</span>
    <h2 style="margin:0 0 4px;font-size:16px;"><a href="${escapeXml(item.link)}" style="color:#1a0dab;text-decoration:none;">${escapeXml(item.title)}</a></h2>
    ${dateStr ? `<p style="margin:0 0 8px;color:#999;font-size:12px;">${escapeXml(dateStr)}</p>` : ""}
    ${desc}
  </div>`;
  }).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeXml(pageTitle)}</title>
  <meta name="description" content="${escapeXml(metaDescription)}" />
  <link rel="alternate" type="application/rss+xml" title="${escapeXml(pageTitle)}" href="${escapeXml(feedXmlUrl)}" />
  ${jsonLdBlocks}
</head>
<body style="font-family:system-ui,-apple-system,sans-serif;max-width:800px;margin:0 auto;padding:24px 16px;background:#fff;">
  <h1 style="font-size:22px;color:#1a1a1a;margin-bottom:4px;">${escapeXml(pageTitle)}</h1>
  <p style="color:#666;margin-bottom:24px;font-size:14px;">
    <a href="${escapeXml(feedXmlUrl)}" style="color:#1a0dab;">RSS Feed</a> · ${escapeXml(String(items.length))} items
  </p>
  ${itemsHtml}
</body>
</html>`;
}
