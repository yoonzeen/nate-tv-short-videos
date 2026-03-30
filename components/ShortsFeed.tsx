"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { VideoItem } from "@/data/videos";
import { ShortVideoCard } from "@/components/ShortVideoCard";
import styles from "./ShortsFeed.module.css";

type ShortsFeedProps = {
  videos: VideoItem[];
};

export function ShortsFeed({ videos }: ShortsFeedProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isSoundOn, setIsSoundOn] = useState(false);
  const feedRef = useRef<HTMLElement | null>(null);
  const itemRefs = useRef<Array<HTMLElement | null>>([]);
  const animationFrameRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);

  const normalizeIndex = useCallback(
    (index: number) => {
      if (videos.length === 0) {
        return 0;
      }

      return (index + videos.length) % videos.length;
    },
    [videos.length],
  );

  const goToIndex = useCallback(
    (index: number) => {
      const safeIndex = normalizeIndex(index);
      setActiveIndex(safeIndex);
      itemRefs.current[safeIndex]?.scrollIntoView({
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
    animationFrameRef.current = window.requestAnimationFrame(() => {
      animationFrameRef.current = null;
      updateActiveIndex();
    });

    const handleResize = () => updateActiveIndex();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);

      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [updateActiveIndex]);

  useEffect(() => {
    if (videos.length === 0) {
      return;
    }

    const initialFrame = window.requestAnimationFrame(() => {
      goToIndex(0);
    });

    return () => {
      window.cancelAnimationFrame(initialFrame);
    };
  }, [goToIndex, videos.length]);

  const handleScroll = () => {
    if (animationFrameRef.current !== null) {
      return;
    }

    animationFrameRef.current = window.requestAnimationFrame(() => {
      animationFrameRef.current = null;
      updateActiveIndex();
    });
  };

  const handleTouchStart = (event: React.TouchEvent<HTMLElement>) => {
    touchStartYRef.current = event.touches[0]?.clientY ?? null;
  };

  const handleTouchEnd = (event: React.TouchEvent<HTMLElement>) => {
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

  return (
    <main
      ref={feedRef}
      className={styles.feed}
      onScroll={handleScroll}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div className={styles.topOverlay}>
        <p className={styles.brand}>NateTV Shorts</p>
        <p className={styles.guide}>각 영상은 처음 15초만 자동 재생됩니다.</p>
      </div>

      {videos.map((video, index) => (
        <section
          key={video.id}
          ref={(element) => {
            itemRefs.current[index] = element;
          }}
          data-index={index}
          className={styles.snapItem}
        >
          <ShortVideoCard
            video={video}
            isActive={index === activeIndex}
            isSoundOn={isSoundOn}
            orderLabel={`${index + 1} / ${videos.length}`}
            onPreviewEnd={() => goToIndex(index + 1)}
            onToggleSound={setIsSoundOn}
          />
        </section>
      ))}
    </main>
  );
}
