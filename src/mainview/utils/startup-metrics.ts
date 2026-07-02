const START_MARK = performance.now();

export function startupMark(label: string) {
  console.info(`[startup] ${label} at ${(performance.now() - START_MARK).toFixed(1)}ms`);
}

export function installLongTaskObserver(durationMs = 50, windowMs = 10000) {
  if (typeof PerformanceObserver === 'undefined') return;
  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.duration >= durationMs) {
          console.warn(
            `[startup] long task ${entry.duration.toFixed(0)}ms (start ${entry.startTime.toFixed(0)}ms)`,
          );
        }
      }
    });
    observer.observe({ type: 'longtask', buffered: true } as PerformanceObserverInit);
    window.setTimeout(() => observer.disconnect(), windowMs);
  } catch {
    // longtask not supported in this WebView
  }
}
