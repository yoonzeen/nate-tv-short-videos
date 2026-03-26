"use client";

import { useEffect, useRef, useState } from "react";
import type { VideoItem } from "@/data/videos";
import styles from "./ShortVideoCard.module.css";

const PREVIEW_DURATION = 15;

type ShortVideoCardProps = {
  video: VideoItem;
  isActive: boolean;
  orderLabel: string;
  onPreviewEnd: () => void;
};

export function ShortVideoCard({
  video,
  isActive,
  orderLabel,
  onPreviewEnd,
}: ShortVideoCardProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hasAdvancedRef = useRef(false);
  const [progress, setProgress] = useState(0);
  const displayProgress = isActive ? progress : 0;

  useEffect(() => {
    const element = videoRef.current;

    if (!element) {
      return;
    }

    if (!isActive) {
      element.pause();
      element.currentTime = 0;
      hasAdvancedRef.current = false;
      return;
    }

    element.currentTime = 0;
    hasAdvancedRef.current = false;

    const attemptPlay = async () => {
      try {
        await element.play();
      } catch {
        // Ignore autoplay rejections and keep the card usable.
      }
    };

    void attemptPlay();
  }, [isActive]);

  const handleTimeUpdate = () => {
    const element = videoRef.current;

    if (!element || !isActive) {
      return;
    }

    const nextProgress = Math.min(element.currentTime / PREVIEW_DURATION, 1);
    setProgress(nextProgress);

    if (element.currentTime < PREVIEW_DURATION || hasAdvancedRef.current) {
      return;
    }

    hasAdvancedRef.current = true;
    element.pause();
    onPreviewEnd();
  };

  return (
    <article className={styles.card}>
      <video
        ref={videoRef}
        className={styles.video}
        src={video.src}
        muted
        playsInline
        preload="metadata"
        onPlay={() => setProgress(0)}
        onTimeUpdate={handleTimeUpdate}
      />

      <div className={styles.overlay}>
        <div className={styles.progressTrack}>
          <div
            className={styles.progressBar}
            style={{ transform: `scaleX(${displayProgress})` }}
          />
        </div>

        <div className={styles.metaTop}>
          <span className={styles.pill}>{orderLabel}</span>
          <span className={styles.pill}>15s Preview</span>
        </div>

        <div className={styles.metaBottom}>
          <div>
            <p className={styles.channel}>@{video.channel}</p>
            <h1 className={styles.title}>{video.title}</h1>
            <p className={styles.description}>{video.description}</p>
          </div>

          <button
            type="button"
            className={styles.cta}
            onClick={() => {
              const element = videoRef.current;

              if (!element) {
                return;
              }

              element.currentTime = 0;
              hasAdvancedRef.current = false;
              setProgress(0);
              void element.play().catch(() => undefined);
            }}
          >
            다시 보기
          </button>
        </div>
      </div>
    </article>
  );
}
