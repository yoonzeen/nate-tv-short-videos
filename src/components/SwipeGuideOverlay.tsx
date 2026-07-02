import { useEffect } from "react";
import styles from "./SwipeGuideOverlay.module.css";

/** 스와이프 가이드 레이어를 표시하는 시간(ms). 이후 자동으로 닫힘 */
const GUIDE_VISIBLE_MS = 3_500;

type SwipeGuideOverlayProps = {
  onComplete: () => void;
};

export function SwipeGuideOverlay({ onComplete }: SwipeGuideOverlayProps) {
  useEffect(() => {
    const timer = window.setTimeout(onComplete, GUIDE_VISIBLE_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [onComplete]);

  return (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label="뉴스 탐색 안내"
    >
      <div className={styles.content}>
        <div className={styles.arrowIcon} aria-hidden="true" />
        <p className={styles.text}>
          <span className={styles.highlight}>위로 살짝 밀어서</span>
          {"\n"}
          다양한 뉴스를 확인해보세요
        </p>
      </div>
    </div>
  );
}
