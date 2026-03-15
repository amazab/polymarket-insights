// ============================================
// POLYMARKET INSIGHTS — CLIENT APPLICATION
// ============================================

// ==========================================
// REDDIT SENTIMENT 
// ==========================================

async function fetchRedditSentiment(query) {
  try {
    const response = await fetch(`${PROXY_API}/api/reddit?q=${encodeURIComponent(query)}`);
    if (!response.ok) throw new Error('Reddit fetch failed');
    const data = await response.json();
    return data.posts || [];
  } catch (err) {
    console.error('Reddit sentiment error:', err);
    return [];
  }
}

function renderRedditSentiment(index, posts) {
  const panel = document.getElementById(`panel-reddit-${index}`);
  if (!panel) return;

  if (!posts || !posts.length) {
    panel.innerHTML = `<p class="no-insights">No recent Reddit discussions found.</p>`;
    return;
  }

  panel.innerHTML = `
    <div class="insights-list">
      ${posts.map(post => `
        <a class="insight-item" href="${post.url}" target="_blank" rel="noopener">
          <div class="insight-title" style="margin-bottom: 8px;">${post.title}</div>
          <div class="insight-meta" style="display: flex; gap: 15px; align-items: center;">
            <span class="insight-source" style="color: #ff4500;">r/${post.subreddit}</span>
            <span style="display: flex; align-items: center; gap: 4px; color: var(--text-muted);">
              <span>⬆️</span> ${post.upvotes}
            </span>
            <span style="display: flex; align-items: center; gap: 4px; color: var(--text-muted);">
              <span>💬</span> ${post.comments}
            </span>
            ${post.date ? `<span style="color: var(--text-muted);">· ${timeAgo(post.date)}</span>` : ''}
          </div>
        </a>
      `).join('')}
    </div>
  `;
}

// ==========================================
// RENDERERS
// ============================================

const POLYMARKET_API = 'https://gamma-api.polymarket.com';
const PROXY_API = 'http://localhost:3001';

// ---- Categories ----

const CATEGORIES = [
  { slug: 'all', label: 'Trending', icon: '🔥', query: '' },
  { slug: 'politics', label: 'Politics', icon: '🏛️', query: 'politics' },
  { slug: 'crypto', label: 'Crypto', icon: '₿', query: 'crypto' },
  { slug: 'sports', label: 'Sports', icon: '⚽', query: 'sports' },
  { slug: 'pop-culture', label: 'Pop Culture', icon: '🎬', query: 'pop culture' },
  { slug: 'business', label: 'Business', icon: '💼', query: 'business' },
  { slug: 'science', label: 'Science', icon: '🔬', query: 'science' },
];

// Cache for fetched events per category
const categoryCache = {};
let allEvents = [];

// AI provider configuration (set by API key dialog)
let aiConfig = { provider: 'gemini', apiKey: null, useDefault: true };

// ---- Data Fetching ----

async function fetchAllEvents() {
  const url = `${PROXY_API}/api/polymarket/events?limit=50&order=volume24hr&ascending=false&active=true&closed=false`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Polymarket API error: ${response.status}`);
  return await response.json();
}

function categorizeEvent(event) {
  const text = `${event.title} ${event.description || ''} ${(event.tags || []).map(t => t.label || t.slug || '').join(' ')}`.toLowerCase();

  const rules = [
    { slug: 'politics', keywords: ['president', 'election', 'congress', 'senate', 'democrat', 'republican', 'trump', 'biden', 'government', 'political', 'vote', 'governor', 'mayor', 'party', 'legislation', 'tariff', 'fed ', 'federal', 'primaries', 'cabinet', 'impeach'] },
    { slug: 'crypto', keywords: ['bitcoin', 'ethereum', 'crypto', 'btc', 'eth', 'token', 'blockchain', 'defi', 'nft', 'solana', 'altcoin', 'coin', 'web3', 'doge', 'memecoin'] },
    { slug: 'sports', keywords: ['nba', 'nfl', 'mlb', 'nhl', 'soccer', 'football', 'basketball', 'baseball', 'tennis', 'ufc', 'boxing', 'f1', 'championship', 'playoff', 'mvp', 'super bowl', 'world cup', 'olympics'] },
    { slug: 'pop-culture', keywords: ['movie', 'film', 'oscar', 'grammy', 'celebrity', 'music', 'album', 'award', 'tv show', 'netflix', 'tiktok', 'kardashian', 'taylor swift', 'concert', 'entertainment'] },
    { slug: 'business', keywords: ['stock', 'market', 'company', 'ceo', 'ipo', 'revenue', 'gdp', 'inflation', 'interest rate', 'economy', 'recession', 'merger', 'acquisition', 'layoff', 'earnings', 's&p', 'nasdaq'] },
    { slug: 'science', keywords: ['spacex', 'nasa', 'ai ', 'artificial intelligence', 'climate', 'vaccine', 'research', 'discovery', 'mars', 'quantum', 'gene', 'lab', 'study', 'scientific'] },
  ];

  for (const rule of rules) {
    if (rule.keywords.some(kw => text.includes(kw))) {
      return rule.slug;
    }
  }
  return null;
}

function getEventsForCategory(slug) {
  if (slug === 'all') {
    return allEvents.slice(0, 3);
  }
  return allEvents.filter(e => categorizeEvent(e) === slug).slice(0, 3);
}

// Generate a clean search query from an event title
function generateSearchQuery(title) {
  let query = title;

  // Remove fill-in-the-blanks (underscores)
  query = query.replace(/_+/g, ' ');

  // Remove hash symbols and number placeholders (e.g., "# tweets")
  query = query.replace(/#/g, '');

  // Remove date ranges (e.g., "March 10 - March 17, 2026")
  query = query.replace(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}\s*[-–]\s*(January|February|March|April|May|June|July|August|September|October|November|December)?\s*\d{1,2},?\s*\d{0,4}/gi, '');

  // Remove isolated dates (e.g., "on March 16?")
  query = query.replace(/\bon\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}\??/gi, '');

  // Remove price thresholds (e.g., "above $70k", "hit $100k")
  query = query.replace(/(above|below|hit|reach|over|under)\s*\$?[\d,.]+[kKmMbB]?/gi, '');

  // Remove "by end of Month" patterns
  query = query.replace(/by\s+end\s+of\s+\w+/gi, '');

  // Remove "in Month" at the end
  query = query.replace(/\bin\s+(January|February|March|April|May|June|July|August|September|October|November|December)\??$/gi, '');

  // Remove question marks and extra whitespace
  query = query.replace(/[?]/g, '').replace(/\s+/g, ' ').trim();

  return query;
}

// Generate a simplified fallback query (just the core topic)
function generateFallbackQuery(title) {
  let query = generateSearchQuery(title);

  // Extract just the key subject words (remove common filler)
  const fillers = ['will', 'what', 'who', 'how', 'when', 'where', 'which', 'price', 'winner', 'the', 'vs', 'vs.', 'a', 'an', 'is', 'be', 'to', 'of', 'and', 'or', 'for', 'with', 'this', 'that', 'next', 'last'];
  const words = query.split(/\s+/).filter(w => !fillers.includes(w.toLowerCase()) && w.length > 1);

  // Take the most important words (first 4)
  return words.slice(0, 4).join(' ');
}

async function fetchInsights(query) {
  try {
    // First try with cleaned-up query
    const cleanQuery = generateSearchQuery(query);
    const url = `${PROXY_API}/api/search?q=${encodeURIComponent(cleanQuery)}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('Search failed');
    const data = await response.json();
    const results = data.results || [];

    // If we got results, return them
    if (results.length > 0) return results;

    // Fallback: try with simplified query
    const fallbackQuery = generateFallbackQuery(query);
    if (fallbackQuery && fallbackQuery !== cleanQuery) {
      console.log('No results for:', cleanQuery, '→ retrying with:', fallbackQuery);
      const fbUrl = `${PROXY_API}/api/search?q=${encodeURIComponent(fallbackQuery)}`;
      const fbResponse = await fetch(fbUrl);
      if (fbResponse.ok) {
        const fbData = await fbResponse.json();
        return fbData.results || [];
      }
    }

    return [];
  } catch (e) {
    console.warn('Failed to fetch insights for:', query, e);
    return [];
  }
}

