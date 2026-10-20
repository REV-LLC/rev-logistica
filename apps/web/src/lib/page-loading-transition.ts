export const PAGE_LOADING_ENTER_MS = 220;
export const PAGE_LOADING_REVEAL_MS = 320;
export const PAGE_LOADING_MIN_VISIBLE_MS = 1000;

/** Keep the loader visible for a full second, without delaying data fetching. */
export function loadingRevealDelay(elapsed: number) {
  return Math.max(0, PAGE_LOADING_MIN_VISIBLE_MS - Math.max(0, elapsed));
}
