const { sendJson } = require("../lib/utils");
const { getEnvStatus } = require("../lib/env-loader");

function handler(req, res) {
  const envStatus = getEnvStatus();
  const useGoogleNlp = String(process.env.USE_GOOGLE_NLP || "").toLowerCase() === "true";
  const hasGoogleNlpKey = Boolean(process.env.GOOGLE_NLP_API_KEY);

  sendJson(res, 200, {
    ok: true,
    envFileFound: envStatus.envFileFound,
    envPath: envStatus.envPath,
    loadedKeys: envStatus.loadedKeys.filter((key) => key !== "GOOGLE_NLP_API_KEY"),
    useGoogleNlp,
    googleNlpKeyConfigured: hasGoogleNlpKey,
    googleNlpStatus: useGoogleNlp && hasGoogleNlpKey ? "ready" : "off_or_missing_key",
    nlpMaxArticles: process.env.NLP_MAX_ARTICLES || "25",
    note: "This endpoint does not expose secret key values."
  });
}

module.exports = handler;
