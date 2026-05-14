import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchPhotoSlidesFirstItems } from "../lib/nateNews";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT ?? 3000);
const apiOnly = process.env.API_ONLY === "1";

const servePhotoSlides: express.RequestHandler = async (_req, res) => {
  try {
    res.setHeader("Cache-Control", "public, max-age=60");
    res.json(await fetchPhotoSlidesFirstItems());
  } catch (error) {
    console.error("Failed to fetch photoslides firstItems", error);
    res.status(502).json({ message: "Failed to fetch photoslides firstItems." });
  }
};

app.get("/service/api/photoslides/firstItems", servePhotoSlides);
app.get("/shortnews/service/api/photoslides/firstItems", servePhotoSlides);

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
