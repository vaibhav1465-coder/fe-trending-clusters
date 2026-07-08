const path = require("path");
const { loadEnv } = require("./lib/env-loader");

// Load local .env before any API handlers run.
// This keeps GOOGLE_NLP_API_KEY server-side only.
loadEnv(__dirname);

const http = require("http");
const fs = require("fs");

const trendingClustersHandler = require("./api/trending-clusters");
const feArticlesHandler = require("./api/fe-articles");
const nlpStatusHandler = require("./api/nlp-status");

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, "public");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

function serveStatic(req, res) {
  const requestUrl = new URL(req.url, `http://localhost:${PORT}`);
  let requestedPath = decodeURIComponent(requestUrl.pathname);

  if (requestedPath === "/") requestedPath = "/index.html";

  const safePath = path.normalize(requestedPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(PUBLIC_DIR, safePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "content-type": MIME_TYPES[ext] || "application/octet-stream",
      "cache-control": "public, max-age=0, must-revalidate"
    });
    res.end(content);
  });
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith("/api/nlp-status")) {
    nlpStatusHandler(req, res);
    return;
  }

  if (req.url.startsWith("/api/fe-articles")) {
    feArticlesHandler(req, res);
    return;
  }

  if (req.url.startsWith("/api/trending-clusters")) {
    trendingClustersHandler(req, res);
    return;
  }

  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log("");
  console.log("FE Trending Clusters is running.");
  console.log(`Open:       http://localhost:${PORT}`);
  console.log(`NLP check:  http://localhost:${PORT}/api/nlp-status`);
  console.log(`Articles:   http://localhost:${PORT}/api/fe-articles?days=3`);
  console.log(`Clusters:   http://localhost:${PORT}/api/trending-clusters?days=3&nlp=1`);
  console.log("");
});
