import { buildNateNewsFeed } from "../lib/nateNews";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT ?? 3000);
const apiOnly = process.env.API_ONLY === "1";

const serveNewsFeed: express.RequestHandler = async (_req, res) => {
  try {
    const feed = await buildNateNewsFeed({ rankingLimit: 20 });
    res.json(feed);
  } catch (error) {
    console.error("Failed to crawl Nate news", error);
    res.status(500).json({ message: "Failed to crawl Nate news." });
  }
};

/* Vite 정적 base(/shortnews/)와 맞추기 위해 동일 핸들러를 두 경로에 둠 */
app.get("/api/news", serveNewsFeed);
app.get("/shortnews/api/news", serveNewsFeed);
app.get("/service/api/news", serveNewsFeed);
app.get("/shortnews/service/api/news", serveNewsFeed);

if (!apiOnly) {
  const outDir = path.join(__dirname, "..", "out");
  app.use(express.static(outDir));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(outDir, "index.html"));
  });
}

app.listen(port, () => {
  console.log(`http://localhost:${port}`);
});
