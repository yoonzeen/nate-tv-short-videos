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

const REQUEST_HEADERS = {
  accept: "application/json",
  referer: "https://shortform.nate.com/shortnews/",
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
};

function getPhotoSlidesApiUrl() {
  return process.env.NATE_PHOTO_SLIDES_API_URL?.trim() || DEFAULT_PHOTO_SLIDES_API_URL;
}

export async function fetchPhotoSlidesFirstItems() {
  const response = await fetch(getPhotoSlidesApiUrl(), {
    cache: "no-store",
    headers: REQUEST_HEADERS,
  });

  if (!response.ok) {
    const sample = (await response.text()).slice(0, 120);
    throw new Error(`photoslides ${response.status}: ${sample}`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    const sample = (await response.text()).slice(0, 120);
    throw new Error(`photoslides invalid content-type (${contentType}): ${sample}`);
  }

  return (await response.json()) as NatePhotoSlidesResponse;
}
