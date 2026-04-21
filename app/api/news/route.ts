import { NextResponse } from "next/server";
import { fetchNateRankedNews } from "@/lib/nateNews";

export const dynamic = "force-dynamic";

function isValidDateParam(value: string | null): value is string {
  return value !== null && /^\d{8}$/.test(value);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  const requestedDate = isValidDateParam(date) ? date : undefined;

  try {
    const items = await fetchNateRankedNews(requestedDate);

    return NextResponse.json({
      items,
      count: items.length,
      date: requestedDate ?? null,
    });
  } catch (error) {
    console.error("Failed to crawl Nate news", error);

    return NextResponse.json(
      { message: "Failed to crawl Nate news." },
      { status: 500 },
    );
  }
}