// ---- Formatting Helpers ----

function formatVolume(vol) {
  const num = typeof vol === 'string' ? parseFloat(vol) : vol;
  if (isNaN(num)) return '$0';
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `$${(num / 1_000).toFixed(1)}K`;
  return `$${num.toFixed(0)}`;
}

function formatPercent(price) {
  const num = typeof price === 'string' ? parseFloat(price) : price;
  if (isNaN(num)) return '—';
  return `${(num * 100).toFixed(1)}%`;
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function truncate(str, len = 160) {
  if (!str) return '';
  return str.length > len ? str.substring(0, len) + '…' : str;
}

// ---- Get top outcomes from event's markets ----

function getTopOutcomes(event) {
  const markets = event.markets || [];
  const outcomes = [];

  // Collect all active markets with prices
  for (const market of markets) {
    if (!market.outcomePrices || !market.active) continue;

    try {
      const names = JSON.parse(market.outcomes || '[]');
      const prices = JSON.parse(market.outcomePrices || '[]');
      const title = market.groupItemTitle || names[0] || market.question;

      // For Yes/No markets, take the "Yes" price
      if (names.length === 2 && names[0] === 'Yes' && names[1] === 'No') {
        outcomes.push({
          label: title,
          price: parseFloat(prices[0]) || 0,
          volume: market.volumeNum || 0
        });
      } else {
        // For multi-outcome, add each
        for (let i = 0; i < names.length; i++) {
          outcomes.push({
            label: names[i],
            price: parseFloat(prices[i]) || 0,
            volume: market.volumeNum || 0
          });
        }
      }
    } catch (e) {
      continue;
    }
  }

  // Sort by price descending and take top 5
  outcomes.sort((a, b) => b.price - a.price);
  return outcomes.slice(0, 5);
}

// ---- Rendering ----

function renderOutcomeBars(outcomes) {
  if (!outcomes.length) return '';

  return `
    <div class="outcomes">
      <div class="outcomes-title">Top Outcomes</div>
      <div class="outcome-bars">
        ${outcomes.map((o, i) => `
          <div class="outcome-row">
            <span class="outcome-label" title="${o.label}">${truncate(o.label, 30)}</span>
            <div class="outcome-bar-track">
              <div class="outcome-bar-fill ${i === 0 ? 'primary' : 'secondary'}" 
                   style="width: ${Math.max(o.price * 100, 1)}%"></div>
            </div>
            <span class="outcome-pct">${formatPercent(o.price)}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function renderMarketCard(event, index) {
  const outcomes = getTopOutcomes(event);
  const volume24h = event.volume24hr || 0;
  const totalVolume = event.volume || 0;
  const slug = event.slug || '';
  const polymarketUrl = `https://polymarket.com/event/${slug}`;
  const description = truncate(event.description || '', 150);
  const metadata = extractMetadata(event);
  const apis = getRelevantAPIs(event, metadata);

  return `
    <article class="market-card" id="market-${index}">
      <div class="card-header">
        <img class="card-image" 
             src="${event.image || event.icon || ''}" 
             alt="${event.title}"
             onerror="this.style.display='none'" />
        <div class="card-info">
          <div class="card-rank">#${index + 1} Trending</div>
          <h2 class="card-title">
            <a href="${polymarketUrl}" target="_blank" rel="noopener">${event.title}</a>
          </h2>
          <p class="card-description">${description}</p>
        </div>
      </div>

      <div class="card-stats">
        <div class="stat">
          <span class="stat-label">24h Volume</span>
          <span class="stat-value cyan">${formatVolume(volume24h)}</span>
        </div>
        <div class="stat">
          <span class="stat-label">Total Volume</span>
          <span class="stat-value">${formatVolume(totalVolume)}</span>
        </div>
        <div class="stat">
          <span class="stat-label">Markets</span>
          <span class="stat-value amber">${(event.markets || []).filter(m => m.active).length}</span>
        </div>
        <div class="stat">
          <span class="stat-label">Liquidity</span>
          <span class="stat-value green">${formatVolume(event.liquidity || 0)}</span>
        </div>
        ${event.endDate ? `<div class="stat">
          <span class="stat-label">End Date</span>
          <span class="stat-value">${new Date(event.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
        </div>` : ''}
      </div>

      ${renderOutcomeBars(outcomes)}

      <div class="insights-section" id="insights-${index}">
        <div class="insights-header">
          <div class="insights-icon">📊</div>
          <h3>Collected Insights</h3>
        </div>
        <div class="insights-tabs-container">
          <div class="insights-tab-strip">
            <button class="insights-tab active" data-tab="web-${index}" onclick="switchTab(${index}, 'web-${index}')">
              <span class="insights-tab-icon">🌐</span>Web Insights
            </button>
            <button class="insights-tab" data-tab="reddit-${index}" onclick="switchTab(${index}, 'reddit-${index}')">
              <span class="insights-tab-icon">🗣️</span>Social Sentiment
            </button>
            <button class="insights-tab" data-tab="meta-${index}" onclick="switchTab(${index}, 'meta-${index}')">
              <span class="insights-tab-icon">📋</span>Bet Metadata
            </button>
            <button class="insights-tab" data-tab="apis-${index}" onclick="switchTab(${index}, 'apis-${index}')">
              <span class="insights-tab-icon">🔌</span>Data APIs
            </button>
            <button class="insights-tab" data-tab="ai-${index}" onclick="switchTab(${index}, 'ai-${index}')">
              <span class="insights-tab-icon">🤖</span>AI Verdict
            </button>
          </div>
          <div class="insights-tab-panels">
            <div class="insights-tab-panel active" id="panel-web-${index}">
              <div class="insights-loading">
                <div class="insights-spinner"></div>
                Scanning the web for insights...
              </div>
            </div>
            <div class="insights-tab-panel" id="panel-reddit-${index}">
              <div class="insights-loading">
                <div class="insights-spinner"></div>
                Analyzing Reddit sentiment...
              </div>
            </div>
            <div class="insights-tab-panel" id="panel-meta-${index}">
              ${renderMetadata(event, metadata)}
            </div>
            <div class="insights-tab-panel" id="panel-apis-${index}">
              ${renderAPIs(apis)}
            </div>
            <div class="insights-tab-panel" id="panel-ai-${index}">
              <div class="ai-loading">
                <div class="ai-loading-icon">🤖</div>
                <p>AI is analyzing this market...</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </article>
  `;
}

// ---- Tab Switching ----

window.switchTab = function (cardIndex, tabId) {
  const section = document.getElementById(`insights-${cardIndex}`);
  if (!section) return;

  // Deactivate all tabs and panels in this card
  section.querySelectorAll('.insights-tab').forEach(t => t.classList.remove('active'));
  section.querySelectorAll('.insights-tab-panel').forEach(p => p.classList.remove('active'));

  // Activate selected
  section.querySelector(`[data-tab="${tabId}"]`)?.classList.add('active');
  const panel = document.getElementById(`panel-${tabId}`);
  if (panel) panel.classList.add('active');
};

// ---- Metadata Extraction ----

const TOPIC_KEYWORDS = {
  'Politics': ['president', 'election', 'nominee', 'congress', 'senate', 'democrat', 'republican', 'vote', 'political', 'governor', 'mayor', 'parliament', 'prime minister', 'chancellor'],
  'Finance': ['fed', 'interest rate', 'bitcoin', 'btc', 'crypto', 'stock', 'market', 's&p', 'nasdaq', 'treasury', 'inflation', 'gdp', 'recession', 'oil', 'crude', 'commodity', 'forex'],
  'Sports': ['world cup', 'fifa', 'nba', 'nfl', 'premier league', 'la liga', 'champions league', 'tennis', 'atp', 'f1', 'grand prix', 'super bowl', 'olympics', 'epl', 'uefa', 'serie a', 'bundesliga'],
  'Geopolitics': ['war', 'conflict', 'iran', 'russia', 'ukraine', 'china', 'ceasefire', 'regime', 'sanctions', 'military', 'nato', 'invasion', 'strait', 'nuclear'],
  'Entertainment': ['oscar', 'grammy', 'emmy', 'movie', 'film', 'album', 'eurovision', 'actor', 'actress', 'best picture'],
  'Science & Tech': ['ai', 'spacex', 'nasa', 'launch', 'alien', 'climate', 'vaccine', 'fda', 'approval', 'quantum'],
};

function detectTopic(event) {
  const text = `${event.title} ${event.description || ''} ${event.slug || ''}`.toLowerCase();
  const scores = {};

  for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS)) {
    scores[topic] = keywords.filter(kw => text.includes(kw)).length;
  }

  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  if (sorted[0][1] > 0) return sorted[0][0];
  return 'General';
}

function calculateRisk(event) {
  const markets = event.markets || [];
  const activeMarkets = markets.filter(m => m.active);
  const liquidity = parseFloat(event.liquidity) || 0;
  const volume = parseFloat(event.volume) || 0;
  const endDate = event.endDate ? new Date(event.endDate) : null;
  const now = new Date();

  let riskScore = 50; // Start at medium

  // Low liquidity = higher risk
  if (liquidity < 100_000) riskScore += 20;
  else if (liquidity < 1_000_000) riskScore += 10;
  else riskScore -= 10;

  // High volume relative to liquidity = more volatile
  if (volume > 0 && liquidity > 0) {
    const ratio = volume / liquidity;
    if (ratio > 50) riskScore += 15;
    else if (ratio > 20) riskScore += 5;
  }

  // Many active markets = more complex
  if (activeMarkets.length > 20) riskScore += 10;
  else if (activeMarkets.length > 10) riskScore += 5;

  // Events far in the future = more uncertainty
  if (endDate) {
    const daysUntil = (endDate - now) / (1000 * 60 * 60 * 24);
    if (daysUntil > 365) riskScore += 15;
    else if (daysUntil > 90) riskScore += 5;
    else if (daysUntil < 7) riskScore -= 10;
  }

  // Competitive market = lower risk (more efficient pricing)
  const competitive = event.competitive || 0;
  if (competitive > 0.8) riskScore -= 10;

  riskScore = Math.max(0, Math.min(100, riskScore));

  if (riskScore <= 35) return { level: 'low', label: 'Low Risk', score: riskScore };
  if (riskScore <= 65) return { level: 'medium', label: 'Medium Risk', score: riskScore };
  return { level: 'high', label: 'High Risk', score: riskScore };
}

function extractMetadata(event) {
  const topic = detectTopic(event);
  const risk = calculateRisk(event);
  const endDate = event.endDate ? new Date(event.endDate) : null;
  const startDate = event.startDate ? new Date(event.startDate) : null;
  const markets = event.markets || [];
  const activeMarkets = markets.filter(m => m.active);
  const totalComments = event.commentCount || 0;

  // Calculate days remaining
  let daysRemaining = null;
  if (endDate) {
    const now = new Date();
    daysRemaining = Math.max(0, Math.ceil((endDate - now) / (1000 * 60 * 60 * 24)));
  }

  // Determine market type
  const isNegRisk = event.negRisk || false;
  const marketType = isNegRisk ? 'Multi-Outcome' :
    activeMarkets.length === 1 ? 'Binary (Yes/No)' : 'Multi-Market';

  return { topic, risk, endDate, startDate, daysRemaining, marketType, totalComments, activeMarkets: activeMarkets.length };
}

function renderMetadata(event, meta) {
  const endDateStr = meta.endDate ? meta.endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A';
  const startDateStr = meta.startDate ? meta.startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A';

  return `
    <div class="meta-grid">
      <div class="meta-item">
        <div class="meta-label">Topic</div>
        <div class="meta-value">${meta.topic}</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">Risk Factor</div>
        <div class="meta-value"><span class="risk-badge ${meta.risk.level}">${meta.risk.label} (${meta.risk.score}/100)</span></div>
      </div>
      <div class="meta-item">
        <div class="meta-label">Market Type</div>
        <div class="meta-value">${meta.marketType}</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">End Date</div>
        <div class="meta-value">${endDateStr}${meta.daysRemaining !== null ? ` <span style="color:var(--text-muted); font-weight:400">(${meta.daysRemaining}d left)</span>` : ''}</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">Active Markets</div>
        <div class="meta-value">${meta.activeMarkets}</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">Comments</div>
        <div class="meta-value">${meta.totalComments.toLocaleString()}</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">Start Date</div>
        <div class="meta-value">${startDateStr}</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">Competitiveness</div>
        <div class="meta-value">${event.competitive ? (event.competitive * 100).toFixed(0) + '%' : 'N/A'}</div>
      </div>
      <div class="meta-item full-width">
        <div class="meta-label">Resolution Source</div>
        <div class="meta-value small">${event.resolutionSource || event.markets?.[0]?.resolutionSource || 'Consensus of credible reporting'}</div>
      </div>
    </div>
  `;
}

// ---- Data APIs Suggestions ----

const API_DATABASE = {
  Politics: [
    { name: 'OpenSecrets API', desc: 'Campaign finance, lobbying data, and politician profiles from the Center for Responsive Politics', url: 'https://www.opensecrets.org/open-data/api', pricing: 'free' },
    { name: 'ProPublica Congress API', desc: 'US congressional data including bills, votes, statements, and member profiles', url: 'https://projects.propublica.org/api-docs/congress-api/', pricing: 'free' },
    { name: 'FiveThirtyEight / Polls', desc: 'Polling data and political forecasting models', url: 'https://projects.fivethirtyeight.com/', pricing: 'free' },
    { name: 'Google Trends API', desc: 'Search trend data to gauge public interest in candidates and topics', url: 'https://trends.google.com/trends/', pricing: 'free' },
    { name: 'Ballotpedia API', desc: 'Election data, candidate information, ballot measures, and political reference', url: 'https://ballotpedia.org/API-documentation', pricing: 'freemium' },
  ],
  Finance: [
    { name: 'Federal Reserve (FRED) API', desc: 'Economic data from the Federal Reserve Bank of St. Louis — rates, inflation, GDP, and more', url: 'https://fred.stlouisfed.org/docs/api/fred/', pricing: 'free' },
    { name: 'Alpha Vantage', desc: 'Real-time and historical stock, forex, and crypto data with technical indicators', url: 'https://www.alphavantage.co/documentation/', pricing: 'freemium' },
    { name: 'CoinGecko API', desc: 'Cryptocurrency prices, market cap, volume, and historical data for 10,000+ coins', url: 'https://www.coingecko.com/en/api/documentation', pricing: 'freemium' },
    { name: 'Yahoo Finance API', desc: 'Stock quotes, financial statements, and market data', url: 'https://finance.yahoo.com/', pricing: 'freemium' },
    { name: 'CME FedWatch Tool', desc: 'Market-implied probabilities for Fed rate decisions', url: 'https://www.cmegroup.com/markets/interest-rates/cme-fedwatch-tool.html', pricing: 'free' },
  ],
  Sports: [
    { name: 'API-Football', desc: 'Comprehensive football/soccer data: livescores, standings, fixtures, odds, and statistics', url: 'https://www.api-football.com/', pricing: 'freemium' },
    { name: 'The Odds API', desc: 'Real-time odds from bookmakers across sports — great for comparing prediction markets', url: 'https://the-odds-api.com/', pricing: 'freemium' },
    { name: 'SofaScore API', desc: 'Live scores, fixtures, standings, and player stats across all major sports', url: 'https://www.sofascore.com/', pricing: 'free' },
    { name: 'ESPN API', desc: 'Scores, schedules, standings, and team info for major US and international sports', url: 'https://site.api.espn.com/apis/site/v2/sports/', pricing: 'free' },
    { name: 'Football-Data.org', desc: 'European football leagues data including Premier League, La Liga, Serie A, Bundesliga', url: 'https://www.football-data.org/', pricing: 'freemium' },
  ],
  Geopolitics: [
    { name: 'GDELT Project', desc: 'Global events database tracking news coverage, themes, sentiment, and locations worldwide', url: 'https://www.gdeltproject.org/', pricing: 'free' },
    { name: 'ACLED API', desc: 'Armed Conflict Location & Event Data — political violence, protests, and conflict tracking', url: 'https://acleddata.com/acleddatanew/wp-content/uploads/2021/11/ACLED_API-User-Guide_2021.pdf', pricing: 'free' },
    { name: 'World Bank API', desc: 'Development indicators, economic data, and country statistics for 200+ countries', url: 'https://datahelpdesk.worldbank.org/knowledgebase/articles/889392', pricing: 'free' },
    { name: 'SIPRI Databases', desc: 'Military spending, arms transfers, and conflict data from the Stockholm International Peace Research Institute', url: 'https://www.sipri.org/databases', pricing: 'free' },
    { name: 'NewsAPI', desc: 'Search worldwide news articles by keyword, source, language, and date range', url: 'https://newsapi.org/', pricing: 'freemium' },
  ],
  Entertainment: [
    { name: 'TMDB API', desc: 'Movie and TV data — titles, cast, ratings, release dates, and box office info', url: 'https://developer.themoviedb.org/docs', pricing: 'free' },
    { name: 'OMDB API', desc: 'Open Movie Database — search and retrieve movie, series, and episode data', url: 'https://www.omdbapi.com/', pricing: 'freemium' },
    { name: 'Spotify API', desc: 'Music data — artists, albums, tracks, playlists, and audio features', url: 'https://developer.spotify.com/documentation/web-api/', pricing: 'free' },
    { name: 'Google Trends API', desc: 'Track search interest in performers, films, and entertainment topics over time', url: 'https://trends.google.com/trends/', pricing: 'free' },
  ],
  'Science & Tech': [
    { name: 'NASA APIs', desc: 'Space data — imagery, asteroid tracking, Mars rover photos, and mission data', url: 'https://api.nasa.gov/', pricing: 'free' },
    { name: 'OpenAI API', desc: 'AI models for text analysis, prediction, and research on AI-related bets', url: 'https://platform.openai.com/docs/', pricing: 'paid' },
    { name: 'arXiv API', desc: 'Search academic papers and preprints in physics, CS, math, and more', url: 'https://info.arxiv.org/help/api/', pricing: 'free' },
    { name: 'PubMed API', desc: 'Biomedical literature search — useful for health/science prediction markets', url: 'https://www.ncbi.nlm.nih.gov/home/develop/api/', pricing: 'free' },
  ],
  General: [
    { name: 'NewsAPI', desc: 'Search worldwide news articles by keyword, source, language, and date range', url: 'https://newsapi.org/', pricing: 'freemium' },
    { name: 'Google Trends API', desc: 'Track search interest in any topic over time to gauge public sentiment', url: 'https://trends.google.com/trends/', pricing: 'free' },
    { name: 'Wikipedia API', desc: 'Access Wikipedia article content, summaries, and page view statistics', url: 'https://www.mediawiki.org/wiki/API:Main_page', pricing: 'free' },
    { name: 'GDELT Project', desc: 'Global events database with news monitoring, tone analysis, and trend tracking', url: 'https://www.gdeltproject.org/', pricing: 'free' },
  ],
};

function getRelevantAPIs(event, metadata) {
  const topicAPIs = API_DATABASE[metadata.topic] || API_DATABASE['General'];
  // Always include Polymarket's own API
  const polymarketAPI = {
    name: 'Polymarket Gamma API',
    desc: 'Direct market data — prices, volume, order book depth, and historical trades for this event',
    url: 'https://docs.polymarket.com/',
    pricing: 'free'
  };
  return [polymarketAPI, ...topicAPIs];
}

function renderAPIs(apis) {
  return `
    <div class="api-list">
      ${apis.map(api => `
        <div class="api-item">
          <div class="api-name">
            ${api.name}
            <span class="api-badge ${api.pricing}">${api.pricing}</span>
          </div>
          <div class="api-desc">${api.desc}</div>
          <a class="api-url" href="${api.url}" target="_blank" rel="noopener">${api.url}</a>
        </div>
      `).join('')}
    </div>
  `;
}

// ---- Render Web Insights into Tab Panel ----

function renderInsights(index, selectedArticles, excludedArticles = []) {
  const panel = document.getElementById(`panel-web-${index}`);
  if (!panel) return;

  let html = '';

  if (!selectedArticles.length && !excludedArticles.length) {
    panel.innerHTML = `<p class="no-insights">No recent articles found for this market.</p>`;
    return;
  }

  if (selectedArticles.length) {
    html += `
      <h3 style="margin-bottom: 15px; color: var(--text-primary); font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em;">Included in Analysis</h3>
      <div class="insights-list">
        ${selectedArticles.map(article => `
          <a class="insight-item" href="${article.url}" target="_blank" rel="noopener">
            <div class="insight-title">${article.title}</div>
            <div class="insight-meta">
              <span class="insight-source">${article.source}</span>
              ${article.date ? `<span>·</span><span>${timeAgo(article.date)}</span>` : ''}
            </div>
            ${article.snippet ? `<p class="insight-snippet">${truncate(article.snippet, 140)}</p>` : ''}
          </a>
        `).join('')}
      </div>
    `;
  } else {
    html += `<p class="no-insights">No articles were included in the analysis.</p>`;
  }

  if (excludedArticles.length) {
    html += `
      <h3 style="margin-top: 30px; margin-bottom: 15px; color: var(--text-primary); font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em;">Excluded from Analysis</h3>
      <div class="insights-list excluded-list" style="opacity: 0.6; filter: grayscale(100%);">
        ${excludedArticles.map(article => `
          <a class="insight-item" href="${article.url}" target="_blank" rel="noopener">
            <div class="insight-title">${article.title}</div>
            <div class="insight-meta">
              <span class="insight-source">${article.source}</span>
              ${article.date ? `<span>·</span><span>${timeAgo(article.date)}</span>` : ''}
            </div>
          </a>
        `).join('')}
      </div>
    `;
  }

  panel.innerHTML = html;
}

// ---- AI Analysis ----

async function fetchAIAnalysis(event, newsArticles, metadata, redditPosts) {
  try {
    const outcomes = getTopOutcomes(event);
    const payload = {
      event: {
        title: event.title,
        description: event.description || '',
        topic: metadata.topic,
        riskScore: metadata.risk.score,
        riskLevel: metadata.risk.level,
        marketType: metadata.marketType,
        daysUntilResolution: metadata.daysRemaining,
        endDate: metadata.endDate ? metadata.endDate.toISOString() : null,
        outcomes: outcomes.map(o => ({
          name: o.label,
          probability: `${(o.price * 100).toFixed(1)}%`,
          price: o.price
        })),
        volume24h: formatVolume(event.volume24hr || 0),
        totalVolume: formatVolume(event.volume || 0),
        liquidity: formatVolume(event.liquidity || 0),
        activeMarkets: metadata.activeMarkets,
        recentNews: (newsArticles || []).slice(0, 5).map(a => ({
          headline: a.title,
          source: a.source,
          date: a.date ? timeAgo(a.date) : 'recent'
        })),
        redditSentiment: (redditPosts || []).slice(0, 5).map(p => ({
          title: p.title,
          subreddit: p.subreddit,
          upvotes: p.upvotes,
          comments: p.comments
        }))
      },
      // Pass AI provider config
      aiProvider: aiConfig.provider,
      aiApiKey: aiConfig.useDefault ? null : aiConfig.apiKey
    };

    const response = await fetch(`${PROXY_API}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const err = await response.json();
      if (err.fallback) return err.fallback;
      throw new Error(err.message || 'Analysis failed');
    }

    return await response.json();
  } catch (e) {
    console.warn('AI analysis failed:', e);
    return null;
  }
}

function renderAIVerdict(index, analysis) {
  const panel = document.getElementById(`panel-ai-${index}`);
  if (!panel) return;

  if (!analysis) {
    panel.innerHTML = `
            <div class="ai-error">
                <p>⚠️ AI analysis unavailable</p>
                <p class="error-detail">Make sure GEMINI_API_KEY is set in your .env file and restart the server.</p>
            </div>`;
    return;
  }

  const v = analysis.verdict.toLowerCase();
  const verdictIcons = { opportunity: '💰', hold: '⏸️', avoid: '🚫' };
  const icon = verdictIcons[v] || '❓';

  panel.innerHTML = `
        <div class="verdict-card ${v}">
            <div class="verdict-header">
                <span class="verdict-badge ${v}">
                    <span class="verdict-badge-icon">${icon}</span>
                    ${analysis.verdict}
                </span>
                <div class="confidence-meter">
                    <div class="confidence-bar-track">
                        <div class="confidence-bar-fill ${v}" style="width: ${analysis.confidence}%"></div>
                    </div>
                    <span class="confidence-label">${analysis.confidence}% confident</span>
                </div>
            </div>

            <div class="verdict-section">
                <div class="verdict-section-label">Analysis</div>
                <div class="verdict-reasoning">${analysis.reasoning}</div>
            </div>

            <div class="verdict-section">
                <div class="verdict-section-label">Edge</div>
                <div class="verdict-edge">${analysis.edge}</div>
            </div>

            ${analysis.suggestedOutcome && analysis.suggestedOutcome !== 'None' ? `
            <div class="verdict-section">
                <div class="verdict-section-label">Suggestion</div>
                <div class="verdict-suggestion">
                    <div class="verdict-suggestion-item">
                        <div class="verdict-suggestion-label">Outcome</div>
                        <div class="verdict-suggestion-value">${analysis.suggestedOutcome}</div>
                    </div>
                    ${analysis.suggestedPrice && analysis.suggestedPrice !== 'N/A' ? `
                    <div class="verdict-suggestion-item">
                        <div class="verdict-suggestion-label">Fair Price</div>
                        <div class="verdict-suggestion-value">${analysis.suggestedPrice}</div>
                    </div>` : ''}
                </div>
            </div>` : ''}

            ${analysis.riskWarnings && analysis.riskWarnings.length ? `
            <div class="verdict-section">
                <div class="verdict-section-label">Risk Warnings</div>
                <div class="risk-warnings">
                    ${analysis.riskWarnings.map(w => `
                        <div class="risk-warning">
                            <span class="risk-warning-icon">⚠</span>
                            <span>${w}</span>
                        </div>
                    `).join('')}
                </div>
            </div>` : ''}
        </div>`;
}

// ---- Bet Selector Dialog ----

function renderBetSelector(activeSlug = 'all') {
  const events = getEventsForCategory(activeSlug);
  const container = document.getElementById('bet-selector-container');

  // Store current events for selection
  container._currentEvents = events;

  container.innerHTML = `
    <div class="bet-selector-overlay" id="bet-selector-overlay">
      <div class="bet-selector">
        <div class="selector-header">
          <h2>Choose a <span class="accent">Market</span> to Analyze</h2>
          <p>Select a prediction market from the categories below</p>
        </div>
        <div class="category-tabs" id="category-tabs">
          <button class="category-tab" data-action="history" type="button" style="background: rgba(0, 204, 255, 0.1); color: #00ccff; border-color: rgba(0, 204, 255, 0.2);">
            <span class="category-tab-icon">🕒</span>History
          </button>
          ${CATEGORIES.map(cat => `
            <button class="category-tab ${cat.slug === activeSlug ? 'active' : ''}"
                    data-category="${cat.slug}" type="button">
              <span class="category-tab-icon">${cat.icon}</span>
              ${cat.label}
            </button>
          `).join('')}
        </div>
        <div class="selector-bets" id="selector-bets">
          ${renderSelectorBets(events)}
        </div>
      </div>
    </div>
  `;

  // Attach click listeners directly to tabs
  container.querySelectorAll('[data-category]').forEach(tab => {
    tab.addEventListener('click', function (e) {
      e.stopPropagation();
      const slug = this.dataset.category;
      renderBetSelector(slug);
    });
  });

  // Attach history button listener
  const historyBtn = container.querySelector('[data-action="history"]');
  if (historyBtn) {
    historyBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      showHistoryDialog();
    });
  }

  // Attach click listeners directly to bet cards
  container.querySelectorAll('[data-event-index]').forEach(card => {
    card.addEventListener('click', function () {
      const index = parseInt(this.dataset.eventIndex);
      const selectedEvent = events[index];
      if (selectedEvent) {
        const overlay = document.getElementById('bet-selector-overlay');
        if (overlay) {
          overlay.classList.add('closing');
          setTimeout(() => {
            overlay.remove();
            showApiKeyDialog(selectedEvent);
          }, 350);
        }
      }
    });
  });
}

function renderSelectorBets(events) {
  if (!events || !events.length) {
    return `<div class="selector-empty">No active markets in this category right now</div>`;
  }

  return `
    <div class="selector-bets-grid">
      ${events.map((event, i) => {
    const outcomes = getTopOutcomes(event);
    const topOutcome = outcomes[0];
    const volume = formatVolume(event.volume24hr || event.volume || 0);
    return `
          <div class="selector-bet-card" data-event-index="${i}">
            <img class="selector-bet-image"
                 src="${event.image || event.icon || ''}"
                 alt="${event.title}"
                 onerror="this.style.display='none'" />
            <div class="selector-bet-info">
              <div class="selector-bet-title">${event.title}</div>
              <div class="selector-bet-meta">
                <span class="selector-bet-volume">${volume} vol</span>
                ${topOutcome ? `<span class="selector-bet-outcomes">${topOutcome.label}: ${formatPercent(topOutcome.price)}</span>` : ''}
              </div>
            </div>
            <span class="selector-bet-arrow">→</span>
          </div>
        `;
  }).join('')}
    </div>
  `;
}


// Store fetched articles per event for AI analysis
const eventArticles = {};

window.showBetSelector = function () {
  document.getElementById('analysis-view').style.display = 'none';
  renderBetSelector();
};

// ---- Web Insights Review Dialog ----

async function showWebInsightsDialog(event) {
  const container = document.getElementById('bet-selector-container');

  // Show a loading state in the dialog space
  container.innerHTML = `
    <div class="bet-selector-overlay" id="insights-review-overlay">
      <div class="api-key-dialog" style="text-align: center; padding: 40px;">
        <div class="loading-spinner"></div>
        <h3 style="margin-top: 20px; color: var(--text-primary);">Fetching Web Insights...</h3>
        <p style="color: var(--text-muted); font-size: 14px; margin-top: 10px;">Finding relevant recent articles for analysis</p>
      </div>
    </div>
  `;

  // Fetch the articles
  const articles = await fetchInsights(event.title);

  // If no articles found, just proceed directly
  if (!articles || articles.length === 0) {
    const overlay = document.getElementById('insights-review-overlay');
    overlay.classList.add('closing');
    setTimeout(() => {
      container.innerHTML = '';
      analyzeSelectedBet(event, []);
    }, 350);
    return;
  }

  // Render the review dialog
  container.innerHTML = `
    <div class="bet-selector-overlay" id="insights-review-overlay">
      <div class="api-key-dialog insights-review-dialog" style="max-width: 650px;">
        <div class="dialog-header">
          <div class="dialog-icon">📰</div>
          <h2>Review <span class="accent">Web Insights</span></h2>
          <p>Select which articles to include in the AI analysis context</p>
        </div>

        <div class="insights-review-list" id="insights-review-list">
          ${articles.map((article, index) => `
            <label class="insight-review-item">
              <input type="checkbox" class="insight-checkbox" value="${index}" checked>
              <div class="insight-review-content">
                <div class="insight-title">${article.title}</div>
                <div class="insight-meta">
                  <span class="insight-source">${article.source}</span>
                  ${article.date ? `<span>·</span><span>${timeAgo(article.date)}</span>` : ''}
                </div>
              </div>
            </label>
          `).join('')}
        </div>

        <div class="dialog-actions" style="display: flex; gap: 10px; margin-top: 20px;">
          <button class="dialog-secondary-btn" id="insights-skip" type="button" style="flex: 1; padding: 14px; background: var(--bg-secondary); border: 1px solid var(--border-subtle); border-radius: 12px; color: var(--text-primary); cursor: pointer; font-weight: 600;">
            Skip Insights
          </button>
          <button class="dialog-continue-btn" id="insights-continue" type="button" style="flex: 2;">
            Analyze with Selected →
          </button>
        </div>
      </div>
    </div>
  `;

  // Attach listeners
  const continueBtn = container.querySelector('#insights-continue');
  const skipBtn = container.querySelector('#insights-skip');

  continueBtn.addEventListener('click', () => {
    const checkboxes = container.querySelectorAll('.insight-checkbox:checked');
    const uncheckedBoxes = container.querySelectorAll('.insight-checkbox:not(:checked)');
    const selectedArticles = Array.from(checkboxes).map(cb => articles[parseInt(cb.value)]);
    const excludedArticles = Array.from(uncheckedBoxes).map(cb => articles[parseInt(cb.value)]);

    const overlay = document.getElementById('insights-review-overlay');
    overlay.classList.add('closing');
    setTimeout(() => {
      container.innerHTML = '';
      showAnalysisConfirmationDialog(event, selectedArticles, excludedArticles);
    }, 350);
  });

  skipBtn.addEventListener('click', () => {
    const overlay = document.getElementById('insights-review-overlay');
    overlay.classList.add('closing');
    setTimeout(() => {
      container.innerHTML = '';
      showAnalysisConfirmationDialog(event, [], articles);
    }, 350);
  });
}

// ---- AI Analysis Confirmation Dialog ----

function showAnalysisConfirmationDialog(event, selectedArticles, excludedArticles = []) {
  const container = document.getElementById('bet-selector-container');

  container.innerHTML = `
    <div class="bet-selector-overlay" id="ai-confirm-overlay">
      <div class="api-key-dialog" style="max-width: 500px; text-align: center;">
        <div class="dialog-header">
          <div class="dialog-icon" style="background: rgba(255, 170, 0, 0.1); color: #ffaa00; border-color: rgba(255, 170, 0, 0.2);">⚠️</div>
          <h2>Confirm <span class="accent" style="color: #ffaa00;">Analysis</span></h2>
          <p>You are about to run a Generative AI analysis.</p>
        </div>

        <div class="token-warning-box" style="background: var(--bg-secondary); border: 1px solid var(--border-subtle); border-radius: 12px; padding: 20px; text-align: left; margin: 20px 0;">
          <h4 style="color: var(--text-primary); margin: 0 0 10px 0; display: flex; align-items: center; gap: 8px;">
            <span>🪙</span> Token Consumption Warning
          </h4>
          <p style="color: var(--text-muted); font-size: 14px; margin: 0; line-height: 1.5;">
            Running this analysis will transmit the market data and the <strong>${selectedArticles.length}</strong> selected web insights to the chosen LLM provider (${aiConfig.provider === 'gemini' ? 'Google Gemini' : aiConfig.provider === 'openai' ? 'OpenAI' : 'Anthropic Claude'}). This will consume tokens against your API key.
          </p>
        </div>

        <div class="dialog-actions" style="display: flex; gap: 10px; margin-top: 20px;">
          <button class="dialog-secondary-btn" id="confirm-cancel" type="button" style="flex: 1; padding: 14px; background: var(--bg-secondary); border: 1px solid var(--border-subtle); border-radius: 12px; color: var(--text-primary); cursor: pointer; font-weight: 600;">
            Cancel
          </button>
          <button class="dialog-continue-btn" id="confirm-proceed" type="button" style="flex: 2; background: linear-gradient(135deg, #ffaa00, #ff7700); box-shadow: 0 6px 25px rgba(255, 170, 0, 0.3);">
            Proceed & Analyze
          </button>
        </div>
      </div>
    </div>
  `;

  // Attach listeners
  const proceedBtn = container.querySelector('#confirm-proceed');
  const cancelBtn = container.querySelector('#confirm-cancel');

  proceedBtn.addEventListener('click', () => {
    const overlay = document.getElementById('ai-confirm-overlay');
    overlay.classList.add('closing');

    // Change button state to indicate loading
    proceedBtn.innerHTML = '<span class="loading-spinner" style="width: 20px; height: 20px; border-width: 2px; display: inline-block; vertical-align: middle;"></span> Analyzing...';
    proceedBtn.style.opacity = '0.8';

    setTimeout(() => {
      container.innerHTML = '';
      analyzeSelectedBet(event, selectedArticles, excludedArticles);
    }, 400); // slightly longer wait to let user see "analyzing" state
  });

  cancelBtn.addEventListener('click', () => {
    const overlay = document.getElementById('ai-confirm-overlay');
    overlay.classList.add('closing');
    setTimeout(() => {
      container.innerHTML = '';
      // Go back to the selector view
      document.getElementById('analysis-view').style.display = 'none';
      renderBetSelector();
    }, 350);
  });
}

// ---- API Key Dialog ----

function showApiKeyDialog(event) {
  const container = document.getElementById('bet-selector-container');
  // Reset aiConfig to null initial state for choice
  aiConfig.useDefault = null;

  container.innerHTML = `
    <div class="bet-selector-overlay" id="api-key-overlay">
      <div class="api-key-dialog">
        <div class="dialog-header">
          <div class="dialog-icon">🤖</div>
          <h2>AI Analysis <span class="accent">Setup</span></h2>
          <p>Choose how to power the AI analysis for this market</p>
        </div>

        <div class="api-key-options">
          <button class="api-key-option" id="opt-default" type="button">
            <div class="option-icon">⚡</div>
            <div class="option-content">
              <div class="option-title">Use Default</div>
              <div class="option-desc">Free Gemini-powered analysis — ready to go</div>
            </div>
            <div class="option-check">✓</div>
          </button>

          <button class="api-key-option" id="opt-custom" type="button">
            <div class="option-icon">🔑</div>
            <div class="option-content">
              <div class="option-title">Use Your Own Key</div>
              <div class="option-desc">Bring your own Gemini, OpenAI, or Claude API key</div>
            </div>
            <div class="option-check">✓</div>
          </button>
        </div>

        <div class="custom-key-panel" id="custom-key-panel" style="display: none;">
          <div class="custom-key-field">
            <label>Provider</label>
            <div class="provider-select-wrapper">
              <select id="ai-provider" class="provider-select">
                <option value="gemini" ${aiConfig.provider === 'gemini' ? 'selected' : ''}>🟢 Google Gemini</option>
                <option value="openai" ${aiConfig.provider === 'openai' ? 'selected' : ''}>🟣 OpenAI (GPT)</option>
                <option value="claude" ${aiConfig.provider === 'claude' ? 'selected' : ''}>🟠 Anthropic Claude</option>
              </select>
            </div>
          </div>
          <div class="custom-key-field">
            <label>API Key</label>
            <div class="key-input-wrapper">
              <input type="password" id="ai-api-key" class="key-input"
                     placeholder="Paste your API key here..."
                     value="${aiConfig.apiKey || ''}" />
              <button class="key-toggle" id="key-toggle" type="button">👁</button>
            </div>
          </div>
        </div>

        <button class="dialog-continue-btn" id="api-key-continue" type="button" style="display: none;">
          Continue to Analysis →
        </button>
      </div>
    </div>
  `;

  // Attach listeners
  const optDefault = container.querySelector('#opt-default');
  const optCustom = container.querySelector('#opt-custom');
  const customPanel = container.querySelector('#custom-key-panel');
  const continueBtn = container.querySelector('#api-key-continue');
  const keyToggle = container.querySelector('#key-toggle');
  const keyInput = container.querySelector('#ai-api-key');

  optDefault.addEventListener('click', () => {
    optDefault.classList.add('selected');
    optCustom.classList.remove('selected');
    customPanel.style.display = 'none';
    continueBtn.style.display = 'none';

    // Set config and Auto-proceed immediately for a seamless UX
    aiConfig.useDefault = true;
    aiConfig.provider = 'gemini';
    aiConfig.apiKey = null;

    const overlay = container.querySelector('#api-key-overlay');
    overlay.classList.add('closing');
    setTimeout(() => {
      container.innerHTML = '';
      showWebInsightsDialog(event);
    }, 350);
  });

  optCustom.addEventListener('click', () => {
    optCustom.classList.add('selected');
    optDefault.classList.remove('selected');
    customPanel.style.display = 'block';
    continueBtn.style.display = 'block';
    aiConfig.useDefault = false;
    setTimeout(() => keyInput.focus(), 100);
  });

  keyToggle.addEventListener('click', () => {
    keyInput.type = keyInput.type === 'password' ? 'text' : 'password';
  });

  continueBtn.addEventListener('click', () => {
    const provider = container.querySelector('#ai-provider').value;
    const key = keyInput.value.trim();
    if (!key) {
      keyInput.classList.add('shake');
      keyInput.placeholder = 'Please enter a valid API key';
      setTimeout(() => keyInput.classList.remove('shake'), 600);
      return;
    }
    aiConfig.provider = provider;
    aiConfig.apiKey = key;

    // Close dialog and move to Insights Review
    const overlay = container.querySelector('#api-key-overlay');
    overlay.classList.add('closing');
    setTimeout(() => {
      container.innerHTML = '';
      showWebInsightsDialog(event);
    }, 350);
  });
}

async function analyzeSelectedBet(event, selectedArticles, excludedArticles = []) {
  const marketsEl = document.getElementById('markets');
  const analysisView = document.getElementById('analysis-view');

  // Show analysis view with the single card
  analysisView.style.display = 'block';
  marketsEl.innerHTML = renderMarketCard(event, 0);

  // Use the passed articles
  eventArticles[0] = selectedArticles;
  renderInsights(0, selectedArticles, excludedArticles);

  // Trigger Reddit Sentiment Fetch
  let redditPosts = [];
  try {
    redditPosts = await fetchRedditSentiment(event.title);
    renderRedditSentiment(0, redditPosts);
  } catch (e) {
    renderRedditSentiment(0, []);
  }

  // Trigger AI analysis
  try {
    const metadata = extractMetadata(event);
    const analysis = await fetchAIAnalysis(event, selectedArticles, metadata, redditPosts);
    renderAIVerdict(0, analysis);
    saveToHistory(event, analysis);
  } catch (e) {
    console.warn('AI analysis failed:', e);
    renderAIVerdict(0, null);
  }
}

// ---- History View ----

function saveToHistory(event, analysis) {
  if (!analysis || !analysis.verdict) return;

  try {
    const history = JSON.parse(localStorage.getItem('polymarket_history') || '[]');

    // Create history item
    const item = {
      id: Date.now().toString(),
      date: new Date().toISOString(),
      eventTitle: event.title,
      eventUrl: `https://polymarket.com/event/${event.slug}`,
      verdict: analysis.verdict,
      confidence: analysis.confidence
    };

    // Add to beginning of array
    history.unshift(item);

    // Keep only last 50 analyses
    const trimmedHistory = history.slice(0, 50);
    localStorage.setItem('polymarket_history', JSON.stringify(trimmedHistory));
  } catch (e) {
    console.error('Failed to save to history', e);
  }
}

function showHistoryDialog() {
  const container = document.getElementById('bet-selector-container');
  let history = [];

  try {
    history = JSON.parse(localStorage.getItem('polymarket_history') || '[]');
  } catch (e) {
    console.error('Failed to load history', e);
  }

  container.innerHTML = `
    <div class="bet-selector-overlay" id="history-overlay">
      <div class="api-key-dialog">
        <div class="dialog-header">
          <div class="dialog-icon" style="background: rgba(0, 204, 255, 0.1); color: #00ccff; border-color: rgba(0, 204, 255, 0.2);">🕒</div>
          <h2>Analysis <span class="accent" style="color: #00ccff;">History</span></h2>
          <p>Your past AI-powered predictions</p>
        </div>

        <div class="history-list">
          ${history.length === 0 ? `
            <div class="history-empty">
              No analysis history yet. Analyze a market to see it here!
            </div>
          ` : history.map(item => `
            <div class="history-card" onclick="window.open('${item.eventUrl}', '_blank')">
              <div class="history-header">
                <div class="history-title">${item.eventTitle}</div>
                <div class="history-date">${timeAgo(item.date)}</div>
              </div>
              <div class="history-verdict ${item.verdict.toLowerCase()}">
                ${item.verdict === 'OPPORTUNITY' ? '💰 ' : item.verdict === 'AVOID' ? '🚫 ' : '⏸️ '}${item.verdict} 
                <span style="font-weight: normal; margin-left: 5px; opacity: 0.8">${item.confidence}%</span>
              </div>
            </div>
          `).join('')}
        </div>

        <div class="dialog-actions" style="display: flex; gap: 10px; margin-top: 20px;">
          <button class="dialog-secondary-btn" id="history-back" type="button" style="width: 100%; padding: 14px; background: var(--bg-secondary); border: 1px solid var(--border-subtle); border-radius: 12px; color: var(--text-primary); cursor: pointer; font-weight: 600;">
            ← Back to Markets
          </button>
        </div>
      </div>
    </div>
  `;

  const backBtn = container.querySelector('#history-back');
  backBtn.addEventListener('click', () => {
    const overlay = document.getElementById('history-overlay');
    overlay.classList.add('closing');
    setTimeout(() => {
      container.innerHTML = '';
      renderBetSelector();
    }, 350);
  });
}

// ---- App Init ----

async function init() {
  const loadingEl = document.getElementById('loading');
  const errorEl = document.getElementById('error');

  try {
    allEvents = await fetchAllEvents();

    if (!allEvents || !allEvents.length) {
      throw new Error('No active events found');
    }

    // Hide loading, show bet selector
    loadingEl.style.display = 'none';
    renderBetSelector();

  } catch (error) {
    console.error('App init error:', error);
    loadingEl.style.display = 'none';
    errorEl.style.display = 'block';
    document.getElementById('error-message').textContent = error.message;
  }
}

// Start the app
init();
