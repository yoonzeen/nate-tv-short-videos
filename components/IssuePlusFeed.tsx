"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type TouchEvent,
} from "react";
import type { IssueSlide } from "@/data/issuePlusSlides";
import styles from "./IssuePlusFeed.module.css";

const SLIDE_DURATION_MS = 10_000;

type IssuePlusFeedProps = {
  slides: IssueSlide[];
};

export function IssuePlusFeed({ slides }: IssuePlusFeedProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const feedRef = useRef<HTMLElement | null>(null);
  const itemRefs = useRef<Array<HTMLElement | null>>([]);
  const touchStartYRef = useRef<number | null>(null);
  const slideStartRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);
  const scrollRafRef = useRef<number | null>(null);

  const normalizeIndex = useCallback(
    (index: number) => {
      if (slides.length === 0) {
        return 0;
      }
      return (index + slides.length) % slides.length;
    },
    [slides.length],
  );

  const goToIndex = useCallback(
    (index: number) => {
      const safe = normalizeIndex(index);
      setActiveIndex(safe);
      itemRefs.current[safe]?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    },
    [normalizeIndex],
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
    if (slides.length === 0) {
      return;
    }

    const initialFrame = window.requestAnimationFrame(() => {
      goToIndex(0);
    });

    return () => {
      window.cancelAnimationFrame(initialFrame);
    };
  }, [goToIndex, slides.length]);

  useEffect(() => {
    if (slides.length === 0) {
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
  }, [activeIndex, goToIndex, slides.length]);

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

  if (slides.length === 0) {
    return (
      <main className={styles.empty}>
        표시할 이슈+ 썸네일이 없습니다. 광고·클러스터 블록은 건너뜁니다.
      </main>
    );
  }

  return (
    <main
      ref={feedRef}
      className={styles.feed}
      onScroll={handleScroll}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div className={styles.topOverlay}>
        <p className={styles.brand}>Nate 이슈+</p>
        <p className={styles.guide}>
          썸네일 {SLIDE_DURATION_MS / 1000}초 후 아래에서 위로 자동 전환됩니다.
        </p>
      </div>

      {slides.map((slide, index) => (
        <section
          key={slide.id}
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
                  index === activeIndex
                    ? { animationDuration: `${SLIDE_DURATION_MS}ms` }
                    : undefined
                }
                src={slide.imageUrl}
                alt=""
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

              <div className={styles.metaTop}>
                <span className={styles.pill}>
                  {index + 1} / {slides.length}
                </span>
              </div>

              <div className={styles.metaBottom}>
                <div className={styles.sourceRow}>
                  <span>{slide.sourceName}</span>
                  {slide.sourceTime ? (
                    <>
                      <span className={styles.dot}>·</span>
                      <span>{slide.sourceTime}</span>
                    </>
                  ) : null}
                </div>
                <h1 className={styles.title}>{slide.title}</h1>
                <a
                  href={slide.href}
                  className={styles.cta}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  기사 보러가기
                </a>
              </div>
            </div>
          </article>
        </section>
      ))}
    </main>
  );
}
