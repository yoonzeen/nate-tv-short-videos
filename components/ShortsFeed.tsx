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
  const itemRefs = useRef<Array<HTMLElement | null>>([]);

  const scrollToIndex = useCallback(
    (index: number) => {
      const safeIndex = index >= videos.length ? 0 : index;
      itemRefs.current[safeIndex]?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    },
    [videos.length],
  );

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visibleEntry = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

        if (!visibleEntry) {
          return;
        }

        const nextIndex = Number(visibleEntry.target.getAttribute("data-index"));

        if (!Number.isNaN(nextIndex)) {
          setActiveIndex(nextIndex);
        }
      },
      {
        threshold: [0.55, 0.75],
      },
    );

    itemRefs.current.forEach((item) => {
      if (item) {
        observer.observe(item);
      }
    });

    return () => observer.disconnect();
  }, [videos.length]);

  return (
    <main className={styles.feed}>
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
            orderLabel={`${index + 1} / ${videos.length}`}
            onPreviewEnd={() => scrollToIndex(index + 1)}
          />
        </section>
      ))}
    </main>
  );
}
