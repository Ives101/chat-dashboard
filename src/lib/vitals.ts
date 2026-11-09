import type { Metric } from "web-vitals";

const VITALS_ENDPOINT = "/api/vitals";

export function reportWebVitals(metric: Metric) {
  const body = JSON.stringify({
    name: metric.name,
    value: metric.value,
    rating: metric.rating,
    delta: metric.delta,
    id: metric.id,
    navigationType: metric.navigationType,
    url: window.location.href,
    timestamp: Date.now(),
  });

  // Use sendBeacon for reliability (works even on page unload)
  if (navigator.sendBeacon) {
    navigator.sendBeacon(VITALS_ENDPOINT, new Blob([body], { type: "application/json" }));
  } else {
    fetch(VITALS_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  }
}

export function initWebVitals() {
  if (typeof window === "undefined") return;

  // Dynamically import web-vitals to avoid SSR issues
  import("web-vitals").then(({ onCLS, onFCP, onINP, onLCP, onTTFB }) => {
    onCLS(reportWebVitals);
    onFCP(reportWebVitals);
    onINP(reportWebVitals);
    onLCP(reportWebVitals);
    onTTFB(reportWebVitals);
  }).catch(() => {});
}