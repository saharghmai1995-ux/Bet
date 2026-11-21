// ─────────────────────────────────────────────────────────────────────────────
// سرویس اجماع بازار (Market Consensus Service) — v24.0
//
// ریشه ۹۷٪ `oddsSource=ENGINE`: فید Odds API فقط با `useOddsApi` دستی فراخوانی
// می‌شد و زمان‌بند سرور هیچ‌وقت خط واقعی نمی‌گرفت → کل بازار موتور از خود
// موتور می‌آمد (همان اختلاف بزرگ با betforward/1xbet).
//
// این سرویس با «سوگیری صرفه‌جویی اعتبار» خط اجماعی واقعی را به‌صورت خودکار
// در دسترس همه پایپ‌لاین می‌گذارد:
//   · فقط لیگ‌هایی که در پنجره ۴۸ ساعت بازی پیش‌رو دارند sweep می‌شوند
//   · حداکثر هر ۱۲ ساعت یک بار (≈ ۴–۸ اعتبار در روز — داخل پلن رایگان)
//   · گارد اعتبار: زیر ۴۰ اعتبار باقی‌مانده → دیگر sweep نمی‌کند
//   · کش درون‌حافظه؛ دوباره‌سازی زودهنگام فقط با force=true (دکمه دستی)
// ─────────────────────────────────────────────────────────────────────────────

import { fetchOddsApiEvents, type OddsApiEvent } from "./live-sources";
import { GLOBAL_ESPN_SOCCER_LEAGUES } from "@/lib/leagues-catalog";

const CONSENSUS_TTL_MS = 12 * 60 * 60 * 1000; // ۱۲ ساعت
const MIN_CREDITS_RESERVE = 40;

let cache: {
  at: number;
  events: OddsApiEvent[];
  remaining: number | null;
  sweptKeys: string[];
} = { at: 0, events: [], remaining: null, sweptKeys: [] };

function oddsApiKey(userKey?: string): string {
  return (userKey && userKey.trim()) || process.env.ODDS_API_KEY || "3c0379d120a8bbd1e4ead8a8c4a7b637";
}

/**
 * خط اجماعی واقعی بازار — خودتنظیم بر اساس اعتبار و پنجره بازی‌های پیش‌رو.
 * `activeLeagueSlugs` = اسلاگ لیگ‌هایی که همین لحظه بازی پیش‌رو دارند.
 */
export async function getMarketConsensus(
  opts?: { force?: boolean; activeLeagueSlugs?: string[]; apiKey?: string }
): Promise<{ events: OddsApiEvent[]; remaining: number | null; swept: boolean; keys: string[] }> {
  const now = Date.now();
  const fresh = now - cache.at < CONSENSUS_TTL_MS;
  if (!opts?.force && fresh) {
    return { events: cache.events, remaining: cache.remaining, swept: false, keys: cache.sweptKeys };
  }
  // گارد اعتبار — زیر سقف محفوظ، sweep نمی‌کنیم (اعتبار برای روزهای مانده ماه)
  if (cache.remaining !== null && cache.remaining < MIN_CREDITS_RESERVE && !opts?.force) {
    return { events: cache.events, remaining: cache.remaining, swept: false, keys: [] };
  }

  const slugToKey = new Map(GLOBAL_ESPN_SOCCER_LEAGUES.map((l) => [l.slug, l.oddsKey] as const));
  let keys: string[];
  if (opts?.activeLeagueSlugs?.length) {
    // فقط لیگ‌های فعالی که بازی پیش‌رو دارند
    keys = Array.from(
      new Set(opts.activeLeagueSlugs.map((s) => slugToKey.get(s)).filter((k): k is string => Boolean(k)))
    );
  } else {
    keys = Array.from(new Set(GLOBAL_ESPN_SOCCER_LEAGUES.map((l) => l.oddsKey).filter(Boolean)));
  }
  if (!keys.length) {
    return { events: cache.events, remaining: cache.remaining, swept: false, keys: [] };
  }

  try {
    const res = await fetchOddsApiEvents(keys, oddsApiKey(opts?.apiKey));
    cache = {
      at: now,
      events: res.events.length ? res.events : cache.events,
      remaining: res.requestsRemaining ?? cache.remaining,
      sweptKeys: keys,
    };
    return { events: cache.events, remaining: cache.remaining, swept: true, keys };
  } catch {
    return { events: cache.events, remaining: cache.remaining, swept: false, keys };
  }
}

/** وضعیت فعلی کش (برای داشبورد) */
export function consensusStatus(): { ageMs: number; events: number; remaining: number | null } {
  return { ageMs: Date.now() - cache.at, events: cache.events.length, remaining: cache.remaining };
}
