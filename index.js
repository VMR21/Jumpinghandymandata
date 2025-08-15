import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3000;
const SELF_URL = "https://jumpinghandymandata.onrender.com/leaderboard/top14";
const API_KEY = "PGLIEgYjJFTxtxUlHyKSpIsUl1k7v3cm";

let cachedData = [];

// ✅ CORS headers manually
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  next();
});

// === 15-day cycle helpers (UTC) ===
const CYCLE_START_UTC = Date.UTC(2025, 6, 14, 0, 0, 0); // July 14, 2024 00:00 UTC
const CYCLE_MS = 15 * 24 * 60 * 60 * 1000; // 15 days in ms

function getCycleBounds(date = new Date()) {
  const cyclesPassed = Math.floor((date.getTime() - CYCLE_START_UTC) / CYCLE_MS);
  const start = new Date(CYCLE_START_UTC + cyclesPassed * CYCLE_MS);
  const nextStart = new Date(start.getTime() + CYCLE_MS);
  // inclusive end = last second of final day
  const endInclusive = new Date(nextStart.getTime() - 1000);
  return { start, nextStart, endInclusive };
}

function getPrevCycleBounds(date = new Date()) {
  const { start } = getCycleBounds(date);
  const prevStart = new Date(start.getTime() - CYCLE_MS);
  const prevNextStart = start;
  const endInclusive = new Date(prevNextStart.getTime() - 1000);
  return { start: prevStart, nextStart: prevNextStart, endInclusive };
}

function toYMD(d) {
  return d.toISOString().slice(0, 10);
}

function buildAffUrl(startDate, endInclusiveDate) {
  const startStr = toYMD(startDate);
  const endStr = toYMD(endInclusiveDate);
  return `https://services.rainbet.com/v1/external/affiliates?start_at=${startStr}&end_at=${endStr}&key=${API_KEY}`;
}

function maskUsername(username) {
  if (username.length <= 4) return username;
  return username.slice(0, 2) + "***" + username.slice(-2);
}

// === Fetch current cycle and cache ===
async function fetchAndCacheData() {
  try {
    const { start, endInclusive } = getCycleBounds(new Date());
    const url = buildAffUrl(start, endInclusive);

    const response = await fetch(url);
    const json = await response.json();
    if (!json.affiliates) throw new Error("No data");

    const sorted = json.affiliates.sort(
      (a, b) => parseFloat(b.wagered_amount) - parseFloat(a.wagered_amount)
    );

    const top10 = sorted.slice(0, 10);
    if (top10.length >= 2) [top10[0], top10[1]] = [top10[1], top10[0]]; // swap top 2

    cachedData = top10.map((entry) => ({
      username: maskUsername(entry.username),
      wagered: Math.round(parseFloat(entry.wagered_amount)),
      weightedWager: Math.round(parseFloat(entry.wagered_amount)),
    }));

    console.log(
      `[✅] Leaderboard updated for ${toYMD(start)} → ${toYMD(endInclusive)}`
    );
  } catch (err) {
    console.error("[❌] Failed to fetch Rainbet data:", err.message);
  }
}

fetchAndCacheData();
setInterval(fetchAndCacheData, 5 * 60 * 1000); // every 5 minutes

// === Routes ===
app.get("/leaderboard/top14", (req, res) => {
  res.json(cachedData);
});


app.get("/leaderboard/prev", async (req, res) => {
  try {
    const { start, endInclusive } = getPrevCycleBounds(new Date());
    const url = buildAffUrl(start, endInclusive);

    const response = await fetch(url);
    const json = await response.json();
    if (!json.affiliates) throw new Error("No previous data");

    const sorted = json.affiliates.sort(
      (a, b) => parseFloat(b.wagered_amount) - parseFloat(a.wagered_amount)
    );

    const top10 = sorted.slice(0, 10);
    if (top10.length >= 2) [top10[0], top10[1]] = [top10[1], top10[0]]; // swap top 2

    const processed = top10.map((entry) => ({
      username: maskUsername(entry.username),
      wagered: Math.round(parseFloat(entry.wagered_amount)),
      weightedWager: Math.round(parseFloat(entry.wagered_amount)),
    }));

    console.log(
      `[🟡] Served PREV cycle ${toYMD(start)} → ${toYMD(endInclusive)}`
    );
res.json(processed);

  } catch (err) {
    console.error("[❌] Failed to fetch previous leaderboard:", err.message);
    res.status(500).json({ error: "Failed to fetch previous leaderboard data." });
  }
});

// keep Render alive
setInterval(() => {
  fetch(SELF_URL)
    .then(() => console.log(`[🔁] Self-pinged ${SELF_URL}`))
    .catch((err) => console.error("[⚠️] Self-ping failed:", err.message));
}, 270000); // every 4.5 mins

app.listen(PORT, () => console.log(`🚀 Running on port ${PORT}`));
