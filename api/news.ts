import type { VercelRequest, VercelResponse } from "@vercel/node";

function setCors(res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

/**
 * Serverless는 무료 플랜에서 실행 시간이 짧아, 기본은 댓글 보강 없음(none).
 * Pro 등에서 시간 여유가 있으면 환경 변수로 조정:
 * - NATE_API_ENRICH=top10 | all | full
 */
function resolveVercelDetailMode(): "none" | "top10" | "all" {
  const v = process.env.NATE_API_ENRICH?.toLowerCase();
  if (v === "all" || v === "full") {
    return "all";
  }
  if (v === "top10") {
    return "top10";
  }
  return "none";
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
    const { buildNateNewsFeed } = await import("../lib/nateNews.js");
    const feed = await buildNateNewsFeed({
      rankingLimit: 20,
      detailMode: resolveVercelDetailMode(),
    });
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
