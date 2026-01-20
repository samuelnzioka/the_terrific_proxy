/***********************
 * The Terrific Proxy
 * server.js (Node 18+ / 24 CLEAN FIX)
 ***********************/

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const PORT = process.env.PORT || 4000;

const app = express();

app.use(cors());
app.use(express.json());

// =========================
//   WARS – GUARDIAN API
// =========================
app.get("/api/wars", async (req, res) => {
  try {
    const page = Number(req.query.page || 1);
    
    const url =
      `https://content.guardianapis.com/search` +
      `?section=world` +
      `&q=war OR conflict OR military OR geopolitics` +
      `&show-fields=trailText,thumbnail` +
      `&order-by=newest` +
      `&page-size=10` +
      `&page=${page}` +
      `&api-key=${process.env.GUARDIAN_API_KEY}`;

    const response = await fetch(url);
    const json = await response.json();

    if (!json.response || !json.response.results) {
      throw new Error('Invalid Guardian response');
    }

    const articles = json.response?.results?.map(item => ({
      id: item.id,
      title: item.webTitle,
      summary: item.fields?.trailText || '',
      image: item.fields?.thumbnail || null,
      date: item.webPublicationDate,
      source: 'The Guardian'
    })) || [];

    res.json({
      articles,
      hasMore: page < json.response.pages
    });

  } catch (err) {
    console.error('Guardian Wars API Error:', err.message);
    res.status(500).json({
      error: 'Failed to load wars data',
      details: err.message
    });
  }
});

// =========================
//   WARS – FULL ARTICLE (GUARDIAN CONTENT)
// =========================
app.get("/api/wars/article", async (req, res) => {
  try {
    const id = (req.query.id || "").toString().trim();

    if (!id) {
      return res.status(400).json({
        error: "Missing required query param: id"
      });
    }

    if (!process.env.GUARDIAN_API_KEY) {
      return res.status(500).json({
        error: "Server misconfigured: missing GUARDIAN_API_KEY"
      });
    }

    const safeId = id
      .split("/")
      .map(seg => encodeURIComponent(seg))
      .join("/");

    const url =
      `https://content.guardianapis.com/${safeId}` +
      `?show-fields=trailText,thumbnail,body,bodyText` +
      `&api-key=${process.env.GUARDIAN_API_KEY}`;

    const response = await fetch(url);
    const contentType = response.headers.get("content-type") || "";

    // Guardian should return JSON, but be defensive.
    const rawText = contentType.includes("application/json")
      ? null
      : await response.text();

    if (!response.ok) {
      if (rawText !== null) {
        return res.status(response.status).json({
          error: "Failed to load wars article",
          details: rawText.slice(0, 500)
        });
      }

      const errJson = await response.json();
      const details = errJson?.response?.message || errJson?.message || `Guardian HTTP ${response.status}`;
      return res.status(response.status).json({
        error: "Failed to load wars article",
        details
      });
    }

    const json = rawText !== null ? null : await response.json();
    const content = json?.response?.content;
    if (!content) {
      throw new Error("Invalid Guardian article response");
    }

    res.json({
      id: content.id,
      title: content.webTitle,
      summary: content.fields?.trailText || "",
      image: content.fields?.thumbnail || null,
      date: content.webPublicationDate,
      source: "The Guardian",
      url: content.webUrl,
      body: content.fields?.body ?? content.fields?.bodyText ?? ""
    });
  } catch (err) {
    console.error("Guardian Wars Article API Error:", err.message);
    res.status(500).json({
      error: "Failed to load wars article",
      details: err.message
    });
  }
});

// =========================
//   REDDIT – MEMES (ENDLESS)
// =========================
app.get("/api/memes", async (req, res) => {
  try {
    const after = req.query.after || "";

    const url =
      `https://old.reddit.com/r/PoliticalHumor+NonCredibleDefense/hot.json` +
      `?limit=10&after=${after}`;

    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) TheTerrific/1.0"
      }
    });

    const data = await response.json();

    const result = {
      after: data.data.after,
      memes: data.data.children.map(p => ({
        title: p.data.title,
        image: p.data.url,
        subreddit: p.data.subreddit_name_prefixed,
        permalink: `https://reddit.com${p.data.permalink}`
      }))
    };

    res.json(result);

  } catch (err) {
    console.error("Reddit API Error:", err.message);
    res.status(500).json({
      error: "Failed to fetch memes",
      details: err.message
    });
  }
});

