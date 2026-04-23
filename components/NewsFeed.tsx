"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type TouchEvent,
} from "react";
import styles from "./IssuePlusFeed.module.css";

const SLIDE_DURATION_MS = 15_000;

type NewsItem = {
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

type NewsFeedProps = {
  items?: NewsItem[];
};

export function NewsFeed({ items: initialItems }: NewsFeedProps) {
  const [items, setItems] = useState<NewsItem[]>(initialItems || []);
  const [loading, setLoading] = useState(!initialItems || initialItems.length === 0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const feedRef = useRef<HTMLElement | null>(null);
  const itemRefs = useRef<Array<HTMLElement | null>>([]);
  const touchStartYRef = useRef<number | null>(null);
  const slideStartRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);
  const scrollRafRef = useRef<number | null>(null);
  const toastTimeoutRef = useRef<number | null>(null);
  const hasRestoredInitialItemRef = useRef(false);

  // 데이터 로딩
  useEffect(() => {
    if (items.length === 0 && loading) {
      const loadData = async () => {
        try {
          // 빠른 버전과 전체 버전을 동시에 시작
          const quickPromise = fetch('/api/news?quick=true', { cache: 'no-store' });
          const fullPromise = fetch('/api/news', { cache: 'no-store' });
          
          // 먼저 빠른 버전 결과 표시
          const quickResponse = await quickPromise;
          const quickData = await quickResponse.json();
          setItems(quickData);
          setLoading(false);
          
          // 전체 데이터가 로드되면 교체
          try {
            const fullResponse = await fullPromise;
            const fullData = await fullResponse.json();
            setItems(fullData);
          } catch (error) {
            console.error('Failed to load full news data:', error);
          }
        } catch (error) {
          console.error('Failed to load news:', error);
          setLoading(false);
        }
      };
      loadData();
    }
  }, [items.length, loading]);

  const normalizeIndex = useCallback(
    (index: number) => {
      if (items.length === 0) {
        return 0;
      }
      // 첫 번째에서 이전으로 가려고 하면 첫 번째에 머물기
      if (index < 0) {
        return 0;
      }
      // 마지막에서 다음으로 가려고 하면 마지막에 머물기
      if (index >= items.length) {
        return items.length - 1;
      }
      return index;
    },
    [items.length],
  );

  const goToIndex = useCallback(
    (index: number) => {
      const safe = normalizeIndex(index);
      setIsTransitioning(true);
      setActiveIndex(safe);
      itemRefs.current[safe]?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
      
      // 전환 완료 후 상태 리셋
      setTimeout(() => {
        setIsTransitioning(false);
      }, 300); // CSS transition과 동일한 시간
    },
    [normalizeIndex],
  );

  const updateUrlWithId = useCallback((id: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set("id", id);
    window.history.replaceState(null, document.title, url);
  }, []);

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

    if (!feedElement) {
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

    setActiveIndex((currentIndex) =>
      currentIndex === closestIndex ? currentIndex : closestIndex,
    );
  }, []);

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

    const initialFrame = window.requestAnimationFrame(() => {
      const id = new URLSearchParams(window.location.search).get("id");
      const initialIndex = items.findIndex((item) => item.id === id);
      const safeInitialIndex = initialIndex >= 0 ? initialIndex : 0;

      hasRestoredInitialItemRef.current = true;
      setActiveIndex(safeInitialIndex);
      itemRefs.current[safeInitialIndex]?.scrollIntoView({
        behavior: "auto",
        block: "start",
      });
    });

    return () => {
      window.cancelAnimationFrame(initialFrame);
    };
  }, [items]);

  useEffect(() => {
    if (!hasRestoredInitialItemRef.current) {
      return;
    }

    const activeItem = items[activeIndex];

    if (!activeItem) {
      return;
    }

    updateUrlWithId(activeItem.id);
  }, [activeIndex, items, updateUrlWithId]);

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current !== null) {
        window.clearTimeout(toastTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (items.length === 0) {
      return;
    }

    let cancelled = false;

    const startId = requestAnimationFrame(() => {
      if (cancelled) {
        return;
      }

      slideStartRef.current = performance.now();
      setProgress(0);

      const tick = (now: number) => {
        if (cancelled) {
          return;
        }

        const elapsed = now - slideStartRef.current;
        const next = Math.min(elapsed / SLIDE_DURATION_MS, 1);
        setProgress(next);

        if (next >= 1) {
          goToIndex(activeIndex + 1);
          return;
        }

        rafRef.current = requestAnimationFrame(tick);
      };

      rafRef.current = requestAnimationFrame(tick);
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(startId);

      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [activeIndex, goToIndex, items.length]);

  const handleScroll = () => {
    if (scrollRafRef.current !== null) {
      return;
    }

    scrollRafRef.current = window.requestAnimationFrame(() => {
      scrollRafRef.current = null;
      updateActiveIndex();
    });
  };

  const handleTouchStart = (event: TouchEvent<HTMLElement>) => {
    touchStartYRef.current = event.touches[0]?.clientY ?? null;
  };

  const handleTouchEnd = (event: TouchEvent<HTMLElement>) => {
    const startY = touchStartYRef.current;
    const endY = event.changedTouches[0]?.clientY ?? null;
    touchStartYRef.current = null;

    if (startY === null || endY === null) {
      return;
    }

    const deltaY = startY - endY;
    if (Math.abs(deltaY) < 50) {
      return;
    }

    if (deltaY > 0) {
      goToIndex(activeIndex + 1);
      return;
    }

    goToIndex(activeIndex - 1);
  };

  const handleWheel = useCallback((event: React.WheelEvent) => {
    event.preventDefault();
    
    const { deltaY } = event;
    
    // 휠 감도 조정 (임계값)
    if (Math.abs(deltaY) < 30) {
      return;
    }
    
    if (deltaY > 0) {
      // 아래로 스크롤 - 다음 뉴스
      goToIndex(activeIndex + 1);
    } else {
      // 위로 스크롤 - 이전 뉴스
      goToIndex(activeIndex - 1);
    }
  }, [activeIndex, goToIndex]);

  if (loading) {
    return <main className={styles.empty}>뉴스를 불러오는 중...</main>;
  }

  if (items.length === 0) {
    return <main className={styles.empty}>표시할 뉴스 카드가 없습니다.</main>;
  }

  return (
    <main
      ref={feedRef}
      className={styles.feed}
      onScroll={handleScroll}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onWheel={handleWheel}
    >
      <div className={styles.topOverlay}>
        <div className={styles.brandRow}>
          <p className={styles.brand}>NATE News</p>
          {!items[activeIndex]?.isAd && (
            <span className={styles.brandCount}>
              {items.slice(0, activeIndex + 1).filter(item => !item.isAd).length} / {items.filter(item => !item.isAd).length}
            </span>
          )}
        </div>
        {!items[activeIndex]?.isAd && (
          <p className={styles.guide}>
            뉴스 카드가 {SLIDE_DURATION_MS / 1000}초 후 자동으로 다음 카드로
            전환됩니다.
          </p>
        )}
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
                className={
                  index === activeIndex
                    ? `${styles.thumb} ${styles.thumbPan}`
                    : styles.thumb
                }
                style={
                  index === activeIndex && !isTransitioning
                    ? { animationDuration: `${SLIDE_DURATION_MS}ms` }
                    : index === activeIndex && isTransitioning
                    ? { animationPlayState: 'paused' }
                    : undefined
                }
                src={item.img}
                alt={item.title}
                loading={index === 0 ? "eager" : "lazy"}
                decoding="async"
              />
            </div>

            <div className={styles.overlay}>
              <div className={styles.progressTrack}>
                <div
                  className={styles.progressBar}
                  style={{
                    transform: `scaleX(${index === activeIndex ? progress : 0})`,
                  }}
                />
              </div>

              {!item.isAd && (
                <div className={styles.metaTop}>
                  <div className={styles.metaActions}>
                    <button
                      type="button"
                      className={styles.shareButton}
                      onClick={() => handleShare(item.id)}
                    >
                      <span className={styles.shareIcon} aria-hidden="true">
                        🔗
                      </span>
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
                          👍
                        </span>
                        <span className={styles.recommendCount}>
                          {item.recommendationCount.toLocaleString("ko-KR")}
                        </span>
                      </div>
                    ) : (
                      <div className={`${styles.skeleton} ${styles.skeletonRecommendBadge}`}></div>
                    )}
                    
                    <h1 className={styles.title}>{item.title}</h1>
                    
                    {/* 댓글 - 스켈레톤 또는 실제 데이터 */}
                    {item.topComment ? (
                      <div className={styles.commentInline}>
                        <span className={styles.commentIcon} aria-hidden="true">
                          🗨️
                        </span>
                        <p className={styles.commentText}>{item.topComment}</p>
                      </div>
                    ) : (
                      <div className={`${styles.skeleton} ${styles.skeletonComment}`}></div>
                    )}
                    <a
                      href={item.link}
                      className={styles.cta}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      기사 보러 가기
                    </a>
                  </>
                )}
              </div>
            </div>
          </article>
        </section>
      ))}
      {toastMessage ? <div className={styles.toast}>{toastMessage}</div> : null}
    </main>
  );
}
