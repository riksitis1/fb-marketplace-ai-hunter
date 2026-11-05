# ⚡ MarketPulse AI — Facebook Marketplace Deal Hunter & Arbitrage Radar

An advanced AI-powered web application and arbitrage scanner designed for **Facebook Marketplace**. It cross-references local listings against secondary market values using **Google Gemini AI**, uncovering underpriced steals, calculating estimated flip profit margins, flagging potential scams, and generating tactical negotiation messages for sellers.

Designed for instant, frictionless deployment on **Render** (or any Node.js cloud platform) with zero native build dependencies.

---

## 🌟 Key Features

- 🎯 **AI Deal Scoring Engine (1–100)**: Evaluates listings with Gemini (`gemini-2.5-flash`), classifying items into *Insane Steals (90+)*, *Great Value (75–89)*, *Fair Market*, or *Overpriced/Skip*.
- 💰 **Arbitrage & Resell Profit Calculator**: Estimates real-world Fair Market Value (FMV) and calculates net flip profit margins.
- 🌍 **Custom Location & City Radar**: Browse any city across the globe (e.g., Tallinn, London, New York, Miami, Berlin, Sydney, or custom vanity slugs) with distance and price filters.
- 🛡️ **Scam & Red Flag Audit**: Detects $1 placeholders, suspicious account behavior, stolen goods indicators, and unrealistic pricing anomalies.
- 💬 **Instant Negotiation Message Generator**: Crafts 3 custom copy-paste messages (Fast Cash Pickup, Friendly Bargain, Clean Inquiry) tailored to the seller and target offer.
- 🧪 **Sandbox Demo Mode**: Built-in realistic simulated sandbox datasets so you can test deal valuation and flipping radar immediately without needing cookies.
- 🔒 **Client-First Security**: Facebook session cookies (`c_user`, `xs`) and Gemini API keys are kept safely in your browser's `localStorage` and sent over HTTPS only to your private server instance.
- 📊 **Export to CSV**: Export discovered deals and comps with one click.

---

## 🚀 Quick Start (Local Development)

```bash
# 1. Install dependencies
npm install

# 2. Start the application
npm start

# 3. Open in browser
http://localhost:10000 (or http://localhost:3000)
```

---

## ☁️ Deploying to Render

### Option A: Using the Render Blueprint (`render.yaml`)
1. Push this repository to your GitHub account (see instructions below).
2. Go to your [Render Dashboard](https://dashboard.render.com/).
3. Click **New +** &rarr; **Blueprint**.
4. Connect your GitHub repository (`fb-marketplace-ai-hunter`).
5. Render will automatically detect `render.yaml`, configure the Node environment, run `npm install`, and launch `npm start`.

### Option B: Manual Web Service on Render
1. Go to [Render Dashboard](https://dashboard.render.com/) &rarr; **New +** &rarr; **Web Service**.
2. Connect your GitHub repository.
3. Configure the settings:
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: `Free`
4. Click **Create Web Service**. Render will assign you a live HTTPS URL (e.g., `https://fb-marketplace-ai-hunter.onrender.com`).

---

## 🔑 How to Setup Your Credentials

### 1. Google Gemini API Key
1. Get a free API key at [Google AI Studio](https://aistudio.google.com/app/apikey).
2. In the MarketPulse AI web app, click the **Credentials & Setup** button in the top right.
3. Paste your key and click **Save & Apply Settings**.

### 2. Facebook Session Cookies (For Live Scraping)
1. Open [Facebook.com](https://www.facebook.com) in your browser (Chrome, Brave, Edge).
2. Press <kbd>F12</kbd> &rarr; Go to the **Application** tab (or **Storage** in Firefox).
3. In the left panel, expand **Cookies** &rarr; click `https://www.facebook.com`.
4. Copy the values of `c_user` and `xs` (e.g., `c_user=1000...; xs=...`).
5. Paste them into the **Facebook Session Cookies** field in MarketPulse AI and click **Verify Facebook Cookies**.

> 💡 *Don't have cookies handy? Simply toggle on **Sandbox / Demo Data** to explore the full Gemini deal valuation experience right away!*

---

## 🛠️ Tech Stack

- **Backend**: Node.js, Express, Native Fetch, Relay / GraphQL JSON extractors
- **AI Core**: Google Gemini API (`models/gemini-2.5-flash` / `gemini-1.5-flash`)
- **Frontend**: Vanilla JavaScript (ES6+), Modern Cyber/Fintech Glassmorphism CSS, Inter / JetBrains Mono typography
- **Hosting**: Render Ready (`render.yaml`, zero native binary dependencies)

---

## ⚖️ License
MIT License. Created by Riko.
