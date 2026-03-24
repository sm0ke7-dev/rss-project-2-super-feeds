export interface VideoObjectLdInput {
  name: string;
  thumbnailUrl: string;
  uploadDate: string; // ISO 8601 with timezone
  description?: string;
  embedUrl?: string;
  contentUrl?: string;
}

export interface DigitalDocumentLdInput {
  name: string;
  url: string;
  description?: string;
  datePublished?: string;
}

export interface ArticleLdInput {
  headline: string;
  url: string;
  description?: string;
  datePublished?: string;
  fullContent?: string;
}

export function buildVideoObjectLd(input: VideoObjectLdInput): object {
  return {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: input.name,
    thumbnailUrl: input.thumbnailUrl,
    uploadDate: input.uploadDate,
    ...(input.description ? { description: input.description } : {}),
    ...(input.embedUrl ? { embedUrl: input.embedUrl } : {}),
    ...(input.contentUrl ? { contentUrl: input.contentUrl } : {}),
  };
}

export function buildDigitalDocumentLd(input: DigitalDocumentLdInput): object {
  return {
    "@context": "https://schema.org",
    "@type": "DigitalDocument",
    name: input.name,
    url: input.url,
    encodingFormat: "application/pdf",
    ...(input.description ? { description: input.description } : {}),
    ...(input.datePublished ? { datePublished: input.datePublished } : {}),
  };
}

export function buildArticleLd(input: ArticleLdInput): object {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: input.headline,
    url: input.url,
    publisher: {
      "@type": "Organization",
      name: "AAAC Wildlife Removal",
    },
    ...(input.description ? { description: input.description } : {}),
    ...(input.datePublished ? { datePublished: input.datePublished } : {}),
    ...(input.fullContent ? { articleBody: input.fullContent.slice(0, 5000) } : {}),
  };
}

export type FeedPageItem = {
  guid: string;
  title: string;
  link: string;
  description?: string;
  fullContent?: string;
  isoDate?: string;
  videoId?: string;
  thumbnailUrl?: string;
  schemaType: "VideoObject" | "Article" | "DigitalDocument";
  sourceName?: string;
};

export function dispatchJsonLd(item: FeedPageItem): object {
  if (item.schemaType === "VideoObject") {
    const embedUrl = item.videoId
      ? `https://www.youtube.com/embed/${item.videoId}`
      : undefined;
    const contentUrl = item.videoId
      ? `https://www.youtube.com/watch?v=${item.videoId}`
      : item.link;
    // Ensure uploadDate has timezone — append Z if no timezone suffix
    let uploadDate = item.isoDate ?? new Date().toISOString();
    if (!/[Z+\-]\d*$/.test(uploadDate.replace(/\.\d+/, ""))) {
      uploadDate = uploadDate + "Z";
    }
    return buildVideoObjectLd({
      name: item.title,
      thumbnailUrl: item.thumbnailUrl ?? "",
      uploadDate,
      description: item.description,
      embedUrl,
      contentUrl,
    });
  }

  if (item.schemaType === "DigitalDocument") {
    return buildDigitalDocumentLd({
      name: item.title,
      url: item.link,
      description: item.description,
      datePublished: item.isoDate,
    });
  }

  // Article (default)
  return buildArticleLd({
    headline: item.title,
    url: item.link,
    description: item.description,
    datePublished: item.isoDate,
    fullContent: item.fullContent,
  });
}
