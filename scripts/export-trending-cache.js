const fs = require("fs");
const path = require("path");
const { getTrendingData } = require("../api/trending-clusters");

async function main() {
  const data = await getTrendingData({
    days: process.env.FE_LOOKBACK_DAYS || 3,
    maxClusters: process.env.FE_MAX_CLUSTERS || 12,
    maxArticlesPerCluster: process.env.FE_MAX_ARTICLES_PER_CLUSTER || 10
  });

  const outPath = path.join(process.cwd(), "public", "data", "trending-cache.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(data, null, 2), "utf8");

  console.log(`Exported cache: ${outPath}`);
  console.log(`${data.clusterCount} clusters | ${data.articleCount} articles`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
