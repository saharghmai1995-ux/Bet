// ─────────────────────────────────────────────────────────────────────────────
// حافظه کش پایدار پاسخ LLM با اثر انگشت مسابقه — localStorage Cache (v5.0)
// کلید: llm_cache_${matchId}_${Math.round(lambdaHome*10)} — TTL شصت دقیقه
// اعتبار کش تا زمانی که امید گل بازی بیش از ۱۰٪ تغییر نکرده باشد.
// ─────────────────────────────────────────────────────────────────────────────

"use client";

import type { DebateResultDTO } from "./types";

const TTL_MS = 60 * 60 * 1000; // ۶۰ دقیقه
const LAMBDA_TOLERANCE = 0.1; // تغییر بیش از ۱۰٪ λ → کش باطل

export interface CachedDebate {
  result: DebateResultDTO;
  lambdaHome: number;
  at: number;
}

export function debateCacheKey(matchId: string, lambdaHome: number): string {
  return `llm_cache_${matchId}_${Math.round(lambdaHome * 10)}`;
}

/** خواندن پاسخ LLM از کش — null یعنی کش ندارد یا منقضی/نامعتبر است */
export function getCachedDebate(matchId: string, lambdaHome: number): CachedDebate | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(debateCacheKey(matchId, lambdaHome));
    if (!raw) return null;
    const entry = JSON.parse(raw) as CachedDebate;
    if (!entry?.result?.success) return null;
    if (Date.now() - entry.at > TTL_MS) {
      localStorage.removeItem(debateCacheKey(matchId, lambdaHome));
      return null;
    }
    // اثر انگشت λ: اگر امید گل بیش از ۱۰٪ تغییر کرده، کش منقضی است
    if (Math.abs(entry.lambdaHome - lambdaHome) > Math.max(0.05, lambdaHome * LAMBDA_TOLERANCE)) return null;
    return entry;
  } catch {
    return null;
  }
}

/** ذخیره پاسخ LLM در کش پایدار مرورگر */
export function setCachedDebate(matchId: string, lambdaHome: number, result: DebateResultDTO): void {
  if (typeof window === "undefined") return;
  try {
    const entry: CachedDebate = { result, lambdaHome, at: Date.now() };
    localStorage.setItem(debateCacheKey(matchId, lambdaHome), JSON.stringify(entry));
  } catch {
    // حافظه پر یا JSON نامعتبر — کش اختیاری است
  }
}

/** تعداد کلیدهای کش فعال (برای نشانگر سپر در هدر) */
export function llmCacheKeyCount(): number {
  if (typeof window === "undefined") return 0;
  try {
    let n = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("llm_cache_")) n += 1;
    }
    return n;
  } catch {
    return 0;
  }
}
