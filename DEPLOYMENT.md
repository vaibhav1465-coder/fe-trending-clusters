# Deployment Notes

## Local run

```powershell
cd D:\FE-Trending-Clusters
node server.js
```

Open:

```txt
http://localhost:3000
```

## Local checks

```txt
http://localhost:3000/api/nlp-status
http://localhost:3000/api/fe-articles?days=3
http://localhost:3000/api/trending-clusters?days=3&nlp=1
```

## Required Vercel environment variables

Add these in Vercel Project Settings -> Environment Variables:

```txt
USE_GOOGLE_NLP=true
GOOGLE_NLP_API_KEY=<hidden Google NLP key>
NLP_MAX_ARTICLES=25
FE_LOOKBACK_DAYS=3
FE_MAX_ARTICLES=220
FE_MAX_CLUSTERS=12
FE_MAX_ARTICLES_PER_CLUSTER=12
```

Do not add the API key to GitHub or frontend files.

## Git safety check before every push

```powershell
git check-ignore .env
```

Expected output:

```txt
.env
```
