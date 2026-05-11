import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type TouchEvent,
} from "react";
import styles from "./NewsFeed.module.css";

const SLIDE_DURATION_MS = 5_000;
const SWIPE_ANIMATION_RESUME_DELAY_MS = 180;

const THUMB_MOTION_VARIANTS = [
  "panLeft",
  "panRight",
  "zoomIn",
] as const;

type ThumbMotionVariant = (typeof THUMB_MOTION_VARIANTS)[number];

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
  const [activeIndex, setActiveIndex] = useState(0);
  const [activeLoopIndex, setActiveLoopIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isGestureActive, setIsGestureActive] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isMobileDevice, setIsMobileDevice] = useState(false);
  const [isPageActive, setIsPageActive] = useState(true);
  const feedRef = useRef<HTMLElement | null>(null);
  const itemRefs = useRef<Array<HTMLElement | null>>([]);
  const thumbImgRefs = useRef<Array<HTMLImageElement | null>>([]);
  const touchStartYRef = useRef<number | null>(null);
  const slideElapsedRef = useRef<number>(0);
  const lastTickRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const scrollRafRef = useRef<number | null>(null);
  const transitionTimeoutRef = useRef<number | null>(null);
  const gestureTimeoutRef = useRef<number | null>(null);
  const activeIndexRef = useRef(0);
  const activeLoopIndexRef = useRef(0);
  const navigationLockedRef = useRef(false);
  const suppressScrollGestureRef = useRef(false);

  /**
   * - dev: Vite 프록시 → 로컬 Express
   * - prod: 기본은 같은 origin의 상대 경로(base 아래 /api/news)
   * - GitLab Pages 등 정적 호스트만 쓸 때: 빌드 전 `VITE_NEWS_API_URL`(절대 URL)로 Vercel 등 외부 API 지정
   */
  const newsApiUrl = import.meta.env.DEV
    ? "/api/news"
    : (() => {
        const external = import.meta.env.VITE_NEWS_API_URL?.trim();
        if (external) {
          return external;
        }
        return import.meta.env.BASE_URL.endsWith("/")
          ? `${import.meta.env.BASE_URL}api/news`
          : `${import.meta.env.BASE_URL}/api/news`;
      })();

  const hasLoop = items.length > 1;
  const loopCount = hasLoop ? items.length + 2 : items.length;
  const startLoopIndex = hasLoop ? 1 : 0;

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
        const response = await fetch(newsApiUrl, {
          cache: "no-store",
          signal,
        });

        if (!response.ok) {
          throw new Error(`news ${response.status}`);
        }

        const data = getItemsFromResponse(await response.json());
        setItems(data);
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }

        console.error("Failed to load news:", error);
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
  }, [initialItems, newsApiUrl]);

  const scrollItemIntoView = useCallback(
    (item: HTMLElement | null | undefined, behavior: ScrollBehavior) => {
      if (!item) {
        return;
      }

      suppressScrollGestureRef.current = true;
      item.scrollIntoView({
        behavior,
        block: "start",
      });

      window.requestAnimationFrame(() => {
        suppressScrollGestureRef.current = false;
      });
    },
    [],
  );

  const goToIndex = useCallback(
    (index: number) => {
      if (items.length === 0 || navigationLockedRef.current) {
        return;
      }

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
          targetLoopIndex = 0;
          nextRealIndex = total - 1;
          needsResetAfterScroll = true;
          resetLoopIndex = total; // last real slide in loop
        } else if (index >= total) {
          // 20페이지에서 다음으로: "1(클론)"으로 1칸 이동 후 → 진짜 1로 순간 이동
          targetLoopIndex = total + 1;
          nextRealIndex = 0;
          needsResetAfterScroll = true;
          resetLoopIndex = 1; // first real slide in loop
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
      setActiveIndex(nextRealIndex);
      setActiveLoopIndex(targetLoopIndex);
      activeIndexRef.current = nextRealIndex;
      activeLoopIndexRef.current = targetLoopIndex;
      scrollItemIntoView(itemRefs.current[targetLoopIndex], "smooth");

      if (transitionTimeoutRef.current !== null) {
        window.clearTimeout(transitionTimeoutRef.current);
      }
      transitionTimeoutRef.current = window.setTimeout(() => {
        if (needsResetAfterScroll && feedRef.current) {
          const feed = feedRef.current;
          const resetTop =
            itemRefs.current[resetLoopIndex]?.offsetTop ??
            resetLoopIndex *
              (itemRefs.current[startLoopIndex]?.getBoundingClientRect().height ||
                feed.clientHeight ||
                1);

          suppressScrollGestureRef.current = true;
          feed.scrollTop = resetTop;
          setActiveLoopIndex(resetLoopIndex);
          activeLoopIndexRef.current = resetLoopIndex;
          window.requestAnimationFrame(() => {
            suppressScrollGestureRef.current = false;
          });
        }

        navigationLockedRef.current = false;
        setIsTransitioning(false);
        transitionTimeoutRef.current = null;
      }, 300);
    },
    [hasLoop, items.length, scrollItemIntoView, startLoopIndex],
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
      setIsGestureActive(true);
      clearGestureTimeout();

      if (typeof resumeDelayMs === "number" && resumeDelayMs > 0) {
        gestureTimeoutRef.current = window.setTimeout(() => {
          setIsGestureActive(false);
          gestureTimeoutRef.current = null;
        }, resumeDelayMs);
      }
    },
    [clearGestureTimeout],
  );

  const updateActiveIndex = useCallback(() => {
    const feedElement = feedRef.current;

    if (
      !feedElement ||
      navigationLockedRef.current
    ) {
      return;
    }

    const slideHeight =
      itemRefs.current[startLoopIndex]?.getBoundingClientRect().height ||
      feedElement.clientHeight ||
      1;

    const rawIndex = Math.round(feedElement.scrollTop / slideHeight);
    const closestLoopIndex = Math.max(
      0,
      Math.min(loopCount - 1, rawIndex),
    );

    if (hasLoop) {
      const expectedTop =
        itemRefs.current[closestLoopIndex]?.offsetTop ?? closestLoopIndex * slideHeight;
      const isSnapped = Math.abs(feedElement.scrollTop - expectedTop) < 2;
      const isTopClone = closestLoopIndex === 0;
      const isBottomClone = closestLoopIndex === loopCount - 1;

      if (isSnapped && (isTopClone || isBottomClone)) {
        const total = items.length;
        const resetLoopIndex = isTopClone ? total : 1;
        const resetRealIndex = isTopClone ? total - 1 : 0;
        const resetTop =
          itemRefs.current[resetLoopIndex]?.offsetTop ?? resetLoopIndex * slideHeight;

        suppressScrollGestureRef.current = true;
        feedElement.scrollTop = resetTop;
        setActiveLoopIndex(resetLoopIndex);
        setActiveIndex(resetRealIndex);
        activeLoopIndexRef.current = resetLoopIndex;
        activeIndexRef.current = resetRealIndex;

        window.requestAnimationFrame(() => {
          suppressScrollGestureRef.current = false;
        });
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
  }, [hasLoop, items.length, loopCount, startLoopIndex]);

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
    if (thumbImgRefs.current.length > loopCount) {
      thumbImgRefs.current.length = loopCount;
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

  useLayoutEffect(() => {
    if (loading || items.length === 0) {
      return;
    }

    const img = thumbImgRefs.current[activeLoopIndex];
    if (!img) {
      return;
    }

    img.style.animation = "none";
    void img.offsetWidth;
    img.style.animation = "";
  }, [activeLoopIndex, items, loading]);

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
    return () => {
      clearGestureTimeout();

      if (transitionTimeoutRef.current !== null) {
        window.clearTimeout(transitionTimeoutRef.current);
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
    let cancelled = false;
    const tick = (now: number) => {
      if (cancelled) {
        return;
      }

      if (lastTickRef.current === null) {
        lastTickRef.current = now;
      } else if (!shouldPauseSlideProgress) {
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

  if (items.length === 0) {
    return <main className={styles.empty}>표시할 뉴스 카드가 없습니다.</main>;
  }

  const activeSlideItem = items[activeIndex];
  const currentNewsPosition = activeSlideItem != null ? activeIndex + 1 : 0;
  const totalNewsCount = items.length;
  const showRankCount =
    Boolean(activeSlideItem) && currentNewsPosition > 0;

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

      {slides.map(({ key, item, realIndex, loopIndex }) => (
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
                ref={(element) => {
                  thumbImgRefs.current[loopIndex] = element;
                }}
                className={`${styles.thumb} ${styles[getThumbMotionVariant(item, realIndex)]}`}
                style={{
                  animationPlayState: isPageActive ? "running" : "paused",
                }}
                src={item.imageUrl}
                alt={item.title}
                loading={realIndex === 0 ? "eager" : "lazy"}
                decoding="async"
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
                <div className={styles.progressTrack}>
                  <div
                    className={styles.progressBar}
                    style={{
                      transform: `scaleX(${realIndex === activeIndex ? progress : 0})`,
                    }}
                  />
                </div>
              </div>
            </div>
          </article>
        </section>
      ))}
    </main>
  );
}
