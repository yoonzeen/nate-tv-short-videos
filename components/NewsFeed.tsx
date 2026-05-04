"use client";

import Image from "next/image";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type TouchEvent,
} from "react";
import styles from "./IssuePlusFeed.module.css";

const SLIDE_DURATION_MS = 5_000;
const SWIPE_ANIMATION_RESUME_DELAY_MS = 180;
const THUMB_MOTION_DURATION_MS = 12_000;

const THUMB_MOTION_VARIANTS = [
  "panLeft",
  "panRight",
  "panUp",
  "panDown",
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
  isAd?: boolean;
};

type NewsFeedProps = {
  items?: NewsItem[];
  leadArticleId?: string;
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

function getThumbMotionDelay(item: NewsItem, index: number) {
  const seed = hashText(`delay:${item.id}:${index}`);
  const offsetMs = seed % THUMB_MOTION_DURATION_MS;

  return `${-offsetMs}ms`;
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

export function NewsFeed({
  items: initialItems,
  leadArticleId,
}: NewsFeedProps) {
  const [items, setItems] = useState<NewsItem[]>(() => initialItems ?? []);
  const [loading, setLoading] = useState(!(initialItems && initialItems.length > 0));
  const [activeIndex, setActiveIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isGestureActive, setIsGestureActive] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isMobileDevice, setIsMobileDevice] = useState(false);
  const [isPageActive, setIsPageActive] = useState(true);
  const feedRef = useRef<HTMLElement | null>(null);
  const itemRefs = useRef<Array<HTMLElement | null>>([]);
  const touchStartYRef = useRef<number | null>(null);
  const slideElapsedRef = useRef<number>(0);
  const lastTickRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const scrollRafRef = useRef<number | null>(null);
  const toastTimeoutRef = useRef<number | null>(null);
  const transitionTimeoutRef = useRef<number | null>(null);
  const gestureTimeoutRef = useRef<number | null>(null);
  const activeIndexRef = useRef(0);
  const navigationLockedRef = useRef(false);
  const hasMovedFromInitialItemRef = useRef(false);
  const suppressScrollGestureRef = useRef(false);

  const newsApiUrl = leadArticleId ? `/api/news?id=${leadArticleId}` : "/api/news";

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
    const updatePageActiveState = () => {
      setIsPageActive(document.visibilityState === "visible" && document.hasFocus());
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
    const nextItems = initialItems ?? [];

    setItems(nextItems);
    setLoading(!(initialItems && initialItems.length > 0));
    setActiveIndex(0);
    setProgress(0);

    activeIndexRef.current = 0;
    itemRefs.current = [];
    slideElapsedRef.current = 0;
    lastTickRef.current = null;
    navigationLockedRef.current = false;
    hasMovedFromInitialItemRef.current = false;

    if (scrollRafRef.current !== null) {
      window.cancelAnimationFrame(scrollRafRef.current);
      scrollRafRef.current = null;
    }

    if (feedRef.current) {
      feedRef.current.scrollTop = 0;
    }
  }, [initialItems, leadArticleId]);

  // SSR로 목록이 없을 때만 클라이언트에서 요청
  useEffect(() => {
    if (initialItems && initialItems.length > 0) {
      return;
    }
    if (!loading || items.length > 0) {
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
        setLoading(false);
      }
    };

    void loadData();

    return () => {
      controller.abort();
    };
  }, [initialItems, loading, items.length, newsApiUrl]);

  const updateUrlWithId = useCallback((id: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set("id", id);
    window.history.replaceState(null, document.title, url);
  }, []);

  const syncUrlForItem = useCallback(
    (item: NewsItem | undefined) => {
      if (!item || item.isAd) {
        return;
      }

      updateUrlWithId(item.id);
    },
    [updateUrlWithId],
  );

  const hasActiveUrlSync = useCallback(() => {
    if (!leadArticleId) {
      return true;
    }

    return hasMovedFromInitialItemRef.current;
  }, [leadArticleId]);

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
      hasMovedFromInitialItemRef.current = true;
      setIsTransitioning(true);
      setActiveIndex(nextIndex);
      activeIndexRef.current = nextIndex;
      scrollItemIntoView(itemRefs.current[nextIndex], "smooth");

      if (transitionTimeoutRef.current !== null) {
        window.clearTimeout(transitionTimeoutRef.current);
      }
      transitionTimeoutRef.current = window.setTimeout(() => {
        const nextItem = items[nextIndex];

        if (hasActiveUrlSync()) {
          syncUrlForItem(nextItem);
        }

        navigationLockedRef.current = false;
        setIsTransitioning(false);
        transitionTimeoutRef.current = null;
      }, 300);
    },
    [hasActiveUrlSync, items, normalizeIndex, scrollItemIntoView, syncUrlForItem],
  );

  const getShareUrl = useCallback((id: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set("id", id);

    return url.toString();
  }, []);

  const showToast = useCallback((message: string) => {
    setToastMessage(message);

    if (toastTimeoutRef.current !== null) {
      window.clearTimeout(toastTimeoutRef.current);
    }

    toastTimeoutRef.current = window.setTimeout(() => {
      setToastMessage(null);
      toastTimeoutRef.current = null;
    }, 2000);
  }, []);

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

  const handleShare = useCallback(
    async (id: string) => {
      const shareUrl = getShareUrl(id);

      try {
        await navigator.clipboard.writeText(shareUrl);
      } catch {
        const textarea = document.createElement("textarea");
        textarea.value = shareUrl;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "absolute";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }

      updateUrlWithId(id);
      showToast("URL을 복사했어요.");
    },
    [getShareUrl, showToast, updateUrlWithId],
  );

  const updateActiveIndex = useCallback(() => {
    const feedElement = feedRef.current;

    if (
      !feedElement ||
      navigationLockedRef.current ||
      !hasActiveUrlSync()
    ) {
      return;
    }

    const feedCenter = feedElement.scrollTop + feedElement.clientHeight / 2;
    let closestIndex = 0;
    let closestDistance = Number.POSITIVE_INFINITY;

    itemRefs.current.forEach((item, index) => {
      if (!item) {
        return;
      }

      const itemCenter = item.offsetTop + item.clientHeight / 2;
      const distance = Math.abs(itemCenter - feedCenter);

      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    });

    const nextItem = items[closestIndex];

    setActiveIndex((currentIndex) =>
      currentIndex === closestIndex ? currentIndex : closestIndex,
    );
    if (hasActiveUrlSync()) {
      syncUrlForItem(nextItem);
    }
  }, [hasActiveUrlSync, items, syncUrlForItem]);

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

  useEffect(() => {
    if (items.length === 0) {
      return;
    }

    const initialIndex = 0;
    activeIndexRef.current = initialIndex;
    setActiveIndex(initialIndex);
    if (!leadArticleId) {
      syncUrlForItem(items[initialIndex]);
    }
    scrollItemIntoView(itemRefs.current[initialIndex], "auto");
  }, [items, leadArticleId, scrollItemIntoView, syncUrlForItem]);

  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

  useEffect(() => {
    slideElapsedRef.current = 0;
    lastTickRef.current = null;
    setProgress(0);
  }, [activeIndex]);

  useEffect(() => {
    if (loading) {
      return;
    }

    const activeItem = items[activeIndex];

    if (!activeItem || activeItem.isAd) {
      return;
    }

    if (!hasActiveUrlSync()) {
      return;
    }

    updateUrlWithId(activeItem.id);
  }, [activeIndex, hasActiveUrlSync, items, loading, updateUrlWithId]);

  useEffect(() => {
    return () => {
      clearGestureTimeout();

      if (toastTimeoutRef.current !== null) {
        window.clearTimeout(toastTimeoutRef.current);
      }

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

    // 휠 감도 조정 (임계값)
    if (Math.abs(deltaY) < 30) {
      return;
    }

    if (deltaY > 0) {
      // 아래로 스크롤 - 다음 뉴스
      goToIndex(activeIndexRef.current + 1);
    } else {
      // 위로 스크롤 - 이전 뉴스
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
  const newsItems = items.filter((item) => !item.isAd);
  const currentNewsPosition = activeSlideItem?.isAd
    ? 0
    : newsItems.findIndex((item) => item.id === activeSlideItem?.id) + 1;
  const totalNewsCount = newsItems.length;
  const showRankCount =
    Boolean(activeSlideItem) &&
    !activeSlideItem.isAd &&
    currentNewsPosition > 0;

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
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className={`${styles.thumb} ${styles[getThumbMotionVariant(item, index)]}`}
                style={{
                  animationDelay: getThumbMotionDelay(item, index),
                  animationPlayState: isPageActive ? "running" : "paused",
                }}
                src={item.imageUrl}
                alt={item.title}
                loading={index === 0 ? "eager" : "lazy"}
                decoding="async"
              />
            </div>

            <div className={styles.overlay}>
              {!item.isAd && (
                <div className={styles.metaTop}>
                  <div className={styles.metaActions}>
                    <button
                      type="button"
                      className={styles.shareButton}
                      onClick={() => handleShare(item.id)}
                    >
                      <Image
                        src="/images/btn-link.png"
                        alt=""
                        aria-hidden="true"
                        width={16}
                        height={16}
                        className={styles.shareIcon}
                      />
                      <span className={styles.srOnly}>공유하기</span>
                    </button>
                  </div>
                </div>
              )}

              <div className={styles.metaBottom}>
                {item.isAd ? (
                  // 광고 아이템 렌더링
                  <>
                    <div className={styles.adBadge}>
                      <span>광고</span>
                    </div>
                    <h1 className={styles.title}>{item.title}</h1>
                    <p className={styles.adDescription}>
                      이곳에 광고가 표시됩니다
                    </p>
                  </>
                ) : (
                  // 일반 뉴스 아이템 렌더링
                  <>
                    <div className={styles.sourceRow}>
                      {/* 언론사 - 스켈레톤 또는 실제 데이터 */}
                      {item.sourceName ? (
                        <p className={styles.publisher}>{item.sourceName}</p>
                      ) : (
                        <div className={`${styles.skeleton} ${styles.skeletonPublisher}`}></div>
                      )}
                      
                      {/* 추천수 - 스켈레톤 또는 실제 데이터 */}
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
                    
                    {/* 댓글 - 스켈레톤, 실제 데이터, 또는 빈 상태 */}
                    {item.topComment ? (
                      <div className={styles.commentInline}>
                        <Image
                          src="/images/ico-reple.png"
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
                        <Image
                          src="/images/ico-reple.png"
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
                  </>
                )}
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
      {toastMessage ? <div className={styles.toast}>{toastMessage}</div> : null}
    </main>
  );
}
