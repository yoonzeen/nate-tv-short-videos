import { NewsFeed } from "@/components/NewsFeed";
import { fetchNateRankedNews } from "@/lib/nateNews";
import type { Metadata } from 'next';

export const dynamic = "force-dynamic";

type Props = {
  searchParams: { id?: string };
};

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  // 기본 메타데이터 (로딩 속도 향상을 위해 API 호출 없이 기본값 사용)
  const title = "NATE News Shorts";
  const description = "네이트 뉴스의 최신 관심 기사를 숏폼으로 만나보세요";
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

export default function NewsPage({ searchParams }: Props) {
  return <NewsFeed />;
}
