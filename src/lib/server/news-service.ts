// ─────────────────────────────────────────────────────────────────────────────
// سرویس خبر فوتبال (ESPN Soccer News Wire) — v18.0
// منبع رسمی: now.core.api.espn.com — بدون کلید، بدون هزینه، کش ۳۰ دقیقه‌ای.
// خروجی برای پوستر «خبرهای فوتبال» کانال عمومی @aineobet.
// ─────────────────────────────────────────────────────────────────────────────

export interface NewsHeadline {
  headline: string;
  description: string;
  published: string; // ISO
  link: string | null;
}

interface EspnNowItem {
  headline?: string;
  title?: string;
  description?: string;
  published?: string;
  categorized?: string;
  link?: { web?: string; mobile?: string };
  links?: { web?: { href?: string } };
}

let cache: { at: number; items: NewsHeadline[] } | null = null;
const TTL = 30 * 60_000;

/** تیترهای فوتبال ESPN — شکست شبکه = آرایه خالی (پست خبر silently skip می‌شود) */
export async function fetchSoccerNews(limit = 10): Promise<NewsHeadline[]> {
  if (cache && Date.now() - cache.at < TTL && cache.items.length > 0) return cache.items.slice(0, limit);
  try {
    const res = await fetch(`https://now.core.api.espn.com/v1/sports/news?sport=soccer&limit=${Math.min(30, limit * 3)}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`ESPN news HTTP ${res.status}`);
    const json = (await res.json()) as { headlines?: EspnNowItem[] };
    const items: NewsHeadline[] = (json.headlines ?? [])
      .map((h) => ({
        headline: String(h.headline ?? h.title ?? "").trim(),
        description: String(h.description ?? "").trim(),
        published: String(h.published ?? h.categorized ?? new Date().toISOString()),
        link: h.link?.web ?? h.links?.web?.href ?? null,
      }))
      .filter((h) => h.headline.length > 0 && h.headline.length < 180);
    // تازه‌ترین اول + حذف تکراری تیتر
    items.sort((a, b) => new Date(b.published).getTime() - new Date(a.published).getTime());
    const seen = new Set<string>();
    const dedup = items.filter((h) => {
      const k = h.headline.toLowerCase().slice(0, 80);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    cache = { at: Date.now(), items: dedup };
    return dedup.slice(0, limit);
  } catch (err) {
    console.warn("[news] ESPN wire fetch failed:", err instanceof Error ? err.message : err);
    return [];
  }
}

/** ساعت کوتاه تهران برای چیپ زمان روی پوستر — «14:32» */
export function newsTimeEn(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Tehran" }).format(new Date(iso));
  } catch {
    return "—";
  }
}
