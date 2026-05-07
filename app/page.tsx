import { NewsFeed } from "@/components/NewsFeed";
import { buildNateNewsFeed } from "@/lib/nateNews";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const title = "NATE News Story";
  const description = "세상의 속도, 네이트 뉴스";
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const imageUrl = `${basePath}/og-image.png`;

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
      type: "article",
      siteName: "NATE News Story",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [imageUrl],
    },
  };
}

export default async function HomePage() {
  let initialItems: Awaited<ReturnType<typeof buildNateNewsFeed>>["items"] = [];

  try {
    initialItems = (await buildNateNewsFeed()).items;
  } catch (error) {
    console.error("Failed to load initial news list", error);
  }

  return <NewsFeed items={initialItems} />;
}
