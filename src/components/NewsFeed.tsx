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
  const navigationLockedRef = useRef(false);
  const suppressScrollGestureRef = useRef(false);

  /** dev에서는 항상 /api/news → Vite proxy가 잡음 (base가 /shortnews/여도 동일) */
  const newsApiUrl = import.meta.env.DEV
    ? "/api/news"
    : import.meta.env.BASE_URL.endsWith("/")
      ? `${import.meta.env.BASE_URL}api/news`
      : `${import.meta.env.BASE_URL}/api/news`;

  const normalizeIndex = useCallback(
    (index: number) => {
      if (items.length === 0) {
        return 0;
      }

      return ((index % items.length) + items.length) % items.length;
    },
    [items.length],
  );

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

    setItems(nextItems);
    setLoading(!(initialItems && initialItems.length > 0));
    setActiveIndex(0);
    setProgress(0);

    activeIndexRef.current = 0;
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

      const nextIndex = normalizeIndex(index);
      const current = activeIndexRef.current;

      if (nextIndex === current) {
        return;
      }

      navigationLockedRef.current = true;
      setIsTransitioning(true);
      setActiveIndex(nextIndex);
      activeIndexRef.current = nextIndex;
      scrollItemIntoView(itemRefs.current[nextIndex], "smooth");

      if (transitionTimeoutRef.current !== null) {
        window.clearTimeout(transitionTimeoutRef.current);
      }
      transitionTimeoutRef.current = window.setTimeout(() => {
        navigationLockedRef.current = false;
        setIsTransitioning(false);
        transitionTimeoutRef.current = null;
      }, 300);
    },
    [items, normalizeIndex, scrollItemIntoView],
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
      itemRefs.current[0]?.getBoundingClientRect().height ||
      feedElement.clientHeight ||
      1;

    const rawIndex = Math.round(feedElement.scrollTop / slideHeight);
    const closestIndex = Math.max(
      0,
      Math.min(items.length - 1, rawIndex),
    );

    setActiveIndex((currentIndex) =>
      currentIndex === closestIndex ? currentIndex : closestIndex,
    );
  }, [items]);

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

    if (itemRefs.current.length > items.length) {
      itemRefs.current.length = items.length;
    }
    if (thumbImgRefs.current.length > items.length) {
      thumbImgRefs.current.length = items.length;
    }

    const feed = feedRef.current;
    if (!feed) {
      return;
    }

    feed.scrollTop = 0;
    const initialIndex = 0;
    activeIndexRef.current = initialIndex;
    setActiveIndex(initialIndex);
    setProgress(0);
    slideElapsedRef.current = 0;
    lastTickRef.current = null;

    requestAnimationFrame(() => {
      feed.scrollTop = 0;
      requestAnimationFrame(() => {
        updateActiveIndex();
      });
    });
  }, [items, updateActiveIndex]);

  useLayoutEffect(() => {
    if (loading || items.length === 0) {
      return;
    }

    const img = thumbImgRefs.current[activeIndex];
    if (!img) {
      return;
    }

    img.style.animation = "none";
    void img.offsetWidth;
    img.style.animation = "";
  }, [activeIndex, items, loading]);

  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

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
  const currentNewsPosition =
    activeSlideItem != null
      ? items.findIndex((item) => item.id === activeSlideItem.id) + 1
      : 0;
  const totalNewsCount = items.length;
  const showRankCount =
    Boolean(activeSlideItem) && currentNewsPosition > 0;

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

      {items.map((item, index) => (
        <section
          key={item.id}
          ref={(element) => {
            itemRefs.current[index] = element;
          }}
          className={styles.snapItem}
        >
          <article className={styles.card}>
            <div className={styles.thumbWrap}>
              <img
                ref={(element) => {
                  thumbImgRefs.current[index] = element;
                }}
                className={`${styles.thumb} ${styles[getThumbMotionVariant(item, index)]}`}
                style={{
                  animationPlayState: isPageActive ? "running" : "paused",
                }}
                src={item.imageUrl}
                alt={item.title}
                loading={index === 0 ? "eager" : "lazy"}
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
                      transform: `scaleX(${index === activeIndex ? progress : 0})`,
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
