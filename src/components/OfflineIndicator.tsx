"use client";
import { useEffect, useState, useCallback } from "react";
import { offlineCache, syncOfflineQueue } from "@/lib/offlineCache";

export default function OfflineIndicator() {
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const updatePendingCount = useCallback(async () => {
    try {
      const queue = await offlineCache.getQueue();
      setPendingCount(queue.length);
    } catch {}
  }, []);

  const handleSync = useCallback(async () => {
    if (!navigator.onLine) return;
    setSyncing(true);
    try {
      const synced = await syncOfflineQueue();
      if (synced > 0) {
        window.dispatchEvent(new CustomEvent("app:synced", { detail: { count: synced } }));
      }
    } finally {
      setSyncing(false);
      updatePendingCount();
    }
  }, [updatePendingCount]);

  useEffect(() => {
    setIsOnline(navigator.onLine);
    updatePendingCount();

    const handleOnline = () => {
      setIsOnline(true);
      handleSync();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    const interval = setInterval(updatePendingCount, 3000);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      clearInterval(interval);
    };
  }, [handleSync, updatePendingCount]);

  if (isOnline && pendingCount === 0 && !syncing) return null;

  return (
    <div
      className="fixed bottom-4 left-4 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-medium shadow-lg transition-all backdrop-blur-sm"
      style={{
        background: isOnline ? "rgba(245, 158, 11, 0.95)" : "rgba(239, 68, 68, 0.95)",
        color: "white",
      }}
    >
      <span className="inline-block w-2 h-2 bg-white rounded-full animate-pulse" />
      {!isOnline ? (
        <>
          Offline
          {pendingCount > 0 && <span className="ml-1 opacity-80">({pendingCount} pending)</span>}
        </>
      ) : syncing ? (
        "Syncing…"
      ) : (
        <>
          {pendingCount} change{pendingCount !== 1 ? "s" : ""} pending
        </>
      )}
    </div>
  );
}