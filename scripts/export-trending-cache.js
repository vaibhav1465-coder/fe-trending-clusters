const fs = require("fs");
const path = require("path");
const { loadEnv } = require("../lib/env-loader");

// Important:
// The local cache export runs outside server.js, so it must load .env here.
// Otherwise Google NLP stays off while creating public/data/trending-cache.json.
loadEnv(path.join(__dirname, ".."));

const { getTrendingData } = require("../api/trending-clusters");

async function main() {
  const data = await getTrendingData({
    days: process.env.FE_LOOKBACK_DAYS || 3,
    maxClusters: process.env.FE_MAX_CLUSTERS || 12,
    maxArticlesPerCluster: process.env.FE_MAX_ARTICLES_PER_CLUSTER || 12,
    useNlp: true
  });

  const outPath = path.join(process.cwd(), "public", "data", "trending-cache.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(data, null, 2), "utf8");

  console.log(`Exported cache: ${outPath}`);
  console.log(`${data.clusterCount} clusters | ${data.articleCount} articles`);
  console.log(`Google NLP enabled: ${data.nlpStatus && data.nlpStatus.enabled}`);
  console.log(`Google NLP calls made: ${data.nlpStatus ? data.nlpStatus.callsMade : 0}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
