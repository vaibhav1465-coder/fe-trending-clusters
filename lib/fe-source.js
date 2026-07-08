const {
  cleanText,
  getTag,
  getAllTags,
  canonicalUrl,
  isLikelyArticleUrl,
  inferSectionFromUrl,
  isWithinDays,
  safeIsoDate,
  fetchWithTimeout,
  fetchJsonWithTimeout
} = require("./utils");

const FE_RSS_SOURCES = [
  "https://www.financialexpress.com/feed/",
  "https://www.financialexpress.com/market/feed/",
  "https://www.financialexpress.com/business/feed/",
  "https://www.financialexpress.com/money/feed/",
  "https://www.financialexpress.com/india-news/feed/",
  "https://www.financialexpress.com/tech/feed/"
];

const FE_HTML_SOURCES = [
  "https://www.financialexpress.com/",
  "https://www.financialexpress.com/market/",
  "https://www.financialexpress.com/business/",
  "https://www.financialexpress.com/money/",
  "https://www.financialexpress.com/india-news/",
  "https://www.financialexpress.com/tech/"
];

const FE_REST_SOURCES = [
  "https://www.financialexpress.com/wp-json/wp/v2/posts?per_page=80&_fields=date,link,title,excerpt"
];

const FE_HEADERS = {
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
  "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,application/rss+xml,application/json,*/*;q=0.8",
  "accept-language": "en-IN,en;q=0.9",
  "cache-control": "no-cache"
};

function parseRss(xml, sourceUrl) {
  const itemBlocks = xml.match(/<item[\s\S]*?<\/item>/gi) || [];

  return itemBlocks.map((block) => {
    const link = canonicalUrl(getTag(block, "link") || getTag(block, "guid"));
    const categories = getAllTags(block, "category");
    const pubDate = getTag(block, "pubDate") || getTag(block, "dc:date");
    const publishedAt = pubDate ? safeIsoDate(pubDate) : null;

    return {
      title: getTag(block, "title"),
      url: link,
      publishedAt,
      summary: cleanText(getTag(block, "description")).slice(0, 260),
      sourceFeed: sourceUrl,
      sourceType: "rss-feed",
      section: categories[0] || inferSectionFromUrl(link),
      categories
    };
  }).filter((article) => article.title && article.url && isLikelyArticleUrl(article.url));
}

function parseRestPosts(posts, sourceUrl) {
  if (!Array.isArray(posts)) return [];

  return posts.map((post) => {
    const url = canonicalUrl(post.link || "");

    return {
      title: cleanText(post.title && post.title.rendered ? post.title.rendered : post.title || ""),
      url,
      publishedAt: post.date ? safeIsoDate(post.date) : null,
      summary: cleanText(post.excerpt && post.excerpt.rendered ? post.excerpt.rendered : "").slice(0, 260),
      sourceFeed: sourceUrl,
      sourceType: "wp-rest",
      section: inferSectionFromUrl(url),
      categories: []
    };
  }).filter((article) => article.title && article.url && isLikelyArticleUrl(article.url));
}

function parseHtmlArticles(html, sourceUrl) {
  const articles = [];
  const linkRegex = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = linkRegex.exec(html))) {
    const url = canonicalUrl(match[1]);
    if (!url || !isLikelyArticleUrl(url)) continue;

    const title = cleanText(match[2]);
    if (!title || title.length < 24 || title.length > 180) continue;

    articles.push({
      title,
      url,
      publishedAt: null,
      summary: "Open the full Financial Express story for complete details.",
      sourceFeed: sourceUrl,
      sourceType: "html-page",
      section: inferSectionFromUrl(url),
      categories: []
    });
  }

  return articles;
}

async function fetchRecentFeArticles(options = {}) {
  const days = Math.min(Math.max(Number(options.days || process.env.FE_LOOKBACK_DAYS || 3), 1), 7);
  const maxArticles = Math.min(Math.max(Number(options.maxArticles || process.env.FE_MAX_ARTICLES || 220), 30), 500);

  const tasks = [];

  for (const url of FE_RSS_SOURCES) {
    tasks.push(fetchWithTimeout(url, 12000, FE_HEADERS).then((xml) => parseRss(xml, url)));
  }

  for (const url of FE_REST_SOURCES) {
    tasks.push(fetchJsonWithTimeout(url, 12000, FE_HEADERS).then((json) => parseRestPosts(json, url)));
  }

  for (const url of FE_HTML_SOURCES) {
    tasks.push(fetchWithTimeout(url, 12000, FE_HEADERS).then((html) => parseHtmlArticles(html, url)));
  }

  const results = await Promise.allSettled(tasks);
  const articles = [];
  const sourceStatus = [];

  for (const result of results) {
    if (result.status === "fulfilled") {
      articles.push(...result.value);
      sourceStatus.push({ ok: true, count: result.value.length });
    } else {
      sourceStatus.push({
        ok: false,
        error: result.reason ? result.reason.message : "Unknown FE source error"
      });
    }
  }

  const deduped = [];
  const seen = new Set();

  for (const article of articles) {
    const url = canonicalUrl(article.url);
    if (!url || seen.has(url)) continue;

    seen.add(url);

    const normalized = {
      ...article,
      url,
      title: cleanText(article.title),
      summary: cleanText(article.summary || "Open the full Financial Express story for complete details.").slice(0, 260),
      section: cleanText(article.section || inferSectionFromUrl(url))
    };

    if (isWithinDays(normalized, days)) deduped.push(normalized);
  }

  deduped.sort((a, b) => {
    const ad = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
    const bd = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
    return bd - ad;
  });

  return {
    ok: true,
    sourceMode: "live-fe-sources",
    sourceName: "Financial Express article source API",
    sourceExplanation: "This is our own backend source layer. It collects recent Financial Express article URLs from FE RSS feeds, FE public WordPress REST posts where available, and FE section/homepage HTML links.",
    days,
    articleCount: deduped.slice(0, maxArticles).length,
    generatedAt: new Date().toISOString(),
    sourceStatus,
    articles: deduped.slice(0, maxArticles)
  };
}

module.exports = {
  fetchRecentFeArticles,
  FE_RSS_SOURCES,
  FE_HTML_SOURCES,
  FE_REST_SOURCES
};
