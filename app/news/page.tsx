import { NewsFeed } from "@/components/NewsFeed";
import { fetchNateRankedNewsListOnly } from "@/lib/nateNews";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

type PageSearchParams = { id?: string };

type Props = {
  searchParams: Promise<PageSearchParams> | PageSearchParams;
};

async function resolveSearchParams(
  sp: Promise<PageSearchParams> | PageSearchParams,
): Promise<PageSearchParams> {
  return await Promise.resolve(sp);
}

export async function generateMetadata(): Promise<Metadata> {
  // 기본 메타데이터 (로딩 속도 향상을 위해 API 호출 없이 기본값 사용)
  const title = "NATE News Shorts";
  const description = "세상의 속도, 네이트 뉴스";
  const imageUrl = "/og-image.png";

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [
        {
          url: imageUrl,
          width: 1200,
          height: 630,
          alt: description,
        },
      ],
      type: 'article',
      siteName: 'NATE News Shorts',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [imageUrl],
    },
  };
}

export default async function NewsPage({ searchParams }: Props) {
  const sp = await resolveSearchParams(searchParams);
  const leadArticleId =
    typeof sp.id === "string" && sp.id.length > 0 ? sp.id : undefined;

  let initialItems: Awaited<ReturnType<typeof fetchNateRankedNewsListOnly>> = [];

  try {
    initialItems = await fetchNateRankedNewsListOnly(undefined, 1);
  } catch (error) {
    console.error("Failed to load initial news list", error);
  }

  return <NewsFeed items={initialItems} leadArticleId={leadArticleId} />;
}
