// app.js - MarketPulse AI Client-Side Application
(() => {
  // Application State
  const state = {
    geminiApiKey: localStorage.getItem('fb_hunter_gemini_key') || '',
    fbCookies: localStorage.getItem('fb_hunter_cookies') || '',
    geminiModel: localStorage.getItem('fb_hunter_gemini_model') || 'gemini-2.5-flash',
    savedBookmarks: JSON.parse(localStorage.getItem('fb_hunter_bookmarks') || '[]'),
    listings: [],
    marketPulse: null,
    currentFilter: 'all',
    activeModalItem: null,
    isSearching: false,
    isAnalyzing: false
  };

  const FALLBACK_IMG = 'https://images.unsplash.com/photo-1526738549149-8e07eca6c147?auto=format&fit=crop&w=600&q=80';
  // Escape untrusted text (listings come from other Facebook users)
  function esc(v) {
    return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function safeUrl(u, fallback) {
    try { const p = new URL(u); return p.protocol === 'https:' ? p.href : fallback; } catch { return fallback; }
  }
  // DOM Elements
  const elements = {
    // Nav & Pills
    fbStatusPill: document.getElementById('fbStatusPill'),
    geminiStatusPill: document.getElementById('geminiStatusPill'),
    savedDealsBtn: document.getElementById('savedDealsBtn'),
    savedCountBadge: document.getElementById('savedCountBadge'),
    openSettingsBtn: document.getElementById('openSettingsBtn'),

    // Search Controls
    searchForm: document.getElementById('searchForm'),
    searchInput: document.getElementById('searchInput'),
    locationInput: document.getElementById('locationInput'),
    minPriceInput: document.getElementById('minPriceInput'),
    maxPriceInput: document.getElementById('maxPriceInput'),
    sortSelect: document.getElementById('sortSelect'),
    demoModeToggle: document.getElementById('demoModeToggle'),
    scanBtn: document.getElementById('scanBtn'),
    scanSpinner: document.getElementById('scanSpinner'),
    scanBtnText: document.getElementById('scanBtnText'),
    sampleSearchBtn: document.getElementById('sampleSearchBtn'),

    // Market Pulse
    marketPulseCard: document.getElementById('marketPulseCard'),
    pulseQueryLabel: document.getElementById('pulseQueryLabel'),
    statAvgPrice: document.getElementById('statAvgPrice'),
    statSteals: document.getElementById('statSteals'),
    statTotalItems: document.getElementById('statTotalItems'),
    pulseBriefingText: document.getElementById('pulseBriefingText'),
    exportCsvBtn: document.getElementById('exportCsvBtn'),

    // Filter counts
    countAll: document.getElementById('countAll'),
    countSteals: document.getElementById('countSteals'),
    countGreat: document.getElementById('countGreat'),
    countSaved: document.getElementById('countSaved'),

    // Listings Container
    resultsHeading: document.getElementById('resultsHeading'),
    resultsSourceTag: document.getElementById('resultsSourceTag'),
    emptyState: document.getElementById('emptyState'),
    cardsGrid: document.getElementById('cardsGrid'),

    // Inspector Modal
    dealModal: document.getElementById('dealModal'),
    closeDealModal: document.getElementById('closeDealModal'),
    modalItemImg: document.getElementById('modalItemImg'),
    modalScoreBadge: document.getElementById('modalScoreBadge'),
    modalItemTitle: document.getElementById('modalItemTitle'),
    modalItemPrice: document.getElementById('modalItemPrice'),
    modalItemFmv: document.getElementById('modalItemFmv'),
    modalItemSavings: document.getElementById('modalItemSavings'),
    modalItemLoc: document.getElementById('modalItemLoc'),
    modalItemSeller: document.getElementById('modalItemSeller'),
    modalItemDesc: document.getElementById('modalItemDesc'),
    modalItemFbLink: document.getElementById('modalItemFbLink'),
    modalVerdictBanner: document.getElementById('modalVerdictBanner'),
    modalVerdictWord: document.getElementById('modalVerdictWord'),
    modalVerdictDetails: document.getElementById('modalVerdictDetails'),
    modalEstProfit: document.getElementById('modalEstProfit'),
    modalTargetOffer: document.getElementById('modalTargetOffer'),
    modalScoreVal: document.getElementById('modalScoreVal'),
    modalTacticText: document.getElementById('modalTacticText'),
    modalFlagsList: document.getElementById('modalFlagsList'),
    generatedMessagesList: document.getElementById('generatedMessagesList'),
    regenMessagesBtn: document.getElementById('regenMessagesBtn'),

    // Settings Modal
    settingsModal: document.getElementById('settingsModal'),
    closeSettingsModal: document.getElementById('closeSettingsModal'),
    cancelSettingsBtn: document.getElementById('cancelSettingsBtn'),
    saveSettingsBtn: document.getElementById('saveSettingsBtn'),
    geminiApiKeyInput: document.getElementById('geminiApiKeyInput'),
    geminiModelSelect: document.getElementById('geminiModelSelect'),
    toggleKeyVisibility: document.getElementById('toggleKeyVisibility'),
    fbCookiesInput: document.getElementById('fbCookiesInput'),
    verifyCookiesBtn: document.getElementById('verifyCookiesBtn'),
    verifySpinner: document.getElementById('verifySpinner'),
    verifyFeedback: document.getElementById('verifyFeedback'),

    // Toast
    toastContainer: document.getElementById('toastContainer')
  };

  // Toast Notification
  function showToast(message, type = 'info', duration = 4000) {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    elements.toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  // Update Status Pills
  function updateStatusPills() {
    // FB Status
    const hasFbCookies = state.fbCookies && state.fbCookies.includes('c_user=');
    if (hasFbCookies && !elements.demoModeToggle.checked) {
      elements.fbStatusPill.innerHTML = '<span class="status-indicator success"></span><span class="status-label">FB: Cookies Active</span>';
    } else {
      elements.fbStatusPill.innerHTML = '<span class="status-indicator warning"></span><span class="status-label">FB: Demo Sandbox</span>';
    }

    // Gemini Status
    if (state.geminiApiKey) {
      elements.geminiStatusPill.innerHTML = '<span class="status-indicator success"></span><span class="status-label">AI: Connected</span>';
    } else {
      elements.geminiStatusPill.innerHTML = '<span class="status-indicator warning"></span><span class="status-label">AI: Key Needed</span>';
    }

    // Bookmarks count
    elements.savedCountBadge.textContent = state.savedBookmarks.length;
    elements.countSaved.textContent = state.savedBookmarks.length;
  }

  // Init Form Fields
  function initInputs() {
    elements.geminiApiKeyInput.value = state.geminiApiKey;
    elements.fbCookiesInput.value = state.fbCookies;
    elements.geminiModelSelect.value = state.geminiModel;

    // Default demo toggle to checked if no cookies
    if (!state.fbCookies) {
      elements.demoModeToggle.checked = true;
    }

    updateStatusPills();
  }

  // Open / Close Settings
  elements.openSettingsBtn.addEventListener('click', () => {
    elements.geminiApiKeyInput.value = state.geminiApiKey;
    elements.fbCookiesInput.value = state.fbCookies;
    elements.geminiModelSelect.value = state.geminiModel;
    elements.verifyFeedback.textContent = '';
    elements.settingsModal.classList.remove('hidden');
  });

  const hideSettings = () => elements.settingsModal.classList.add('hidden');
  elements.closeSettingsModal.addEventListener('click', hideSettings);
  elements.cancelSettingsBtn.addEventListener('click', hideSettings);

  // Toggle API Key visibility
  elements.toggleKeyVisibility.addEventListener('click', () => {
    const isPassword = elements.geminiApiKeyInput.type === 'password';
    elements.geminiApiKeyInput.type = isPassword ? 'text' : 'password';
    elements.toggleKeyVisibility.textContent = isPassword ? '🔒' : '👁️';
  });

  // Verify Facebook Cookies
  elements.verifyCookiesBtn.addEventListener('click', async () => {
    const cookies = elements.fbCookiesInput.value.trim();
    if (!cookies) {
      elements.verifyFeedback.className = 'verify-feedback error';
      elements.verifyFeedback.textContent = 'Please paste cookies first.';
      return;
    }

    elements.verifySpinner.classList.remove('hidden');
    elements.verifyFeedback.className = 'verify-feedback';
    elements.verifyFeedback.textContent = 'Verifying with Facebook...';

    try {
      const res = await fetch('/api/validate-cookies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cookies })
      });
      const data = await res.json();
      elements.verifySpinner.classList.add('hidden');

      if (data.valid) {
        elements.verifyFeedback.className = 'verify-feedback success';
        elements.verifyFeedback.textContent = '✓ Active & Valid!';
        showToast('Facebook session cookies verified successfully!', 'success');
      } else {
        elements.verifyFeedback.className = 'verify-feedback error';
        elements.verifyFeedback.textContent = data.message || 'Verification failed.';
        showToast(data.message || 'Invalid cookies.', 'error');
      }
    } catch (err) {
      elements.verifySpinner.classList.add('hidden');
      elements.verifyFeedback.className = 'verify-feedback error';
      elements.verifyFeedback.textContent = 'Connection error: ' + err.message;
    }
  });

  // Save Settings
  elements.saveSettingsBtn.addEventListener('click', () => {
    state.geminiApiKey = elements.geminiApiKeyInput.value.trim();
    state.fbCookies = elements.fbCookiesInput.value.trim();
    state.geminiModel = elements.geminiModelSelect.value;

    localStorage.setItem('fb_hunter_gemini_key', state.geminiApiKey);
    localStorage.setItem('fb_hunter_cookies', state.fbCookies);
    localStorage.setItem('fb_hunter_gemini_model', state.geminiModel);

    updateStatusPills();
    hideSettings();
    showToast('Credentials saved to your browser storage.', 'success');
  });

  // Demo toggle switch change
  elements.demoModeToggle.addEventListener('change', () => {
    updateStatusPills();
  });

  // Preset chips click
  document.querySelectorAll('.preset-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      elements.searchInput.value = chip.dataset.query;
      executeScan();
    });
  });

  // Sample search from empty state
  elements.sampleSearchBtn.addEventListener('click', () => {
    elements.searchInput.value = 'iPhone 15 Pro';
    executeScan();
  });

  // Search Form Submit
  elements.searchForm.addEventListener('submit', (e) => {
    e.preventDefault();
    executeScan();
  });

  // Main Scan & Analysis Workflow
  async function executeScan() {
    const query = elements.searchInput.value.trim();
    const location = elements.locationInput.value.trim() || 'tallinn';
    const minPrice = elements.minPriceInput.value;
    const maxPrice = elements.maxPriceInput.value;
    const forceDemo = elements.demoModeToggle.checked || !state.fbCookies;

    if (!query) {
      showToast('Please enter an item or keyword to search.', 'warning');
      return;
    }

    // Set Loading UI
    setSearchLoading(true);
    elements.emptyState.classList.add('hidden');
    elements.cardsGrid.classList.remove('hidden');
    elements.cardsGrid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 60px 20px;">
        <div class="btn-spinner" style="width: 32px; height: 32px; border-width: 3px; margin-bottom: 16px;"></div>
        <h3 style="margin-bottom: 8px;">Scanning Facebook Marketplace (${location.toUpperCase()})...</h3>
        <p style="color: var(--text-muted); font-size: 0.9rem;">Retrieving listings, images, and price data...</p>
      </div>
    `;

    try {
      // 1. Fetch Listings from Backend
      const searchRes = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          location,
          minPrice,
          maxPrice,
          cookies: state.fbCookies,
          forceDemo
        })
      });

      const searchData = await searchRes.json();

      if (!searchRes.ok || !searchData.success) {
        throw new Error(searchData.error || 'Failed to search Marketplace.');
      }

      state.listings = searchData.items || [];
      elements.resultsSourceTag.textContent = searchData.source === 'live_facebook' ? 'Live Facebook Data' : 'Sandbox Simulated Data';
      elements.resultsHeading.textContent = `Listings for "${query}" (${state.listings.length} found)`;

      if (state.listings.length === 0) {
        elements.cardsGrid.innerHTML = `
          <div style="grid-column: 1/-1; text-align: center; padding: 60px 20px;">
            <h3>No listings found</h3>
            <p style="color: var(--text-muted);">Try a broader keyword or expand your price filters.</p>
          </div>
        `;
        setSearchLoading(false);
        return;
      }

      // Render initial raw listings
      renderCards();

      // 2. Automatically trigger Gemini AI Valuation
      if (state.geminiApiKey) {
        await analyzeListingsWithGemini(query, location);
      } else {
        showToast('Tip: Add your Gemini API Key in Settings to unlock AI deal scoring & arbitrage valuation!', 'warning', 6000);
      }

    } catch (err) {
      elements.cardsGrid.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 60px 20px; color: var(--accent-rose);">
          <h3>Search Error</h3>
          <p>${esc(err.message)}</p>
        </div>
      `;
      showToast(err.message, 'error');
    } finally {
      setSearchLoading(false);
    }
  }

  // Trigger Gemini AI Deal Evaluation
  async function analyzeListingsWithGemini(query, location) {
    elements.pulseBriefingText.textContent = 'Gemini AI is analyzing real-world fair market values, resale margins, and condition flags...';
    elements.marketPulseCard.classList.remove('hidden');

    try {
      const aiRes = await fetch('/api/analyze-deals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: state.listings,
          query,
          location,
          geminiApiKey: state.geminiApiKey,
          model: state.geminiModel
        })
      });

      const aiData = await aiRes.json();
      if (!aiRes.ok || !aiData.success) {
        throw new Error(aiData.error || 'Gemini analysis failed.');
      }

      // Update state with enriched AI data
      state.listings = aiData.items || state.listings;
      state.marketPulse = aiData.marketPulse;

      // Update Market Pulse Briefing Card
      if (state.marketPulse) {
        elements.pulseQueryLabel.textContent = `${query} in ${location}`;
        elements.statAvgPrice.textContent = state.marketPulse.avgMarketPrice || 'Varies';
        elements.pulseBriefingText.textContent = state.marketPulse.executiveSummary || 'Market valuation completed.';
      }

      // Re-sort & Render
      sortListings();
      renderCards();
      updateFilterCounts();
      showToast('Gemini Deal Valuation completed!', 'success');

    } catch (err) {
      console.error('AI Analysis error:', err);
      elements.pulseBriefingText.textContent = `AI analysis warning: ${err.message}. Showing raw listings.`;
      showToast(`AI Valuation: ${err.message}`, 'warning');
    }
  }

  // Update Search Button UI Loading State
  function setSearchLoading(loading) {
    state.isSearching = loading;
    if (loading) {
      elements.scanSpinner.classList.remove('hidden');
      elements.scanBtnText.textContent = 'Scanning Radar...';
      elements.scanBtn.disabled = true;
    } else {
      elements.scanSpinner.classList.add('hidden');
      elements.scanBtnText.textContent = 'Scan Marketplace & Value Deals';
      elements.scanBtn.disabled = false;
    }
  }

  // Sorting
  function sortListings() {
    const sortVal = elements.sortSelect.value;
    if (sortVal === 'dealScore') {
      state.listings.sort((a, b) => (b.dealScore || 50) - (a.dealScore || 50));
    } else if (sortVal === 'profit') {
      const getNumProfit = (item) => parseFloat(String(item.estimatedProfit || '0').replace(/[^0-9.-]/g, '')) || 0;
      state.listings.sort((a, b) => getNumProfit(b) - getNumProfit(a));
    } else if (sortVal === 'priceAsc') {
      state.listings.sort((a, b) => (a.numericPrice || 0) - (b.numericPrice || 0));
    } else if (sortVal === 'priceDesc') {
      state.listings.sort((a, b) => (b.numericPrice || 0) - (a.numericPrice || 0));
    }
  }

  elements.sortSelect.addEventListener('change', () => {
    sortListings();
    renderCards();
  });

  // Filter Tabs
  document.querySelectorAll('.filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      state.currentFilter = tab.dataset.filter;
      renderCards();
    });
  });

  function updateFilterCounts() {
    const all = state.listings.length;
    const steals = state.listings.filter(i => (i.dealScore || 0) >= 90).length;
    const great = state.listings.filter(i => (i.dealScore || 0) >= 75 && (i.dealScore || 0) < 90).length;
    const saved = state.savedBookmarks.length;

    elements.countAll.textContent = all;
    elements.countSteals.textContent = steals;
    elements.countGreat.textContent = great;
    elements.countSaved.textContent = saved;
    elements.statSteals.textContent = steals + great;
    elements.statTotalItems.textContent = all;
  }

  // Render Deal Cards
  function renderCards() {
    let itemsToDisplay = [...state.listings];

    if (state.currentFilter === 'steals') {
      itemsToDisplay = itemsToDisplay.filter(i => (i.dealScore || 0) >= 90);
    } else if (state.currentFilter === 'great') {
      itemsToDisplay = itemsToDisplay.filter(i => (i.dealScore || 0) >= 75);
    } else if (state.currentFilter === 'bookmarks') {
      itemsToDisplay = state.savedBookmarks;
    }

    if (itemsToDisplay.length === 0) {
      elements.cardsGrid.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 40px 20px; color: var(--text-muted);">
          <p>No listings match this filter tab.</p>
        </div>
      `;
      return;
    }

    elements.cardsGrid.innerHTML = itemsToDisplay.map(item => {
      const score = item.dealScore || 50;
      let badgeClass = 'fair';
      let badgeText = `${score} FAIR`;

      if (score >= 90) {
        badgeClass = 'steal';
        badgeText = `🔥 ${score} STEAL`;
      } else if (score >= 75) {
        badgeClass = 'great';
        badgeText = `⚡ ${score} GREAT`;
      } else if (score < 50) {
        badgeClass = 'skip';
        badgeText = `⚠️ ${score} SKIP`;
      }

      const isBookmarked = state.savedBookmarks.some(b => b.id === item.id);
      const isStealCard = score >= 90;

      return `
        <div class="deal-card ${isStealCard ? 'card-steal' : ''}" data-id="${esc(item.id)}">
          <div class="card-img-box">
            <img src="${esc(safeUrl(item.image, FALLBACK_IMG))}" alt="${esc(item.title)}" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1526738549149-8e07eca6c147?auto=format&fit=crop&w=600&q=80'">
            <div class="card-score-badge ${badgeClass}">${badgeText}</div>
            <button class="card-bookmark-btn ${isBookmarked ? 'active' : ''}" data-bookmark-id="${esc(item.id)}" title="Save deal">
              ★
            </button>
          </div>

          <div class="card-body">
            <h3 class="card-title" title="${esc(item.title)}">${esc(item.title)}</h3>
            <div class="card-location-meta">
              <span>📍 ${esc(item.location || 'Local Area')}</span>
              <span>•</span>
              <span>👤 ${esc(item.sellerName || 'Seller')}</span>
            </div>

            <div class="card-price-grid">
              <div>
                <span class="card-listed-price">${esc(item.price)}</span>
              </div>
              <div class="card-fmv-wrap">
                <div class="card-fmv-label">Est. FMV</div>
                <div class="card-fmv-val">${esc(item.estimatedFmv || 'N/A')}</div>
              </div>
            </div>

            ${item.estimatedProfit && item.estimatedProfit !== '$0' ? `
              <div class="card-profit-chip">
                <span>💰 Est. Flip Profit: ${esc(item.estimatedProfit)}</span>
                ${item.discountPercent ? `<span>(${esc(item.discountPercent)}% off)</span>` : ''}
              </div>
            ` : ''}

            <p class="card-ai-verdict">${esc(item.verdict || 'Evaluation ready. Click inspect to generate offers.')}</p>

            <div class="card-actions">
              <button class="inspect-btn" data-inspect-id="${esc(item.id)}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                AI Inspector & Offers
              </button>
              <a href="${esc(safeUrl(item.link, 'https://www.facebook.com/marketplace/'))}" target="_blank" rel="noopener" class="fb-link-btn" title="Open on Facebook">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
              </a>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Attach card event listeners
    attachCardListeners();
  }

  function attachCardListeners() {
    // Bookmark buttons
    document.querySelectorAll('.card-bookmark-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.bookmarkId;
        toggleBookmark(id);
      });
    });

    // Inspect buttons
    document.querySelectorAll('.inspect-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.inspectId;
        openInspector(id);
      });
    });

    // Card click
    document.querySelectorAll('.deal-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.dataset.id;
        openInspector(id);
      });
    });
  }

  // Toggle Bookmark
  function toggleBookmark(itemId) {
    const targetItem = state.listings.find(i => i.id === itemId) || state.savedBookmarks.find(i => i.id === itemId);
    if (!targetItem) return;

    const existsIdx = state.savedBookmarks.findIndex(b => b.id === itemId);
    if (existsIdx > -1) {
      state.savedBookmarks.splice(existsIdx, 1);
      showToast('Removed from saved deals.', 'info');
    } else {
      state.savedBookmarks.push(targetItem);
      showToast('Saved deal to bookmarks! ⭐', 'success');
    }

    localStorage.setItem('fb_hunter_bookmarks', JSON.stringify(state.savedBookmarks));
    updateStatusPills();
    updateFilterCounts();
    renderCards();
  }

  // Open Inspector Modal
  function openInspector(itemId) {
    const item = state.listings.find(i => i.id === itemId) || state.savedBookmarks.find(i => i.id === itemId);
    if (!item) return;

    state.activeModalItem = item;

    elements.modalItemImg.src = safeUrl(item.image, FALLBACK_IMG);
    elements.modalScoreBadge.textContent = `${item.dealScore || 50}/100`;
    elements.modalItemTitle.textContent = item.title;
    elements.modalItemPrice.textContent = item.price;
    elements.modalItemFmv.textContent = `FMV: ${item.estimatedFmv || 'N/A'}`;
    elements.modalItemSavings.textContent = item.discountPercent ? `-${item.discountPercent}%` : 'Fair';
    elements.modalItemLoc.textContent = `📍 ${item.location || 'Local'}`;
    elements.modalItemSeller.textContent = `👤 ${item.sellerName || 'Marketplace Seller'}`;
    elements.modalItemDesc.textContent = item.description || 'No detailed description provided by seller.';
    elements.modalItemFbLink.href = safeUrl(item.link, 'https://www.facebook.com/marketplace/');

    elements.modalVerdictWord.textContent = item.badge || 'VALUATION';
    elements.modalVerdictDetails.textContent = item.verdict || 'Listing analyzed against market comps.';
    elements.modalEstProfit.textContent = item.estimatedProfit || '$0';
    elements.modalTargetOffer.textContent = item.negotiationOffer || item.price;
    elements.modalScoreVal.textContent = `${item.dealScore || 50}/100`;
    elements.modalTacticText.textContent = item.negotiationTip || 'Propose same-day pickup with cash.';

    // Red flags
    if (Array.isArray(item.redFlags) && item.redFlags.length > 0) {
      elements.modalFlagsList.innerHTML = item.redFlags.map(f => `<li style="color: var(--accent-rose);">⚠️ ${esc(f)}</li>`).join('');
    } else {
      elements.modalFlagsList.innerHTML = '<li>✓ Clean listing - no suspicious red flags detected.</li>';
    }

    // Load initial pre-written messages
    generateNegotiationMessages(item);

    elements.dealModal.classList.remove('hidden');
  }

  // Close Inspector Modal
  elements.closeDealModal.addEventListener('click', () => {
    elements.dealModal.classList.add('hidden');
  });

  // Generate Negotiation Messages
  async function generateNegotiationMessages(item) {
    elements.generatedMessagesList.innerHTML = `
      <div style="text-align: center; padding: 15px; color: var(--text-muted);">
        <div class="btn-spinner" style="margin-bottom: 8px;"></div>
        <p>Crafting custom seller messages...</p>
      </div>
    `;

    const offerPrice = item.negotiationOffer || item.price;

    // Fallback templates immediately shown if no API key
    const fallbackMessages = [
      {
        style: '⚡ Fast Cash Pick-Up',
        text: `Hi ${item.sellerName || 'there'}, is this still available? I can come pick it up today with cash for ${offerPrice}. Let me know if that works for you!`
      },
      {
        style: '🤝 Friendly Bargain',
        text: `Hello! I'm interested in your ${item.title}. If everything is in good working order, would you consider ${offerPrice} for a quick, smooth pickup?`
      },
      {
        style: '💼 Direct & Respectful',
        text: `Hi! Ready to buy. Can pick it up at your convenience. Please let me know your general location for pickup.`
      }
    ];

    if (!state.geminiApiKey) {
      renderMessagesList(fallbackMessages);
      return;
    }

    try {
      const res = await fetch('/api/generate-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item,
          geminiApiKey: state.geminiApiKey
        })
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.messages)) {
        renderMessagesList(data.messages);
      } else {
        renderMessagesList(fallbackMessages);
      }
    } catch {
      renderMessagesList(fallbackMessages);
    }
  }

  function renderMessagesList(messages) {
    elements.generatedMessagesList.innerHTML = messages.map(m => `
      <div class="message-card">
        <div class="message-style-tag">${esc(m.style)}</div>
        <p class="message-text">${esc(m.text)}</p>
        <button class="copy-message-btn" data-copy-text="${encodeURIComponent(m.text)}">Copy Message</button>
      </div>
    `).join('');

    elements.generatedMessagesList.querySelectorAll('.copy-message-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const text = decodeURIComponent(btn.dataset.copyText);
        navigator.clipboard.writeText(text).then(() => {
          const originalText = btn.textContent;
          btn.textContent = '✓ Copied!';
          btn.style.background = 'var(--accent-emerald)';
          btn.style.color = '#fff';
          setTimeout(() => {
            btn.textContent = originalText;
            btn.style.background = '';
            btn.style.color = '';
          }, 2000);
          showToast('Message copied to clipboard!', 'success');
        });
      });
    });
  }

  elements.regenMessagesBtn.addEventListener('click', () => {
    if (state.activeModalItem) {
      generateNegotiationMessages(state.activeModalItem);
    }
  });

  // Saved Deals Nav Click
  elements.savedDealsBtn.addEventListener('click', () => {
    document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
    document.querySelector('.filter-tab[data-filter="bookmarks"]')?.classList.add('active');
    state.currentFilter = 'bookmarks';
    renderCards();
    showToast(`Showing ${state.savedBookmarks.length} bookmarked deals.`, 'info');
  });

  // Export to CSV
  elements.exportCsvBtn.addEventListener('click', () => {
    if (state.listings.length === 0) {
      showToast('No listings to export.', 'warning');
      return;
    }

    const headers = ['ID', 'Title', 'Listed Price', 'Estimated FMV', 'Deal Score', 'Flip Profit', 'Location', 'Seller', 'Link'];
    const rows = state.listings.map(item => [
      `"${item.id}"`,
      `"${(item.title || '').replace(/"/g, '""')}"`,
      `"${item.price}"`,
      `"${item.estimatedFmv || ''}"`,
      item.dealScore || 50,
      `"${item.estimatedProfit || ''}"`,
      `"${item.location || ''}"`,
      `"${item.sellerName || ''}"`,
      `"${item.link}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `marketplace-deals-${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();

    showToast('Exported deals to CSV!', 'success');
  });

  // Wipe everything this browser has stored (key, cookies, bookmarks)
  document.getElementById('clearDataBtn').addEventListener('click', () => {
    if (!confirm('Remove your API key, Facebook cookies and saved deals from this browser?')) return;
    Object.keys(localStorage).filter(k => k.startsWith('fb_hunter_')).forEach(k => localStorage.removeItem(k));
    state.geminiApiKey = '';
    state.fbCookies = '';
    state.savedBookmarks = [];
    elements.geminiApiKeyInput.value = '';
    elements.fbCookiesInput.value = '';
    updateStatusPills();
    showToast('All your data was removed from this browser.', 'success');
  });

  // Initialize
  initInputs();
})();

