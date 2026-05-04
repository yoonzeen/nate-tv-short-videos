import { NextResponse } from "next/server";
import { buildNateNewsFeed } from "@/lib/nateNews";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const quick = searchParams.get("quick") === "true";
  const requestedLeadArticleId = searchParams.get("id") || undefined;

  try {
    const feed = await buildNateNewsFeed({
      leadArticleId: requestedLeadArticleId,
      rankingLimit: 20,
      detailMode: quick ? "top10" : "all",
    });

    return NextResponse.json(feed);
  } catch (error) {
    console.error("Failed to crawl Nate news", error);

    return NextResponse.json(
      { message: "Failed to crawl Nate news." },
      { status: 500 },
    );
  }
}
