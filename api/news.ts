type VercelRequest = {
  method?: string;
};

type VercelResponse = {
  setHeader(name: string, value: string): void;
  status(code: number): VercelResponse;
  json(value: unknown): void;
  end(): void;
};

const PHOTO_SLIDES_API_URL =
  process.env.NATE_PHOTO_SLIDES_API_URL?.trim() ||
  "https://shortform.nate.com/service/api/photoslides/firstItems";

const REQUEST_HEADERS = {
  accept: "application/json",
  referer: "https://shortform.nate.com/shortnews/",
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
};

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

async function fetchPhotoSlidesFirstItems() {
  const response = await fetch(PHOTO_SLIDES_API_URL, {
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
      upstream: PHOTO_SLIDES_API_URL,
      error: getErrorMessage(error),
    });
  }
}
