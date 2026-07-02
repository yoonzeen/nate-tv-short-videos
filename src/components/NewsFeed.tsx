import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type TouchEvent,
} from "react";
import { sendPV } from "../utils";
import { hasSeenSwipeGuide, markSwipeGuideSeen } from "../utils/swipeGuide";
import { NewsFeedLoadingSkeleton } from "./NewsFeedLoadingSkeleton";
import { SwipeGuideOverlay } from "./SwipeGuideOverlay";
import styles from "./NewsFeed.module.css";

/** 한 슬라이드가 progress bar로 자동 넘어가기까지 걸리는 시간(ms) */
const SLIDE_DURATION_MS = 2_000;
/** 썸네일 object-position 패닝 애니메이션 한 사이클 길이(ms). 슬라이드 duration과 맞춤 */
const THUMB_MOTION_DURATION_MS = 2_000;
/** scroll-snap 전환 scroll 애니메이션 길이(ms) */
const SLIDE_TRANSITION_MS = 320;
/** scroll-snap 전환 완료 대기 최대 시간(ms) */
const NAV_SNAP_TIMEOUT_MS = SLIDE_TRANSITION_MS + 120;
/** 스와이프·전환 직후 progress·썸네일 애니메이션을 멈추는 시간(ms) */
const SWIPE_ANIMATION_RESUME_DELAY_MS = 180;
/** 스크롤이 멈춘 뒤 activeIndex를 다시 맞출 때까지 기다리는 시간(ms) */
const SCROLL_SETTLE_SYNC_DELAY_MS = SWIPE_ANIMATION_RESUME_DELAY_MS + 80;
/** 네이티브 스크롤이 시작됐다고 볼 scrollTop 변화량(px) */
const TOUCH_NATIVE_SCROLL_DELTA_PX = 4;
/** 터치 스와이프 후 programmatic scroll 대신 goToIndex를 쓸 때까지 지연(ms) */
const TOUCH_FALLBACK_NAVIGATION_DELAY_MS = 40;
/** shortform·Vite 프록시 등에서 쓰는 photoslides API 상대 경로 */
const SHORTFORM_PHOTO_SLIDES_FIRST_ITEMS_API_PATH =
  "/service/api/photoslides/firstItems";
/** shortform.nate.com 배포 환경 photoslides API 전체 URL */
const SHORTFORM_PHOTO_SLIDES_FIRST_ITEMS_API_URL =
  "https://shortform.nate.com/service/api/photoslides/firstItems";
/** 네이트 뉴스 API 서버 photoslides firstItems 직접 URL(로컬·프록시 대상) */
const NATE_PHOTO_SLIDES_FIRST_ITEMS_API_URL =
  "http://api.news.nate.com:8080/photoslides/firstItems";
/** 기사 상세 진입 후 돌아올 때 슬라이드 위치·progress를 복원하기 위한 sessionStorage 키 */
const ARTICLE_RETURN_STATE_STORAGE_KEY = "natetv-shorts:return-state";
/** 네이트 view610 썸네일 CDN URL 접두사 */
const NATE_VIEW_THUMB_IMAGE_PREFIX = "https://thumbnews.nateimg.co.kr/view610/";

/** 썸네일 패닝 방향 후보(슬라이드마다 해시로 좌/우 중 하나 선택) */
const THUMB_MOTION_VARIANTS = ["panLeft", "panRight"] as const;
type ThumbMotionVariant = (typeof THUMB_MOTION_VARIANTS)[number];

/** 썸네일 object-position 이동 폭(%). crop 없이도 움직임을 주기 위한 값 */
const THUMB_OBJECT_POS_DELTA = 10;

