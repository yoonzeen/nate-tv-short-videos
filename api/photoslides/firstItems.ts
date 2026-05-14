type VercelRequest = {
  method?: string;
};

type VercelResponse = {
  setHeader(name: string, value: string): void;
  status(code: number): VercelResponse;
  json(value: unknown): void;
  end(): void;
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

function getPhotoSlidesApiUrl() {
  if (CONFIGURED_PHOTO_SLIDES_API_URL) {
    return CONFIGURED_PHOTO_SLIDES_API_URL;
  }

  if (process.env.VERCEL) {
    throw new Error(
      "NATE_PHOTO_SLIDES_API_URL is required on Vercel. " +
        "The Nate/shortform photo slides API resolves to an internal backend on Nate networks, " +
        "but Vercel reaches the public backend that returns 404.",
    );
  }

  return LOCAL_PHOTO_SLIDES_API_URL;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    const cause = error.cause;
    if (cause && typeof cause === "object" && "code" in cause) {
      return `${error.message} (${String(cause.code)})`;
    }
    return error.message;
  }

  return String(error);
}

function buildUpstreamError(url: string, status: number, sample: string) {
  const hint =
    url.includes("shortform.nate.com") && status === 404
      ? " The shortform public backend returned its static-resource 404; use a Vercel-accessible API/proxy URL in NATE_PHOTO_SLIDES_API_URL."
      : "";

  return `photoslides ${status}: ${sample}${hint}`;
}

async function fetchPhotoSlidesFirstItems() {
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

  return response.json();
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "GET") {
    res.status(405).json({ message: "Method not allowed" });
    return;
  }

  try {
    res.setHeader(
      "Cache-Control",
      "public, s-maxage=60, stale-while-revalidate=300",
    );
    res.status(200).json(await fetchPhotoSlidesFirstItems());
  } catch (error) {
    console.error("Failed to fetch photoslides firstItems", error);
    res.status(502).json({
      message: "Failed to fetch photoslides firstItems.",
      upstream:
        CONFIGURED_PHOTO_SLIDES_API_URL ||
        (process.env.VERCEL ? "(missing NATE_PHOTO_SLIDES_API_URL)" : LOCAL_PHOTO_SLIDES_API_URL),
      error: getErrorMessage(error),
    });
  }
}
