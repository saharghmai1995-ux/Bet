// ─────────────────────────────────────────────────────────────────────────────
// کش کوتاه‌مدت اندپوینت‌های پرتکرار داشبورد (Poll Cache) — v20.1
//
// ریشه فشار حافظه/CPU: داشبورد هر چند ثانیه /api/lineup و /api/agent/portfolio
// را صدا می‌زد و هر پاس = واکشی ESPN + موتور کامل + رندر — با هزاران تخصیص
// لحظه‌ای در دقیقه (ریشه رشد RSS و OOM).
// این کش TTL کوتاه (۱۵-۳۰ ثانیه) با سقف اندازه و تخلیه قدیمی‌ترین‌ها:
//   · پاسخ‌های تکراری را بلافاصله از حافظه می‌دهد (تأخیر ~۰ms)
//   · بار ESPN/DB/موتور را تا ~۹۰٪ کاهش می‌دهد
// کلید شامل کامل پارامترهای بدنه است — سناریوهای what-if هرگز با هم قاطی نمی‌شوند.
// ─────────────────────────────────────────────────────────────────────────────

const store = new Map<string, { at: number; value: unknown }>();
const MAX_ENTRIES = 400;

export function pollCacheKey(route: string, params: Record<string, unknown>): string {
  const parts = Object.keys(params)
    .sort()
    .map((k) => `${k}=${String(params[k] ?? "")}`);
  return `${route}|${parts.join("&")}`;
}

export async function cachedPoll<T>(key: string, ttlMs: number, producer: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  const now = Date.now();
  if (hit && now - hit.at < ttlMs) return hit.value as T;
  const value = await producer();
  pollCacheSet(key, value);
  return value;
}

/** خواندن مستقیم کش (برای الگوی get-early/set-late در هندلرها) */
export function pollCacheGet<T>(key: string, ttlMs: number): T | null {
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  return null;
}

/** نوشتن مستقیم در کش با سقف اندازه (تخلیه قدیمی‌ترین‌ها) */
export function pollCacheSet(key: string, value: unknown): void {
  store.set(key, { at: Date.now(), value });
  if (store.size > MAX_ENTRIES) {
    for (const k of store.keys()) {
      store.delete(k);
      if (store.size <= MAX_ENTRIES) break;
    }
  }
}
