"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { VideoItem } from "@/data/videos";
import styles from "./ShortVideoCard.module.css";

const PREVIEW_DURATION = 15;

type ShortVideoCardProps = {
  video: VideoItem;
  isActive: boolean;
  isSoundOn: boolean;
  orderLabel: string;
  onPreviewEnd: () => void;
  onToggleSound: (nextValue: boolean) => void;
};

export function ShortVideoCard({
  video,
  isActive,
  isSoundOn,
  orderLabel,
  onPreviewEnd,
  onToggleSound,
}: ShortVideoCardProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hasAdvancedRef = useRef(false);
  const autoplayRetryTimeoutsRef = useRef<number[]>([]);
  const manuallyPausedRef = useRef(false);
  const wasActiveRef = useRef(false);
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const displayProgress = isActive ? progress : 0;

  const playActiveVideo = useCallback(async (resetTime: boolean) => {
    const element = videoRef.current;

    if (!element || !isActive) {
      return;
    }

    if (manuallyPausedRef.current) {
      return;
    }

    try {
      element.muted = true;
      element.defaultMuted = true;

      if (resetTime) {
        element.pause();
        if (element.currentTime > 0) {
          element.currentTime = 0;
        }
      }

      await element.play();

      if (isSoundOn) {
        element.muted = false;
      }
    } catch {
      // Ignore autoplay rejections and retry on media readiness events.
    }
  }, [isActive, isSoundOn]);

  useEffect(() => {
    return () => {
      autoplayRetryTimeoutsRef.current.forEach((timeoutId) => {
        window.clearTimeout(timeoutId);
      });
      autoplayRetryTimeoutsRef.current = [];
    };
  }, []);

  useEffect(() => {
    const element = videoRef.current;

    if (!element) {
      return;
    }

    autoplayRetryTimeoutsRef.current.forEach((timeoutId) => {
      window.clearTimeout(timeoutId);
    });
    autoplayRetryTimeoutsRef.current = [];

    if (!isActive) {
      element.pause();
      element.currentTime = 0;
      element.muted = true;
      element.defaultMuted = true;
      hasAdvancedRef.current = false;
      manuallyPausedRef.current = false;
      wasActiveRef.current = false;
      return;
    }

    const isNewActivation = !wasActiveRef.current;
    wasActiveRef.current = true;
    hasAdvancedRef.current = false;
    manuallyPausedRef.current = false;
    void playActiveVideo(isNewActivation);

    autoplayRetryTimeoutsRef.current = [200, 600, 1200].map((delay) =>
      window.setTimeout(() => {
        void playActiveVideo(false);
      }, delay),
    );

    return () => {
      autoplayRetryTimeoutsRef.current.forEach((timeoutId) => {
        window.clearTimeout(timeoutId);
      });
      autoplayRetryTimeoutsRef.current = [];
    };
  }, [isActive, playActiveVideo]);

  useEffect(() => {
    const element = videoRef.current;

    if (!element || !isActive) {
      return;
    }

    if (!isSoundOn) {
      element.muted = true;
      return;
    }

    if (manuallyPausedRef.current) {
      element.muted = false;
      return;
    }

    element.muted = false;
    void element.play().catch(() => {
      element.muted = true;
    });
  }, [isActive, isSoundOn]);

  const handleTogglePlayback = async () => {
    const element = videoRef.current;

    if (!element || !isActive) {
      return;
    }

    if (element.paused) {
      manuallyPausedRef.current = false;
      element.muted = !isSoundOn;
      await element.play().catch(() => undefined);
      return;
    }

    manuallyPausedRef.current = true;
    element.pause();
  };

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
    <article className={styles.card} onClick={() => void handleTogglePlayback()}>
      <video
        ref={videoRef}
        className={styles.video}
        src={video.src}
        autoPlay
        muted
        playsInline
        preload="auto"
        onLoadedMetadata={() => void playActiveVideo(!wasActiveRef.current)}
        onCanPlay={() => void playActiveVideo(!wasActiveRef.current)}
        onPlay={(event) => {
          const nextProgress = Math.min(
            event.currentTarget.currentTime / PREVIEW_DURATION,
            1,
          );

          setProgress(nextProgress);
          setIsPaused(false);
        }}
        onPause={() => {
          setIsPaused(manuallyPausedRef.current);
        }}
        onTimeUpdate={handleTimeUpdate}
      />

      <div className={styles.overlay}>
        {isActive && isPaused && (
          <div className={styles.playbackIndicator}>
            <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.playbackIcon}>
              <path d="M8 6.5v11l9-5.5-9-5.5Z" fill="currentColor" />
            </svg>
          </div>
        )}

        <div className={styles.progressTrack}>
          <div
            className={styles.progressBar}
            style={{ transform: `scaleX(${displayProgress})` }}
          />
        </div>

        <div className={styles.metaTop}>
          <button
            type="button"
            className={styles.soundButton}
            aria-label={isSoundOn ? "음소거" : "소리 켜기"}
            onClick={(event) => {
              event.stopPropagation();
              const element = videoRef.current;
              const nextSoundOn = !isSoundOn;

              if (element) {
                element.muted = !nextSoundOn;

                if (!manuallyPausedRef.current) {
                  void element.play().catch(() => undefined);
                }
              }

              onToggleSound(nextSoundOn);
            }}
          >
            {isSoundOn ? (
              <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.soundIcon}>
                <path
                  d="M5 9v6h4l5 4V5L9 9H5Z"
                  fill="currentColor"
                />
                <path
                  d="M17.5 8.5a5 5 0 0 1 0 7"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
                <path
                  d="M19.8 6a8.3 8.3 0 0 1 0 12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.soundIcon}>
                <path
                  d="M5 9v6h4l5 4V5L9 9H5Z"
                  fill="currentColor"
                />
                <path
                  d="m17 9 5 5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
                <path
                  d="m22 9-5 5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            )}
          </button>
          <span className={styles.pill}>{orderLabel}</span>
        </div>

        <div className={styles.metaBottom}>
          <div>
            <p className={styles.channel}>@{video.channel}</p>
            <h1 className={styles.title}>{video.title}</h1>
            <p className={styles.description}>{video.description}</p>
          </div>

          <div className={styles.actions}>
            <a
              href={`https://m.tv.nate.com/clip/${video.id}`}
              className={styles.ctaLink}
              target='_blank'
              rel='noopener noreferrer'
              onClick={(event) => event.stopPropagation()}
            >
              이 영상 보러가기
            </a>
          </div>
        </div>
      </div>
    </article>
  );
}
