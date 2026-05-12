import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type TouchEvent,
} from "react";
import styles from "./NewsFeed.module.css";

const SLIDE_DURATION_MS = 5_000;
const SWIPE_ANIMATION_RESUME_DELAY_MS = 180;

const THUMB_MOTION_VARIANTS = ["panLeft", "panRight"] as const;
type ThumbMotionVariant = (typeof THUMB_MOTION_VARIANTS)[number];

const THUMB_OBJECT_POS_DELTA = 10; // crop 없이도 '움직임' 느낌

type NewsItem = {
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
};

type NewsFeedProps = {
  items?: NewsItem[];
};

type NewsFeedResponse = {
  items?: NewsItem[];
};

function hashText(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash;
}

function getThumbMotionVariant(item: NewsItem, index: number): ThumbMotionVariant {
  const seed = hashText(`${item.id}:${index}`);

  return THUMB_MOTION_VARIANTS[seed % THUMB_MOTION_VARIANTS.length];
}

function getItemsFromResponse(value: unknown): NewsItem[] {
  if (Array.isArray(value)) {
    return value as NewsItem[];
  }

  if (
    value &&
    typeof value === "object" &&
    Array.isArray((value as NewsFeedResponse).items)
  ) {
    return (value as NewsFeedResponse).items ?? [];
  }

  return [];
}

const commentIconSrc = `${import.meta.env.BASE_URL}images/ico-reple.png`;

