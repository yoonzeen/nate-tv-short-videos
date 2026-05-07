import { NextResponse } from "next/server";
import { buildNateNewsFeed } from "@/lib/nateNews";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const feed = await buildNateNewsFeed({
      rankingLimit: 20,
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
