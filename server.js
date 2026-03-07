import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';

const app = express();
const PORT = 3001;

app.use(cors());

// Parse Google News RSS feed into article objects
function parseRSSItems(xml) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null && items.length < 5) {
    const content = match[1];
    const title = content.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1') || '';
    const link = content.match(/<link>([\s\S]*?)<\/link>/)?.[1] || '';
    const pubDate = content.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] || '';
    const source = content.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1]?.replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1') || '';
    const description = content.match(/<description>([\s\S]*?)<\/description>/)?.[1]?.replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1')?.replace(/<[^>]+>/g, '') || '';

    if (title && link) {
      items.push({
        title: decodeHTMLEntities(title),
        url: link.trim(),
        snippet: decodeHTMLEntities(description).substring(0, 200),
        source: decodeHTMLEntities(source) || extractDomain(link),
        date: pubDate
      });
    }
  }
  return items;
}

function decodeHTMLEntities(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/');
}

function extractDomain(url) {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return '';
  }
}

// Proxy endpoint for Polymarket Gamma API (avoids CORS issues)
app.get('/api/polymarket/*', async (req, res) => {
  try {
    const path = req.params[0]; // everything after /api/polymarket/
    const queryString = new URLSearchParams(req.query).toString();
    const url = `https://gamma-api.polymarket.com/${path}${queryString ? '?' + queryString : ''}`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: `Polymarket API returned ${response.status}` });
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Polymarket proxy error:', error);
    res.status(500).json({ error: 'Polymarket proxy failed', details: error.message });
  }
});

// Search endpoint — uses Google News RSS (no API key needed)
app.get('/api/search', async (req, res) => {
  const query = req.query.q;
  if (!query) {
    return res.status(400).json({ error: 'Query parameter "q" is required' });
  }

  try {
    const encodedQuery = encodeURIComponent(query);

    // Fetch from Google News RSS
    const googleNewsUrl = `https://news.google.com/rss/search?q=${encodedQuery}&hl=en-US&gl=US&ceid=US:en`;
    const response = await fetch(googleNewsUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    });

    let articles = [];
    if (response.ok) {
      const xml = await response.text();
      articles = parseRSSItems(xml);
    }

    // If Google News didn't return enough, try DuckDuckGo as backup
    if (articles.length < 3) {
      try {
        const ddgUrl = `https://api.duckduckgo.com/?q=${encodedQuery}&format=json&no_redirect=1&no_html=1`;
        const ddgResponse = await fetch(ddgUrl);
        if (ddgResponse.ok) {
          const ddgData = await ddgResponse.json();

          // Add related topics
          const relatedTopics = ddgData.RelatedTopics || [];
          for (const topic of relatedTopics.slice(0, 5 - articles.length)) {
            if (topic.Text && topic.FirstURL) {
              articles.push({
                title: topic.Text.substring(0, 100),
                url: topic.FirstURL,
                snippet: topic.Text,
                source: extractDomain(topic.FirstURL),
                date: ''
              });
            }
          }

          // Add abstract if available
          if (ddgData.Abstract && ddgData.AbstractURL) {
            articles.unshift({
              title: ddgData.Heading || query,
              url: ddgData.AbstractURL,
              snippet: ddgData.Abstract,
              source: ddgData.AbstractSource || extractDomain(ddgData.AbstractURL),
              date: ''
            });
          }
        }
      } catch (e) {
        // DuckDuckGo backup failed, continue with what we have
      }
    }

    res.json({ results: articles.slice(0, 6) });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Search failed', details: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🔍 Polymarket Insights proxy server running on http://localhost:${PORT}`);
});
