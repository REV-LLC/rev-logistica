export const PAGE_LOADING_ENTER_MS = 220;
export const PAGE_LOADING_REVEAL_MS = 320;

/** Finish entering the glass before reversing it, even for a cached destination. */
export function loadingRevealDelay(elapsed: number) {
  return Math.max(0, PAGE_LOADING_ENTER_MS - Math.max(0, elapsed));
}
