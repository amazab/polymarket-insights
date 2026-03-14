import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// Initialize Gemini
let genai = null;
if (process.env.GEMINI_API_KEY) {
  genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  console.log('✅ Gemini AI initialized');
} else {
  console.warn('⚠️  GEMINI_API_KEY not set in .env — AI analysis will be unavailable');
}

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

// ============================================
// AI ANALYSIS ENDPOINT (Gemini)
// ============================================

const ANALYSIS_PROMPT = `You are an expert prediction market analyst. Your job is to analyze a Polymarket betting event and determine if there is a profitable opportunity.

You will receive structured data about a prediction market event including:
- The event title and description
- Current outcome probabilities (prices)
- Trading volume and liquidity data
- Recent news headlines about the topic
- Market metadata (topic, risk score, days until resolution)

Based on ALL available evidence, provide your analysis as a JSON object with these EXACT fields:

{
  "verdict": "OPPORTUNITY" | "HOLD" | "AVOID",
  "confidence": <number 0-100>,
  "reasoning": "<2-3 sentence analysis explaining your verdict>",
  "edge": "<1 sentence describing the specific market inefficiency or opportunity, or why none exists>",
  "suggestedOutcome": "<the specific outcome to bet on, or 'None' if HOLD/AVOID>",
  "suggestedPrice": "<the fair probability you estimate for the suggested outcome, e.g. '72%', or 'N/A'>",
  "riskWarnings": ["<warning 1>", "<warning 2>"]
}

IMPORTANT RULES:
- OPPORTUNITY = you believe the market price is significantly wrong (>5% mispricing) AND there's strong evidence for a different probability
- HOLD = interesting market but no clear mispricing, or evidence is mixed
- AVOID = market is efficient, too risky, too illiquid, or too uncertain to have an edge
- Be CONSERVATIVE. Most markets are efficiently priced. Only call OPPORTUNITY when evidence strongly supports it.
- Consider liquidity — thin markets are riskier even if mispriced
- Consider time decay — markets close to resolution with high certainty are less interesting
- News recency matters — recent developments may not yet be priced in (this is where opportunities arise)
- ALWAYS respond with valid JSON only, no markdown formatting around it`;

app.post('/api/analyze', async (req, res) => {
  if (!genai) {
    return res.status(503).json({
      error: 'AI not configured',
      message: 'Set GEMINI_API_KEY in .env file to enable AI analysis'
    });
  }

  const { event } = req.body;
  if (!event) {
    return res.status(400).json({ error: 'Event data is required' });
  }

  try {
    // Build the analysis context
    const context = JSON.stringify(event, null, 2);
    const userPrompt = `Analyze this prediction market event and provide your verdict:\n\n${context}`;

    // Retry logic for rate limiting
    let response;
    const maxRetries = 3;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        response = await genai.models.generateContent({
          model: 'gemini-2.0-flash',
          contents: userPrompt,
          config: {
            systemInstruction: ANALYSIS_PROMPT,
            temperature: 0.3,
            maxOutputTokens: 1000,
          }
        });
        break; // Success — exit retry loop
      } catch (apiError) {
        if (apiError.status === 429 && attempt < maxRetries) {
          const delay = Math.pow(2, attempt + 1) * 5000; // 10s, 20s, 40s
          console.log(`Rate limited, retrying in ${delay / 1000}s (attempt ${attempt + 1}/${maxRetries})...`);
          await new Promise(r => setTimeout(r, delay));
        } else {
          throw apiError;
        }
      }
    }

    const text = response.text.trim();

    // Parse the JSON from the response (strip markdown fences if present)
    let jsonStr = text;
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    const analysis = JSON.parse(jsonStr);

    // Validate required fields
    const required = ['verdict', 'confidence', 'reasoning', 'edge', 'suggestedOutcome', 'riskWarnings'];
    for (const field of required) {
      if (!(field in analysis)) {
        throw new Error(`Missing field: ${field}`);
      }
    }

    // Normalize verdict
    analysis.verdict = analysis.verdict.toUpperCase();
    if (!['OPPORTUNITY', 'HOLD', 'AVOID'].includes(analysis.verdict)) {
      analysis.verdict = 'HOLD';
    }

    // Clamp confidence
    analysis.confidence = Math.max(0, Math.min(100, parseInt(analysis.confidence) || 50));

    res.json(analysis);
  } catch (error) {
    console.error('AI analysis error:', error);
    res.status(500).json({
      error: 'AI analysis failed',
      message: error.message,
      // Provide a fallback verdict
      fallback: {
        verdict: 'HOLD',
        confidence: 0,
        reasoning: 'Unable to complete AI analysis. Please check your API key and try again.',
        edge: 'Analysis unavailable',
        suggestedOutcome: 'None',
        suggestedPrice: 'N/A',
        riskWarnings: ['AI analysis failed — manual review recommended']
      }
    });
  }
});

app.listen(PORT, () => {
  console.log(`🔍 Polymarket Insights proxy server running on http://localhost:${PORT}`);
});