export function NewsFeed({ items: initialItems }: NewsFeedProps) {
  const [items, setItems] = useState<NewsItem[]>(() => initialItems ?? []);
  const [loading, setLoading] = useState(!(initialItems && initialItems.length > 0));
  const [apiError, setApiError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [activeLoopIndex, setActiveLoopIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isGestureActive, setIsGestureActive] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isMobileDevice, setIsMobileDevice] = useState(false);
  const [isPageActive, setIsPageActive] = useState(true);
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
  const slideElapsedRef = useRef<number>(0);
  const lastTickRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const scrollRafRef = useRef<number | null>(null);
  const gestureTimeoutRef = useRef<number | null>(null);
  const scrollEndTimeoutRef = useRef<number | null>(null);
  const activeIndexRef = useRef(0);
  const activeLoopIndexRef = useRef(0);
  const navigationLockedRef = useRef(false);
  const suppressScrollGestureRef = useRef(false);
  const transitionTokenRef = useRef(0);
  const frozenThumbObjectPositionRef = useRef(new Map<number, string>());
  const portraitThumbRef = useRef(new Map<string, boolean>());

  /**
   * - dev: Vite 프록시 → 로컬 Express
   * - prod: 같은 origin의 /api/news 또는 base 아래 /api/news 중 동작하는 쪽을 자동 선택
   * - 정적 호스트만 쓸 때: `VITE_NEWS_API_URL`(절대 URL)로 외부 API 지정 가능
   */
  const newsApiCandidates = useMemo(() => {
    if (import.meta.env.DEV) {
      return ["/api/news"];
    }

    const external = import.meta.env.VITE_NEWS_API_URL?.trim();
    const serviceApi = "/service/api/news";
    const baseApi = import.meta.env.BASE_URL.endsWith("/")
      ? `${import.meta.env.BASE_URL}api/news`
      : `${import.meta.env.BASE_URL}/api/news`;

    const candidates = [serviceApi, baseApi, "/api/news"];
    if (external) {
      candidates.unshift(external);
    }

    // 중복 제거
    return Array.from(new Set(candidates));
  }, []);

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
    setIsMobileDevice(window.matchMedia("(max-width: 768px)").matches);
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
    const nextItems = initialItems ?? [];
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
        let lastError: unknown = null;

        for (const url of newsApiCandidates) {
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

            const data = getItemsFromResponse(await response.json());
            setItems(data);
            return;
          } catch (error) {
            lastError = error;
          }
        }

        throw lastError ?? new Error("news request failed");
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
            ? `${message}\n\n(정적 배포에서는 /api/news가 없어서 HTML이 내려올 수 있습니다. 빌드 시 VITE_NEWS_API_URL에 외부 뉴스 API 전체 URL을 지정해 주세요.)`
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

      suppressScrollGestureRef.current = true;
      feed.scrollTo({ top: getLoopTop(loopIndex), behavior });

      window.requestAnimationFrame(() => {
        suppressScrollGestureRef.current = false;
      });
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
    const clamped = Math.max(0, Math.min(1, progress));
    const variant = getThumbMotionVariant(activeItem, realIndex);
    const posX =
      variant === "panLeft"
        ? 50 + THUMB_OBJECT_POS_DELTA - THUMB_OBJECT_POS_DELTA * 2 * clamped
        : 50 - THUMB_OBJECT_POS_DELTA + THUMB_OBJECT_POS_DELTA * 2 * clamped;

    frozenThumbObjectPositionRef.current.set(loopIndex, `${posX.toFixed(2)}% 50%`);
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

      waitUntilSnappedTo(targetLoopIndex, token, 900, () => {
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
    (item: NewsItem) => {
      if (isMobileDevice) {
        return item.mobileLink ?? item.link;
      }

      return item.pcLink ?? item.link;
    },
    [isMobileDevice],
  );

  const clearGestureTimeout = useCallback(() => {
    if (gestureTimeoutRef.current !== null) {
      window.clearTimeout(gestureTimeoutRef.current);
      gestureTimeoutRef.current = null;
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

    const initialRealIndex = 0;
    const initialLoopIndex = startLoopIndex;
    activeIndexRef.current = initialRealIndex;
    activeLoopIndexRef.current = initialLoopIndex;
    setActiveIndex(initialRealIndex);
    setActiveLoopIndex(initialLoopIndex);
    setProgress(0);
    slideElapsedRef.current = 0;
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
  }, [items, loopCount, startLoopIndex, updateActiveIndex]);

  // 팬 애니메이션은 "활성 슬라이드일 때만" 클래스가 붙도록 해서
  // 매번 0프레임부터 시작하게 만든다(중간 위치 재개 방지).

  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

  useEffect(() => {
    activeLoopIndexRef.current = activeLoopIndex;
  }, [activeLoopIndex]);

  useEffect(() => {
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
    };
  }, [clearGestureTimeout]);

  useEffect(() => {
    if (items.length === 0 || loading) {
      setProgress(0);
      slideElapsedRef.current = 0;
      lastTickRef.current = null;
      return;
    }

    const shouldPauseSlideProgress =
      isGestureActive || isTransitioning || !isPageActive;

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
    isGestureActive,
    isTransitioning,
    isPageActive,
    items.length,
    loading,
    activeIndex,
  ]);

  const handleScroll = () => {
    if (!suppressScrollGestureRef.current) {
      markGestureActive(SWIPE_ANIMATION_RESUME_DELAY_MS);

      if (scrollEndTimeoutRef.current !== null) {
        window.clearTimeout(scrollEndTimeoutRef.current);
      }
      scrollEndTimeoutRef.current = window.setTimeout(() => {
        scrollEndTimeoutRef.current = null;
        updateActiveIndex({ allowNonSnapped: true });
      }, SWIPE_ANIMATION_RESUME_DELAY_MS + 40);
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
    markGestureActive();
    touchStartYRef.current = event.touches[0]?.clientY ?? null;
  };

  const handleTouchMove = () => {
    markGestureActive();
  };

  const handleTouchEnd = (event: TouchEvent<HTMLElement>) => {
    const startY = touchStartYRef.current;
    const endY = event.changedTouches[0]?.clientY ?? null;
    touchStartYRef.current = null;

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

    if (deltaY > 0) {
      goToIndex(activeIndexRef.current + 1);
      return;
    }

    goToIndex(activeIndexRef.current - 1);
  };

  const handleTouchCancel = () => {
    touchStartYRef.current = null;
    markGestureActive(SWIPE_ANIMATION_RESUME_DELAY_MS);
  };

  const handleWheel = useCallback((event: React.WheelEvent) => {
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
  }, [goToIndex, markGestureActive]);

  if (loading) {
    return <main className={styles.empty}>뉴스를 불러오는 중...</main>;
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

  const activeSlideItem = items[activeIndex];
  const currentNewsPosition = activeSlideItem != null ? activeIndex + 1 : 0;
  const totalNewsCount = items.length;
  const showRankCount =
    Boolean(activeSlideItem) && currentNewsPosition > 0;

  const isPortraitThumb = (item: NewsItem) => portraitThumbRef.current.get(item.id) === true;

  const getThumbObjectPosition = (
    item: NewsItem,
    realIndex: number,
    isActiveSlide: boolean,
    loopIndex: number,
  ) => {
    const getStartPosition = () => {
      if (isPortraitThumb(item)) {
        return "50.00% 0.00%";
      }

      const variant = getThumbMotionVariant(item, realIndex);
      const posX = variant === "panLeft" ? 50 + THUMB_OBJECT_POS_DELTA : 50 - THUMB_OBJECT_POS_DELTA;
      return `${posX.toFixed(2)}% 50%`;
    };

    if (!isActiveSlide) {
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

    const clamped = Math.max(0, Math.min(1, progress));

    if (isPortraitThumb(item)) {
      const posY = 100 * clamped;
      const next = `50.00% ${posY.toFixed(2)}%`;
      frozenThumbObjectPositionRef.current.set(loopIndex, next);
      return next;
    }

    const variant = getThumbMotionVariant(item, realIndex);
    const posX =
      variant === "panLeft"
        ? 50 + THUMB_OBJECT_POS_DELTA - THUMB_OBJECT_POS_DELTA * 2 * clamped
        : 50 - THUMB_OBJECT_POS_DELTA + THUMB_OBJECT_POS_DELTA * 2 * clamped;

    // progress가 멈춘 상태(페이지 비활성/제스처/전환)에서도 같은 object-position을 유지하면 “정지”처럼 보인다.
    const next = `${posX.toFixed(2)}% 50%`;
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
        key: item.id,
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
        key: `clone:tail:${lastItem.id}`,
        item: lastItem,
        realIndex: total - 1,
        loopIndex: 0,
      },
      ...items.map((item, realIndex) => ({
        key: item.id,
        item,
        realIndex,
        loopIndex: realIndex + 1,
      })),
      {
        key: `clone:head:${firstItem.id}`,
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
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
      onWheel={handleWheel}
    >
      <div className={styles.topOverlay}>
        <div className={styles.brandRow}>
          <p className={styles.brand}>News Story</p>
        </div>
        {showRankCount ? (
          <span className={styles.brandCount}>
            {currentNewsPosition} / {totalNewsCount}
          </span>
        ) : null}
      </div>

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
                  src={item.imageUrl}
                  alt={item.title}
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
                    const previous = portraitThumbRef.current.get(item.id);
                    if (previous === isPortrait) {
                      return;
                    }

                    portraitThumbRef.current.set(item.id, isPortrait);
                    frozenThumbObjectPositionRef.current.clear();
                    bumpThumbMetaVersion((version) => version + 1);
                  }}
                />
              </div>

            <div className={styles.overlay}>

              <div className={styles.metaBottom}>
                <div className={styles.sourceRow}>
                  {item.sourceName ? (
                    <p className={styles.publisher}>{item.sourceName}</p>
                  ) : (
                    <div className={`${styles.skeleton} ${styles.skeletonPublisher}`}></div>
                  )}

                  {item.recommendationCount !== null ? (
                    <div className={styles.recommendBadge}>
                      <span className={styles.recommendIcon} aria-hidden="true">
                        🙂
                      </span>
                      <span className={styles.recommendCount}>
                        {item.recommendationCount.toLocaleString("ko-KR")}
                      </span>
                    </div>
                  ) : (
                    <div className={`${styles.skeleton} ${styles.skeletonRecommendBadge}`}></div>
                  )}
                </div>
                <h1 className={styles.title}>{item.title}</h1>

                {item.topComment ? (
                  <div className={styles.commentInline}>
                    <img
                      src={commentIconSrc}
                      alt=""
                      aria-hidden="true"
                      width={16}
                      height={16}
                      className={styles.commentIcon}
                    />
                    <p className={styles.commentText}>{item.topComment}</p>
                  </div>
                ) : (
                  <div className={styles.commentInline}>
                    <img
                      src={commentIconSrc}
                      alt=""
                      aria-hidden="true"
                      width={16}
                      height={16}
                      className={styles.commentIcon}
                    />
                    <p className={styles.commentText}>
                      댓글이 없어요. 더 많은 이야기를 나눠볼까요?
                    </p>
                  </div>
                )}
                <a
                  href={getArticleHref(item)}
                  className={styles.cta}
                  target="_blank"
                  rel="noopener noreferrer"
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
