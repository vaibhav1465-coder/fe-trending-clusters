const FE_ORIGIN = "https://www.financialexpress.com";

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "content-type",
    "cache-control": "public, max-age=180"
  });
  res.end(JSON.stringify(payload, null, 2));
}

function decodeEntities(value = "") {
  return String(value)
    .replace(/<!\[CDATA\[/g, "")
    .replace(/\]\]>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#8217;/g, "'")
    .replace(/&#8216;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&#8211;/g, "-")
    .replace(/&#8212;/g, "-")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, " ");
}

function cleanText(value = "") {
  return decodeEntities(String(value))
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getTag(block, tagName) {
  const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i");
  const match = block.match(regex);
  return match ? cleanText(match[1]) : "";
}

function getAllTags(block, tagName) {
  const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "gi");
  const values = [];
  let match;
  while ((match = regex.exec(block))) values.push(cleanText(match[1]));
  return values.filter(Boolean);
}

function safeIsoDate(value) {
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString();
  } catch {
    return null;
  }
}

function toTitleCase(value = "") {
  return String(value)
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}

function slugify(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function canonicalUrl(rawUrl = "") {
  try {
    let value = decodeEntities(String(rawUrl).trim());
    if (value.startsWith("//")) value = "https:" + value;
    if (value.startsWith("/")) value = FE_ORIGIN + value;
    const url = new URL(value);
    url.hash = "";
    url.search = "";
    return url.toString();
  } catch {
    return "";
  }
}

function isLikelyArticleUrl(rawUrl = "") {
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.replace(/^www\./, "");
    const pathName = url.pathname.toLowerCase();

    if (host !== "financialexpress.com") return false;
    if (!pathName || pathName === "/") return false;

    const blocked = [
      "/about", "/advertise", "/author/", "/category/", "/contact", "/epaper", "/feed", "/jobs",
      "/photos/", "/privacy", "/search", "/tag/", "/videos/", "/web-stories/", "/get-quote",
      "/market/stock-market/"
    ];

    if (blocked.some((part) => pathName.includes(part))) return false;

    const parts = pathName.split("/").filter(Boolean);
    const hasNumericId = /-\d{5,}\/?$/.test(pathName) || /\/\d{5,}\/?$/.test(pathName);
    return hasNumericId || parts.length >= 3;
  } catch {
    return false;
  }
}

function inferSectionFromUrl(rawUrl = "") {
  try {
    const url = new URL(rawUrl);
    const firstPart = url.pathname.split("/").filter(Boolean)[0] || "financial express";
    return toTitleCase(firstPart);
  } catch {
    return "Financial Express";
  }
}

function isWithinDays(article, days) {
  if (!article.publishedAt) return true;
  const published = new Date(article.publishedAt).getTime();
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return Number.isFinite(published) && published >= cutoff;
}

async function fetchWithTimeout(url, timeoutMs = 12000, headers = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers,
      signal: controller.signal
    });

    if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJsonWithTimeout(url, timeoutMs = 12000, headers = {}) {
  const text = await fetchWithTimeout(url, timeoutMs, headers);
  return JSON.parse(text);
}

module.exports = {
  FE_ORIGIN,
  sendJson,
  decodeEntities,
  cleanText,
  getTag,
  getAllTags,
  safeIsoDate,
  toTitleCase,
  slugify,
  canonicalUrl,
  isLikelyArticleUrl,
  inferSectionFromUrl,
  isWithinDays,
  fetchWithTimeout,
  fetchJsonWithTimeout
};
