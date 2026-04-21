import { NewsFeed } from "@/components/NewsFeed";
import { fetchNateRankedNews } from "@/lib/nateNews";
import type { Metadata } from 'next';

export const dynamic = "force-dynamic";

type Props = {
  searchParams: { id?: string };
};

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const items = await fetchNateRankedNews();
  const articleId = searchParams.id;
  
  // 기본값: 첫 번째 뉴스 기사 사용
  const firstNewsArticle = items.find(item => !item.isAd);
  let title = "NATE News Shorts";
  let description = firstNewsArticle?.title || "네이트 뉴스의 최신 관심 기사를 숏폼으로 만나보세요";
  let imageUrl = "/images/ad-banner.png";
  
  // 첫 번째 뉴스 기사의 이미지를 기본 이미지로 사용
  if (firstNewsArticle) {
    if (firstNewsArticle.img.startsWith('http')) {
      imageUrl = firstNewsArticle.img;
    } else {
      imageUrl = `https://thumbnews.nateimg.co.kr/mnews300x166/${firstNewsArticle.img}`;
    }
  }
  
  // URL에 특정 기사 ID가 있는 경우 해당 기사 정보 사용
  if (articleId) {
    const currentArticle = items.find(item => item.id === articleId && !item.isAd);
    if (currentArticle) {
      title = "NATE News Shorts";
      description = currentArticle.title;
      
      // 현재 기사의 이미지 URL 처리
      if (currentArticle.img.startsWith('http')) {
        imageUrl = currentArticle.img;
      } else {
        imageUrl = `https://thumbnews.nateimg.co.kr/mnews300x166/${currentArticle.img}`;
      }
    }
  }

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [
        {
          url: imageUrl,
          width: 300,
          height: 200,
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
  const items = await fetchNateRankedNews();

  return <NewsFeed items={items} />;
}
