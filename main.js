// ============================================
// POLYMARKET INSIGHTS — CLIENT APPLICATION
// ============================================

const POLYMARKET_API = 'https://gamma-api.polymarket.com';
const PROXY_API = 'http://localhost:3001';

// ---- Data Fetching ----

async function fetchTopEvents() {
  const url = `${PROXY_API}/api/polymarket/events?limit=3&order=volume24hr&ascending=false&active=true&closed=false`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Polymarket API error: ${response.status}`);
  const events = await response.json();
  return events;
}

async function fetchInsights(query) {
  try {
    const url = `${PROXY_API}/api/search?q=${encodeURIComponent(query)}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('Search failed');
    const data = await response.json();
    return data.results || [];
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

function renderInsights(index, articles) {
  const panel = document.getElementById(`panel-web-${index}`);
  if (!panel) return;

  if (!articles.length) {
    panel.innerHTML = `<p class="no-insights">No recent articles found for this market.</p>`;
    return;
  }

  panel.innerHTML = `
    <div class="insights-list">
      ${articles.map(article => `
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
}

// ---- AI Analysis ----

async function fetchAIAnalysis(event, newsArticles, metadata) {
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
        }))
      }
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

// ---- App Init ----

// Store fetched articles per event for AI analysis
const eventArticles = {};

async function init() {
  const loadingEl = document.getElementById('loading');
  const errorEl = document.getElementById('error');
  const marketsEl = document.getElementById('markets');

  try {
    const events = await fetchTopEvents();

    if (!events || !events.length) {
      throw new Error('No active events found');
    }

    // Hide loading, render cards
    loadingEl.style.display = 'none';
    marketsEl.innerHTML = events.map((event, i) => renderMarketCard(event, i)).join('');

    // Fetch web insights for each event (in parallel)
    const insightPromises = events.map((event, i) => {
      const searchQuery = event.title;
      return fetchInsights(searchQuery).then(articles => {
        eventArticles[i] = articles;
        renderInsights(i, articles);
      });
    });

    await Promise.allSettled(insightPromises);

    // Now trigger AI analysis sequentially (free-tier rate limits)
    for (let i = 0; i < events.length; i++) {
      const metadata = extractMetadata(events[i]);
      const articles = eventArticles[i] || [];
      try {
        const analysis = await fetchAIAnalysis(events[i], articles, metadata);
        renderAIVerdict(i, analysis);
      } catch (e) {
        console.warn(`AI analysis failed for event ${i}:`, e);
        renderAIVerdict(i, null);
      }
      // Delay between requests to avoid rate limiting
      if (i < events.length - 1) {
        await new Promise(r => setTimeout(r, 3000));
      }
    }

  } catch (error) {
    console.error('App init error:', error);
    loadingEl.style.display = 'none';
    errorEl.style.display = 'block';
    document.getElementById('error-message').textContent = error.message;
  }
}

// Start the app
init();
