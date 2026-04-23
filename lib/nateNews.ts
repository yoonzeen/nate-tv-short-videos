import "server-only";

export type NateNewsItem = {
  id: string;
  rank: number;
  title: string;
  link: string;
  img: string;
  sourceName: string | null;
  topComment: string | null;
  recommendationCount: number | null;
  isAd?: boolean;
};

const NATE_MOBILE_RANK_URL =
  "https://m.news.nate.com/rank/list?mid=m2001&section=photo&rmode=interest";
const NATE_COMMENT_BASE_URL = "https://m.comm.news.nate.com/Comment/ArticleComment/List";
const NATE_EMOTICON_BASE_URL =
  "https://m.comm.news.nate.com/comment/articleEmoticonComment/ArticleEmoticonList";

const ITEM_PATTERN =
  /<div class="item">\s*<a href="([^"]+)"[^>]*>\s*<span class="cnt(?:\s+r\d+)?">(\d+)<\/span>\s*<span class="thumb" style="background-image:url\('([^']+)'\);">[\s\S]*?<h2 class="txt">([\s\S]*?)<\/h2>/g;
const ARTICLE_ID_PATTERN = /\/view\/(\d{8}n\d+)/i;
const ARTICLE_MID_PATTERN =
  /ArticleEmoticonList\?artc_sq=\d{8}n\d+(?:&|&amp;)mid=([^"'&\s]+)/i;
const COMMENT_MID_PATTERN =
  /ArticleComment\/List\?artc_sq=\d{8}n\d+(?:&|&amp;)[^"'<>]*mid=([^"'&\s]+)/i;
const COMMENT_TEXT_PATTERN =
  /<dd class="userText">[\s\S]*?<a[^>]*>\s*([\s\S]*?)\s*<\/a>/gi;
const ARTICLE_SOURCE_PATTERN =
  /<div class="author">[\s\S]*?<em><b>([^<]+)<\/b><span>/i;
const ARTICLE_SOURCE_FALLBACK_PATTERN = /<span class="source">([^<]+)<\/span>/i;
const TOTAL_COUNT_PATTERN = /"totalcount":"(\d+)"/i;

const REQUEST_HEADERS = {
  "accept-language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
};
// 12페이지씩 순차적으로 호출하여 100개 항목 가져오기 (여유분 포함)
const RANK_PAGE_PARAMS = Array.from({ length: 12 }, (_, i) => 
  i === 0 ? "" : `&page=${i}`
);

function getTodayInSeoul() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = parts.find((part) => part.type === "day")?.value ?? "";

  return `${year}${month}${day}`;
}

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

function normalizeUrl(value: string) {
  const normalizedValue = value.startsWith("//") ? `https:${value}` : value;

  if (
    normalizedValue.startsWith(
      "https://thumbnews.nateimg.co.kr/mnews300x166/",
    )
  ) {
    return normalizedValue.replace(
      "https://thumbnews.nateimg.co.kr/mnews300x166/",
      "",
    );
  }

  return normalizedValue;
}

function cleanTitle(value: string) {
  return decodeHtmlEntities(value)
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

function getArticleId(link: string) {
  return link.match(ARTICLE_ID_PATTERN)?.[1] ?? null;
}

function getArticleMid(articleHtml: string) {
  const match =
    articleHtml.match(ARTICLE_MID_PATTERN) ?? articleHtml.match(COMMENT_MID_PATTERN);

  return decodeHtmlEntities(match?.[1] ?? "");
}

function getArticleSource(articleHtml: string) {
  const match =
    articleHtml.match(ARTICLE_SOURCE_PATTERN) ??
    articleHtml.match(ARTICLE_SOURCE_FALLBACK_PATTERN);
  const sourceName = cleanSource(match?.[1] ?? "");

  return sourceName || null;
}

function createAdItem(adIndex: number): NateNewsItem {
  return {
    id: `ad_${adIndex}`,
    rank: -1, // 광고는 순위가 없음
    title: `광고 ${adIndex}`,
    link: "#",
    img: "/images/ad-banner.png",
    sourceName: "광고",
    topComment: null,
    recommendationCount: null,
    isAd: true,
  };
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

async function fetchArticleDetails(link: string) {
  const articleId = getArticleId(link);

  if (!articleId) {
    return {
      recommendationCount: null,
      topComment: null,
    };
  }

  const articleHtml = await fetchNateDocument(link);
  const mid = getArticleMid(articleHtml);
  const sourceName = getArticleSource(articleHtml);

  if (!mid) {
    return {
      sourceName,
      recommendationCount: null,
      topComment: null,
    };
  }

  const emoticonUrl = `${NATE_EMOTICON_BASE_URL}?artc_sq=${articleId}&mid=${mid}`;
  const commentUrl = `${NATE_COMMENT_BASE_URL}?artc_sq=${articleId}&mid=${mid}`;

  const [emoticonResponse, commentHtml] = await Promise.all([
    fetchNateDocument(emoticonUrl),
    fetchNateDocument(commentUrl),
  ]);

  const recommendationCount = Number.parseInt(
    emoticonResponse.match(TOTAL_COUNT_PATTERN)?.[1] ?? "",
    10,
  );
  const topComment = getFirstMatchText(commentHtml, COMMENT_TEXT_PATTERN);

  return {
    sourceName,
    recommendationCount: Number.isNaN(recommendationCount)
      ? null
      : recommendationCount,
    topComment,
  };
}

export async function fetchNateRankedNews(date = getTodayInSeoul()) {
  const items: NateNewsItem[] = [];
  const seenArticleIds = new Set<string>();

  // 순차적으로 10페이지씩 호출하여 100개 항목 수집
  for (const pageParam of RANK_PAGE_PARAMS) {
    try {
      const html = await fetchNateDocument(`${NATE_MOBILE_RANK_URL}&date=${date}${pageParam}`);
      
      for (const match of html.matchAll(ITEM_PATTERN)) {
        const link = normalizeUrl(decodeHtmlEntities(match[1] ?? ""));
        const articleId = getArticleId(link);
        const rank = Number.parseInt(match[2] ?? "", 10);
        const img = normalizeUrl(decodeHtmlEntities(match[3] ?? ""));
        const title = cleanTitle(match[4] ?? "");

        if (
          !articleId ||
          seenArticleIds.has(articleId) ||
          !link ||
          !img ||
          !title ||
          Number.isNaN(rank)
        ) {
          continue;
        }

        seenArticleIds.add(articleId);
        items.push({
          id: articleId,
          rank,
          title,
          link,
          img,
          sourceName: null,
          topComment: null,
          recommendationCount: null,
        });
      }
    } catch (error) {
      console.error(`Failed to fetch page ${pageParam}:`, error);
      // 개별 페이지 실패 시에도 다른 페이지는 계속 처리
      continue;
    }
  }

  const enrichedItems = await Promise.all(
    items.map(async (item) => {
      try {
        const details = await fetchArticleDetails(item.link);

        return {
          ...item,
          ...details,
        };
      } catch (error) {
        console.error("Failed to enrich Nate news item", item.link, error);

        return item;
      }
    }),
  );

  // 정확히 100개의 뉴스 아이템만 가져오기
  const sortedItems = enrichedItems.sort((a, b) => a.rank - b.rank).slice(0, 100);
  
  // 광고 삽입: 10개마다 광고 추가 (10위 다음, 20위 다음, ...)
  const itemsWithAds: NateNewsItem[] = [];
  let adCounter = 1;
  
  for (let i = 0; i < sortedItems.length; i++) {
    itemsWithAds.push(sortedItems[i]);
    
    // 10의 배수 위치 다음에 광고 삽입 (10, 20, 30, ..., 100)
    if ((i + 1) % 10 === 0) {
      itemsWithAds.push(createAdItem(adCounter));
      adCounter++;
    }
  }
  
  return itemsWithAds;
}

/** 랭킹 HTML만 병렬 수집(기사 상세 없음). 첫 페인트·SSR용. */
export async function fetchNateRankedNewsListOnly(
  date = getTodayInSeoul(),
  maxItems = 20,
) {
  const pageCount = Math.max(1, Math.ceil(maxItems / 10));
  const quickPages = Array.from(
    { length: pageCount },
    (_, index) => (index === 0 ? "" : `&page=${index}`),
  );
  const htmlPages = await Promise.all(
    quickPages.map((pageParam) =>
      fetchNateDocument(`${NATE_MOBILE_RANK_URL}&date=${date}${pageParam}`),
    ),
  );

  const items: NateNewsItem[] = [];
  const seenArticleIds = new Set<string>();

  for (const html of htmlPages) {
    for (const match of html.matchAll(ITEM_PATTERN)) {
      const link = normalizeUrl(decodeHtmlEntities(match[1] ?? ""));
      const articleId = getArticleId(link);
      const rank = Number.parseInt(match[2] ?? "", 10);
      const img = normalizeUrl(decodeHtmlEntities(match[3] ?? ""));
      const title = cleanTitle(match[4] ?? "");

      if (
        !articleId ||
        seenArticleIds.has(articleId) ||
        !link ||
        !img ||
        !title ||
        Number.isNaN(rank)
      ) {
        continue;
      }

      seenArticleIds.add(articleId);
      items.push({
        id: articleId,
        rank,
        title,
        link,
        img,
        sourceName: null,
        topComment: null,
        recommendationCount: null,
      });
    }
  }

  const sortedItems = items.sort((a, b) => a.rank - b.rank).slice(0, maxItems);
  const itemsWithAds: NateNewsItem[] = [];
  let adCounter = 1;

  for (let i = 0; i < sortedItems.length; i++) {
    itemsWithAds.push(sortedItems[i]);

    if ((i + 1) % 10 === 0) {
      itemsWithAds.push(createAdItem(adCounter));
      adCounter++;
    }
  }

  return itemsWithAds;
}

// 빠른 로딩을 위한 간단한 버전 (상세 정보 없이)
export async function fetchNateRankedNewsSimple(date = getTodayInSeoul()) {
  const items: NateNewsItem[] = [];
  const seenArticleIds = new Set<string>();

  // 처음 2페이지만 빠르게 가져오기 (약 20개 기사)
  const quickPages = ["", "&page=1"];

  const htmlPages = await Promise.all(
    quickPages.map((pageParam) =>
      fetchNateDocument(`${NATE_MOBILE_RANK_URL}&date=${date}${pageParam}`),
    ),
  );

  for (const html of htmlPages) {
    try {
      for (const match of html.matchAll(ITEM_PATTERN)) {
        const link = normalizeUrl(decodeHtmlEntities(match[1] ?? ""));
        const articleId = getArticleId(link);
        const rank = Number.parseInt(match[2] ?? "", 10);
        const img = normalizeUrl(decodeHtmlEntities(match[3] ?? ""));
        const title = cleanTitle(match[4] ?? "");

        if (
          !articleId ||
          seenArticleIds.has(articleId) ||
          !link ||
          !img ||
          !title ||
          Number.isNaN(rank)
        ) {
          continue;
        }

        seenArticleIds.add(articleId);
        items.push({
          id: articleId,
          rank,
          title,
          link,
          img,
          sourceName: null,
          topComment: null,
          recommendationCount: null,
        });
      }
    } catch (error) {
      console.error("Failed to parse quick rank page:", error);
    }
  }

  // 정렬하고 처음 10개 기사는 상세 정보 포함
  const sortedItems = items.sort((a, b) => a.rank - b.rank).slice(0, 20);
  
  // 처음 10개 기사에 대해서는 상세 정보 가져오기
  const enrichedItems = await Promise.all(
    sortedItems.map(async (item, index) => {
      if (index < 10) {
        // 처음 10개만 상세 정보 포함
        try {
          const details = await fetchArticleDetails(item.link);
          return {
            ...item,
            ...details,
          };
        } catch (error) {
          console.error("Failed to enrich quick news item", item.link, error);
          return item;
        }
      }
      return item; // 나머지는 기본 정보만
    })
  );
  
  // 광고 삽입
  const itemsWithAds: NateNewsItem[] = [];
  let adCounter = 1;
  
  for (let i = 0; i < enrichedItems.length; i++) {
    itemsWithAds.push(enrichedItems[i]);
    
    // 10의 배수 위치 다음에 광고 삽입
    if ((i + 1) % 10 === 0) {
      itemsWithAds.push(createAdItem(adCounter));
      adCounter++;
    }
  }
  
  return itemsWithAds;
}
