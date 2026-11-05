// server.js - AI-Powered Facebook Marketplace Deal Hunter Backend
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;

const ALLOWED_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];

// Behind Render's proxy: use the real client IP for rate limiting
app.set('trust proxy', 1);
app.disable('x-powered-by');

// Same-origin only: the UI is served by this server, so no cross-site API use
app.use(cors({ origin: false }));
app.use(express.json({ limit: '2mb' }));

// Security headers + never cache API responses (they may contain per-user data)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
  next();
});

// Simple in-memory per-IP rate limiter (nothing user-specific is persisted)
const rateBuckets = new Map();
function rateLimit(max, windowMs) {
  return (req, res, next) => {
    const now = Date.now();
    const bucket = rateBuckets.get(req.ip + req.path);
    if (!bucket || now > bucket.reset) {
      rateBuckets.set(req.ip + req.path, { count: 1, reset: now + windowMs });
      return next();
    }
    if (++bucket.count > max) {
      return res.status(429).json({ success: false, error: 'Too many requests. Please slow down.' });
    }
    next();
  };
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of rateBuckets) if (now > v.reset) rateBuckets.delete(k);
}, 60000).unref();
app.use('/api/', rateLimit(30, 60000));

app.use(express.static(path.join(__dirname, 'public')));

// Standard User-Agent for realistic web queries
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    service: 'fb-marketplace-ai-hunter'
  });
});

// Helper: Normalize & Clean Cookie string
function sanitizeCookies(rawCookies) {
  if (!rawCookies || typeof rawCookies !== 'string') return '';
  // Support both key=value; format and JSON exports
  if (rawCookies.trim().startsWith('[') || rawCookies.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(rawCookies);
      if (Array.isArray(parsed)) {
        return parsed.map(c => `${c.name}=${c.value}`).join('; ');
      }
    } catch {
      // Continue as plain text
    }
  }
  // Strip control chars / newlines to prevent header injection
  return rawCookies.trim().replace(/[^\x20-\x7E]+/g, ' ');
}

// Validate Facebook Session Cookies
app.post('/api/validate-cookies', async (req, res) => {
  try {
    const rawCookies = req.body.cookies;
    const cookieString = sanitizeCookies(rawCookies);

    if (!cookieString) {
      return res.status(400).json({ valid: false, message: 'No cookies provided.' });
    }

    const hasUser = cookieString.includes('c_user=');
    const hasXs = cookieString.includes('xs=');

    if (!hasUser || !hasXs) {
      return res.json({
        valid: false,
        warning: true,
        message: 'Missing essential Facebook session tokens (`c_user` or `xs`). Make sure you copied all cookies while logged into Facebook.'
      });
    }

    // Quick verification ping to Facebook
    const fbRes = await fetch('https://www.facebook.com/marketplace/', {
      method: 'GET',
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cookie': cookieString
      },
      redirect: 'manual'
    });

    const locationHeader = fbRes.headers.get('location') || '';
    if (fbRes.status === 302 && (locationHeader.includes('login') || locationHeader.includes('checkpoint'))) {
      return res.json({
        valid: false,
        message: 'Facebook redirected to login/checkpoint. The cookies may have expired or need re-logging in.'
      });
    }

    return res.json({
      valid: true,
      statusCode: fbRes.status,
      message: 'Facebook session cookies verified successfully! Marketplace access ready.'
    });
  } catch (err) {
    return res.status(500).json({ valid: false, error: err.message });
  }
});

