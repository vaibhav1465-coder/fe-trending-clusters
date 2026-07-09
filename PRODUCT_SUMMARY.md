# FE Trending Clusters - Short Product Summary

## What it is

FE Trending Clusters is a Financial Express-style homepage discovery module. It replaces static stock-style chips with dynamic trending topic chips created from recent Financial Express stories.

## User flow

1. User sees horizontal topic chips below the FE menu.
2. User clicks a cluster chip.
3. Related FE articles open in a horizontal strip on the same page.
4. Clicking the same cluster again closes the strip.
5. Clicking an article opens the FE article in a new tab with UTM tracking.

## How articles are fetched

The backend uses the FE Article Source API:

```txt
/api/fe-articles?days=3
```

This is an internal backend source layer. It fetches recent FE article URLs from:

- Financial Express RSS feeds
- Financial Express public WordPress REST posts where available
- Financial Express homepage and section-page links

The API cleans the data and keeps:

- Title
- URL
- Section
- Publish time
- Summary/excerpt
- Source type

## How clusters are created

The cluster API is:

```txt
/api/trending-clusters?days=3&nlp=1
```

It creates clusters using:

- Article title
- Article summary
- Section/category
- Recency
- Keyword overlap
- Google NLP entities

## Google NLP use

Google Cloud Natural Language API is used only on the backend. It extracts entities from article titles and summaries, such as companies, organizations, people, places, products, markets and financial topics.

The API key is never exposed in frontend code or GitHub.

Local secret storage:

```txt
D:\FE-Trending-Clusters\.env
```

Vercel secret storage:

```txt
Vercel Project Settings -> Environment Variables
```

## Tracking

Every article click gets UTM parameters:

```txt
utm_source=fe_trending_cluster
utm_medium=homepage_chip
utm_campaign=whats_trending_today
utm_content=<cluster_name>
```

## APIs used

```txt
/api/fe-articles
/api/trending-clusters
/api/nlp-status
Google Cloud Natural Language API
```

## Current status

- Live FE source fetching: working
- Google NLP: working
- UTM tracking: added
- Registration form: not included
- Feedback form: not included
- Mobile-friendly horizontal layout: added
