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
  artworkUrl?: string;
  duration?: string;
  schemaType: "VideoObject" | "Article" | "DigitalDocument" | "AudioObject";
}

export function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export interface WebFeedInput {
  title: string;
  url: string;
  items: Array<{
    title: string;
    link: string;
    videoId?: string;
    thumbnailUrl?: string;
    description?: string;
    publishedAt?: string;
  }>;
}

export function generateWebFeedRss(feed: WebFeedInput, feedUrl: string): string {
  const lastBuildDate = new Date().toUTCString();

  const itemsXml = feed.items
    .map((item) => {
      const pubDateXml = item.publishedAt
        ? "\n      <pubDate>" + escapeXml(item.publishedAt) + "</pubDate>"
        : "";
      const descriptionXml = item.description
        ? "\n      <description><![CDATA[" + item.description + "]]></description>"
        : "";
      const mediaThumbXml = item.thumbnailUrl
        ? "\n      <media:thumbnail url=\"" + escapeXml(item.thumbnailUrl) + "\" />"
        : "";
      const ytVideoIdXml = item.videoId
        ? "\n      <yt:videoId>" + escapeXml(item.videoId) + "</yt:videoId>"
        : "";

      return (
        "\n    <item>" +
        "\n      <title><![CDATA[" + item.title + "]]></title>" +
        "\n      <link>" + escapeXml(item.link) + "</link>" +
        "\n      <guid isPermaLink=\"true\">" + escapeXml(item.link) + "</guid>" +
        pubDateXml +
        descriptionXml +
        mediaThumbXml +
        ytVideoIdXml +
        "\n    </item>"
      );
    })
    .join("\n");

  return (
    "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n" +
    "<rss version=\"2.0\"" +
    " xmlns:atom=\"http://www.w3.org/2005/Atom\"" +
    " xmlns:media=\"http://search.yahoo.com/mrss/\"" +
    " xmlns:yt=\"http://www.youtube.com/xml/schemas/2015\">\n" +
    "  <channel>\n" +
    "    <title><![CDATA[" + feed.title + "]]></title>\n" +
    "    <link>" + escapeXml(feed.url) + "</link>\n" +
    "    <description><![CDATA[RSS feed generated from " + feed.title + "]]></description>\n" +
    "    <lastBuildDate>" + escapeXml(lastBuildDate) + "</lastBuildDate>\n" +
    "    <atom:link href=\"" + escapeXml(feedUrl) + "\" rel=\"self\" type=\"application/rss+xml\" />\n" +
    itemsXml + "\n" +
    "  </channel>\n" +
    "</rss>"
  );
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
    const itunesImageXml = item.artworkUrl
      ? `<itunes:image href="${escapeXml(item.artworkUrl)}" />`
      : "";
    const itunesDurationXml = item.duration
      ? `<itunes:duration>${escapeXml(item.duration)}</itunes:duration>`
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
      ${itunesImageXml}
      ${itunesDurationXml}
    </item>`;
  }).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:atom="http://www.w3.org/2005/Atom"
  xmlns:media="http://search.yahoo.com/mrss/"
  xmlns:content="http://purl.org/rss/1.0/modules/content/"
  xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
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
