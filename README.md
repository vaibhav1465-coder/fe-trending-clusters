# FE Trending Clusters

A Financial Express-style trending cluster module.

## What this product does

It fetches recent Financial Express articles from the last 2-3 days, groups them into FE-style topic chips, and shows related stories on the same page.

## APIs included

### 1. FE Article Source API

Endpoint:

```txt
/api/fe-articles?days=3
```

This is our own backend source layer. It collects recent FE article URLs from:

- Financial Express RSS feeds
- Financial Express public WordPress REST posts, where available
- Financial Express homepage and section-page article links

It returns cleaned article data:

- title
- URL
- section
- publish time
- summary
- source type

### 2. Trending Cluster API

Endpoint:

```txt
/api/trending-clusters?days=3&nlp=1
```

This creates topic chips using:

- article title
- summary
- section/category
- recency
- keyword overlap
- optional Google NLP entities

### 3. Google NLP enrichment

Google NLP is optional.

Enable it with:

```txt
USE_GOOGLE_NLP=true
GOOGLE_NLP_API_KEY=your_key_here
NLP_MAX_ARTICLES=25
```

When enabled, the backend uses Google Cloud Natural Language entity analysis to detect companies, products, topics, places and other entities from the article title and summary.

If NLP is not enabled, the product still works using local keyword/entity fallback.

## Local run

```powershell
cd D:\FE-Trending-Clusters
npm start
```

Open:

```txt
http://localhost:3000
```

Test APIs:

```txt
http://localhost:3000/api/fe-articles?days=3
http://localhost:3000/api/trending-clusters?days=3&nlp=1
```

## Vercel environment variables

Add these in Vercel only if Google NLP should be active:

```txt
USE_GOOGLE_NLP=true
GOOGLE_NLP_API_KEY=your_google_cloud_nlp_api_key
NLP_MAX_ARTICLES=25
```

Keep `NLP_MAX_ARTICLES` low for cost control.
