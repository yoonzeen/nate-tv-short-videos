export type PhotoSlideItem = {
  title: string;
  mobileUrl: string;
  pcUrl: string;
  imageUrl: string;
  cpName: string;
  emoticonCnt: number;
  bestCmtSq: number;
  bestCmtContent: string | null;
  bestCmtMobileUrl: string;
  bestCmtPcUrl: string;
};

export type NatePhotoSlidesResponse = {
  code?: string;
  message?: string;
  timestamp?: string;
  data?: PhotoSlideItem[];
};

const DEFAULT_PHOTO_SLIDES_API_URL =
  "http://api.news.nate.com:8080/photoslides/firstItems";

function getPhotoSlidesApiUrl() {
  return process.env.NATE_PHOTO_SLIDES_API_URL?.trim() || DEFAULT_PHOTO_SLIDES_API_URL;
}

export async function fetchPhotoSlidesFirstItems() {
  const response = await fetch(getPhotoSlidesApiUrl(), {
    cache: "no-store",
    headers: {
      accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`photoslides ${response.status}`);
  }

  return (await response.json()) as NatePhotoSlidesResponse;
}
