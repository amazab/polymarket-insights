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
          <div class="insights-icon">🔍</div>
          <h3>Web Insights</h3>
        </div>
        <div class="insights-loading">
          <div class="insights-spinner"></div>
          Scanning the web for insights...
        </div>
      </div>
    </article>
  `;
}

function renderInsights(index, articles) {
    const container = document.getElementById(`insights-${index}`);
    if (!container) return;

    const header = container.querySelector('.insights-header').outerHTML;

    if (!articles.length) {
        container.innerHTML = `
      ${header}
      <p class="no-insights">No recent articles found for this market.</p>
    `;
        return;
    }

    container.innerHTML = `
    ${header}
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

// ---- App Init ----

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

        // Fetch insights for each event (in parallel)
        const insightPromises = events.map((event, i) => {
            const searchQuery = event.title;
            return fetchInsights(searchQuery).then(articles => renderInsights(i, articles));
        });

        await Promise.allSettled(insightPromises);

    } catch (error) {
        console.error('App init error:', error);
        loadingEl.style.display = 'none';
        errorEl.style.display = 'block';
        document.getElementById('error-message').textContent = error.message;
    }
}

// Start the app
init();
