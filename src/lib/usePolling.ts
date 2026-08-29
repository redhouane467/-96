import { useEffect, useRef } from "react";

// Calls `fn` immediately, then every `intervalMs` while `enabled` is true.
// Pauses automatically when the tab is hidden, and always cleans up its
// timer on unmount or when `enabled`/`intervalMs` change — this keeps
// "near-live" order/location updates without hammering the API.
export function usePolling(fn: () => void, intervalMs: number, enabled: boolean) {
  const savedFn = useRef(fn);
  savedFn.current = fn;

  useEffect(() => {
    if (!enabled) return;
    savedFn.current();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") savedFn.current();
    }, intervalMs);
    return () => clearInterval(id);
  }, [enabled, intervalMs]);
}
