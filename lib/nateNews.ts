import "server-only";

export type NateNewsItem = {
  id: string;
  rank: number;
  title: string;
  link: string;
  mobileLink?: string;
  pcLink?: string;
  imageUrl: string;
  sourceName: string | null;
  topComment: string | null;
  recommendationCount: number | null;
  isAd?: boolean;
};

export type NateNewsFeed = {
  items: NateNewsItem[];
  leadArticleId?: string;
};

type NewsDetailMode = "all" | "top10" | "none";

type BuildNateNewsFeedOptions = {
  leadArticleId?: string;
  rankingLimit?: number;
  detailMode?: NewsDetailMode;
};

type NateEmoticonRankItem = {
  rank?: number;
  title?: string;
  mobileUrl?: string;
  pcUrl?: string;
  imageUrl?: string;
  cpName?: string;
  emoticonCnt?: number;
};

type NateEmoticonRankResponse = {
  data?: NateEmoticonRankItem[];
};

const NATE_COMMENT_BASE_URL =
  "https://m.comm.news.nate.com/Comment/ArticleComment/List";

const NATE_EMOTICON_RANK_ORIGIN =
  process.env.NODE_ENV === "production"
    ? "http://api.news.nate.com"
    : "http://api.news.nate.com:8080";

const NATE_EMOTICON_RANK_URL = `${NATE_EMOTICON_RANK_ORIGIN}/ranks/emoticons`;
const NATE_EMOTICON_RANK_PAGE_URL = "https://news.nate.com/rank/emoticon";
const NATE_EMOTICON_RANK_PAGE_PATH = "/rank/emoticon";
const NATE_ARTICLE_BASE_URL = "https://news.nate.com/view/";
const NATE_MOBILE_ARTICLE_BASE_URL = "https://m.news.nate.com/view/";
const NATE_IMAGE_PREFIX = "https://thumbnews.nateimg.co.kr/mnews107x80/";
const NATE_VIEW_IMAGE_PREFIX = "https://thumbnews.nateimg.co.kr/view610/";
const NATE_IDOL_IMAGE_PREFIX = "https://thumbnews.nateimg.co.kr/idol140x88/";

const ARTICLE_ID_PATTERN = /\/view\/(\d{8}n\d+)/i;
const ARTICLE_MID_PATTERN =
  /ArticleEmoticonList\?artc_sq=\d{8}n\d+(?:&|&amp;)mid=([^"'&\s]+)/i;
const COMMENT_MID_PATTERN =
  /ArticleComment\/List\?artc_sq=\d{8}n\d+(?:&|&amp;)[^"'<>]*mid=([^"'&\s]+)/i;
const COMMENT_TEXT_PATTERN =
  /<dd class="userText">[\s\S]*?<a[^>]*>\s*([\s\S]*?)\s*<\/a>/gi;
const ARTICLE_SOURCE_PATTERN =
  /<div class="author">[\s\S]*?<em><b>([^<]+)<\/b><span>/i;
const ARTICLE_SOURCE_LINK_PATTERN =
  /<a[^>]+href=["'](?:\/\/)?news\.nate\.com\/mediaList\?cp=[^"']+["'][^>]*>([^<]+)<\/a>/i;
const ARTICLE_SOURCE_FALLBACK_PATTERN = /<span class="source">([^<]+)<\/span>/i;
const ARTICLE_TITLE_META_PATTERN =
  /<meta[^>]+property=["']og:title["'][^>]+content=(["'])([\s\S]*?)\1[^>]*>/i;
const ARTICLE_TITLE_FALLBACK_PATTERN = /<title>([^<]+)<\/title>/i;
const ARTICLE_IMAGE_META_PATTERN =
  /<meta[^>]+property=["']og:image["'][^>]+content=(["'])([\s\S]*?)\1[^>]*>/i;
const ARTICLE_IMAGE_FALLBACK_PATTERN =
  /<img[^>]+class=["'][^"']*img[^"']*["'][^>]+src=["']([^"']+)["'][^>]*>/i;
const EMOTICON_RANK_TOP_ITEM_PATTERN =
  /<div class="mduSubjectList f_clear">[\s\S]*?<dt><em>(\d+)[^<]*<\/em><\/dt>[\s\S]*?<a href="([^"]*\/view\/\d{8}n\d+[^"]*)"[\s\S]*?<img src="([^"]+)"[\s\S]*?<h2 class="tit">([\s\S]*?)<\/h2>[\s\S]*?<span class="emcnt"><em>([\d,]+)<\/em><\/span><span class="teCnt">([\s\S]*?)<\/span>/gi;
