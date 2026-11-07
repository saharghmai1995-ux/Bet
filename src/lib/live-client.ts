// ─────────────────────────────────────────────────────────────────────────────
// کلاینت فید زنده (Live Data Service — سمت مرورگر) — v4.0
// معادل liveDataService سند ارتقا: به محض باز شدن سایت به /api/live-football
// وصل می‌شود، دیتای واقعی ESPN/TheSportsDB/Open-Meteo/The Odds API را می‌گیرد
// و وضعیت را در استور سراسری می‌نویسد.
// ─────────────────────────────────────────────────────────────────────────────

"use client";

import { useQuantStore } from "./store";
import type { LiveFeedDTO } from "./types";

/**
 * همگام‌سازی فید زنده.
 *   force=false → GET (کش ۹۰ ثانیه‌ای سرور، بدون هزینه Odds API)
 *   force=true  → POST (دکمه 🔄 — شامل تازه‌سازی ضرایب The Odds API با throttle ۱۲ دقیقه‌ای)
 */
export async function syncLive(force: boolean): Promise<LiveFeedDTO | null> {
  const store = useQuantStore.getState();
  if (store.liveSyncing) return null;
  store.setLiveSyncing(true);
  try {
    const res = await fetch("/api/live-football", {
      method: force ? "POST" : "GET",
      headers: { "Content-Type": "application/json" },
      body: force ? JSON.stringify({ useOddsApi: true, oddsApiKey: store.config.oddsApiKey || undefined }) : undefined,
      cache: "no-store",
    });
    const feed = (await res.json()) as LiveFeedDTO;
    store.patchLiveFeed(feed);
    return feed;
  } catch {
    // آفلاین — فید قبلی حفظ می‌شود؛ داشبورد حالت FALLBACK نشان می‌دهد
    return null;
  } finally {
    useQuantStore.getState().setLiveSyncing(false);
  }
}

/** برچسب فارسی فاصله زمانی نسبت به الان */
export function agoLabel(ts: number | null | undefined, now: number): string {
  if (!ts) return "—";
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return `${s} ثانیه پیش`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} دقیقه پیش`;
  return `${Math.round(m / 60)} ساعت پیش`;
}
