import type { VercelRequest, VercelResponse } from "@vercel/node";
import { buildNateNewsFeed } from "../lib/nateNews";

function setCors(res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  setCors(res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "GET") {
    res.status(405).json({ message: "Method not allowed" });
    return;
  }

  try {
    const feed = await buildNateNewsFeed({ rankingLimit: 20 });
    res.setHeader(
      "Cache-Control",
      "public, s-maxage=60, stale-while-revalidate=300",
    );
    res.status(200).json(feed);
  } catch (error) {
    console.error("Failed to crawl Nate news", error);
    res.status(500).json({ message: "Failed to crawl Nate news." });
  }
}

export const config = {
  maxDuration: 60,
};
