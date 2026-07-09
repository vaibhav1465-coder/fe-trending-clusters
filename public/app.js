const state = {
  clusters: [],
  selectedClusterId: null,
  apiData: null,
  isClusterOpen: false
};

const clusterChips = document.getElementById("clusterChips");
const selectedTitle = document.getElementById("selectedTitle");
const selectedDescription = document.getElementById("selectedDescription");
const articlesEl = document.getElementById("articles");
const statusLine = document.getElementById("statusLine");
const refreshBtn = document.getElementById("refreshBtn");

function formatDate(value) {
  if (!value) return "Recently";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";

  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function safeText(value) {
  return String(value || "").replace(/[<>&"]/g, (character) => ({
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
    '"': "&quot;"
  }[character]));
}

function clusterUtmValue(value) {
  return String(value || "top-fe-stories")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function addUtm(url, cluster) {
  try {
    const parsed = new URL(url);
    parsed.searchParams.set("utm_source", "fe_trending_cluster");
    parsed.searchParams.set("utm_medium", "homepage_chip");
    parsed.searchParams.set("utm_campaign", "whats_trending_today");
    parsed.searchParams.set("utm_content", clusterUtmValue(cluster.name));
    return parsed.toString();
  } catch {
    return url;
  }
}

function renderStatus(data) {
  const sourceMode = String(data.sourceMode || "");
  const sourceLabel = sourceMode.startsWith("cached")
    ? "Cached data"
    : sourceMode === "no-live-data"
      ? "No live data"
      : "Live FE sources";

  let nlpLabel = "Google NLP off/fallback";
  if (data.nlpStatus && data.nlpStatus.enabled) {
    nlpLabel = `Google NLP on: ${data.nlpStatus.callsMade} calls`;
    if (Array.isArray(data.nlpStatus.errors) && data.nlpStatus.errors.length) {
      nlpLabel += " with fallback errors";
    }
  }

  statusLine.textContent = `${sourceLabel} | ${data.clusterCount || 0} clusters | ${data.articleCount || 0} articles | ${nlpLabel} | Updated ${formatDate(data.generatedAt || data.servedAt)}`;
}

function renderChips() {
  if (!state.clusters.length) {
    clusterChips.innerHTML = "";
    return;
  }

  clusterChips.innerHTML = state.clusters.map((cluster) => {
    const active = cluster.id === state.selectedClusterId && state.isClusterOpen ? "active" : "";
    return `
      <button class="topic-chip ${active}" type="button" data-id="${safeText(cluster.id)}">
        ${safeText(cluster.name)}
        <span class="chip-count">${cluster.articleCount || 0}</span>
      </button>
    `;
  }).join("");

  clusterChips.querySelectorAll(".topic-chip").forEach((button) => {
    button.addEventListener("click", () => {
      const clickedId = button.dataset.id;

      if (state.selectedClusterId === clickedId && state.isClusterOpen) {
        state.isClusterOpen = false;
      } else {
        state.selectedClusterId = clickedId;
        state.isClusterOpen = true;
      }

      renderAll();

      if (state.isClusterOpen) {
        document.querySelector(".cluster-detail-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  });
}

function getHomepageItems() {
  const items = [];

  state.clusters.forEach((cluster) => {
    (cluster.articles || []).slice(0, 1).forEach((article) => {
      items.push({ cluster, article });
    });
  });

  return items.slice(0, 8);
}

function renderHomepageWidget() {
  selectedTitle.textContent = "What's trending on Financial Express";
  selectedDescription.textContent = "Quick topic chips above help readers discover recent stories from the last 2-3 days.";

  const items = getHomepageItems();

  if (!items.length) {
    articlesEl.innerHTML = "";
    return;
  }

  articlesEl.innerHTML = `
    <div class="home-widget">
      <div class="home-widget-head">
        <strong>Top stories across trending clusters</strong>
        <span>Click a cluster chip above to expand more related stories.</span>
      </div>
      <div class="home-widget-strip">
        ${items.map(({ cluster, article }, index) => {
          const targetUrl = addUtm(article.url, cluster);
          return `
            <a class="home-story" href="${targetUrl}" target="_blank" rel="noopener noreferrer">
              <span>${safeText(cluster.name)}</span>
              <strong>${safeText(article.title)}</strong>
              <em>${index + 1}</em>
            </a>
          `;
        }).join("")}
      </div>
    </div>
  `;
}

function renderArticles(cluster) {
  if (!cluster || !cluster.articles || !cluster.articles.length) {
    articlesEl.innerHTML = `
      <div class="empty-state">
        <strong>No trending clusters found right now.</strong>
        <span>The FE source may be temporarily blocked or unavailable. Try Refresh after a few minutes.</span>
      </div>
    `;
    return;
  }

  articlesEl.innerHTML = `
    <div class="horizontal-pages" aria-label="${safeText(cluster.name)} articles">
      ${cluster.articles.map((article, index) => {
        const targetUrl = addUtm(article.url, cluster);

        return `
          <a class="page-link-card" href="${targetUrl}" target="_blank" rel="noopener noreferrer">
            <span class="page-number">${index + 1}</span>
            <span class="page-meta">
              <b>${safeText(article.section || "FE")}</b>
              <em>${formatDate(article.publishedAt)}</em>
            </span>
            <strong>${safeText(article.title)}</strong>
            <span class="open-label">Open full story</span>
          </a>
        `;
      }).join("")}
    </div>
  `;
}

function renderAll() {
  renderChips();

  if (!state.isClusterOpen) {
    renderHomepageWidget();
    return;
  }

  const selected = state.clusters.find((cluster) => cluster.id === state.selectedClusterId) || state.clusters[0];

  if (!selected) {
    selectedTitle.textContent = "No clusters available";
    selectedDescription.textContent = "Once FE articles are fetched, trending topic chips will appear above.";
    renderArticles(null);
    return;
  }

  state.selectedClusterId = selected.id;
  selectedTitle.textContent = selected.name;
  selectedDescription.textContent = selected.description || "Recent Financial Express stories grouped into this trend cluster.";
  renderArticles(selected);
}

async function loadData(force = false) {
  refreshBtn.disabled = true;
  refreshBtn.textContent = "Loading...";
  statusLine.textContent = "Fetching live FE articles and clustering...";

  try {
    const response = await fetch(`/api/trending-clusters?days=3&clusters=12&articles=12&nlp=1${force ? "&forceLive=1&refresh=1&t=" + Date.now() : ""}`, {
      cache: "no-store"
    });

    if (!response.ok) throw new Error(`API returned ${response.status}`);

    const data = await response.json();

    state.apiData = data;
    state.clusters = Array.isArray(data.clusters) ? data.clusters : [];
    state.selectedClusterId = null;
    state.isClusterOpen = false;

    renderStatus(data);
    renderAll();
  } catch (error) {
    statusLine.textContent = "API unavailable";
    selectedTitle.textContent = "Unable to load clusters";
    selectedDescription.textContent = "Please check the local server and FE source API.";
    articlesEl.innerHTML = `
      <div class="empty-state">
        <strong>Something went wrong.</strong>
        <span>${safeText(error.message || "Unknown error")}</span>
      </div>
    `;
  } finally {
    refreshBtn.disabled = false;
    refreshBtn.textContent = "Refresh";
  }
}

refreshBtn.addEventListener("click", () => loadData(true));
loadData();





