/** One request at a time, only while visible. Stopping also rejects late responses. */
export function startAnnexLiveRefresh<T>(options: {
  window: EventTarget;
  document: EventTarget & { visibilityState: string };
  load: (signal: AbortSignal) => Promise<T>;
  apply: (data: T) => void;
  onError: (error: unknown) => void;
  intervalMs?: number;
}) {
  let stopped = false;
  let pending: AbortController | null = null;
  let debounce: ReturnType<typeof setTimeout> | undefined;
  const refresh = async () => {
    if (stopped || pending || options.document.visibilityState !== "visible")
      return;
    const controller = new AbortController();
    pending = controller;
    try {
      const data = await options.load(controller.signal);
      if (!stopped && !controller.signal.aborted) options.apply(data);
    } catch (error) {
      if (!stopped && !controller.signal.aborted) options.onError(error);
    } finally {
      if (pending === controller) pending = null;
    }
  };
  const schedule = () => {
    clearTimeout(debounce);
    debounce = setTimeout(refresh, 150);
  };
  options.window.addEventListener("focus", schedule);
  options.document.addEventListener("visibilitychange", schedule);
  const interval = setInterval(refresh, options.intervalMs ?? 60_000);
  return () => {
    stopped = true;
    pending?.abort();
    clearTimeout(debounce);
    clearInterval(interval);
    options.window.removeEventListener("focus", schedule);
    options.document.removeEventListener("visibilitychange", schedule);
  };
}
