import { z } from "zod/v4";

// =============================================================================
// Zod Schemas
// =============================================================================

const ProductSchema = z.object({
  machine_name: z.string(),
  tile_name: z.string(),
  product_url: z.string(),
  detailed_marketing_blurb: z.string(),
  tile_image: z.url(),
  "start_date|datetime": z.string(),
  "end_date|datetime": z.string(),
  tile_stamp: z.string(),
});

const SectionSchema = z.object({
  products: z.array(ProductSchema),
});

const CategorySchema = z.object({
  mosaic: z.array(SectionSchema),
});

const DataSchema = z.object({
  books: CategorySchema.optional(),
  games: CategorySchema.optional(),
  software: CategorySchema.optional(),
});

const LandingPageSchema = z.object({
  data: DataSchema,
});

type Product = z.infer<typeof ProductSchema>;

// =============================================================================
// Fetching & Parsing
// =============================================================================

const HUMBLE_BUNDLES_URL = "https://www.humblebundle.com/bundles";
const SCRIPT_TAG_REGEX =
  /<script id="landingPage-json-data" type="application\/json">([\s\S]*?)<\/script>/;

async function fetchBundles(): Promise<Product[]> {
  const response = await fetch(HUMBLE_BUNDLES_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch Humble Bundle page: ${response.status}`);
  }

  const html = await response.text();
  const match = html.match(SCRIPT_TAG_REGEX);
  if (!match || !match[1]) {
    throw new Error("Could not find landingPage-json-data script tag");
  }

  const rawData = JSON.parse(match[1]);
  const validated = LandingPageSchema.parse(rawData);

  const products: Product[] = [];
  const { data } = validated;

  for (const category of [data.books, data.games, data.software]) {
    if (!category) continue;
    for (const section of category.mosaic) {
      products.push(...section.products);
    }
  }

  // Sort by start date, newest first
  products.sort((a, b) => {
    const dateA = new Date(a["start_date|datetime"]).getTime();
    const dateB = new Date(b["start_date|datetime"]).getTime();
    return dateB - dateA;
  });

  return products;
}

function filterByCategory(
  products: Product[],
  category: "games" | "books" | "software"
): Product[] {
  return products.filter((p) => p.tile_stamp === category);
}

// =============================================================================
// RSS Generation
// =============================================================================

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "");
}

function generateRss(
  products: Product[],
  title: string,
  canonicalUrl: string
): string {
  const now = new Date().toUTCString();

  const items = products
    .map((product) => {
      const link = `https://www.humblebundle.com${product.product_url}`;
      const pubDate = new Date(product["start_date|datetime"]).toUTCString();
      const endDate = new Date(product["end_date|datetime"]);
      const description = `${stripHtml(
        product.detailed_marketing_blurb
      )}\n\nEnds: ${endDate.toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })}`;

      return `    <item>
      <title>${escapeXml(product.tile_name)}</title>
      <link>${escapeXml(link)}</link>
      <description><![CDATA[<img src="${product.tile_image}" /><br/><br/>${
        product.detailed_marketing_blurb
      }<br/><br/><strong>Ends:</strong> ${endDate.toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })}]]></description>
      <pubDate>${pubDate}</pubDate>
      <guid isPermaLink="false">${escapeXml(product.machine_name)}</guid>
      <category>${escapeXml(product.tile_stamp)}</category>
    </item>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(title)}</title>
    <link>${HUMBLE_BUNDLES_URL}</link>
    <description>Current bundles available on Humble Bundle</description>
    <language>en-us</language>
    <lastBuildDate>${now}</lastBuildDate>
    <atom:link href="${canonicalUrl}" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>`;
}

// =============================================================================
// HTML Homepage
// =============================================================================

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function generateHomepage(products: Product[]): string {
  const now = Date.now();
  const feedItems = products
    .map((p) => {
      const link = `https://www.humblebundle.com${p.product_url}`;
      const endDate = new Date(p["end_date|datetime"]);
      const hoursLeft = (endDate.getTime() - now) / (1000 * 60 * 60);
      let statusClass = "ok";
      if (hoursLeft <= 24 && hoursLeft > 0) statusClass = "urgent";
      else if (hoursLeft <= 168) statusClass = "soon"; // 7 days
      return `      <li><span class="entry ${statusClass}"><span class="cat">[${escapeHtml(
        p.tile_stamp
      )}]</span> <a href="${escapeHtml(link)}" title="${escapeHtml(
        p.tile_name
      )}" target="_blank" rel="noopener noreferrer nofollow">${escapeHtml(
        p.tile_name
      )}</a></span></li>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Humble Bundle RSS Feeds</title>
  <meta name="description" content="Unofficial RSS feeds for current Humble Bundle offerings.">
  <link rel="alternate" type="application/rss+xml" title="Humble Bundle RSS" href="/rss">
  <link rel="icon" type="image/svg+xml" href="/favicon.ico">
  <style>
    :root {
      --bg: #fafafa;
      --fg: #222;
      --muted: #666;
      --link: #0066cc;
      --accent: #b33;
      --border: #ccc;
      --green: #1a7a1a;
      --yellow: #7a6a00;
      --red: #b33;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #1a1a1a;
        --fg: #e0e0e0;
        --muted: #888;
        --link: #6cf;
        --accent: #e66;
        --border: #444;
        --green: #5a5;
        --yellow: #ca3;
        --red: #e55;
      }
    }
    * { box-sizing: border-box; }
    body {
      font-family: ui-monospace, "Cascadia Code", "Source Code Pro", Menlo, Consolas, monospace;
      font-size: 14px;
      line-height: 1.6;
      background: var(--bg);
      color: var(--fg);
      max-width: 72ch;
      margin: 0 auto;
      padding: 2rem 1rem;
    }
    h1 { font-size: 1em; font-weight: bold; margin: 0 0 0.5rem 0; }
    h2 { font-size: 1em; font-weight: bold; margin: 1.5rem 0 0.5rem 0; color: var(--accent); }
    p { margin: 0.5rem 0; }
    a { color: var(--link); }
    a:visited { color: var(--link); opacity: 0.8; }
    .meta { color: var(--muted); }
    .feeds { margin: 1rem 0; }
    .feeds a { margin-right: 1.5em; }
    ol { padding-left: 2.5em; margin: 0.5rem 0; }
    li { padding: 0.15rem 0; }
    .entry { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .ok a { color: var(--green); }
    .soon a { color: var(--yellow); }
    .urgent a { color: var(--red); }
  </style>
</head>
<body>
  <h1>HUMBLE BUNDLE RSS FEEDS</h1>
  <p>Unofficial RSS feeds for current Humble Bundle offerings.</p>

  <h2>FEEDS</h2>
  <div class="feeds">
    <a target="_blank" href="/rss">/rss</a>
    <a target="_blank" href="/games">/games</a>
    <a target="_blank" href="/books">/books</a>
    <a target="_blank" href="/software">/software</a>
  </div>
  <p class="meta">Add any feed URL to your RSS reader.</p>

  <h2>CURRENT BUNDLES</h2>
  <div data-nosnippet>
    <ol>
${feedItems}
    </ol>
  </div>

  <p class="meta">Data from <a target="_blank" href="https://www.humblebundle.com/bundles">humblebundle.com</a></p>
  <p class="meta">See <a target="_blank" href="https://github.com/zeen/humblebundle-rss">GitHub</a> for bug reports and pull requests.</p>
</body>
</html>`;
}

async function handleHomepage(): Promise<Response> {
  try {
    const products = await fetchBundles();
    const html = generateHomepage(products);
    return new Response(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    console.error("Error generating homepage:", error);
    return new Response(
      `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
      { status: 500, headers: { "Content-Type": "text/plain" } }
    );
  }
}

// Derived from https://commons.wikimedia.org/wiki/File:Humble_Bundle_H_logo_red.svg
const favicon = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="48" height="48" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg">
  <circle cx="50%" cy="50%" r="50%" fill="#D0011B"/>
  <path transform="scale(0.7,0.7) translate(220, 225)" d="M765.201172,820.589844 C620.475426,820.589844 843.283203,0.189453125 843.283203,0.189453125 L694.142578,5.68434189e-14 C694.142578,5.68434189e-14 633.090481,193.090536 592.811289,407.652717 L464.271164,407.652717 C467.639745,363.532521 469.262415,318.878282 468.522971,274.491064 C462.730655,-78.7375255 255.842002,-13.3140749 163.226562,67.7578125 C75.1710315,144.824375 1.42382812,291.240234 0,403.996094 C14.0273437,403.3125 69.4453125,403.074219 69.4453125,403.074219 C69.4453125,403.074219 115.528161,192.837891 260.253906,192.837891 C404.959112,192.837891 181.810547,1013.25 181.810547,1013.25 L331.015625,1013.36133 C331.015625,1013.36133 408.132049,793.724753 446.480469,548.455078 L569.224609,547.75 C562.076645,611.218997 559.803302,681.30885 560.850849,746.400517 C566.663705,1099.62911 772.743935,1023.82674 865.359375,942.775391 C957.974815,861.703503 1027.08594,690.517578 1026.23242,608.322266 C1026.3457,608.228516 955.882812,608.892578 955.037109,608.875 C955.279297,615.365234 909.906377,820.589844 765.201172,820.589844 Z" fill="white"/>
</svg>`;

// =============================================================================
// HTTP Server
// =============================================================================

async function handleRssRequest(
  canonicalUrl: string,
  category?: "games" | "books" | "software"
): Promise<Response> {
  try {
    let products = await fetchBundles();

    let title = "Humble Bundle - All Bundles";
    if (category) {
      products = filterByCategory(products, category);
      title = `Humble Bundle - ${
        category.charAt(0).toUpperCase() + category.slice(1)
      } Bundles`;
    }

    const rss = generateRss(products, title, canonicalUrl);
    return new Response(rss, {
      headers: {
        "Content-Type": "application/rss+xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    console.error("Error generating RSS feed:", error);
    return new Response(
      `Error generating RSS feed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
      { status: 500 }
    );
  }
}

const server = Bun.serve({
  port: process.env.PORT || 3000,
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;
    const canonicalUrl = `${url.origin}${path}`;

    switch (path) {
      case "/":
        return handleHomepage();
      case "/rss":
        return handleRssRequest(canonicalUrl);
      case "/games":
        return handleRssRequest(canonicalUrl, "games");
      case "/books":
        return handleRssRequest(canonicalUrl, "books");
      case "/software":
        return handleRssRequest(canonicalUrl, "software");
      case "/favicon.ico":
        return new Response(favicon, {
          headers: {
            "Content-Type": "image/svg+xml",
            "Cache-Control": "public, max-age=3600",
          },
        });
      default:
        return new Response("Not Found", { status: 404 });
    }
  },
});

console.log(
  `🚀 Humble Bundle RSS server running at http://localhost:${server.port}`
);
console.log(`
Available endpoints:
  /         - Homepage with feed links and current bundles
  /rss      - RSS feed of all bundles
  /games    - RSS feed of game bundles
  /books    - RSS feed of book bundles
  /software - RSS feed of software bundles
`);
