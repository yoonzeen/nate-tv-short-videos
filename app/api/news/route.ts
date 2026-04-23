import { NextResponse } from "next/server";
import { fetchNateRankedNews, fetchNateRankedNewsSimple } from "@/lib/nateNews";

export const dynamic = "force-dynamic";

function isValidDateParam(value: string | null): value is string {
  return value !== null && /^\d{8}$/.test(value);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  const quick = searchParams.get("quick") === "true";
  const requestedDate = isValidDateParam(date) ? date : undefined;

  try {
    // quick 파라미터가 있으면 빠른 버전 사용
    const items = quick 
      ? await fetchNateRankedNewsSimple(requestedDate)
      : await fetchNateRankedNews(requestedDate);

    return NextResponse.json(items);
  } catch (error) {
    console.error("Failed to crawl Nate news", error);

    return NextResponse.json(
      { message: "Failed to crawl Nate news." },
      { status: 500 },
    );
  }
}
