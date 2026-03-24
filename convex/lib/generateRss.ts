export interface FeedMeta {
  officeSlug: string;
  locationSlug: string;
  serviceSlug: string;
  officeName: string;
  locationName: string;
  serviceName: string;
  feedBaseUrl: string; // e.g. "https://feeds.aaacwildlife.com"
  lastBuildDate: string; // UTC string
}

export interface FeedItem {
  guid: string;
  title: string;
  link: string;
  description?: string;
  fullContent?: string;
  pubDate?: string;
  isoDate?: string;
  videoId?: string;
  thumbnailUrl?: string;
  schemaType: "VideoObject" | "Article" | "DigitalDocument";
}

export function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function generateRss2(meta: FeedMeta, items: FeedItem[]): string {
  const feedUrl = `${meta.feedBaseUrl}/feeds/${meta.officeSlug}/${meta.locationSlug}/${meta.serviceSlug}/feed.xml`;
  const feedHtmlUrl = `${meta.feedBaseUrl}/feeds/${meta.officeSlug}/${meta.locationSlug}/${meta.serviceSlug}/feed.html`;
  const feedTitle = `AAAC ${meta.locationName} — ${meta.serviceName} Super Feed`;
  const feedDescription = `Aggregated wildlife removal resources for ${meta.locationName}, ${meta.serviceName}.`;

  const itemsXml = items.map(item => {
    const isYouTube = !!item.videoId;
    const guidAttr = isYouTube ? `isPermaLink="false"` : `isPermaLink="true"`;
    const mediaThumb = item.thumbnailUrl
      ? `<media:thumbnail url="${escapeXml(item.thumbnailUrl)}" />`
      : "";
    const pubDateXml = item.pubDate
      ? `<pubDate>${escapeXml(item.pubDate)}</pubDate>`
      : "";
    const descriptionXml = item.description
      ? `<description><![CDATA[${item.description}]]></description>`
      : "";
    const contentEncodedXml = item.fullContent
      ? `<content:encoded><![CDATA[${item.fullContent}]]></content:encoded>`
      : "";

    return `
    <item>
      <title><![CDATA[${item.title}]]></title>
      <link>${escapeXml(item.link)}</link>
      <guid ${guidAttr}>${escapeXml(item.guid)}</guid>
      ${pubDateXml}
      ${descriptionXml}
      ${contentEncodedXml}
      ${mediaThumb}
    </item>`;
  }).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:atom="http://www.w3.org/2005/Atom"
  xmlns:media="http://search.yahoo.com/mrss/"
  xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title><![CDATA[${feedTitle}]]></title>
    <link>${escapeXml(feedHtmlUrl)}</link>
    <description><![CDATA[${feedDescription}]]></description>
    <language>en-us</language>
    <lastBuildDate>${escapeXml(meta.lastBuildDate)}</lastBuildDate>
    <atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml" />
${itemsXml}
  </channel>
</rss>`;
}
