const fs = require("fs");
const path = require("path");

const { sendJson, cleanText, toTitleCase, slugify } = require("../lib/utils");
const { fetchRecentFeArticles } = require("../lib/fe-source");
const { enrichArticlesWithNlp } = require("../lib/google-nlp");

const CLUSTER_RULES = [
  {
    id: "defence-stocks",
    name: "Defence Stocks",
    description: "Recent stories on defence companies, orders, contracts and stock movement.",
    patterns: ["defence", "defense", "hal", "hindustan aeronautics", "bharat electronics", "bel", "mazagon", "cochin shipyard", "bdl"]
  },
  {
    id: "ai-stocks",
    name: "AI Stocks",
    description: "Recent AI, tech, semiconductor and IT services stories from Financial Express.",
    patterns: ["ai", "artificial intelligence", "semiconductor", "technology", "tech", "it stocks", "tcs", "infosys", "wipro", "hcltech"]
  },
  {
    id: "market-today",
    name: "Market Today",
    description: "Nifty, Sensex, shares, top movers and daily market direction.",
    patterns: ["nifty", "sensex", "stock market", "share market", "equity market", "market today", "top gainers", "top losers", "dalal street"]
  },
  {
    id: "ipo-watch",
    name: "IPO Watch",
    description: "IPO launches, GMP, subscription, allotment and listing updates.",
    patterns: ["ipo", "gmp", "listing", "allotment", "public issue", "subscription", "price band", "grey market"]
  },
  {
    id: "finance-stocks",
    name: "Finance Stocks",
    description: "Banks, NBFCs, lending, deposits and financial services stock updates.",
    patterns: ["bank", "banks", "banking", "nbfc", "hdfc bank", "icici bank", "sbi", "axis bank", "finance stocks", "lending"]
  },
  {
    id: "it-stocks",
    name: "IT Stocks",
    description: "IT services, software, tech earnings and company movement.",
    patterns: ["it stocks", "it services", "software", "tcs", "infosys", "wipro", "hcltech", "tech mahindra", "ltimindtree"]
  },
  {
    id: "gold-rate",
    name: "Gold Rate",
    description: "Gold prices, bullion, MCX and commodity market movement.",
    patterns: ["gold", "gold rate", "bullion", "mcx", "commodity"]
  },
  {
    id: "silver-rate",
    name: "Silver Rate",
    description: "Silver prices, bullion, MCX and commodity market movement.",
    patterns: ["silver", "silver rate", "bullion", "mcx", "commodity"]
  },
  {
    id: "mutual-funds",
    name: "Mutual Funds",
    description: "Mutual funds, SIP, NFO, fund performance and personal investing updates.",
    patterns: ["mutual fund", "mutual funds", "sip", "nfo", "amc", "small cap fund", "large cap fund", "elss"]
  },
  {
    id: "rbi-economy",
    name: "RBI Economy",
    description: "RBI policy, inflation, GDP, rate cuts, rupee and macro economy updates.",
    patterns: ["rbi", "reserve bank", "inflation", "gdp", "rate cut", "repo rate", "monetary policy", "rupee", "economy"]
  },
  {
    id: "tax-money",
    name: "Tax Money",
    description: "Income tax, ITR, EPFO, savings, loans, insurance and money planning.",
    patterns: ["income tax", "itr", "tax", "epfo", "pension", "insurance", "loan", "credit card", "personal finance", "savings"]
  },
  {
    id: "global-markets",
    name: "Global Markets",
    description: "US markets, Fed, crude oil, dollar, China and global cues.",
    patterns: ["global market", "global markets", "wall street", "dow jones", "nasdaq", "us fed", "federal reserve", "crude oil", "brent", "dollar", "china"]
  }
];

const NLP_ENTITY_CLUSTER_MAP = [
  { patterns: ["RBI", "Reserve Bank", "Repo Rate", "Inflation"], clusterId: "rbi-economy" },
  { patterns: ["IPO", "GMP", "Allotment", "Listing"], clusterId: "ipo-watch" },
  { patterns: ["Nifty", "Sensex", "BSE", "NSE"], clusterId: "market-today" },
  { patterns: ["Gold", "Bullion"], clusterId: "gold-rate" },
  { patterns: ["Silver"], clusterId: "silver-rate" },
  { patterns: ["Mutual Fund", "SIP", "AMC"], clusterId: "mutual-funds" },
  { patterns: ["AI", "Artificial Intelligence", "TCS", "Infosys", "Wipro"], clusterId: "ai-stocks" },
  { patterns: ["HAL", "BEL", "Mazagon", "Cochin Shipyard", "Defence"], clusterId: "defence-stocks" },
  { patterns: ["Bank", "SBI", "HDFC Bank", "ICICI Bank", "NBFC"], clusterId: "finance-stocks" }
];

