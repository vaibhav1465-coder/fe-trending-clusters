const { fetchRecentFeArticles } = require("../lib/fe-source");
const { getTrendingData } = require("../api/trending-clusters");

async function main() {
  console.log("Testing FE Article Source API logic...");
  const articles = await fetchRecentFeArticles({ days: 3, maxArticles: 30 });
  console.log(`FE articles found: ${articles.articleCount}`);

  console.log("Testing Trending Cluster API logic...");
  const clusters = await getTrendingData({ days: 3, maxClusters: 12, maxArticlesPerCluster: 10, useNlp: true });
  console.log(`Clusters found: ${clusters.clusterCount}`);
  console.log(`Google NLP status: ${clusters.nlpStatus.enabled ? "enabled" : "off/fallback"}`);
  console.log(`Google NLP calls made: ${clusters.nlpStatus.callsMade}`);
  console.log("Done.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
