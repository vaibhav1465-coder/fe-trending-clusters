const { sendJson } = require("../lib/utils");
const { fetchRecentFeArticles } = require("../lib/fe-source");

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
    const requestUrl = new URL(req.url || "/api/fe-articles", "http://localhost");
    const days = requestUrl.searchParams.get("days") || process.env.FE_LOOKBACK_DAYS || 3;
    const maxArticles = requestUrl.searchParams.get("limit") || process.env.FE_MAX_ARTICLES || 220;
    const data = await fetchRecentFeArticles({ days, maxArticles });

    sendJson(res, 200, data);
  } catch (error) {
    sendJson(res, 500, {
      ok: false,
      sourceName: "Financial Express article source API",
      error: error.message || "Could not fetch FE articles."
    });
  }
}

module.exports = handler;
module.exports.fetchRecentFeArticles = fetchRecentFeArticles;