// =========================
//   EXPLAINERS – GUARDIAN API
// =========================
app.get("/api/explainers", async (req, res) => {
  try {
    const page = Number(req.query.page || 1);

    const url =
      `https://content.guardianapis.com/search` +
      `?q=geopolitics OR propaganda OR war OR information warfare` +
      `&section=world|politics|international` +
      `&show-fields=headline,trailText,bodyText,thumbnail` +
      `&order-by=newest` +
      `&page-size=6` +
      `&page=${page}` +
      `&api-key=${process.env.GUARDIAN_API_KEY}`;

    const response = await fetch(url);
    const data = await response.json();

    if (!data.response || !data.response.results) {
      return res.json({
        page: page,
        explainers: []
      });
    }

    const articles = data.response.results.map(a => ({
      id: a.id,
      title: a.webTitle,
      summary: a.fields?.trailText || '',
      body: a.fields?.bodyText || '',
      image: a.fields?.thumbnail || null,
      date: a.webPublicationDate,
      source: 'The Guardian',
      url: a.webUrl
    }));

    res.json({
      page: page,
      explainers: articles
    });

  } catch (err) {
    console.error("Guardian Explainers API Error:", err.message);
    res.status(500).json({
      error: "Failed to load explainers data",
      details: err.message
    });
  }
});

// =========================
//   SPORTS – NEWSAPI
// =========================
app.get("/api/sports", async (req, res) => {
  try {
    const sport = req.query.sport || "soccer";
    const page = Number(req.query.page || 1);
    
    let apiKey;
    let q;

    // Use different API keys and queries based on sport
    if (process.env.NEWSAPI_KEY) {
      apiKey = process.env.NEWSAPI_KEY;
      q = sport;
    } else if (process.env.NEWS_API_KEY) {
      apiKey = process.env.NEWS_API_KEY;
      q = sport;
    } else {
      throw new Error('No NewsAPI key found');
    }

    const url =
      `https://newsapi.org/v2/everything` +
      `?q=${encodeURIComponent(q)}` +
      `&language=en` +
      `&sortBy=publishedAt` +
      `&pageSize=8` +
      `&page=${page}` +
      `&apiKey=${apiKey}`;

    const response = await fetch(url);
    
    console.log(`🔍 Sports API URL: ${url.replace(/apiKey=[^&]*/, 'apiKey=HIDDEN')}`);
    console.log(`🔑 API Key loaded: ${apiKey ? 'YES' : 'NO'}`);
    console.log(`🔑 Available keys:`, Object.keys(process.env).filter(k => k.includes('NEWS')));
    console.log(`📊 Response status: ${response.status}`);

    const data = await response.json();
    console.log(`📦 NewsAPI response:`, data);

    if (data.status === "error") {
      throw new Error(data.message || 'NewsAPI error');
    }

    const articles = data.articles.map(a => ({
      id: a.url, // NewsAPI has no id, use URL
      title: a.title,
      summary: a.description || "",
      body: a.content || "",
      image: a.urlToImage || null,
      source: a.source?.name || "NewsAPI",
      published: a.publishedAt,
      url: a.url
    }));

    res.json({
      sport,
      page,
      sports: articles
    });

  } catch (err) {
    console.error("Sports NewsAPI error:", err);
    res.status(500).json({ sport: req.query.sport || "soccer", page: 1, sports: [] });
  }
});

// =========================
//   YOUTUBE - PROPAGANDA ANALYSIS
// =========================
app.get("/api/youtube", async (req, res) => {
  try {
    const query = req.query.q || "information warfare geopolitics propaganda media manipulation";
    const pageToken = req.query.pageToken || null;
    const publishedAfter = req.query.publishedAfter || null;

    let url = `https://www.googleapis.com/youtube/v3/search` +
      `?part=snippet` +
      `&q=${encodeURIComponent(query)}` +
      `&type=video` +
      `&maxResults=10` +
      `&order=relevance` +
      `&key=${process.env.YOUTUBE_API_KEY}`;

    if (pageToken) {
      url += `&pageToken=${pageToken}`;
    }

    if (publishedAfter) {
      url += `&publishedAfter=${publishedAfter}`;
    }

    console.log('YouTube API URL:', url);

    const response = await fetch(url);
    const data = await response.json();

    if (!data.items || data.items.length === 0) {
      return res.json({
        videos: [],
        nextPageToken: null
      });
    }

    const videos = data.items.map(item => ({
      videoId: item.id.videoId,
      title: item.snippet.title,
      description: item.snippet.description,
      channel: item.snippet.channelTitle,
      publishedAt: item.snippet.publishedAt,
      thumbnail: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url
    }));

    res.json({
      videos,
      nextPageToken: data.nextPageToken || null
    });

  } catch (err) {
    console.error("YouTube API Error:", err.message);
    res.status(500).json({
      error: "Failed to fetch YouTube videos",
      details: err.message
    });
  }
});

// =========================
//   HEALTH CHECK
// =========================
app.get('/', (req, res) => {
  res.send('The Terrific proxy server is running.');
});

app.listen(PORT, () => {
  console.log(`✅ Proxy server running on port ${PORT}`);
});