function articleText(article) {
  const nlpEntityNames = article.nlp && Array.isArray(article.nlp.entities)
    ? article.nlp.entities.map((entity) => entity.name).join(" ")
    : "";

  return `${article.title || ""} ${article.summary || ""} ${(article.categories || []).join(" ")} ${article.section || ""} ${nlpEntityNames}`.toLowerCase();
}

function findRuleById(id) {
  return CLUSTER_RULES.find((rule) => rule.id === id);
}

function getNlpClusterMatches(article) {
  const entities = article.nlp && Array.isArray(article.nlp.entities) ? article.nlp.entities : [];
  if (!entities.length) return [];

  const names = entities.map((entity) => entity.name || "");
  const matches = [];

  for (const mapRule of NLP_ENTITY_CLUSTER_MAP) {
    const matchedEntity = names.find((name) => {
      const lowerName = name.toLowerCase();
      return mapRule.patterns.some((pattern) => lowerName.includes(pattern.toLowerCase()));
    });

    if (matchedEntity) {
      const rule = findRuleById(mapRule.clusterId);
      if (rule) matches.push({ rule, score: 4, reason: `NLP entity: ${matchedEntity}` });
    }
  }

  return matches;
}

function getRuleMatches(article) {
  const text = articleText(article);
  const ruleMatches = CLUSTER_RULES.map((rule) => {
    const score = rule.patterns.reduce((total, pattern) => {
      return text.includes(pattern.toLowerCase()) ? total + 1 : total;
    }, 0);

    return score > 0 ? { rule, score, reason: "keyword/topic match" } : null;
  }).filter(Boolean);

  const nlpMatches = getNlpClusterMatches(article);
  const combined = new Map();

  for (const match of [...ruleMatches, ...nlpMatches]) {
    const existing = combined.get(match.rule.id);
    if (!existing || match.score > existing.score) {
      combined.set(match.rule.id, match);
    }
  }

  return [...combined.values()].sort((a, b) => b.score - a.score);
}

function getDynamicCluster(article) {
  const entities = article.nlp && Array.isArray(article.nlp.entities) ? article.nlp.entities : [];
  const topEntity = entities.find((entity) => entity.salience >= 0.08 && entity.name.length <= 28);

  if (topEntity) {
    return {
      id: `topic-${slugify(topEntity.name)}`,
      name: toTitleCase(topEntity.name),
      description: `Recent Financial Express stories mentioning ${topEntity.name}.`
    };
  }

  const section = cleanText(article.section || "");
  const generic = new Set(["Business", "Market", "Markets", "Money", "India News", "Financial Express", "Latest News"]);

  if (section && !generic.has(section) && section.length <= 24) {
    return {
      id: slugify(section),
      name: toTitleCase(section),
      description: `Recent Financial Express stories around ${toTitleCase(section)}.`
    };
  }

  return {
    id: "top-fe-stories",
    name: "Top FE Stories",
    description: "Recent Financial Express stories across markets, money, business and economy."
  };
}

function addArticleToCluster(map, clusterInput, article, weight = 1) {
  const id = slugify(clusterInput.id || clusterInput.name);
  if (!id) return;

  if (!map.has(id)) {
    map.set(id, {
      id,
      name: clusterInput.name,
      description: clusterInput.description,
      score: 0,
      nlpEntityNames: new Set(),
      articles: []
    });
  }

  const cluster = map.get(id);

  if (!cluster.articles.some((item) => item.url === article.url)) {
    cluster.articles.push(article);
    cluster.score += weight;

    const entities = article.nlp && Array.isArray(article.nlp.entities) ? article.nlp.entities : [];
    entities.slice(0, 5).forEach((entity) => {
      if (entity.name) cluster.nlpEntityNames.add(entity.name);
    });
  }
}

function buildClusters(articles, maxClusters = 12, maxArticlesPerCluster = 12) {
  const map = new Map();

  for (const article of articles) {
    const matches = getRuleMatches(article);

    if (matches.length) {
      matches.slice(0, 2).forEach((match, index) => {
        addArticleToCluster(map, match.rule, article, match.score + (index === 0 ? 2 : 1));
      });
    } else {
      addArticleToCluster(map, getDynamicCluster(article), article, 1);
    }
  }

  return [...map.values()].map((cluster) => {
    const sortedArticles = cluster.articles.sort((a, b) => {
      const ad = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
      const bd = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
      return bd - ad;
    }).slice(0, maxArticlesPerCluster);

    const recencyBoost = sortedArticles.reduce((score, article) => {
      if (!article.publishedAt) return score + 1;
      const ageHours = (Date.now() - new Date(article.publishedAt).getTime()) / 36e5;
      if (ageHours <= 24) return score + 5;
      if (ageHours <= 48) return score + 3;
      return score + 1;
    }, 0);

    return {
      id: cluster.id,
      name: cluster.name,
      description: cluster.description,
      articleCount: sortedArticles.length,
      trendScore: cluster.score * 10 + recencyBoost,
      nlpEntities: [...cluster.nlpEntityNames].slice(0, 10),
      articles: sortedArticles
    };
  }).filter((cluster) => cluster.articleCount > 0)
    .sort((a, b) => b.trendScore - a.trendScore || b.articleCount - a.articleCount)
    .slice(0, maxClusters);
}