const EMOTICON_RANK_LIST_ITEM_PATTERN =
  /<li>\s*<dl class="mduRank rank\d+">\s*<dt><em>(\d+)[^<]*<\/em><\/dt>\s*<\/dl>[\s\S]*?<a href="([^"]*\/view\/\d{8}n\d+[^"]*)"[\s\S]*?<img src="([^"]+)"[\s\S]*?<h2 class="tit">([\s\S]*?)<\/h2>[\s\S]*?<span class="emcnt"><em>([\d,]+)<\/em><\/span><span class="teCnt">([\s\S]*?)<\/span>/gi;

const REQUEST_HEADERS = {
  "accept-language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
};

const DEFAULT_RANKING_LIMIT = 20;
const QUICK_DETAIL_COUNT = 10;
const EMOTICON_PAGE_SIZE = 20;

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code) =>
      String.fromCodePoint(Number.parseInt(code, 10)),
    )
    .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    );
}

function cleanTitle(value: string) {
  return decodeHtmlEntities(value)
    .replace(/\\[nrtt]/g, " ")
    .replace(/\\(["'/\\])/g, "$1")
    .replace(/\\/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanComment(value: string) {
  return decodeHtmlEntities(value)
    .replace(/<img[^>]*>/g, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanSource(value: string) {
  return decodeHtmlEntities(value)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchNateDocument(url: string) {
  const response = await fetch(url, {
    cache: "no-store",
    headers: REQUEST_HEADERS,
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Nate document: ${response.status}`);
  }

  const body = await response.arrayBuffer();

  return new TextDecoder("euc-kr").decode(body);
}

async function fetchNateJson<T>(url: string) {
  const response = await fetch(url, {
    cache: "no-store",
    headers: REQUEST_HEADERS,
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Nate JSON: ${response.status}`);
  }

  return (await response.json()) as T;
}

function getArticleId(link: string) {
  return link.match(ARTICLE_ID_PATTERN)?.[1] ?? null;
}

function getArticleMid(articleHtml: string) {
  const match =
    articleHtml.match(ARTICLE_MID_PATTERN) ??
    articleHtml.match(COMMENT_MID_PATTERN);

  return decodeHtmlEntities(match?.[1] ?? "");
}

function getFirstMatchText(html: string, pattern: RegExp) {
  const match = pattern.exec(html);
  pattern.lastIndex = 0;

  if (!match) {
    return null;
  }

  const text = cleanComment(match[1] ?? "");

  return text || null;
}

function normalizeImageUrl(value: string) {
  const normalizedValue = decodeHtmlEntities(value)
    .trim()
    .replace(/^\/\//, "https://")
    .replace(NATE_IMAGE_PREFIX, "")
    .replace(NATE_VIEW_IMAGE_PREFIX, "")
    .replace(NATE_IDOL_IMAGE_PREFIX, "");

  const decodedValue = decodeURIComponent(normalizedValue);

  if (/^https?:\/\//i.test(decodedValue)) {
    return decodedValue;
  }

  if (decodedValue.startsWith("news.nateimg.co.kr/")) {
    return `https://${decodedValue}`;
  }

  return decodedValue;
}

function normalizeNateUrl(value: string) {
  const normalizedValue = decodeHtmlEntities(value).trim();

  if (normalizedValue.startsWith("//")) {
    return `https:${normalizedValue}`;
  }

  return normalizedValue;
}

function parseCount(value: string) {
  const count = Number.parseInt(value.replace(/[^\d]/g, ""), 10);

  return Number.isNaN(count) ? null : count;
}

function parseEmoticonRankItemsFromHtml(html: string) {
  const itemsById = new Map<string, NateEmoticonRankItem>();
  const patterns = [EMOTICON_RANK_TOP_ITEM_PATTERN, EMOTICON_RANK_LIST_ITEM_PATTERN];

  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) {
      const rank = Number.parseInt(match[1] ?? "", 10);
      const pcUrl = normalizeNateUrl(match[2] ?? "");
      const articleId = getArticleId(pcUrl);
      const title = cleanTitle(match[4] ?? "");
      const sourceName = cleanSource(match[6] ?? "");
      const recommendationCount = parseCount(match[5] ?? "");
      const imageUrl = normalizeImageUrl(match[3] ?? "");

      if (!articleId || !pcUrl || !title || !imageUrl) {
        continue;
      }

      itemsById.set(articleId, {
        rank: Number.isNaN(rank) ? undefined : rank,
        title,
        pcUrl,
        mobileUrl: `${NATE_MOBILE_ARTICLE_BASE_URL}${articleId}`,
        imageUrl,
        cpName: sourceName || undefined,
        emoticonCnt: recommendationCount ?? undefined,
      });
    }
  }

  return [...itemsById.values()].sort(
    (left, right) => (left.rank ?? Number.MAX_SAFE_INTEGER) - (right.rank ?? Number.MAX_SAFE_INTEGER),
  );
}

async function fetchEmoticonRankItemsFromHtml(pageSize: number) {
  const totalPages = Math.max(1, Math.ceil(pageSize / 15));
  const itemsById = new Map<string, NateEmoticonRankItem>();

  for (let page = 1; page <= totalPages; page += 1) {
    const url =
      page === 1
        ? NATE_EMOTICON_RANK_PAGE_URL
        : new URL(
            `${NATE_EMOTICON_RANK_PAGE_PATH}?type=section&cate=all&no=1&page=${page}`,
            "https://news.nate.com",
          ).toString();
    const html = await fetchNateDocument(url);
    const items = parseEmoticonRankItemsFromHtml(html);

    for (const item of items) {
      const articleId = getArticleId(item.mobileUrl ?? item.pcUrl ?? "");

      if (!articleId || itemsById.has(articleId)) {
        continue;
      }

      itemsById.set(articleId, item);
    }

    if (items.length < 15) {
      break;
    }
  }

  return [...itemsById.values()]
    .sort(
      (left, right) =>
        (left.rank ?? Number.MAX_SAFE_INTEGER) - (right.rank ?? Number.MAX_SAFE_INTEGER),
    )
    .slice(0, pageSize);
}

function getArticleSource(articleHtml: string) {
  const match =
    articleHtml.match(ARTICLE_SOURCE_PATTERN) ??
    articleHtml.match(ARTICLE_SOURCE_LINK_PATTERN) ??
    articleHtml.match(ARTICLE_SOURCE_FALLBACK_PATTERN);
  const sourceName = cleanSource(match?.[1] ?? "");

  return sourceName || null;
}

function getArticleTitle(articleHtml: string) {
  const match =
    articleHtml.match(ARTICLE_TITLE_META_PATTERN) ??
    articleHtml.match(ARTICLE_TITLE_FALLBACK_PATTERN);
  const rawTitle = match?.[2] ?? match?.[1] ?? "";
  const title = cleanTitle(rawTitle).replace(/\s*:\s*네이트.*$/i, "");

  return title || null;
}

function getArticleImage(articleHtml: string) {
  const match =
    articleHtml.match(ARTICLE_IMAGE_META_PATTERN) ??
    articleHtml.match(ARTICLE_IMAGE_FALLBACK_PATTERN);
  const rawImageUrl = match?.[2] ?? match?.[1] ?? "";
  const imageUrl = normalizeImageUrl(rawImageUrl);

  return imageUrl || null;
}

function mapEmoticonRankItemToNewsItem(
  item: NateEmoticonRankItem,
  fallbackRank: number,
): NateNewsItem | null {
  const mobileLink = item.mobileUrl;
  const pcLink = item.pcUrl;
  const articleId = getArticleId(mobileLink ?? pcLink ?? "");
  const title = cleanTitle(item.title ?? "");
  const img = normalizeImageUrl(item.imageUrl ?? "");

  if (!articleId || !mobileLink || !pcLink || !title || !img) {
    return null;
  }

  return {
    id: articleId,
    rank: item.rank ?? fallbackRank,
    title,
    link: pcLink,
    mobileLink,
    pcLink,
    imageUrl: img,
    sourceName: item.cpName ?? null,
    topComment: null,
    recommendationCount:
      typeof item.emoticonCnt === "number" ? item.emoticonCnt : null,
  };
}

function createAdItem(adIndex: number): NateNewsItem {
  return {
    id: `ad_${adIndex}`,
    rank: -1,
    title: `광고 ${adIndex}`,
    link: "#",
    imageUrl: "/images/ad-banner.png",
    sourceName: "광고",
    topComment: null,
    recommendationCount: null,
    isAd: true,
  };
}

async function fetchEmoticonRankItems(pageSize = EMOTICON_PAGE_SIZE) {
  let items: NateEmoticonRankItem[] = [];

  try {
    const params = new URLSearchParams({
      pageSize: String(pageSize),
    });
    const response = await fetchNateJson<NateEmoticonRankResponse>(
      `${NATE_EMOTICON_RANK_URL}?${params.toString()}`,
    );
    items = response.data ?? [];
  } catch (error) {
    console.warn(
      "Failed to fetch Nate emoticon JSON API, falling back to HTML ranking page.",
      error,
    );

    items = await fetchEmoticonRankItemsFromHtml(pageSize);
  }

  if (items.length === 0) {
    throw new Error("Nate emoticon ranking API returned no items.");
  }

  return items.slice(0, pageSize);
}

async function fetchTopComment(link: string) {
  const articleId = getArticleId(link);

  if (!articleId) {
    return null;
  }

  const articleHtml = await fetchNateDocument(link);
  const mid = getArticleMid(articleHtml);

  if (!mid) {
    return null;
  }

  const commentUrl = `${NATE_COMMENT_BASE_URL}?artc_sq=${articleId}&mid=${mid}`;
  const commentHtml = await fetchNateDocument(commentUrl);

  return getFirstMatchText(commentHtml, COMMENT_TEXT_PATTERN);
}

async function fetchTopCommentFromArticleHtml(
  articleId: string,
  articleHtml: string,
) {
  const mid = getArticleMid(articleHtml);

  if (!mid) {
    return null;
  }

  const commentUrl = `${NATE_COMMENT_BASE_URL}?artc_sq=${articleId}&mid=${mid}`;
  const commentHtml = await fetchNateDocument(commentUrl);

  return getFirstMatchText(commentHtml, COMMENT_TEXT_PATTERN);
}

async function enrichRankedItems(
  items: NateNewsItem[],
  detailMode: NewsDetailMode,
  leadArticleId?: string,
) {
  if (detailMode === "none") {
    return items;
  }

  const detailCount = detailMode === "top10" ? QUICK_DETAIL_COUNT : items.length;

  return Promise.all(
    items.map(async (item, index) => {
      if (index >= detailCount && item.id !== leadArticleId) {
        return item;
      }

      try {
        const topComment = await fetchTopComment(item.mobileLink ?? item.link);

        return {
          ...item,
          topComment,
        };
      } catch (error) {
        console.error("Failed to fetch Nate news comment", item.link, error);

        return item;
      }
    }),
  );
}

function composeOrderedNewsItems(
  rankedItems: NateNewsItem[],
  leadArticle: NateNewsItem | null,
) {
  const dedupedRankedItems = leadArticle
    ? rankedItems.filter((item) => item.id !== leadArticle.id)
    : rankedItems;

  return leadArticle ? [leadArticle, ...dedupedRankedItems] : dedupedRankedItems;
}

function insertAds(items: NateNewsItem[]) {
  const itemsWithAds: NateNewsItem[] = [];
  let adCounter = 1;
  let rankedNewsCount = 0;

  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    itemsWithAds.push(item);

    if (item.rank >= 1) {
      rankedNewsCount += 1;
    }

    if (rankedNewsCount > 0 && rankedNewsCount % 10 === 0) {
      itemsWithAds.push(createAdItem(adCounter));
      adCounter += 1;
    }
  }

  return itemsWithAds;
}

export async function fetchNateArticleById(articleId: string) {
  if (!ARTICLE_ID_PATTERN.test(`/view/${articleId}`)) {
    return null;
  }

  const pcLink = `${NATE_ARTICLE_BASE_URL}${articleId}`;
  const mobileLink = `${NATE_MOBILE_ARTICLE_BASE_URL}${articleId}`;
  const articleHtml = await fetchNateDocument(pcLink);
  const title = getArticleTitle(articleHtml);
  const imageUrl = getArticleImage(articleHtml);

  if (!title || !imageUrl) {
    return null;
  }

  const [topComment, rankedItems] = await Promise.all([
    fetchTopCommentFromArticleHtml(articleId, articleHtml).catch((error) => {
      console.error("Failed to fetch Nate lead comment", articleId, error);
      return null;
    }),
    fetchEmoticonRankItems(EMOTICON_PAGE_SIZE).catch((error) => {
      console.error("Failed to fetch Nate emoticon ranks", error);
      return [] as NateEmoticonRankItem[];
    }),
  ]);
  const matchedRankItem = rankedItems.find((item) => {
    const rankedArticleId = getArticleId(item.mobileUrl ?? item.pcUrl ?? "");

    return rankedArticleId === articleId;
  });

  return {
    id: articleId,
    rank: 0,
    title,
    link: pcLink,
    mobileLink,
    pcLink,
    imageUrl,
    sourceName: getArticleSource(articleHtml),
    topComment,
    recommendationCount:
      typeof matchedRankItem?.emoticonCnt === "number"
        ? matchedRankItem.emoticonCnt
        : null,
  } satisfies NateNewsItem;
}

export async function buildNateNewsFeed({
  leadArticleId,
  rankingLimit = DEFAULT_RANKING_LIMIT,
  detailMode = "all",
}: BuildNateNewsFeedOptions = {}): Promise<NateNewsFeed> {
  const pageSize = Math.min(rankingLimit, EMOTICON_PAGE_SIZE);
  const [rankResponseItems, leadArticle] = await Promise.all([
    fetchEmoticonRankItems(pageSize),
    leadArticleId ? fetchNateArticleById(leadArticleId) : Promise.resolve(null),
  ]);
  const rankedItems = rankResponseItems
    .map((item, index) => mapEmoticonRankItemToNewsItem(item, index + 1))
    .filter((item): item is NateNewsItem => item !== null);
  const enrichedItems = await enrichRankedItems(
    rankedItems,
    detailMode,
    leadArticleId,
  );
  const orderedItems = composeOrderedNewsItems(enrichedItems, leadArticle);

  return {
    items: insertAds(orderedItems),
    leadArticleId: leadArticle?.id,
  };
}
