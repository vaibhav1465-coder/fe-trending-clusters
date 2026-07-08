const crypto = require("crypto");

const nlpMemoryCache = new Map();

function isGoogleNlpEnabled(options = {}) {
  if (options.forceNlp === true) return Boolean(process.env.GOOGLE_NLP_API_KEY);
  if (options.forceNlp === false) return false;

  return String(process.env.USE_GOOGLE_NLP || "").toLowerCase() === "true" && Boolean(process.env.GOOGLE_NLP_API_KEY);
}

function hashText(value = "") {
  return crypto.createHash("sha1").update(String(value)).digest("hex");
}

function articleNlpText(article) {
  return [
    article.title || "",
    article.summary || "",
    article.section || "",
    (article.categories || []).join(" ")
  ].join(". ").slice(0, 900);
}

function normalizeEntity(entity) {
  return {
    name: entity.name,
    type: entity.type || "UNKNOWN",
    salience: typeof entity.salience === "number" ? Number(entity.salience.toFixed(4)) : 0,
    mentionCount: Array.isArray(entity.mentions) ? entity.mentions.length : 0
  };
}

async function analyzeTextWithGoogleNlp(text) {
  const apiKey = process.env.GOOGLE_NLP_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_NLP_API_KEY is missing.");

  const endpoint = `https://language.googleapis.com/v1/documents:analyzeEntities?key=${encodeURIComponent(apiKey)}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json; charset=utf-8"
    },
    body: JSON.stringify({
      document: {
        type: "PLAIN_TEXT",
        content: text
      },
      encodingType: "UTF8"
    })
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`Google NLP returned HTTP ${response.status}. ${errorText.slice(0, 180)}`);
  }

  const data = await response.json();

  return {
    language: data.language || "unknown",
    entities: Array.isArray(data.entities)
      ? data.entities
          .map(normalizeEntity)
          .filter((entity) => entity.name && entity.salience >= 0.01)
          .sort((a, b) => b.salience - a.salience)
          .slice(0, 12)
      : []
  };
}

function fallbackEntities(article) {
  const text = articleNlpText(article);
  const words = text.match(/\b[A-Z][A-Za-z&.-]*(?:\s+[A-Z][A-Za-z&.-]*){0,3}\b/g) || [];

  const stop = new Set([
    "Financial Express", "Open", "Story", "Money", "Market", "Business", "India News", "Recently"
  ]);

  const counts = new Map();

  for (const raw of words) {
    const name = raw.trim();
    if (name.length < 3 || stop.has(name)) continue;
    counts.set(name, (counts.get(name) || 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, count]) => ({
      name,
      type: "LOCAL_KEYWORD",
      salience: Math.min(0.5, 0.08 * count),
      mentionCount: count
    }));
}

async function enrichArticlesWithNlp(articles, options = {}) {
  const maxArticles = Math.min(Math.max(Number(options.maxArticles || process.env.NLP_MAX_ARTICLES || 25), 1), 60);
  const enabled = isGoogleNlpEnabled(options);
  const enriched = [];
  const errors = [];
  let callsMade = 0;
  let fallbackCount = 0;

  for (let index = 0; index < articles.length; index += 1) {
    const article = articles[index];
    const text = articleNlpText(article);
    const cacheKey = hashText(`${article.url || ""}:${text}`);

    let nlp = nlpMemoryCache.get(cacheKey);

    if (!nlp) {
      if (enabled && callsMade < maxArticles) {
        try {
          nlp = await analyzeTextWithGoogleNlp(text);
          nlp.provider = "google-cloud-natural-language";
          callsMade += 1;
        } catch (error) {
          nlp = {
            provider: "local-fallback",
            language: "unknown",
            entities: fallbackEntities(article)
          };
          fallbackCount += 1;
          errors.push(error.message || "Google NLP failed for one article.");
        }
      } else {
        nlp = {
          provider: "local-fallback",
          language: "unknown",
          entities: fallbackEntities(article)
        };
        fallbackCount += 1;
      }

      nlpMemoryCache.set(cacheKey, nlp);
    }

    enriched.push({
      ...article,
      nlp
    });
  }

  return {
    articles: enriched,
    nlpStatus: {
      enabled,
      provider: enabled ? "google-cloud-natural-language" : "local-fallback",
      callsMade,
      maxCallsAllowedThisRequest: maxArticles,
      fallbackCount,
      errors: errors.slice(0, 5)
    }
  };
}

module.exports = {
  enrichArticlesWithNlp,
  isGoogleNlpEnabled
};
