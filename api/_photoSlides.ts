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

const CONFIGURED_PHOTO_SLIDES_API_URL = process.env.NATE_PHOTO_SLIDES_API_URL?.trim();
const LOCAL_PHOTO_SLIDES_API_URL = "http://api.news.nate.com:8080/photoslides/firstItems";

const REQUEST_HEADERS = {
  accept: "application/json, text/plain, */*",
  "accept-language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
  referer: "https://shortform.nate.com/shortnews/",
  "sec-fetch-dest": "empty",
  "sec-fetch-mode": "cors",
  "sec-fetch-site": "same-origin",
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
};

export function getPhotoSlidesUpstreamDescription() {
  if (CONFIGURED_PHOTO_SLIDES_API_URL) {
    return CONFIGURED_PHOTO_SLIDES_API_URL;
  }

  if (process.env.VERCEL) {
    return "(missing NATE_PHOTO_SLIDES_API_URL)";
  }

  return LOCAL_PHOTO_SLIDES_API_URL;
}

function getPhotoSlidesApiUrl() {
  if (CONFIGURED_PHOTO_SLIDES_API_URL) {
    return CONFIGURED_PHOTO_SLIDES_API_URL;
  }

  if (process.env.VERCEL) {
    throw new Error(
      "NATE_PHOTO_SLIDES_API_URL is required on Vercel. " +
        "The Nate/shortform photo slides API is not publicly reachable from Vercel.",
    );
  }

  return LOCAL_PHOTO_SLIDES_API_URL;
}

function buildUpstreamError(url: string, status: number, sample: string) {
  const hint =
    url.includes("shortform.nate.com") && status === 404
      ? " The shortform public backend returned its static-resource 404."
      : "";

  return `photoslides ${status} @ ${url}: ${sample}${hint}`;
}

export async function fetchPhotoSlidesFirstItems() {
  const apiUrl = getPhotoSlidesApiUrl();
  const response = await fetch(apiUrl, {
    cache: "no-store",
    headers: REQUEST_HEADERS,
  });

  if (!response.ok) {
    const sample = (await response.text()).slice(0, 120);
    throw new Error(buildUpstreamError(apiUrl, response.status, sample));
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    const sample = (await response.text()).slice(0, 120);
    throw new Error(`photoslides invalid content-type (${contentType}): ${sample}`);
  }

  const parsed = (await response.json()) as NatePhotoSlidesResponse;
  if (!Array.isArray(parsed.data)) {
    throw new Error(`photoslides invalid response @ ${apiUrl}`);
  }

  return parsed;
}
