const SWIPE_GUIDE_STORAGE_KEY = "natetv-shorts:swipe-guide-seen";

export function hasSeenSwipeGuide() {
  if (typeof window === "undefined") {
    return true;
  }

  try {
    return window.localStorage.getItem(SWIPE_GUIDE_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function markSwipeGuideSeen() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(SWIPE_GUIDE_STORAGE_KEY, "1");
  } catch {
    // localStorage를 사용할 수 없는 환경에서는 다음 방문에 다시 노출될 수 있다.
  }
}