function readCache() {
  const cachePath = path.join(process.cwd(), "public", "data", "trending-cache.json");
  try {
    if (!fs.existsSync(cachePath)) return null;
    const parsed = JSON.parse(fs.readFileSync(cachePath, "utf8"));
    if (!parsed || !Array.isArray(parsed.clusters)) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function getTrendingData(options = {}) {
  const days = Math.min(Math.max(Number(options.days || process.env.FE_LOOKBACK_DAYS || 3), 1), 7);
  const maxClusters = Math.min(Math.max(Number(options.maxClusters || process.env.FE_MAX_CLUSTERS || 12), 4), 20);
  const maxArticlesPerCluster = Math.min(Math.max(Number(options.maxArticlesPerCluster || process.env.FE_MAX_ARTICLES_PER_CLUSTER || 12), 4), 20);
  const forceLive = Boolean(options.forceLive);

  let feData;
  let sourceMode = "live-fe-sources";

  try {
    feData = await fetchRecentFeArticles({ days });
  } catch (error) {
    feData = {
      ok: false,
      articleCount: 0,
      articles: [],
      sourceStatus: [{ ok: false, error: error.message || "Unknown FE source error" }]
    };
  }

  if (!feData.articles || !feData.articles.length) {
    const cached = readCache();
    if (cached && Array.isArray(cached.clusters) && cached.clusters.length) {
      return {
        ...cached,
        ok: true,
        sourceMode: forceLive ? "cached-fallback-after-refresh" : "cached-local-export",
        servedAt: new Date().toISOString(),
        note: forceLive
          ? "Refresh attempted live FE fetch with Google NLP, but live FE returned no usable articles from this server. The latest good cached clusters are shown instead."
          : "Live FE source was unavailable, so the page used the latest local cache."
      };
    }
  }

  const nlpResult = await enrichArticlesWithNlp(feData.articles || [], {
    forceNlp: options.useNlp
  });

  const clusters = buildClusters(nlpResult.articles, maxClusters, maxArticlesPerCluster);
  if (!clusters.length) sourceMode = "no-live-data";

  return {
    ok: true,
    product: "FE Trending Clusters",
    sourceMode,
    sourceSummary: {
      feArticleSourceApi: "/api/fe-articles",
      clusterApi: "/api/trending-clusters",
      googleNlp: nlpResult.nlpStatus.enabled ? "enabled" : "fallback/off",
      googleNlpCallsMade: nlpResult.nlpStatus.callsMade
    },
    generatedAt: new Date().toISOString(),
    days,
    articleCount: feData.articleCount || 0,
    clusterCount: clusters.length,
    sourceStatus: feData.sourceStatus || [],
    nlpStatus: nlpResult.nlpStatus,
    clusters
  };
}

async function handler(req, res) {
  if (req.method === "OPTIONS") {
    sendJson(res, 204, {});
    return;
  }

  if (req.method && req.method !== "GET") {
    sendJson(res, 405, { ok: false, error: "Only GET requests are supported." });
    return;
  }

  try {
    const requestUrl = new URL(req.url || "/api/trending-clusters", "http://localhost");
    const useNlpParam = requestUrl.searchParams.get("nlp");

    const data = await getTrendingData({
      days: requestUrl.searchParams.get("days") || process.env.FE_LOOKBACK_DAYS || 3,
      maxClusters: requestUrl.searchParams.get("clusters") || process.env.FE_MAX_CLUSTERS || 12,
      maxArticlesPerCluster: requestUrl.searchParams.get("articles") || process.env.FE_MAX_ARTICLES_PER_CLUSTER || 12,
      forceLive: requestUrl.searchParams.get("forceLive") === "1",
      useNlp: useNlpParam === "1" ? true : useNlpParam === "0" ? false : undefined
    });

    sendJson(res, 200, data);
  } catch (error) {
    sendJson(res, 500, {
      ok: false,
      error: error.message || "Something went wrong while creating trending clusters."
    });
  }
}

module.exports = handler;
module.exports.getTrendingData = getTrendingData;


