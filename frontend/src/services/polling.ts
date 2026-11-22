/**
 * Background polling that only runs while the tab is visible.
 *
 * Every poll re-fetches whole tables from the API (and therefore from
 * Supabase), so polling a hidden or minimised tab burns database egress for
 * nothing. This helper:
 *  - skips ticks while `document.hidden` is true,
 *  - never starts a new tick while the previous one is still in flight,
 *  - optionally refreshes once when the tab becomes visible again.
 *
 * Returns a function that stops the polling.
 */
export const POLL_INTERVAL_MS = 30_000;

interface PollingOptions {
  /** Run `task` once as soon as the tab becomes visible again. */
  refreshOnVisible?: boolean;
}

export function startVisiblePolling(
  task: () => Promise<unknown> | void,
  intervalMs: number = POLL_INTERVAL_MS,
  { refreshOnVisible = false }: PollingOptions = {},
): () => void {
  let running = false;

  const tick = async () => {
    if (running || document.hidden) return;
    running = true;
    try {
      await task();
    } catch {
      /* callers handle their own errors; never let polling die */
    } finally {
      running = false;
    }
  };

  const timer = window.setInterval(() => void tick(), intervalMs);
  const onVisibility = () => {
    if (!document.hidden) void tick();
  };
  if (refreshOnVisible) document.addEventListener('visibilitychange', onVisibility);

  return () => {
    window.clearInterval(timer);
    if (refreshOnVisible) document.removeEventListener('visibilitychange', onVisibility);
  };
}
