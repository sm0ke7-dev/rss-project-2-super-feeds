import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const http = httpRouter();

const FEED_PATH_RE = /^\/feeds\/([a-z0-9-]+)\/([a-z0-9-]+)\/([a-z0-9-]+)\/(feed\.xml|feed\.html)$/;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// CORS preflight
http.route({
  pathPrefix: "/feeds/",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, { status: 204, headers: corsHeaders });
  }),
});

// Serve feed files
http.route({
  pathPrefix: "/feeds/",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const match = url.pathname.match(FEED_PATH_RE);

    if (!match) {
      return new Response("Not found", { status: 404 });
    }

    const [, officeSlug, locationSlug, serviceSlug, filename] = match;

    const feed = await ctx.runQuery(internal.queries.generatedFeeds.getBySlug, {
      officeSlug,
      locationSlug,
      serviceSlug,
    });

    if (!feed) {
      return new Response("Feed not yet generated", {
        status: 404,
        headers: { "Content-Type": "text/plain" },
      });
    }

    const isXml = filename === "feed.xml";
    const content = isXml ? feed.xmlContent : feed.htmlContent;
    const contentType = isXml
      ? "application/rss+xml; charset=utf-8"
      : "text/html; charset=utf-8";

    return new Response(content, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=1800",
        ...corsHeaders,
      },
    });
  }),
});

const SIMPLE_PAGE_STYLE = `
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 800px; margin: 40px auto; padding: 0 24px; color: #333; line-height: 1.6; }
  h1 { font-size: 1.8rem; margin-bottom: 8px; }
  h2 { font-size: 1.2rem; margin-top: 32px; }
  p { margin: 12px 0; }
  a { color: #2563eb; }
  .updated { color: #888; font-size: 0.9rem; margin-bottom: 32px; }
`;

// Terms & Conditions page
http.route({
  path: "/terms",
  method: "GET",
  handler: httpAction(async () => {
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Terms & Conditions — AAAC Wildlife Removal</title>
  <style>${SIMPLE_PAGE_STYLE}</style>
</head>
<body>
  <h1>Terms &amp; Conditions</h1>
  <p class="updated">Last updated: March 2026</p>

  <h2>Use of This Site</h2>
  <p>By accessing or using this website, you agree to be bound by these Terms &amp; Conditions. If you do not agree, please do not use this site.</p>

  <h2>Services</h2>
  <p>AAAC Wildlife Removal provides professional wildlife removal, exclusion, and prevention services. All service pricing, availability, and terms are determined at the time of inspection and may vary by location.</p>

  <h2>Content</h2>
  <p>The information on this site is provided for general informational purposes only. We make no guarantees about completeness, accuracy, or timeliness of the content.</p>

  <h2>Limitation of Liability</h2>
  <p>To the fullest extent permitted by law, AAAC Wildlife Removal shall not be liable for any indirect, incidental, or consequential damages arising from your use of this site or our services.</p>

  <h2>Changes</h2>
  <p>We reserve the right to update these Terms at any time. Continued use of the site after changes constitutes acceptance of the new Terms.</p>

  <h2>Contact</h2>
  <p>Questions? <a href="/contact">Contact us here</a>.</p>
</body>
</html>`;
    return new Response(html, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=86400" },
    });
  }),
});

// Privacy Policy page
http.route({
  path: "/privacy",
  method: "GET",
  handler: httpAction(async () => {
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Privacy Policy — AAAC Wildlife Removal</title>
  <style>${SIMPLE_PAGE_STYLE}</style>
</head>
<body>
  <h1>Privacy Policy</h1>
  <p class="updated">Last updated: March 2026</p>

  <h2>Information We Collect</h2>
  <p>We may collect information you provide directly to us, such as your name, phone number, email address, and service address when you request a quote or contact us.</p>

  <h2>How We Use Your Information</h2>
  <p>We use the information we collect to provide, maintain, and improve our services, to communicate with you about your service requests, and to send relevant updates.</p>

  <h2>Sharing of Information</h2>
  <p>We do not sell your personal information. We may share your information with local franchise operators to fulfill your service request, and with service providers who assist us in operating our business.</p>

  <h2>Cookies</h2>
  <p>We may use cookies and similar tracking technologies to analyze traffic and improve your experience. You can control cookies through your browser settings.</p>

  <h2>Data Security</h2>
  <p>We take reasonable measures to protect your information from unauthorized access or disclosure.</p>

  <h2>Your Choices</h2>
  <p>You may opt out of marketing communications at any time by contacting us or following the unsubscribe instructions in any email we send.</p>

  <h2>Contact</h2>
  <p>If you have questions about this Privacy Policy, please <a href="/contact">contact us</a>.</p>
</body>
</html>`;
    return new Response(html, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=86400" },
    });
  }),
});

export default http;
