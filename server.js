import express from "express";
import fetch from "node-fetch";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import * as cheerio from "cheerio";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// Security
app.use(helmet({
  contentSecurityPolicy: false, // disable for proxied HTML
}));
app.use(rateLimit({ windowMs: 60 * 1000, max: 30 }));
app.use(express.static(path.join(__dirname, "public")));

// Default safe search
const DEFAULT_SAFE_SEARCH = "moderate"; // can be: off, moderate, strict

function validateSafeSearch(level) {
  return ["off", "moderate", "strict"].includes(level) ? level : DEFAULT_SAFE_SEARCH;
}

function sanitizeQuery(q) {
  return q.replace(/[<>]/g, "");
}

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/search", async (req, res) => {
  const q = sanitizeQuery(req.query.q || "");
  const safe = validateSafeSearch(req.query.safe);
  const ddg = new URL("https://duckduckgo.com/html/");
  ddg.searchParams.set("q", q);
  if (safe !== "off") ddg.searchParams.set("kp", safe === "strict" ? "1" : "-1");

  try {
    const response = await fetch(ddg.toString(), {
      headers: { "User-Agent": "Mozilla/5.0 (DDG Proxy)" },
    });
    const text = await response.text();

    const $ = cheerio.load(text);
    $("a").each((_, el) => {
      const href = $(el).attr("href");
      if (href && href.startsWith("/")) {
        $(el).attr("href", "https://duckduckgo.com" + href);
      }
    });

    res.send($.html());
  } catch (e) {
    console.error(e);
    res.status(500).send("Error fetching search results.");
  }
});

app.listen(PORT, () => console.log(`✅ Running on port ${PORT}`));
// Graceful 404 & error handling
app.use((req, res) => res.status(404).send("Page not found."));
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).send("Internal server error.");
});

