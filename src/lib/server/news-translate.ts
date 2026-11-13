// ─────────────────────────────────────────────────────────────────────────────
// مترجم خبر فوتبال به فارسی (v18.1) — کانال دوزبانه است:
//   · پوستر = انگلیسی خالص (تیترهای اصلی وایر ESPN روی تصویر آرکید)
//   · کپشن = فارسی کامل — حتی ترجمه خبرهای مهم (دستور کارفرما)
// یک فراخوان LLM برای کل بچ (حداکثر ۸ تیتر) + کش ۱۲ ساعته + فالبک آرام.
// فقط سمت سرور اجرا می‌شود (z-ai-web-dev-sdk مجاز در backend است).
// ─────────────────────────────────────────────────────────────────────────────

import ZAI from "z-ai-web-dev-sdk";
import { runWithLlmSlot } from "./llm-limiter";
import type { NewsHeadline } from "./news-service";

export interface NewsItemFa {
  headlineFa: string;
  summaryFa: string; // حواشی یک‌جمله‌ای فارسی
}

interface CacheEntry {
  at: number;
  items: NewsItemFa[];
}

const CACHE_TTL = 12 * 60 * 60_000;
const g = globalThis as typeof globalThis & { __neobetNewsFaCache?: Map<string, CacheEntry> };
const cache: Map<string, CacheEntry> = (g.__neobetNewsFaCache ??= new Map());

function stripJson(raw: string): string {
  let s = raw.trim();
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  // نزدیک‌ترین براکت/آکولاد ابتدای بدنه JSON — اگر مدل مستقیماً آرایه برگرداند هم درست برش می‌خورد
  const bi = s.indexOf("{");
  const ai = s.indexOf("[");
  const start = ai >= 0 && (bi < 0 || ai < bi) ? ai : bi;
  const end = Math.max(s.lastIndexOf("}"), s.lastIndexOf("]"));
  if (start >= 0 && end > start) s = s.slice(start, end + 1);
  return s;
}

const SYSTEM_PROMPT = `تو مترجم ارشد بخش فوتبال یک رسانه ورزشی فارسی‌زبان هستی.
هر تیتر ورودی انگلیسی ESPN را به یک تیتر فارسی روان، دقیق و خبری ترجمه کن و یک «حاشیه» یک‌جمله‌ای فارسی (زمینه خبر: چه اتفاقی افتاده، چرا مهم است، تاثیر روی تیم/بازیکن) بنویس.
نام باشگاه‌ها و بازیکنان را انگلیسی حفظ کن (مثلاً Real Madrid، Mbappé).
اصطلاحات فنی را فارسی طبیعی بنویس (مصدومیت، تعویض سرمربی، پرونده انتقال و...).
خروجی تو باید فقط و فقط یک JSON معتبر باشد، بدون markdown و بدون متن اضافه:
{"items":[{"i":0,"headlineFa":"تیتر فارسی","summaryFa":"حاشیه یک‌جمله‌ای فارسی"}]}
تعداد آیتم‌های خروجی دقیقا برابر تعداد آیتم‌های ورودی است و i شماره همان آیتم ورودی است.`;

/**
 * ترجمه بچ تیترهای ESPN به فارسی — یک فراخوان LLM، کش ۱۲ ساعته، فالبک آرام:
 * در شکست شبکه/LLM همان تیتر انگلیسی برگردانده می‌شود تا پست خبر هرگز متوقف نشود.
 */
export async function translateNewsBatch(items: NewsHeadline[]): Promise<NewsItemFa[]> {
  const usable = items.slice(0, 8);
  const now = Date.now();

  // ─── کش: هر تیتر جداگانه؛ فقط تیترهای بدون کش در بچ LLM می‌روند ───
  const out: NewsItemFa[] = new Array(usable.length);
  const missing: { idx: number; headline: string; description: string }[] = [];
  usable.forEach((n, idx) => {
    const key = n.headline.toLowerCase().slice(0, 90);
    const hit = cache.get(key);
    if (hit && now - hit.at < CACHE_TTL) {
      out[idx] = hit.items[0];
    } else {
      missing.push({ idx, headline: n.headline, description: n.description.slice(0, 220) });
    }
  });

  if (missing.length === 0) return out;

  const fallback = (idx: number, headline: string): NewsItemFa => ({ headlineFa: headline, summaryFa: "" });
  const userPrompt =
    `این ${missing.length} تیتر فوتبال انگلیسی را مطابق قاعده ترجمه کن:\n` +
    missing.map((m, k) => `${k}. [i=${m.idx}] ${m.headline}${m.description ? ` | context: ${m.description}` : ""}`).join("\n") +
    `\nخروجی: JSON با {"items":[...]} — دقیقا ${missing.length} آیتم.`;

  let parsedItems: { i?: number; headlineFa?: string; summaryFa?: string }[] | null = null;
  try {
    parsedItems = await runWithLlmSlot(async () => {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const zai = await ZAI.create();
          const completion = await zai.chat.completions.create({
            messages: [
              { role: "assistant", content: SYSTEM_PROMPT },
              { role: "user", content: userPrompt },
            ],
            thinking: { type: "disabled" },
          });
          const content = completion.choices[0]?.message?.content ?? "";
          const parsed = JSON.parse(stripJson(content)) as unknown;
          const list = Array.isArray(parsed)
            ? (parsed as { i?: number; headlineFa?: string; summaryFa?: string }[])
            : ((parsed as { items?: { i?: number; headlineFa?: string; summaryFa?: string }[] }).items ?? null);
          if (Array.isArray(list) && list.length > 0) return list;
          return null;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (attempt < 1) {
            await new Promise((r) => setTimeout(r, 4000));
            continue;
          }
          console.warn("[news-fa] translate failed:", msg);
          return null;
        }
      }
      return null;
    });
  } catch {
    parsedItems = null; // صف LLM پر بود — فالبک کامل
  }

  if (parsedItems) {
    for (const m of missing) {
      const hit = parsedItems.find((p) => Number(p?.i) === m.idx) ?? parsedItems[missing.indexOf(m)] ?? null;
      const item: NewsItemFa = {
        headlineFa: String(hit?.headlineFa ?? m.headline).trim() || m.headline,
        summaryFa: String(hit?.summaryFa ?? "").trim(),
      };
      out[m.idx] = item;
      cache.set(m.headline.toLowerCase().slice(0, 90), { at: now, items: [item] });
    }
  } else {
    for (const m of missing) out[m.idx] = fallback(m.idx, m.headline);
  }

  return out.map((x) => x ?? { headlineFa: "", summaryFa: "" });
}

/** تاریخ کامل فارسی تهران برای سرخط کپشن خبر */
export function newsDateFa(d = new Date()): string {
  try {
    return new Intl.DateTimeFormat("fa-IR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Tehran" }).format(d);
  } catch {
    return "";
  }
}
