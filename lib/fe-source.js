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

const FE_WP_POSTS = "https://www.financialexpress.com/wp-json/wp/v2/posts";

const FE_RSS_SOURCES = [
  "https://www.financialexpress.com/feed/",
  "https://www.financialexpress.com/market/feed/",
  "https://www.financialexpress.com/business/feed/",
  "https://www.financialexpress.com/money/feed/",
  "https://www.financialexpress.com/india-news/feed/",
  "https://www.financialexpress.com/tech/feed/"
];

const FE_HEADERS = {
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
  "accept": "application/json,text/html,application/rss+xml,*/*;q=0.8",
  "accept-language": "en-IN,en;q=0.9",
  "cache-control": "no-cache"
};

function buildWpPostsUrl(page, days) {
  const url = new URL(FE_WP_POSTS);
  const afterDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  url.searchParams.set("per_page", "100");
  url.searchParams.set("page", String(page));
  url.searchParams.set("orderby", "date");
  url.searchParams.set("order", "desc");
  url.searchParams.set("after", afterDate.toISOString());
  url.searchParams.set("_fields", "id,date,date_gmt,link,title,excerpt,categories,slug,status,type");

  return url.toString();
}

function parseWpPosts(posts, sourceUrl) {
  if (!Array.isArray(posts)) return [];

  return posts.map((post) => {
    const url = canonicalUrl(post.link || "");
    const title = cleanText(post.title && post.title.rendered ? post.title.rendered : post.title || "");
    const summary = cleanText(post.excerpt && post.excerpt.rendered ? post.excerpt.rendered : "").slice(0, 280);

    return {
      id: post.id,
      title,
      url,
      publishedAt: post.date ? safeIsoDate(post.date) : null,
      summary: summary || "Open the full Financial Express story for complete details.",
      sourceFeed: sourceUrl,
      sourceType: "wp-rest",
      section: inferSectionFromUrl(url),
      categories: Array.isArray(post.categories) ? post.categories.map(String) : []
    };
  }).filter((article) => article.title && article.url && isLikelyArticleUrl(article.url));
}

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

async function fetchWordPressRestArticles(days, maxArticles) {
  const pages = [1, 2, 3];
  const tasks = pages.map((page) => {
    const url = buildWpPostsUrl(page, days);
    return fetchJsonWithTimeout(url, 15000, FE_HEADERS).then((json) => parseWpPosts(json, url));
  });

  const results = await Promise.allSettled(tasks);
  const articles = [];
  const sourceStatus = [];

  for (const result of results) {
    if (result.status === "fulfilled") {
      articles.push(...result.value);
      sourceStatus.push({ ok: true, sourceType: "wp-rest", count: result.value.length });
    } else {
      sourceStatus.push({
        ok: false,
        sourceType: "wp-rest",
        error: result.reason ? result.reason.message : "WordPress REST source failed"
      });
    }
  }

  return {
    articles: articles.slice(0, maxArticles),
    sourceStatus
  };
}

async function fetchRssBackupArticles() {
  const tasks = FE_RSS_SOURCES.map((url) => {
    return fetchWithTimeout(url, 12000, FE_HEADERS).then((xml) => parseRss(xml, url));
  });

  const results = await Promise.allSettled(tasks);
  const articles = [];
  const sourceStatus = [];

  for (const result of results) {
    if (result.status === "fulfilled") {
      articles.push(...result.value);
      sourceStatus.push({ ok: true, sourceType: "rss-feed", count: result.value.length });
    } else {
      sourceStatus.push({
        ok: false,
        sourceType: "rss-feed",
        error: result.reason ? result.reason.message : "RSS backup failed"
      });
    }
  }

  return { articles, sourceStatus };
}

async function fetchRecentFeArticles(options = {}) {
  const days = Math.min(Math.max(Number(options.days || process.env.FE_LOOKBACK_DAYS || 3), 1), 7);
  const maxArticles = Math.min(Math.max(Number(options.maxArticles || process.env.FE_MAX_ARTICLES || 220), 30), 500);

  let sourceMode = "live-fe-wordpress-rest";
  const sourceStatus = [];

  const wp = await fetchWordPressRestArticles(days, maxArticles);
  sourceStatus.push(...wp.sourceStatus);

  let articles = wp.articles || [];

  if (articles.length < 20) {
    sourceMode = "live-fe-wordpress-rest-plus-rss-backup";
    const rss = await fetchRssBackupArticles();
    sourceStatus.push(...rss.sourceStatus);
    articles.push(...rss.articles);
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
      summary: cleanText(article.summary || "Open the full Financial Express story for complete details.").slice(0, 280),
      section: cleanText(article.section || inferSectionFromUrl(url))
    };

    if (isWithinDays(normalized, days)) deduped.push(normalized);
  }

  deduped.sort((a, b) => {
    const ad = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
    const bd = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
    return bd - ad;
  });

  const finalArticles = deduped.slice(0, maxArticles);

  return {
    ok: true,
    sourceMode,
    sourceName: "Financial Express WordPress REST API",
    sourceExplanation: "Primary source is Financial Express public WordPress REST API /wp-json/wp/v2/posts. RSS is used only as backup.",
    days,
    articleCount: finalArticles.length,
    generatedAt: new Date().toISOString(),
    sourceStatus,
    articles: finalArticles
  };
}

module.exports = {
  fetchRecentFeArticles,
  FE_RSS_SOURCES
};