type PhotoSlideItem = {
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

type NewsFeedProps = {
  items?: PhotoSlideItem[];
};

type NatePhotoSlidesResponse = {
  data?: PhotoSlideItem[];
};

type ArticleReturnState = {
  slideId: string;
  realIndex: number;
  elapsedMs: number;
  savedAt: number;
};

/** 기사 URL에서 네이트 기사 ID(예: 20240521n00001)를 추출하는 정규식 */
const ARTICLE_ID_PATTERN = /\/view\/(\d{8}n\d+)/i;

function easeOutCubic(t: number) {
  return 1 - (1 - t) ** 3;
}

function hashText(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash;
}

function getSlideId(item: PhotoSlideItem) {
  return getArticleId(item.pcUrl || item.mobileUrl) ?? `${item.pcUrl}:${item.title}`;
}

function getThumbMotionVariant(item: PhotoSlideItem, index: number): ThumbMotionVariant {
  const seed = hashText(`${getSlideId(item)}:${index}`);

  return THUMB_MOTION_VARIANTS[seed % THUMB_MOTION_VARIANTS.length];
}

function getThumbMotionProgress(slideProgress: number) {
  return Math.min(
    1,
    Math.max(0, slideProgress) * (SLIDE_DURATION_MS / THUMB_MOTION_DURATION_MS),
  );
}

function getThumbObjectPositionAtProgress(
  item: PhotoSlideItem,
  index: number,
  progress: number,
  isPortrait: boolean,
) {
  const clamped = Math.max(0, Math.min(1, progress));

  if (isPortrait) {
    const posY = 100 * clamped;
    return `50.00% ${posY.toFixed(2)}%`;
  }

  const variant = getThumbMotionVariant(item, index);
  const posX =
    variant === "panLeft"
      ? 50 + THUMB_OBJECT_POS_DELTA - THUMB_OBJECT_POS_DELTA * 2 * clamped
      : 50 - THUMB_OBJECT_POS_DELTA + THUMB_OBJECT_POS_DELTA * 2 * clamped;

  return `${posX.toFixed(2)}% 50%`;
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

function cleanText(value: string) {
  return decodeHtmlEntities(value)
    .replace(/\\[nrtt]/g, " ")
    .replace(/\\(["'/\\])/g, "$1")
    .replace(/\\/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeNateUrl(value: string) {
  const normalizedValue = decodeHtmlEntities(value).trim();

  if (normalizedValue.startsWith("//")) {
    return `https:${normalizedValue}`;
  }

  return normalizedValue;
}

function normalizeImageUrl(value: string) {
  const normalizedValue = normalizeNateUrl(value);

  if (normalizedValue.startsWith(NATE_VIEW_THUMB_IMAGE_PREFIX)) {
    const encodedOriginalUrl = normalizedValue.slice(NATE_VIEW_THUMB_IMAGE_PREFIX.length);

    try {
      const originalUrl = decodeURIComponent(encodedOriginalUrl);
      if (/\.gif(?:[?#]|$)/i.test(originalUrl)) {
        return normalizeNateUrl(originalUrl);
      }
    } catch {
      return normalizedValue;
    }
  }

  return normalizedValue;
}

function getArticleId(value: string) {
  return normalizeNateUrl(value).match(ARTICLE_ID_PATTERN)?.[1] ?? null;
}

function getStoredArticleReturnState() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(ARTICLE_RETURN_STATE_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<ArticleReturnState>;
    if (
      typeof parsed.slideId !== "string" ||
      typeof parsed.realIndex !== "number" ||
      typeof parsed.elapsedMs !== "number"
    ) {
      return null;
    }

    return {
      slideId: parsed.slideId,
      realIndex: parsed.realIndex,
      elapsedMs: Math.max(0, Math.min(parsed.elapsedMs, SLIDE_DURATION_MS)),
      savedAt: typeof parsed.savedAt === "number" ? parsed.savedAt : Date.now(),
    } satisfies ArticleReturnState;
  } catch {
    return null;
  }
}

function storeArticleReturnState(state: ArticleReturnState) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(
      ARTICLE_RETURN_STATE_STORAGE_KEY,
      JSON.stringify(state),
    );
  } catch {
    // 세션 스토리지를 사용할 수 없는 환경에서는 기본 뒤로가기 동작만 유지한다.
  }
}

function clearStoredArticleReturnState() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.removeItem(ARTICLE_RETURN_STATE_STORAGE_KEY);
  } catch {
    // ignore
  }
}

function shouldUseMobileArticleUrl() {
  if (typeof window === "undefined") {
    return false;
  }

  const userAgent = navigator.userAgent;
  const isMobileUserAgent =
    /Android|iPhone|iPod|IEMobile|Mobile/i.test(userAgent) ||
    (/Macintosh/i.test(userAgent) && (navigator.maxTouchPoints ?? 0) > 1);
  const isCoarseSmallViewport =
    window.matchMedia("(pointer: coarse)").matches &&
    window.matchMedia("(max-width: 768px)").matches;

  return isMobileUserAgent || isCoarseSmallViewport;
}

function isPhotoSlideItem(value: unknown): value is PhotoSlideItem {
  if (!value || typeof value !== "object") {
    return false;
  }

  const item = value as Partial<PhotoSlideItem>;
  return Boolean(
    item.title &&
      item.mobileUrl &&
      item.pcUrl &&
      item.imageUrl &&
      getArticleId(item.mobileUrl || item.pcUrl),
  );
}

function getItemsFromResponse(value: unknown): PhotoSlideItem[] {
  if (Array.isArray(value)) {
    return value.filter(isPhotoSlideItem);
  }

  if (
    value &&
    typeof value === "object" &&
    Array.isArray((value as NatePhotoSlidesResponse).data)
  ) {
    return ((value as NatePhotoSlidesResponse).data ?? []).filter(isPhotoSlideItem);
  }

  return [];
}

function getUniqueNewsItems(items: PhotoSlideItem[]) {
  const seen = new Set<string>();
  const uniqueItems: PhotoSlideItem[] = [];

  for (const item of items) {
    const id = getSlideId(item);
    if (seen.has(id)) {
      continue;
    }

    seen.add(id);
    uniqueItems.push(item);
  }

  return uniqueItems;
}

function prepareNewsItems(items: PhotoSlideItem[]) {
  return getUniqueNewsItems(items);
}

function getRandomStartIndex(itemCount: number) {
  if (itemCount <= 1) {
    return 0;
  }

  return Math.floor(Math.random() * itemCount);
}

function getPhotoSlidesFirstItemsApiCandidates() {
  const external = import.meta.env.VITE_NEWS_API_URL?.trim();
  const candidates: string[] = [];

  if (external) {
    candidates.push(external);
  }

  if (typeof window !== "undefined") {
    const isShortformHost = window.location.hostname === "shortform.nate.com";
    const isVercelHost = window.location.hostname.endsWith(".vercel.app");
    const isShortnewsPath =
      window.location.pathname.startsWith("/shortnews") ||
      import.meta.env.BASE_URL.startsWith("/shortnews");

    if (isShortformHost && isShortnewsPath) {
      candidates.push(SHORTFORM_PHOTO_SLIDES_FIRST_ITEMS_API_URL);
    } else if (import.meta.env.DEV || isVercelHost) {
      candidates.push(SHORTFORM_PHOTO_SLIDES_FIRST_ITEMS_API_PATH);
    } else {
      candidates.push(NATE_PHOTO_SLIDES_FIRST_ITEMS_API_URL);
    }
  } else {
    candidates.push(NATE_PHOTO_SLIDES_FIRST_ITEMS_API_URL);
  }

  return Array.from(new Set(candidates));
}

async function fetchNewsItemsFromCandidates(urls: string[], signal: AbortSignal) {
  let lastError: unknown = null;

  for (const url of urls) {
    try {
      const response = await fetch(url, {
        cache: "no-store",
        signal,
      });

      if (!response.ok) {
        throw new Error(`news ${response.status} @ ${url}`);
      }

      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        const sample = (await response.text()).slice(0, 80);
        throw new Error(
          `news invalid content-type (${contentType || "unknown"}) @ ${url}: ${JSON.stringify(sample)}`,
        );
      }

      const data = prepareNewsItems(getItemsFromResponse(await response.json()));
      return data;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error("news request failed");
}

export function NewsFeed({ items: initialItems }: NewsFeedProps) {
  const [items, setItems] = useState<PhotoSlideItem[]>(() =>
    prepareNewsItems(initialItems ?? []),
  );
  const [loading, setLoading] = useState(!(initialItems && initialItems.length > 0));
  const [apiError, setApiError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [activeLoopIndex, setActiveLoopIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isGestureActive, setIsGestureActive] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isMobileDevice, setIsMobileDevice] = useState(false);
  const [isPageActive, setIsPageActive] = useState(true);
  const [showSwipeGuide, setShowSwipeGuide] = useState(false);
  const [, bumpThumbMetaVersion] = useState(0);
  const feedRef = useRef<HTMLElement | null>(null);
  const itemRefs = useRef<Array<HTMLElement | null>>([]);
  const updateViewportHeightRef = useRef<(() => void) | null>(null);
  const detachViewportHeightListenersRef = useRef<(() => void) | null>(null);
  const appliedViewportHeightRef = useRef(0);
  const appliedViewportBottomInsetRef = useRef(0);
  const viewportStabilizeTimeoutRef = useRef<number | null>(null);
  const isGestureActiveRef = useRef(false);
  const isTransitioningRef = useRef(false);
  const touchStartYRef = useRef<number | null>(null);
  const touchStartScrollTopRef = useRef<number | null>(null);
  const touchMovedWithScrollRef = useRef(false);
  const slideElapsedRef = useRef<number>(0);
  const lastTickRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const scrollRafRef = useRef<number | null>(null);
  const slideScrollRafRef = useRef<number | null>(null);
  const gestureTimeoutRef = useRef<number | null>(null);
  const scrollEndTimeoutRef = useRef<number | null>(null);
  const pendingTouchNavigationTimeoutRef = useRef<number | null>(null);
  const activeIndexRef = useRef(0);
  const activeLoopIndexRef = useRef(0);
  const navigationLockedRef = useRef(false);
  const suppressScrollGestureRef = useRef(false);
  const transitionTokenRef = useRef(0);
  const frozenThumbObjectPositionRef = useRef(new Map<number, string>());
  const portraitThumbRef = useRef(new Map<string, boolean>());
  const restoredArticleStateRef = useRef<ArticleReturnState | null>(
    getStoredArticleReturnState(),
  );
  const skipNextActiveIndexProgressResetRef = useRef(false);

  const newsApiCandidates = useMemo(getPhotoSlidesFirstItemsApiCandidates, []);

  const completeSwipeGuide = useCallback(() => {
    markSwipeGuideSeen();
    setShowSwipeGuide(false);
  }, []);

  useEffect(() => {
    if (loading || items.length === 0 || hasSeenSwipeGuide()) {
      return;
    }

    setShowSwipeGuide(true);
  }, [loading, items.length]);

  const hasLoop = items.length > 1;
  const loopCount = hasLoop ? items.length + 2 : items.length;
  const startLoopIndex = hasLoop ? 1 : 0;

  useLayoutEffect(() => {
    if (detachViewportHeightListenersRef.current) {
      return;
    }

    const feed = feedRef.current;
    if (!feed || typeof window === "undefined") {
      return;
    }

    const updateHeight = () => {
      const visualViewport = window.visualViewport;
      const height = Math.round(visualViewport?.height ?? window.innerHeight);
      const bottomInset = visualViewport
        ? Math.max(
            0,
            Math.round(window.innerHeight - (visualViewport.height + visualViewport.offsetTop)),
          )
        : 0;

      const isBusy =
        navigationLockedRef.current ||
        isGestureActiveRef.current ||
        isTransitioningRef.current;

      const prevHeight = appliedViewportHeightRef.current;
      const prevInset = appliedViewportBottomInsetRef.current;

      // 전환/제스처 중에는 뷰포트 높이 변화(주소창/툴바)로 slide height가 바뀌면
      // scrollTop이 재정렬되면서 “삐그덕” 체감이 생긴다.
      // 그래서 busy 동안에는 값을 고정(freeze)하고, idle이 된 뒤 살짝 지연 후 갱신한다.
      if (isBusy && prevHeight > 0) {
        return;
      }

      if (viewportStabilizeTimeoutRef.current !== null) {
        window.clearTimeout(viewportStabilizeTimeoutRef.current);
        viewportStabilizeTimeoutRef.current = null;
      }

      const apply = () => {
        if (
          navigationLockedRef.current ||
          isGestureActiveRef.current ||
          isTransitioningRef.current
        ) {
          return;
        }

        if (height !== appliedViewportHeightRef.current) {
          feed.style.setProperty("--feed-height", `${height}px`);
          appliedViewportHeightRef.current = height;
        }
        if (bottomInset !== prevInset) {
          feed.style.setProperty("--vv-bottom-inset", `${bottomInset}px`);
          appliedViewportBottomInsetRef.current = bottomInset;
        }
      };

      // 증가(주소창 숨김 등)로 인한 여유는 바로 반영, 감소는 짧게 지연해 스냅 끝 프레임 흔들림 방지
      const isShrink = prevHeight > 0 && height < prevHeight;
      if (!isShrink) {
        apply();
        return;
      }

      viewportStabilizeTimeoutRef.current = window.setTimeout(() => {
        viewportStabilizeTimeoutRef.current = null;
        apply();
      }, 220);
    };

    updateViewportHeightRef.current = updateHeight;
    updateHeight();

    window.addEventListener("resize", updateHeight);
    window.addEventListener("orientationchange", updateHeight);
    window.visualViewport?.addEventListener("resize", updateHeight);

    detachViewportHeightListenersRef.current = () => {
      window.removeEventListener("resize", updateHeight);
      window.removeEventListener("orientationchange", updateHeight);
      window.visualViewport?.removeEventListener("resize", updateHeight);
      if (viewportStabilizeTimeoutRef.current !== null) {
        window.clearTimeout(viewportStabilizeTimeoutRef.current);
        viewportStabilizeTimeoutRef.current = null;
      }
      updateViewportHeightRef.current = null;
      detachViewportHeightListenersRef.current = null;
    };
  }, [items.length, loading]);

  useEffect(() => {
    return () => {
      detachViewportHeightListenersRef.current?.();
    };
  }, []);

  useEffect(() => {
    const updateMobileDeviceState = () => {
      setIsMobileDevice(shouldUseMobileArticleUrl());
    };

    updateMobileDeviceState();
    window.addEventListener("resize", updateMobileDeviceState);
    window.addEventListener("orientationchange", updateMobileDeviceState);

    return () => {
      window.removeEventListener("resize", updateMobileDeviceState);
      window.removeEventListener("orientationchange", updateMobileDeviceState);
    };
  }, []);

  useEffect(() => {
    const shouldIgnoreDocumentFocus =
      typeof window !== "undefined" &&
      ("ontouchstart" in window || (navigator.maxTouchPoints ?? 0) > 0);

    const updatePageActiveState = () => {
      const visible = document.visibilityState === "visible";
      setIsPageActive(
        visible && (shouldIgnoreDocumentFocus || document.hasFocus()),
      );
    };

    updatePageActiveState();
    document.addEventListener("visibilitychange", updatePageActiveState);
    window.addEventListener("focus", updatePageActiveState);
    window.addEventListener("blur", updatePageActiveState);

    return () => {
      document.removeEventListener("visibilitychange", updatePageActiveState);
      window.removeEventListener("focus", updatePageActiveState);
      window.removeEventListener("blur", updatePageActiveState);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !("scrollRestoration" in history)) {
      return;
    }

    const previous = history.scrollRestoration;
    history.scrollRestoration = "manual";

    return () => {
      history.scrollRestoration = previous;
    };
  }, []);

  useEffect(() => {
    const nextItems = prepareNewsItems(initialItems ?? []);
    const nextHasLoop = nextItems.length > 1;

    setItems(nextItems);
    setLoading(!(initialItems && initialItems.length > 0));
    setApiError(null);
    setActiveIndex(0);
    setActiveLoopIndex(nextHasLoop ? 1 : 0);
    setProgress(0);

    activeIndexRef.current = 0;
    activeLoopIndexRef.current = nextHasLoop ? 1 : 0;
    slideElapsedRef.current = 0;
    lastTickRef.current = null;
    navigationLockedRef.current = false;

    if (scrollRafRef.current !== null) {
      window.cancelAnimationFrame(scrollRafRef.current);
      scrollRafRef.current = null;
    }

    if (feedRef.current) {
      feedRef.current.scrollTop = 0;
    }
  }, [initialItems]);

  useEffect(() => {
    if ((initialItems?.length ?? 0) > 0) {
      return;
    }

    const controller = new AbortController();
    const { signal } = controller;

    const loadData = async () => {
      try {
        const data = await fetchNewsItemsFromCandidates(newsApiCandidates, signal);
        setItems(data);
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }

        console.error("Failed to load news:", error);
        const message =
          error instanceof Error ? error.message : "뉴스 API 호출에 실패했습니다.";

        const externalConfigured = Boolean(import.meta.env.VITE_NEWS_API_URL?.trim());
        const isShortnewsStaticBase = import.meta.env.BASE_URL.startsWith("/shortnews");

        setApiError(
          !externalConfigured && isShortnewsStaticBase
            ? `${message}\n\n(배포 환경에서 기본 API 경로가 맞지 않다면 빌드 시 VITE_NEWS_API_URL에 photoslides API 전체 URL을 지정해 주세요.)`
            : message,
        );
      } finally {
        /* abort(cleanup) 시에는 loading을 false로 두면 “빈 목록 + 로딩 끝”으로 남아 재요청이 막힘 */
        if (!signal.aborted) {
          setLoading(false);
        }
      }
    };

    setLoading(true);
    void loadData();

    return () => {
      controller.abort();
    };
  }, [initialItems, newsApiCandidates]);

  useEffect(() => {
    const feed = feedRef.current;
    if (!feed || typeof IntersectionObserver === "undefined" || items.length === 0) {
      return;
    }

    const visibleSlides = new Set<Element>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
            if (!visibleSlides.has(entry.target)) {
              visibleSlides.add(entry.target);
              sendPV();
            }
          } else {
            visibleSlides.delete(entry.target);
          }
        }
      },
      {
        root: feed,
        threshold: [0, 0.6],
      },
    );

    for (const element of itemRefs.current) {
      if (element) {
        observer.observe(element);
      }
    }

    return () => {
      observer.disconnect();
      visibleSlides.clear();
    };
  }, [items.length, loopCount]);

  const getLoopTop = useCallback(
    (loopIndex: number) => {
      const feed = feedRef.current;
      if (!feed) {
        return 0;
      }

      const slideHeight =
        itemRefs.current[startLoopIndex]?.getBoundingClientRect().height ||
        feed.clientHeight ||
        1;

      return itemRefs.current[loopIndex]?.offsetTop ?? loopIndex * slideHeight;
    },
    [startLoopIndex],
  );

  const scrollToLoopIndex = useCallback(
    (loopIndex: number, behavior: ScrollBehavior) => {
      const feed = feedRef.current;
      if (!feed) {
        return;
      }

      if (slideScrollRafRef.current !== null) {
        cancelAnimationFrame(slideScrollRafRef.current);
        slideScrollRafRef.current = null;
      }

      const targetTop = getLoopTop(loopIndex);

      if (behavior === "auto") {
        suppressScrollGestureRef.current = true;
        feed.scrollTo({ top: targetTop, behavior: "auto" });

        window.requestAnimationFrame(() => {
          suppressScrollGestureRef.current = false;
        });
        return;
      }

      const startTop = feed.scrollTop;
      const startTime = performance.now();
      const previousSnapType = feed.style.scrollSnapType;
      const previousBehavior = feed.style.scrollBehavior;

      suppressScrollGestureRef.current = true;
      feed.style.scrollSnapType = "none";
      feed.style.scrollBehavior = "auto";

      const step = (now: number) => {
        const progress = Math.min(1, (now - startTime) / SLIDE_TRANSITION_MS);
        feed.scrollTop = startTop + (targetTop - startTop) * easeOutCubic(progress);

        if (progress < 1) {
          slideScrollRafRef.current = requestAnimationFrame(step);
          return;
        }

        feed.scrollTop = targetTop;
        feed.style.scrollSnapType = previousSnapType;
        feed.style.scrollBehavior = previousBehavior;
        slideScrollRafRef.current = null;

        window.requestAnimationFrame(() => {
          suppressScrollGestureRef.current = false;
        });
      };

      slideScrollRafRef.current = requestAnimationFrame(step);
    },
    [getLoopTop],
  );

  const hardSetFeedScrollTop = useCallback((top: number) => {
    const feed = feedRef.current;
    if (!feed) {
      return;
    }

    const previousSnapType = feed.style.scrollSnapType;
    const previousBehavior = feed.style.scrollBehavior;

    suppressScrollGestureRef.current = true;
    feed.style.scrollSnapType = "none";
    feed.style.scrollBehavior = "auto";
    feed.scrollTop = top;

    window.requestAnimationFrame(() => {
      // 일부 브라우저/스냅 조합에서 1프레임 뒤 보정이 들어가 덜컹거릴 수 있어 한 번 더 고정
      feed.scrollTop = top;
      feed.style.scrollSnapType = previousSnapType;
      feed.style.scrollBehavior = previousBehavior;

      window.requestAnimationFrame(() => {
        suppressScrollGestureRef.current = false;
      });
    });
  }, []);

  const freezeThumbObjectPosition = useCallback(() => {
    const loopIndex = activeLoopIndexRef.current;
    const activeItem = items[activeIndexRef.current];
    if (!activeItem) {
      return;
    }

    const realIndex = activeIndexRef.current;
    const isPortrait = portraitThumbRef.current.get(getSlideId(activeItem)) === true;
    const position = getThumbObjectPositionAtProgress(
      activeItem,
      realIndex,
      getThumbMotionProgress(progress),
      isPortrait,
    );

    frozenThumbObjectPositionRef.current.set(loopIndex, position);
  }, [items, progress]);

  const waitUntilSnappedTo = useCallback(
    (loopIndex: number, token: number, timeoutMs: number, onDone: () => void) => {
      const startedAt = performance.now();

      const check = () => {
        if (transitionTokenRef.current !== token) {
          return;
        }

        const feed = feedRef.current;
        if (!feed) {
          return;
        }

        const expectedTop = getLoopTop(loopIndex);
        const isSnapped = Math.abs(feed.scrollTop - expectedTop) < 8;

        if (isSnapped || performance.now() - startedAt > timeoutMs) {
          onDone();
          return;
        }

        window.requestAnimationFrame(check);
      };
      window.requestAnimationFrame(check);
    },
    [getLoopTop],
  );

  const goToIndex = useCallback(
    (index: number) => {
      if (items.length === 0 || navigationLockedRef.current) {
        return;
      }

      // 슬라이드가 위/아래로 움직이는 동안에는 가로 팬을 “현재 위치에서” 멈춰두기
      freezeThumbObjectPosition();

      const token = (transitionTokenRef.current += 1);
      const total = items.length;
      const currentReal = activeIndexRef.current;
      const currentLoop = activeLoopIndexRef.current;

      let targetLoopIndex = index + startLoopIndex;
      let nextRealIndex = index;
      let needsResetAfterScroll = false;
      let resetLoopIndex = targetLoopIndex;

      if (hasLoop) {
        if (index < 0) {
          // 1페이지에서 이전으로: "20(클론)"으로 1칸 이동 후 → 진짜 20으로 순간 이동
          targetLoopIndex = 0; // top clone (last)
          nextRealIndex = total - 1;
          needsResetAfterScroll = true;
          resetLoopIndex = total; // last real slide
        } else if (index >= total) {
          // 20페이지에서 다음으로: "1(클론)"으로 1칸 이동 후 → 진짜 1로 순간 이동
          targetLoopIndex = total + 1; // bottom clone (first)
          nextRealIndex = 0;
          needsResetAfterScroll = true;
          resetLoopIndex = 1; // first real slide
        }
      } else {
        // loop 미사용(아이템 1개): 그냥 그 자리에 둠
        targetLoopIndex = 0;
        nextRealIndex = 0;
      }

      if (nextRealIndex === currentReal && targetLoopIndex === currentLoop) {
        return;
      }

      navigationLockedRef.current = true;
      setIsTransitioning(true);
      isTransitioningRef.current = true;
      setActiveIndex(nextRealIndex);
      setActiveLoopIndex(targetLoopIndex);
      activeIndexRef.current = nextRealIndex;
      activeLoopIndexRef.current = targetLoopIndex;
      scrollToLoopIndex(targetLoopIndex, "smooth");

      waitUntilSnappedTo(targetLoopIndex, token, NAV_SNAP_TIMEOUT_MS, () => {
        if (transitionTokenRef.current !== token) {
          return;
        }

        if (needsResetAfterScroll) {
          const resetTop = getLoopTop(resetLoopIndex);
          hardSetFeedScrollTop(resetTop);
          setActiveLoopIndex(resetLoopIndex);
          activeLoopIndexRef.current = resetLoopIndex;

          // 클론 → 진짜 슬라이드로 순간이동해도 같은 thumb 위치를 유지
          const frozen = frozenThumbObjectPositionRef.current.get(targetLoopIndex);
          if (frozen) {
            frozenThumbObjectPositionRef.current.set(resetLoopIndex, frozen);
          }
        }

        navigationLockedRef.current = false;
        setIsTransitioning(false);
        isTransitioningRef.current = false;
        window.requestAnimationFrame(() => {
          updateViewportHeightRef.current?.();
        });
      });
    },
    [
      hasLoop,
      items.length,
      scrollToLoopIndex,
      startLoopIndex,
      hardSetFeedScrollTop,
      waitUntilSnappedTo,
      freezeThumbObjectPosition,
      getLoopTop,
    ],
  );

  const getArticleHref = useCallback(
    (item: PhotoSlideItem) => {
      const mobileUrl = normalizeNateUrl(item.mobileUrl);
      const pcUrl = normalizeNateUrl(item.pcUrl);

      if (isMobileDevice) {
        return mobileUrl || pcUrl;
      }

      return pcUrl || mobileUrl;
    },
    [isMobileDevice],
  );

  const handleArticleClick = useCallback((item: PhotoSlideItem, realIndex: number) => {
    const isCurrentSlide = activeIndexRef.current === realIndex;
    const elapsedMs = isCurrentSlide ? slideElapsedRef.current : 0;

    storeArticleReturnState({
      slideId: getSlideId(item),
      realIndex,
      elapsedMs,
      savedAt: Date.now(),
    });
  }, []);

  const clearGestureTimeout = useCallback(() => {
    if (gestureTimeoutRef.current !== null) {
      window.clearTimeout(gestureTimeoutRef.current);
      gestureTimeoutRef.current = null;
    }
  }, []);

  const clearPendingTouchNavigation = useCallback(() => {
    if (pendingTouchNavigationTimeoutRef.current !== null) {
      window.clearTimeout(pendingTouchNavigationTimeoutRef.current);
      pendingTouchNavigationTimeoutRef.current = null;
    }
  }, []);

  const markGestureActive = useCallback(
    (resumeDelayMs?: number) => {
      freezeThumbObjectPosition();
      setIsGestureActive(true);
      isGestureActiveRef.current = true;
      clearGestureTimeout();

      if (typeof resumeDelayMs === "number" && resumeDelayMs > 0) {
        gestureTimeoutRef.current = window.setTimeout(() => {
          setIsGestureActive(false);
          isGestureActiveRef.current = false;
          updateViewportHeightRef.current?.();
          gestureTimeoutRef.current = null;
        }, resumeDelayMs);
      }
    },
    [clearGestureTimeout, freezeThumbObjectPosition],
  );

  const updateActiveIndex = useCallback((options?: { allowNonSnapped?: boolean }) => {
    const feedElement = feedRef.current;

    if (
      !feedElement ||
      navigationLockedRef.current
    ) {
      return;
    }

    const slideHeight =
      feedElement.clientHeight ||
      itemRefs.current[startLoopIndex]?.getBoundingClientRect().height ||
      feedElement.clientHeight ||
      1;

    const rawIndex = Math.round(feedElement.scrollTop / slideHeight);
    const closestLoopIndex = Math.max(
      0,
      Math.min(loopCount - 1, rawIndex),
    );

    const expectedTop =
      itemRefs.current[closestLoopIndex]?.offsetTop ?? closestLoopIndex * slideHeight;
    const isSnapped = Math.abs(feedElement.scrollTop - expectedTop) < 8;
    const allowNonSnapped = options?.allowNonSnapped ?? false;

    // 스크롤/드래그 중에는 다음 카드를 미리 active로 취급하지 않는다.
    // (다음 카드 썸네일 애니메이션이 선행 재생/리셋되는 현상 방지)
    if (!isSnapped && !allowNonSnapped) {
      return;
    }

    // 스크롤 종료 후 동기화는 "클론 슬라이드"를 실수로 active로 잡기 쉬워서(특히 하단),
    // 스냅이 붙은 경우에만 클론을 인정한다.
    if (
      allowNonSnapped &&
      !isSnapped &&
      hasLoop &&
      (closestLoopIndex === 0 || closestLoopIndex === loopCount - 1)
    ) {
      return;
    }

    if (hasLoop) {
      const isTopClone = closestLoopIndex === 0;
      const isBottomClone = closestLoopIndex === loopCount - 1;

      if (isSnapped && (isTopClone || isBottomClone)) {
        const total = items.length;
        const resetLoopIndex = isTopClone ? total : 1;
        const resetRealIndex = isTopClone ? total - 1 : 0;
        const resetTop =
          itemRefs.current[resetLoopIndex]?.offsetTop ?? resetLoopIndex * slideHeight;

        hardSetFeedScrollTop(resetTop);
        setActiveLoopIndex(resetLoopIndex);
        setActiveIndex(resetRealIndex);
        activeLoopIndexRef.current = resetLoopIndex;
        activeIndexRef.current = resetRealIndex;
        return;
      }
    }

    const closestRealIndex = (() => {
      if (!hasLoop) {
        return closestLoopIndex;
      }
      if (closestLoopIndex === 0) {
        return items.length - 1;
      }
      if (closestLoopIndex === loopCount - 1) {
        return 0;
      }
      return closestLoopIndex - 1;
    })();

    setActiveLoopIndex((current) =>
      current === closestLoopIndex ? current : closestLoopIndex,
    );
    setActiveIndex((current) =>
      current === closestRealIndex ? current : closestRealIndex,
    );
  }, [hasLoop, items.length, loopCount, startLoopIndex, hardSetFeedScrollTop]);

  const scheduleScrollSettledSync = useCallback(
    (delayMs = SCROLL_SETTLE_SYNC_DELAY_MS) => {
      if (scrollEndTimeoutRef.current !== null) {
        window.clearTimeout(scrollEndTimeoutRef.current);
      }

      scrollEndTimeoutRef.current = window.setTimeout(() => {
        scrollEndTimeoutRef.current = null;
        updateActiveIndex({ allowNonSnapped: true });
      }, delayMs);
    },
    [updateActiveIndex],
  );

  useEffect(() => {
    scrollRafRef.current = window.requestAnimationFrame(() => {
      scrollRafRef.current = null;
      updateActiveIndex();
    });

    const handleResize = () => updateActiveIndex();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);

      if (scrollRafRef.current !== null) {
        window.cancelAnimationFrame(scrollRafRef.current);
      }
    };
  }, [updateActiveIndex]);

  useLayoutEffect(() => {
    if (items.length === 0) {
      return;
    }

    if (itemRefs.current.length > loopCount) {
      itemRefs.current.length = loopCount;
    }

    const feed = feedRef.current;
    if (!feed) {
      return;
    }

    const restoredArticleState = restoredArticleStateRef.current;
    const restoredRealIndex =
      restoredArticleState !== null
        ? items.findIndex((item) => getSlideId(item) === restoredArticleState.slideId)
        : -1;
    const initialRealIndex =
      restoredRealIndex >= 0
        ? restoredRealIndex
        : restoredArticleState !== null
          ? Math.min(Math.max(restoredArticleState.realIndex, 0), items.length - 1)
          : getRandomStartIndex(items.length);
    const initialLoopIndex = hasLoop ? initialRealIndex + 1 : initialRealIndex;
    const initialElapsedMs =
      restoredArticleState !== null
        ? Math.max(0, Math.min(restoredArticleState.elapsedMs, SLIDE_DURATION_MS))
        : 0;
    const initialProgress = initialElapsedMs / SLIDE_DURATION_MS;
    const previousRealIndex = activeIndexRef.current;

    activeIndexRef.current = initialRealIndex;
    activeLoopIndexRef.current = initialLoopIndex;
    if (restoredArticleState !== null && previousRealIndex !== initialRealIndex) {
      skipNextActiveIndexProgressResetRef.current = true;
      restoredArticleStateRef.current = null;
      clearStoredArticleReturnState();
    }
    if (restoredArticleState !== null && previousRealIndex === initialRealIndex) {
      restoredArticleStateRef.current = null;
      clearStoredArticleReturnState();
    }
    setActiveIndex(initialRealIndex);
    setActiveLoopIndex(initialLoopIndex);
    setProgress(initialProgress);
    slideElapsedRef.current = initialElapsedMs;
    lastTickRef.current = null;

    requestAnimationFrame(() => {
      const initialTop =
        itemRefs.current[initialLoopIndex]?.offsetTop ??
        initialLoopIndex *
          (itemRefs.current[startLoopIndex]?.getBoundingClientRect().height ||
            feed.clientHeight ||
            1);
      feed.scrollTop = initialTop;
      requestAnimationFrame(() => {
        updateActiveIndex();
      });
    });
  }, [hasLoop, items, loopCount, startLoopIndex, updateActiveIndex]);

  // 전환/제스처 중에는 object-position을 frozen 값으로 고정하고,
  // 슬라이드가 멈춘 뒤에만 progress 애니메이션을 재개한다.

  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

  useEffect(() => {
    activeLoopIndexRef.current = activeLoopIndex;
  }, [activeLoopIndex]);

  useEffect(() => {
    if (skipNextActiveIndexProgressResetRef.current) {
      skipNextActiveIndexProgressResetRef.current = false;
      return;
    }

    slideElapsedRef.current = 0;
    lastTickRef.current = null;
    setProgress(0);
  }, [activeIndex]);

  useEffect(() => {
    if (!isGestureActive && !isTransitioning) {
      // idle 상태로 돌아오면 freeze 캐시는 현재 활성 슬라이드만 남기고 정리
      const keep = activeLoopIndexRef.current;
      const current = frozenThumbObjectPositionRef.current.get(keep);
      frozenThumbObjectPositionRef.current.clear();
      if (current) {
        frozenThumbObjectPositionRef.current.set(keep, current);
      }
    }
  }, [isGestureActive, isTransitioning]);

  useEffect(() => {
    return () => {
      clearGestureTimeout();

      if (scrollEndTimeoutRef.current !== null) {
        window.clearTimeout(scrollEndTimeoutRef.current);
      }

      clearPendingTouchNavigation();

      if (slideScrollRafRef.current !== null) {
        cancelAnimationFrame(slideScrollRafRef.current);
        slideScrollRafRef.current = null;
      }
    };
  }, [clearGestureTimeout, clearPendingTouchNavigation]);

  useEffect(() => {
    if (items.length === 0 || loading) {
      setProgress(0);
      slideElapsedRef.current = 0;
      lastTickRef.current = null;
      return;
    }

    const shouldPauseSlideProgress =
      isTransitioning || !isPageActive || showSwipeGuide;

    // progress가 멈춘 상태면 RAF도 멈추고(렌더/CPU 절약),
    // progress가 움직이는 동안에만 썸네일 애니메이션을 함께 재생한다.
    if (shouldPauseSlideProgress) {
      lastTickRef.current = null;
      return;
    }

    let cancelled = false;
    const tick = (now: number) => {
      if (cancelled) {
        return;
      }

      if (lastTickRef.current === null) {
        lastTickRef.current = now;
      } else {
        slideElapsedRef.current += now - lastTickRef.current;
      }

      lastTickRef.current = now;

      const next = Math.min(slideElapsedRef.current / SLIDE_DURATION_MS, 1);
      setProgress(next);

      if (next >= 1) {
        goToIndex(activeIndexRef.current + 1);
        return;
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      lastTickRef.current = null;

      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [
    goToIndex,
    isTransitioning,
    isPageActive,
    items.length,
    loading,
    activeIndex,
    showSwipeGuide,
  ]);

  const handleScroll = () => {
    if (!suppressScrollGestureRef.current) {
      const startScrollTop = touchStartScrollTopRef.current;
      const currentScrollTop = feedRef.current?.scrollTop ?? null;

      if (
        startScrollTop !== null &&
        currentScrollTop !== null &&
        Math.abs(currentScrollTop - startScrollTop) > TOUCH_NATIVE_SCROLL_DELTA_PX
      ) {
        touchMovedWithScrollRef.current = true;
      }

      scheduleScrollSettledSync();
    }

    if (scrollRafRef.current !== null) {
      return;
    }

    scrollRafRef.current = window.requestAnimationFrame(() => {
      scrollRafRef.current = null;
      updateActiveIndex();
    });
  };

  const handleTouchStart = (event: TouchEvent<HTMLElement>) => {
    if (showSwipeGuide) {
      completeSwipeGuide();
    }

    clearPendingTouchNavigation();
    markGestureActive();
    touchStartYRef.current = event.touches[0]?.clientY ?? null;
    touchStartScrollTopRef.current = feedRef.current?.scrollTop ?? null;
    touchMovedWithScrollRef.current = false;
  };

  const handleTouchMove = () => {
    markGestureActive();
    const startScrollTop = touchStartScrollTopRef.current;
    const currentScrollTop = feedRef.current?.scrollTop ?? null;

    if (
      startScrollTop !== null &&
      currentScrollTop !== null &&
      Math.abs(currentScrollTop - startScrollTop) > TOUCH_NATIVE_SCROLL_DELTA_PX
    ) {
      touchMovedWithScrollRef.current = true;
    }
  };

  const handleTouchEnd = (event: TouchEvent<HTMLElement>) => {
    const startY = touchStartYRef.current;
    const endY = event.changedTouches[0]?.clientY ?? null;
    const startScrollTop = touchStartScrollTopRef.current;
    const currentScrollTop = feedRef.current?.scrollTop ?? null;
    const usedNativeScroll =
      touchMovedWithScrollRef.current ||
      (startScrollTop !== null &&
        currentScrollTop !== null &&
        Math.abs(currentScrollTop - startScrollTop) > TOUCH_NATIVE_SCROLL_DELTA_PX);

    touchStartYRef.current = null;
    touchStartScrollTopRef.current = null;
    touchMovedWithScrollRef.current = false;

    if (startY === null || endY === null) {
      markGestureActive(SWIPE_ANIMATION_RESUME_DELAY_MS);
      return;
    }

    const deltaY = startY - endY;
    if (Math.abs(deltaY) < 50) {
      markGestureActive(SWIPE_ANIMATION_RESUME_DELAY_MS);
      return;
    }

    markGestureActive(SWIPE_ANIMATION_RESUME_DELAY_MS);

    if (usedNativeScroll) {
      // 사용자가 이미 컨테이너를 움직인 플리킹은 브라우저 관성/스냅에 맡긴다.
      // 여기서 smooth scroll을 다시 걸면 일부 모바일에서 두 스크롤이 충돌해 덜컹거린다.
      scheduleScrollSettledSync();
      return;
    }

    const fallbackStartScrollTop = currentScrollTop;
    const direction = deltaY > 0 ? 1 : -1;
    clearPendingTouchNavigation();
    pendingTouchNavigationTimeoutRef.current = window.setTimeout(() => {
      pendingTouchNavigationTimeoutRef.current = null;
      const nextScrollTop = feedRef.current?.scrollTop ?? null;
      const nativeScrollStarted =
        fallbackStartScrollTop !== null &&
        nextScrollTop !== null &&
        Math.abs(nextScrollTop - fallbackStartScrollTop) > TOUCH_NATIVE_SCROLL_DELTA_PX;

      if (nativeScrollStarted) {
        scheduleScrollSettledSync();
        return;
      }

      goToIndex(activeIndexRef.current + direction);
    }, TOUCH_FALLBACK_NAVIGATION_DELAY_MS);
  };

  const handleTouchCancel = () => {
    clearPendingTouchNavigation();
    touchStartYRef.current = null;
    touchStartScrollTopRef.current = null;
    touchMovedWithScrollRef.current = false;
    markGestureActive(SWIPE_ANIMATION_RESUME_DELAY_MS);
  };

  const handleWheel = useCallback((event: React.WheelEvent) => {
    if (showSwipeGuide) {
      completeSwipeGuide();
    }

    event.preventDefault();
    markGestureActive(SWIPE_ANIMATION_RESUME_DELAY_MS);

    const { deltaY } = event;

    if (Math.abs(deltaY) < 30) {
      return;
    }

    if (deltaY > 0) {
      goToIndex(activeIndexRef.current + 1);
    } else {
      goToIndex(activeIndexRef.current - 1);
    }
  }, [completeSwipeGuide, goToIndex, markGestureActive, showSwipeGuide]);

  if (loading) {
    return <NewsFeedLoadingSkeleton />;
  }

  if (apiError) {
    return (
      <main className={styles.empty}>
        뉴스 API를 불러오지 못했습니다.
        <br />
        {apiError}
      </main>
    );
  }

  if (items.length === 0) {
    return <main className={styles.empty}>표시할 뉴스 카드가 없습니다.</main>;
  }

  const isPortraitThumb = (item: PhotoSlideItem) => portraitThumbRef.current.get(getSlideId(item)) === true;
  const isThumbMotionPaused = isGestureActive || isTransitioning;

  const getThumbObjectPosition = (
    item: PhotoSlideItem,
    realIndex: number,
    isActiveSlide: boolean,
    loopIndex: number,
  ) => {
    const getStartPosition = () => {
      return getThumbObjectPositionAtProgress(
        item,
        realIndex,
        0,
        isPortraitThumb(item),
      );
    };

    if (!isActiveSlide || isThumbMotionPaused) {
      const frozen = frozenThumbObjectPositionRef.current.get(loopIndex);
      if (frozen) {
        return frozen;
      }

      // 캐시가 비어있을 때는 항상 "애니메이션 시작 위치"를 기본으로 둬서
      // (특히 1<->20 래핑에서) 스와이프 중 보이는 위치와 시작 위치가 어긋나지 않게 한다.
      const start = getStartPosition();
      frozenThumbObjectPositionRef.current.set(loopIndex, start);
      return start;
    }

    // 최신 위치를 캐시해두면 다음 제스처/전환 중 같은 자리에서 멈출 수 있다.
    const next = getThumbObjectPositionAtProgress(
      item,
      realIndex,
      getThumbMotionProgress(progress),
      isPortraitThumb(item),
    );
    frozenThumbObjectPositionRef.current.set(loopIndex, next);
    return next;
  };

  const shouldEagerLoadImage = (realIndex: number) => {
    if (items.length <= 1) {
      return true;
    }

    const total = items.length;
    const prev = (activeIndex - 1 + total) % total;
    const next = (activeIndex + 1) % total;

    return realIndex === activeIndex || realIndex === prev || realIndex === next;
  };

  const slides = (() => {
    if (!hasLoop) {
      return items.map((item, loopIndex) => ({
        key: getSlideId(item),
        item,
        realIndex: loopIndex,
        loopIndex,
      }));
    }

    const total = items.length;
    const lastItem = items[total - 1];
    const firstItem = items[0];

    return [
      {
        key: `clone:tail:${getSlideId(lastItem)}`,
        item: lastItem,
        realIndex: total - 1,
        loopIndex: 0,
      },
      ...items.map((item, realIndex) => ({
        key: `${getSlideId(item)}:${realIndex}`,
        item,
        realIndex,
        loopIndex: realIndex + 1,
      })),
      {
        key: `clone:head:${getSlideId(firstItem)}`,
        item: firstItem,
        realIndex: 0,
        loopIndex: total + 1,
      },
    ];
  })();

  return (
    <main
      ref={feedRef}
      className={styles.feed}
      onScroll={handleScroll}
      onPointerDown={() => {
        if (showSwipeGuide) {
          completeSwipeGuide();
        }
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
      onWheel={handleWheel}
    >
      {showSwipeGuide ? <SwipeGuideOverlay onComplete={completeSwipeGuide} /> : null}

      <div className={styles.bottomOverlay} aria-hidden="true">
        <div className={styles.progressTrack}>
          <div
            className={styles.progressBar}
            style={{
              transform: `scaleX(${progress})`,
            }}
          />
        </div>
      </div>

      {slides.map(({ key, item, realIndex, loopIndex }) => {
        const isActiveSlide = loopIndex === activeLoopIndex;
        return (
          <section
            key={key}
            ref={(element) => {
              itemRefs.current[loopIndex] = element;
            }}
            className={styles.snapItem}
          >
            <article className={styles.card}>
              <div className={styles.thumbWrap}>
                <img
                  className={styles.thumb}
                  style={{
                    objectPosition: getThumbObjectPosition(item, realIndex, isActiveSlide, loopIndex),
                  }}
                  src={normalizeImageUrl(item.imageUrl)}
                  referrerPolicy="no-referrer"
                  alt={cleanText(item.title)}
                  loading={shouldEagerLoadImage(realIndex) ? "eager" : "lazy"}
                  decoding="async"
                  onLoad={(event) => {
                    const img = event.currentTarget;
                    const naturalW = img.naturalWidth || 0;
                    const naturalH = img.naturalHeight || 0;
                    if (naturalW <= 0 || naturalH <= 0) {
                      return;
                    }

                    // 세로로 긴 이미지 감지(너무 낮으면 대부분 portrait로 잡혀서 threshold를 둔다)
                    const isPortrait = naturalH / naturalW >= 1.35;
                    const slideId = getSlideId(item);
                    const previous = portraitThumbRef.current.get(slideId);
                    if (previous === isPortrait) {
                      return;
                    }

                    portraitThumbRef.current.set(slideId, isPortrait);
                    frozenThumbObjectPositionRef.current.clear();
                    bumpThumbMetaVersion((version) => version + 1);
                  }}
                />
              </div>

            <div className={styles.overlay}>

              <div className={styles.metaBottom}>
                <div className={styles.sourceRow}>
                  {item.cpName ? (
                    <p className={styles.publisher}>{cleanText(item.cpName)}</p>
                  ) : (
                    <div className={`${styles.skeleton} ${styles.skeletonPublisher}`}></div>
                  )}

                  {typeof item.emoticonCnt === "number" ? (
                    <div className={styles.recommendBadge}>
                      <span className={styles.recommendIcon} aria-hidden="true">
                        😶
                      </span>
                      <span className={styles.recommendCount}>
                        {item.emoticonCnt.toLocaleString("ko-KR")}
                      </span>
                    </div>
                  ) : (
                    <div className={`${styles.skeleton} ${styles.skeletonRecommendBadge}`}></div>
                  )}
                </div>
                <h1 className={styles.title}>{cleanText(item.title)}</h1>
                <a
                  href={getArticleHref(item)}
                  className={styles.cta}
                  target="_self"
                  rel="noopener noreferrer"
                  onClick={() => handleArticleClick(item, realIndex)}
                >
                  기사 보러 가기
                </a>
              </div>
            </div>
            </article>
          </section>
        );
      })}
    </main>
  );
}