// Extract listings from Facebook HTML response
function extractFacebookListings(html, query, locationName) {
  const listings = [];
  const seenIds = new Set();

  try {
    // 1. Scan for Relay JSON data embedded in script tags
    const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
    let match;

    while ((match = scriptRegex.exec(html)) !== null) {
      const content = match[1];
      if (!content || (!content.includes('marketplace_search') && !content.includes('listing_price') && !content.includes('MarketplaceListing'))) {
        continue;
      }

      // Find JSON objects containing marketplace listings
      const jsonRegex = /\{"node":\{"__typename":"MarketplaceListing"[\s\S]*?\}\}/g;
      let jsonMatch;
      while ((jsonMatch = jsonRegex.exec(content)) !== null) {
        try {
          const item = JSON.parse(jsonMatch[0]).node;
          if (item && item.id && !seenIds.has(item.id)) {
            seenIds.add(item.id);
            const price = item.listing_price?.formatted_amount || item.listing_price?.amount || 'N/A';
            const numPrice = parseFloat(String(price).replace(/[^0-9.]/g, '')) || 0;
            listings.push({
              id: item.id,
              title: item.marketplace_listing_title || item.story_title || 'Listing on Marketplace',
              price: price,
              numericPrice: numPrice,
              currency: item.listing_price?.currency || '$',
              location: item.location?.reverse_geocode?.city || locationName || 'Marketplace',
              image: item.primary_listing_photo?.image?.uri || 'https://images.unsplash.com/photo-1526738549149-8e07eca6c147?auto=format&fit=crop&w=600&q=80',
              link: `https://www.facebook.com/marketplace/item/${item.id}/`,
              sellerName: item.marketplace_listing_seller?.name || 'Facebook Seller',
              isLive: true
            });
          }
        } catch {
          // ignore parsing error on sub-fragment
        }
      }

      // Alternative Comet search match
      // Alternative Comet search match: split the payload at each listing title and
      // read price / id / photo from the segment that belongs to that listing.
      const unesc = (s) => { try { return JSON.parse(`"${s}"`); } catch { return s; } };
      const titleRegex = /"marketplace_listing_title":"((?:[^"\\]|\\.)*)"/g;
      const marks = [];
      let tm;
      while ((tm = titleRegex.exec(content)) !== null) marks.push({ index: tm.index, title: tm[1] });

      marks.forEach((mark, i) => {
        const end = i + 1 < marks.length ? marks[i + 1].index : Math.min(content.length, mark.index + 6000);
        const segment = content.slice(mark.index, end);
        const priceM = segment.match(/"formatted_amount":"((?:[^"\\]|\\.)*)"/);
        const idM = segment.match(/"id":"(\d{8,})"/);
        if (!priceM || !idM || seenIds.has(idM[1])) return;
        // Skip anything Facebook itself flags as sold / pending / hidden / not live
        if (/"(?:is_sold|is_pending|is_hidden|is_disabled_by_admin|is_draft)":true/.test(segment) ||
            /"is_live":false/.test(segment)) return;
        // Only use a photo found inside this listing's own segment (never a neighbour's)
        const photoRe = /"(?:primary_listing_photo|listing_photos?)"[\s\S]{0,300}?"uri":"((?:[^"\\]|\\.)*)"/;
        const photoM = segment.match(photoRe);
        const price = unesc(priceM[1]);
        const image = photoM ? unesc(photoM[1]) : '';
        seenIds.add(idM[1]);
        listings.push({
          id: idM[1],
          title: unesc(mark.title),
          price,
          numericPrice: parseFloat(String(price).replace(/[^0-9.]/g, '')) || 0,
          currency: price.replace(/[0-9., ]/g, '') || '$',
          location: locationName || 'Local Area',
          image: image.startsWith('https://') ? image : 'https://images.unsplash.com/photo-1526738549149-8e07eca6c147?auto=format&fit=crop&w=600&q=80',
          link: `https://www.facebook.com/marketplace/item/${idM[1]}/`,
          sellerName: 'Marketplace Seller',
          isLive: true
        });
      });
    }
  } catch (err) {
    console.error('Error during HTML listing parsing:', err);
  }

  return listings;
}

