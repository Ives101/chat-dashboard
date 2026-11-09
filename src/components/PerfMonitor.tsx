"use client";
import { useEffect, useState } from "react";
import { initWebVitals } from "@/lib/vitals";

type Summary = { name: string; count: number; avg: number; min: number; max: number; ratings: Record<string, number> };

export default function PerfMonitor() {
  const [summary, setSummary] = useState<Summary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    initWebVitals();
    fetch("/api/vitals")
      .then((r) => r.json())
      .then((d) => setSummary(d.summary ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const ratingColor = (name: string, value: number) => {
    // Thresholds for Core Web Vitals
    const thresholds: Record<string, [number, number]> = {
      LCP: [2500, 4000],
      INP: [200, 500],
      CLS: [0.1, 0.25],
      FCP: [1800, 3000],
      TTFB: [800, 1800],
    };
    const t = thresholds[name];
    if (!t) return "text-gray-400";
    if (value <= t[0]) return "text-green-400";
    if (value <= t[1]) return "text-yellow-400";
    return "text-red-400";
  };

  const formatValue = (name: string, value: number) => {
    if (name === "CLS") return value.toFixed(3);
    return Math.round(value).toLocaleString() + (name === "LCP" || name === "FCP" || name === "TTFB" ? "ms" : name === "INP" ? "ms" : "");
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h2 className="text-xl font-semibold mb-2">Performance Monitor</h2>
      <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>
        Core Web Vitals collected from real page loads. Metrics are reported automatically via the <code>web-vitals</code> library.
      </p>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="skeleton h-16 w-full" />
          ))}
        </div>
      ) : summary.length === 0 ? (
        <div className="text-center py-12" style={{ color: "var(--text-secondary)" }}>
          <div className="text-4xl mb-3">📊</div>
          <p>No metrics collected yet. Navigate around the app to generate data.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {summary.map((s) => (
            <div
              key={s.name}
              className="rounded-xl border p-4"
              style={{ background: "var(--bg-secondary)", borderColor: "var(--border)" }}
            >
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-lg">{s.name}</h3>
                <span className={`text-2xl font-bold ${ratingColor(s.name, s.avg)}`}>
                  {formatValue(s.name, s.avg)}
                </span>
              </div>
              <div className="flex gap-4 text-xs" style={{ color: "var(--text-secondary)" }}>
                <span>Count: {s.count}</span>
                <span>Min: {formatValue(s.name, s.min)}</span>
                <span>Max: {formatValue(s.name, s.max)}</span>
              </div>
              <div className="flex gap-2 mt-2">
                {Object.entries(s.ratings).map(([rating, count]) => (
                  <span
                    key={rating}
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      rating === "good" ? "bg-green-500/20 text-green-400" :
                      rating === "needs-improvement" ? "bg-yellow-500/20 text-yellow-400" :
                      rating === "poor" ? "bg-red-500/20 text-red-400" :
                      "bg-gray-500/20 text-gray-400"
                    }`}
                  >
                    {rating}: {count}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 text-xs" style={{ color: "var(--text-muted)" }}>
        <p><strong>CLS</strong> = Cumulative Layout Shift (target: ≤ 0.1 good, ≤ 0.25 needs improvement)</p>
        <p><strong>INP</strong> = Interaction to Next Paint (target: ≤ 200ms good, ≤ 500ms needs improvement)</p>
        <p><strong>LCP</strong> = Largest Contentful Paint (target: ≤ 2.5s good, ≤ 4s needs improvement)</p>
        <p><strong>FCP</strong> = First Contentful Paint (target: ≤ 1.8s good, ≤ 3s needs improvement)</p>
        <p><strong>TTFB</strong> = Time to First Byte (target: ≤ 800ms good, ≤ 1.8s needs improvement)</p>
      </div>
    </div>
  );
}