// Check a listing's own page: returns false only when it is clearly sold, removed or private.
// If the check is inconclusive (timeout, odd response) we keep the listing.
async function isListingAvailable(item, cookieString) {
  try {
    const r = await fetch(item.link, {
      headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en-US,en;q=0.9', 'Cookie': cookieString },
      redirect: 'manual',
      signal: AbortSignal.timeout(7000)
    });
    if (r.status === 404 || r.status === 410) return false;
    if (r.status >= 300 && r.status < 400) return true; // login redirect etc. = inconclusive
    const page = await r.text();
    if (/"(?:is_sold|is_pending|is_hidden)":true/.test(page) || /"is_live":false/.test(page)) return false;
    if (/no longer available|isn(?:'|\\u0027|&#039;)t available anymore|listing (?:is|was) removed|content isn(?:'|&#039;)t available right now/i.test(page)) return false;
    return true;
  } catch {
    return true;
  }
}

async function filterAvailable(items, cookieString) {
  const capped = items.slice(0, 24);
  const keep = new Array(capped.length).fill(true);
  let next = 0;
  const worker = async () => {
    while (next < capped.length) {
      const i = next++;
      keep[i] = await isListingAvailable(capped[i], cookieString);
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker)); // 4 at a time to stay gentle
  return capped.filter((_, i) => keep[i]);
}

// Generate Realistic Demo Listings when cookies are omitted or for instant testing
function generateDemoListings(query, locationName, minPrice, maxPrice) {
  const qLower = (query || 'electronics').toLowerCase();
  const loc = locationName || 'Tallinn';

  const presets = [
    {
      title: `${query || 'Apple iPhone 15 Pro'} 256GB Titanium - Like New In Box`,
      price: '$650',
      numericPrice: 650,
      image: 'https://images.unsplash.com/photo-1695048133142-1a20484d2569?auto=format&fit=crop&w=800&q=80',
      description: 'Used for 2 months, 99% battery health. Comes with original box and cable. Need fast cash for rent.',
      seller: 'Alex K.',
      sellerJoined: '2021',
      location: loc
    },
    {
      title: `${query || 'Sony WH-1000XM5'} Wireless Noise-Cancelling Headphones`,
      price: '$170',
      numericPrice: 170,
      image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=800&q=80',
      description: 'Works perfectly, minimal signs of wear. Upgraded to AirPods Max so letting these go cheap.',
      seller: 'Elena M.',
      sellerJoined: '2019',
      location: loc
    },
    {
      title: `${query || 'M2 MacBook Air 13-inch'} 16GB RAM / 512GB SSD Space Gray`,
      price: '$720',
      numericPrice: 720,
      image: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&w=800&q=80',
      description: 'Excellent condition, used for light university study. No scratches on screen. Charger included.',
      seller: 'Marcus V.',
      sellerJoined: '2020',
      location: loc
    },
    {
      title: `${query || 'NVIDIA GeForce RTX 4070 Ti'} Gaming OC 12GB`,
      price: '$490',
      numericPrice: 490,
      image: 'https://images.unsplash.com/photo-1587202372775-e229f172b9d7?auto=format&fit=crop&w=800&q=80',
      description: 'Never mined on, strictly used for casual gaming. Moving abroad next Tuesday, urgent sale.',
      seller: 'Dmitri R.',
      sellerJoined: '2018',
      location: loc
    },
    {
      title: `${query || 'Herman Miller Aeron'} Chair Size B - Fully Loaded`,
      price: '$380',
      numericPrice: 380,
      image: 'https://images.unsplash.com/photo-1580481077197-2a5433141f23?auto=format&fit=crop&w=800&q=80',
      description: 'Office downsizing sale. PostureFit, forward tilt, fully adjustable arms. Perfect mesh condition.',
      seller: 'Tech Studio Liquidation',
      sellerJoined: '2022',
      location: loc
    },
    {
      title: `${query || 'PlayStation 5 Disc Edition'} + 2 Controllers + 3 Games`,
      price: '$320',
      numericPrice: 320,
      image: 'https://images.unsplash.com/photo-1606813907291-d86efa9b94db?auto=format&fit=crop&w=800&q=80',
      description: 'Barely played, bought last Christmas. Comes with Spider-Man 2 and God of War Ragnarok.',
      seller: 'Karl P.',
      sellerJoined: '2023',
      location: loc
    },
    {
      title: `${query || 'Vintage Omega Seamaster'} Automatic 1960s`,
      price: '$1200',
      numericPrice: 1200,
      image: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=800&q=80',
      description: 'Recently serviced vintage timepiece. Keeps great time. Beautiful patinated dial.',
      seller: 'Artisan Collector',
      sellerJoined: '2017',
      location: loc
    },
    {
      title: `${query || 'Specialized Allez'} Road Bike 54cm Shimano 105`,
      price: '$450',
      numericPrice: 450,
      image: 'https://images.unsplash.com/photo-1485965120184-e220f721d03e?auto=format&fit=crop&w=800&q=80',
      description: 'Great commuter or starter road bike. Clean drivetrain, new Continental GP5000 tires.',
      seller: 'Sander T.',
      sellerJoined: '2020',
      location: loc
    }
  ];

  return presets.map((p, idx) => ({
    id: `demo_${Date.now()}_${idx + 1}`,
    title: p.title,
    price: p.price,
    numericPrice: p.numericPrice,
    currency: '$',
    location: p.location,
    image: p.image,
    link: `https://www.facebook.com/marketplace/`,
    description: p.description,
    sellerName: p.seller,
    isLive: false,
    demo: true
  }));
}

// Search Facebook Marketplace
app.post('/api/search', async (req, res) => {
  try {
    const { query, location, minPrice, maxPrice, cookies, forceDemo } = req.body;
    const cleanQuery = (query || '').trim();
    const cleanLocation = (location || 'tallinn').trim().toLowerCase().replace(/\s+/g, '');
    const cookieString = sanitizeCookies(cookies);

    // If user explicitly asks for Demo Mode OR no cookies supplied, return simulated real-world listings
    if (forceDemo || !cookieString) {
      const demoListings = generateDemoListings(cleanQuery, location || 'Tallinn', minPrice, maxPrice);
      return res.json({
        success: true,
        source: 'demo_sandbox',
        message: 'Loaded simulated sandbox listings. Enter your Facebook session cookies in Settings for live Facebook scraping.',
        count: demoListings.length,
        items: demoListings
      });
    }

    // Live Facebook Request
    let searchUrl = `https://www.facebook.com/marketplace/${encodeURIComponent(cleanLocation)}/search/?query=${encodeURIComponent(cleanQuery)}&availability=in%20stock`;
    if (minPrice) searchUrl += `&minPrice=${encodeURIComponent(minPrice)}`;
    if (maxPrice) searchUrl += `&maxPrice=${encodeURIComponent(maxPrice)}`;

    const response = await fetch(searchUrl, {
      method: 'GET',
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'same-origin',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
        'Cookie': cookieString
      }
    });

    if (response.status === 401 || response.status === 403 || response.url.includes('login')) {
      return res.status(401).json({
        success: false,
        source: 'facebook_blocked',
        error: 'Facebook session expired or blocked by checkpoint. Please update your Facebook cookies in Settings.'
      });
    }

    const html = await response.text();
    const foundListings = extractFacebookListings(html, cleanQuery, location);
    // Double-check each listing's own page so sold / deleted / private ones are dropped
    const liveListings = await filterAvailable(foundListings, cookieString);

    if (foundListings.length > 0 && liveListings.length === 0) {
      return res.json({
        success: true,
        source: 'live_facebook',
        notice: 'All matching listings were sold, removed or private.',
        count: 0,
        items: []
      });
    }

    if (liveListings.length === 0) {
      // If live scraping found 0 items (e.g. dynamic client-rendered GraphQL), fallback gracefully to demo sandbox
      const fallbackItems = generateDemoListings(cleanQuery, location, minPrice, maxPrice);
      return res.json({
        success: true,
        source: 'fallback_sandbox',
        notice: 'Facebook delivered an empty or obfuscated server response for this location. Showing intelligent demo results for testing.',
        count: fallbackItems.length,
        items: fallbackItems
      });
    }

    return res.json({
      success: true,
      source: 'live_facebook',
      count: liveListings.length,
      items: liveListings
    });
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Analyze Listings with Gemini AI
app.post('/api/analyze-deals', async (req, res) => {
  try {
    const { items, query, location, geminiApiKey, model = 'gemini-2.5-flash', customGoal } = req.body;

    // Each visitor must supply their own key; there is intentionally NO server-side fallback key.
    const apiKey = typeof geminiApiKey === 'string' ? geminiApiKey.trim() : '';
    const safeModel = ALLOWED_MODELS.includes(model) ? model : 'gemini-2.5-flash';
    if (!apiKey) {
      return res.status(400).json({
        success: false,
        error: 'Gemini API Key is required. Please set it in Settings (top right gear icon).'
      });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: 'No items provided for analysis.' });
    }

    // Limit to top 15 items per batch for optimal Gemini response speed & token quota
    const candidateItems = items.slice(0, 15).map((item, idx) => ({
      index: idx,
      id: item.id,
      title: item.title,
      listedPrice: item.price,
      numericPrice: item.numericPrice,
      location: item.location,
      description: item.description || 'No description provided.',
      seller: item.sellerName || 'Seller'
    }));

    const systemPrompt = `You are a World-Class Marketplace Deal Hunter, Arbitrage Expert, and Resale Appraiser.
Your task is to analyze local Facebook Marketplace listings for the search query "${query || 'items'}" in location "${location || 'local'}".

For EACH listing:
1. Estimate current Fair Market Value (FMV) in the same currency based on typical secondary market prices (eBay completed, Swappa, local classifieds).
2. Calculate the Deal Score from 1 to 100:
   - 90 - 100: "INSANE STEAL" (Heavily underpriced, high demand, instant flip profit)
   - 75 - 89: "GREAT VALUE" (Solid deal, 20-35% below fair market)
   - 50 - 74: "FAIR MARKET" (Average going rate, no arbitrage margin)
   - < 50: "OVERPRICED / SKIP" (Priced above market or suspicious)
3. Calculate estimated Flip Profit / Savings amount (FMV - Listed Price).
4. Provide a quick 1-2 sentence sharp verdict and market analysis.
5. Provide a tactical negotiation tip (e.g. recommended cash offer to close fast).
6. Flag any Red Flags (e.g. placeholder $1, unrealistically cheap / scam warning, stolen goods risk, vague description).

Additionally, provide an overall "marketPulse":
- avgMarketPrice: estimated average going rate for this search query
- dealsFoundCount: how many items are genuine deals (score >= 75)
- executiveSummary: 2-3 sentences advising the buyer on the local market climate for this item.

${customGoal ? `User's Specific Goal: ${customGoal}` : ''}

Respond ONLY with valid JSON conforming strictly to this format:
{
  "marketPulse": {
    "avgMarketPrice": "$XXX",
    "marketSentiment": "Buyer's Market / Seller's Market / High Demand",
    "executiveSummary": "..."
  },
  "evaluations": [
    {
      "index": 0,
      "dealScore": 88,
      "badge": "GREAT VALUE",
      "estimatedFmv": "$XXX",
      "discountPercent": 32,
      "estimatedProfit": "$XXX",
      "verdict": "Underpriced by 30%, clean condition.",
      "negotiationOffer": "$XXX",
      "negotiationTip": "Offer $XXX cash for same-day pickup.",
      "redFlags": []
    }
  ]
}`;

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${safeModel}:generateContent`;

    const promptPayload = {
      contents: [
        {
          role: 'user',
          parts: [
            { text: systemPrompt },
            { text: `Here are the candidate listings to evaluate:\n${JSON.stringify(candidateItems, null, 2)}` }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json'
      }
    };

    const aiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(promptPayload)
    });

    if (!aiRes.ok) {
      const errBody = await aiRes.text();
      return res.status(aiRes.status).json({
        success: false,
        error: `Gemini API Error (${aiRes.status}): ${errBody}`
      });
    }

    const aiData = await aiRes.json();
    const rawContent = aiData.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawContent) {
      return res.status(502).json({ success: false, error: 'Gemini returned an empty response.' });
    }

    let parsedResult;
    try {
      parsedResult = JSON.parse(rawContent);
    } catch {
      // In case of markdown formatting ```json ... ```
      const cleaned = rawContent.replace(/^```json\s*/, '').replace(/\s*```$/, '').trim();
      parsedResult = JSON.parse(cleaned);
    }

    // Merge evaluations back into items
    const evaluationMap = new Map();
    if (Array.isArray(parsedResult.evaluations)) {
      parsedResult.evaluations.forEach(ev => evaluationMap.set(ev.index, ev));
    }

    const enrichedItems = items.map((item, idx) => {
      const evalData = evaluationMap.get(idx);
      if (evalData) {
        return {
          ...item,
          dealScore: evalData.dealScore || 50,
          badge: evalData.badge || 'UNRATED',
          estimatedFmv: evalData.estimatedFmv || 'N/A',
          discountPercent: evalData.discountPercent || 0,
          estimatedProfit: evalData.estimatedProfit || '$0',
          verdict: evalData.verdict || '',
          negotiationOffer: evalData.negotiationOffer || item.price,
          negotiationTip: evalData.negotiationTip || 'Inquire politely about availability.',
          redFlags: evalData.redFlags || []
        };
      }
      return item;
    });

    return res.json({
      success: true,
      marketPulse: parsedResult.marketPulse || {
        avgMarketPrice: 'Varies',
        marketSentiment: 'Analyzed',
        executiveSummary: 'AI analysis completed across all retrieved listings.'
      },
      items: enrichedItems
    });
  } catch (err) {
    console.error('AI Deal Analysis error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// AI Fast Message & Negotiation Generator
app.post('/api/generate-message', async (req, res) => {
  try {
    const { item, geminiApiKey, tone = 'cash_pickup' } = req.body;
    const apiKey = typeof geminiApiKey === 'string' ? geminiApiKey.trim() : '';

    if (!apiKey || !item || typeof item !== 'object') {
      return res.status(400).json({ success: false, error: 'Gemini API key is required.' });
    }

    const prompt = `Write 3 distinct, professional copy-paste Facebook Marketplace messages to the seller of this item:
Title: "${item.title}"
Listed Price: "${item.price}"
Seller's Name: "${item.sellerName || 'there'}"
Negotiation Offer Target: "${item.negotiationOffer || item.price}"

Options to generate:
1. Fast Cash Pick-Up (polite, direct, ready to pick up within hours with cash)
2. Polite Negotiation (asking friendly questions on condition while proposing a fair lower offer)
3. Serious Buyer Full Price (respectful, confirms condition, offers quick frictionless pickup)

Return strictly valid JSON:
{
  "messages": [
    { "style": "⚡ Fast Cash Pick-Up", "text": "..." },
    { "style": "🤝 Friendly Negotiation", "text": "..." },
    { "style": "💼 Direct & Clean", "text": "..." }
  ]
}`;

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`;
    const aiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.3 }
      })
    });

    const aiData = await aiRes.json();
    const text = aiData.candidates?.[0]?.content?.parts?.[0]?.text;
    const result = JSON.parse(text);

    res.json({ success: true, messages: result.messages });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Unknown API routes and errors always answer in JSON (never an HTML error page)
app.all('/api/*', (req, res) => res.status(404).json({ success: false, error: 'Unknown API route.' }));
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    success: false,
    error: status === 413 ? 'Request too large.' : status === 400 ? 'Bad request.' : 'Server error.'
  });
});

// Catch-all route to serve the Single Page App
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 FB Marketplace AI Hunter running on port ${PORT}`);
  console.log(`📡 Ready for Render deployment & local browsing: http://localhost:${PORT}`);
});

