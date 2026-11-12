// ─────────────────────────────────────────────────────────────────────────────
// یابنده بهترین ساعت ثبت ضریب (Optimal Odds Timing Window Finder) — v16.0
//
// 🚨 v16.0 — بازنشستگی رسمی پنجره زیان‌ده «Early Favorite (T-24h)»:
//   در دفتر دکترین نسخه ۱۵ ثبت شد که پنجره T-24h به دلیل عدم اطلاع از ترکیب اصلی
//   −۴۳۸.۸ واحد ضرر داد، در حالی که پنجره «⚡ T-60m Lineup Shock (پس از اعلام
//   ترکیب رسمی)» وین‌ریت بالای ۸۸٪ داشته است. طبق بخش ۳ سند ارتقا v16.0،
//   تمام کارت‌های تاییدشده سوپروایزر روی پنجره طلایی «T-60m Lineup Verified»
//   قفل می‌شوند — همه انواع تیپ → LINEUP_SHOCK.
//
// منطق علمی (ریزساختار حرکت خط بوک‌میکر از بازگشایی تا سوت شروع):
//   ۱) ⏰ EARLY_FAVORITE — T-24h تا T-12h: [بازنشسته v16.0 — فقط برای تاریخچه]
//      وقتی تیپ روی فاوریت است، پول عمومی در ساعات پایانی ضریب فاوریت را
//      به‌شدت پایین می‌آورد → بهترین ضریب ۱۲ تا ۲۴ ساعت قبل ثبت می‌شود.
//      اما بدون ترکیب اصلی، بردهای ۰-۱ و ۱-۲ میهمان نمی‌پوشند (−۴۳۸.۸ واحد).
//   ۲) ⚡ LINEUP_SHOCK — T-60m تا T-45m:
//      استراتژی‌های وابسته به مجموع گل / BTTS / غیبت ستاره‌ها → بهترین لحظه
//      بلافاصله پس از انتشار ترکیب رسمی ESPN و پیش از اصلاح کامل بازار.
//   ۳) 🎯 LATE_UNDERDOG — T-30m تا T-10m: [بازنشسته برای صدور — فقط تاریخچه]
//      تیپ روی آندرداگ (X2 یا هندیکپ +۰.۵) → هجوم پول عمومی به فاوریت در
//      ۳۰ دقیقه پایانی، ضریب آندرداگ را به بالاترین نقطه ارزش می‌رساند.
//
// ماژول خالص (بدون I/O) — هم سمت سرور (صدور کارت) و هم سمت کلاینت (شمارش معکوس)
// ─────────────────────────────────────────────────────────────────────────────

export type TipKind = "FAVORITE" | "TOTALS" | "UNDERDOG";
export type TimingWindowKey = "EARLY_FAVORITE" | "LINEUP_SHOCK" | "LATE_UNDERDOG";
export type TimingStatus = "WAITING" | "OPEN" | "LATE" | "KICKED_OFF";

/**
 * پنجره پیش‌فرض هر نوع تیپ — v16.0: پنجره واحد و طلایی «T-60m Lineup Verified».
 * (بخش ۳ سند ارتقا v16.0 — پنجره زیان‌ده T-24h Early Favorite حذف شد)
 */
export const TIP_KIND_WINDOW: Record<TipKind, TimingWindowKey> = {
  FAVORITE: "LINEUP_SHOCK",
  TOTALS: "LINEUP_SHOCK",
  UNDERDOG: "LINEUP_SHOCK",
};

export interface TimingWindowMeta {
  key: TimingWindowKey;
  icon: string;
  nameFa: string;
  nameEn: string;
  /** توضیح علمی کوتاه — نمایش در tooltip فلش‌کارت */
  rationale: string;
  /** v16.0 — پنجره بازنشسته است (فقط تاریخچه دفتر — دیگر به کارت‌های تازه تخصیص نمی‌یابد) */
  deprecated?: boolean;
}

export const TIMING_WINDOWS: Record<TimingWindowKey, TimingWindowMeta> = {
  EARLY_FAVORITE: {
    key: "EARLY_FAVORITE",
    icon: "⏰",
    nameFa: "پنجره شکار فاوریت (T-24h تا T-12h) — بازنشسته v16.0",
    nameEn: "Early Favorite Window (RETIRED v16.0)",
    rationale:
      "بازنشسته — بدون ترکیب اصلی، بردهای ۰-۱ و ۱-۲ میهمان نمی‌پوشند (−۴۳۸.۸ واحد ضرر ثبت‌شده در دفتر دکترین). تمام کارت‌های تاییدشده به پنجره طلایی T-60m Lineup Verified قفل شده‌اند",
    deprecated: true,
  },
  LINEUP_SHOCK: {
    key: "LINEUP_SHOCK",
    icon: "⚡",
    nameFa: "پنجره طلایی ترکیب رسمی — Lineup Verified (T-60m تا T-45m)",
    nameEn: "T-60m Lineup Verified Window",
    rationale:
      "پنجره واحد و طلایی صدور v16.0 — بلافاصله پس از انتشار ترکیب رسمی ESPN و پیش از اصلاح کامل بازار؛ وین‌ریت اثبات‌شده بالای ۸۸٪",
  },
  LATE_UNDERDOG: {
    key: "LATE_UNDERDOG",
    icon: "🎯",
    nameFa: "پنجره اوج آندرداگ (T-30m تا T-10m) — بازنشسته v16.0",
    nameEn: "Late Underdog Peak (RETIRED v16.0)",
    rationale:
      "بازنشسته برای صدور کارت — طبق سند v16.0 تمام کارت‌های تاییدشده سوپروایزر فقط روی پنجره T-60m قفل می‌شوند",
    deprecated: true,
  },
};

export interface TimingWindowInfo {
  windowKey: TimingWindowKey;
  meta: TimingWindowMeta;
  tipKind: TipKind;
  /** شروع مطلق پنجره (ISO) */
  startAt: string;
  /** پایان مطلق پنجره (ISO) */
  endAt: string;
  /** لحظه پیشنهادی ثبت (ابتدای پنجره) — HH:MM به وقت محلی */
  suggestedClock: string;
  /** وضعیت نسبت به اکنون */
  status: TimingStatus;
  /** آیا همین الان در پنجره طلایی هستیم؟ */
  inWindowNow: boolean;
  /** متن آماده نمایش: 🟢 الان در پنجره طلایی ثبت هستید! یا ⏳ صبر کنید … */
  statusText: string;
  /** دقیقه/ساعت باقی‌مانده تا باز شدن پنجره (وقتی WAITING است) */
  msUntilOpen: number;
  /** دقیقه/ساعت باقی‌مانده تا بستن پنجره (وقتی OPEN است) */
  msUntilClose: number;
}

// ───────────────────────────── استخراج نوع تیپ ─────────────────────────────

/** کلیدهای بازار وابسته به ترکیب رسمی و مجموع گل (پنجره T-60) */
const TOTALS_KEYS = new Set(["O15", "O25", "U25", "O35", "U35", "BTTS_Y", "BTTS_N", "ASIAN_O20", "ASIAN_U20"]);
/** کلیدهای سمت آندرداگ/میهمان (پنجره T-30) */
const UNDERDOG_KEYS = new Set(["AWAY", "DC_X2", "DNB_AWAY", "AH_AWAY_15", "WIN_NIL_AWAY", "TGOAL_AWAY"]);
/** کلیدهای سمت فاوریت/میزبان (پنجره T-24) */
const FAVORITE_KEYS = new Set(["HOME", "DC_1X", "DNB_HOME", "NO_DRAW", "WIN_NIL_HOME", "TGOAL_HOME"]);

/**
 * تشخیص نوع تیپ از کلید بازار + ضریب:
 *   کلیدهای مجموع گل/BTTS → TOTALS
 *   کلید سمت میهمان با ضریب بالا (≥۲.۰) → UNDERDOG
 *   کلید سمت میزبان با ضریب پایین (≤۱.۹) → FAVORITE
 *   fallback: صرفاً بر اساس ضریب
 */
export function deriveTipKind(marketKeys: string[], odds: number): TipKind {
  const keys = (marketKeys ?? []).map((k) => String(k).toUpperCase());
  if (keys.some((k) => TOTALS_KEYS.has(k))) return "TOTALS";
  const hasUnder = keys.some((k) => UNDERDOG_KEYS.has(k));
  const hasFav = keys.some((k) => FAVORITE_KEYS.has(k));
  if (hasUnder && !hasFav) return "UNDERDOG";
  if (hasFav && !hasUnder) return "FAVORITE";
  // fallback ضریب‌محور: ضریب بالا = آندرداگ، ضریب پایین = فاوریت، میانه = بازار گل
  if (odds >= 2.1) return "UNDERDOG";
  if (odds <= 1.9) return "FAVORITE";
  return "TOTALS";
}

// ───────────────────────────── ساعت محلی تهران ─────────────────────────────

/** HH:MM به وقت Asia/Tehran از یک Date */
export function tehranClock(d: Date | string | number): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Asia/Tehran",
    }).format(new Date(d));
  } catch {
    const dd = new Date(d);
    return `${String(dd.getHours()).padStart(2, "0")}:${String(dd.getMinutes()).padStart(2, "0")}`;
  }
}

/** HH:MM به وقت محلی کاربر (نمایش در فلش‌کارت) */
export function localClock(d: Date | string | number): string {
  const dd = new Date(d);
  return `${String(dd.getHours()).padStart(2, "0")}:${String(dd.getMinutes()).padStart(2, "0")}`;
}

/** متن فارسی مدت زمان («۲ ساعت و ۱۳ دقیقه» / «۴۵ دقیقه» / «۳ دقیقه») */
export function faDuration(ms: number): string {
  const totalMin = Math.max(0, Math.round(ms / 60_000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0 && m > 0) return `${faDigits(h)} ساعت و ${faDigits(m)} دقیقه`;
  if (h > 0) return `${faDigits(h)} ساعت`;
  return `${faDigits(m)} دقیقه`;
}

function faDigits(n: number): string {
  return String(n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
}

// ───────────────────────────── محاسبه پنجره ─────────────────────────────

interface WindowSpec {
  key: TimingWindowKey;
  /** میلی‌ثانیه قبل از کیک‌آف — شروع */
  fromMs: number;
  /** میلی‌ثانیه قبل از کیک‌آف — پایان */
  toMs: number;
}

const WINDOW_SPECS: Record<TimingWindowKey, WindowSpec> = {
  // T-24h تا T-12h
  EARLY_FAVORITE: { key: "EARLY_FAVORITE", fromMs: 24 * 3600_000, toMs: 12 * 3600_000 },
  // T-60m تا T-45m
  LINEUP_SHOCK: { key: "LINEUP_SHOCK", fromMs: 60 * 60_000, toMs: 45 * 60_000 },
  // T-30m تا T-10m
  LATE_UNDERDOG: { key: "LATE_UNDERDOG", fromMs: 30 * 60_000, toMs: 10 * 60_000 },
};

/**
 * محاسبه پنجره طلایی ثبت برای یک تیپ.
 * @param kickoff زمان شروع بازی
 * @param tipKind نوع تیپ (فاوریت/مجموع گل/آندرداگ)
 * @param now اکنون (تزریق‌پذیر برای تست و شمارش معکوس زنده کلاینت)
 */
export function computeTimingWindow(kickoff: Date | string | number, tipKind: TipKind, now: Date | number = Date.now()): TimingWindowInfo {
  const ko = new Date(kickoff).getTime();
  const t = new Date(now).getTime();
  const windowKey = TIP_KIND_WINDOW[tipKind];
  const spec = WINDOW_SPECS[windowKey];
  const meta = TIMING_WINDOWS[windowKey];
  const startAt = ko - spec.fromMs;
  const endAt = ko - spec.toMs;

  let status: TimingStatus;
  if (t >= ko) status = "KICKED_OFF";
  else if (t >= startAt && t <= endAt) status = "OPEN";
  else if (t < startAt) status = "WAITING";
  else status = "LATE";

  const inWindowNow = status === "OPEN";
  let statusText: string;
  if (status === "OPEN") {
    statusText = `🟢 الان در پنجره طلایی ثبت هستید! (تا ${localClock(endAt)})`;
  } else if (status === "WAITING") {
    statusText = `⏳ صبر کنید — پنجره ${faDuration(startAt - t)} دیگر باز می‌شود (${localClock(startAt)})`;
  } else if (status === "LATE") {
    statusText = `⚠️ پنجره بسته شد — ضریب احتمالاً توسط پول عمومی اصلاح شده است`;
  } else {
    statusText = `⚪️ بازی شروع شده — پنجره ثبت منقضی است`;
  }

  return {
    windowKey,
    meta,
    tipKind,
    startAt: new Date(startAt).toISOString(),
    endAt: new Date(endAt).toISOString(),
    suggestedClock: localClock(startAt),
    status,
    inWindowNow,
    statusText,
    msUntilOpen: Math.max(0, startAt - t),
    msUntilClose: Math.max(0, endAt - t),
  };
}

/** نسخه خلاص برای سرور (بدون متون وضعیت لحظه‌ای) */
export function computeTimingWindowStatic(
  kickoff: Date | string | number,
  tipKind: TipKind
): { windowKey: TimingWindowKey; startAt: Date; endAt: Date; suggestedClock: string } {
  const ko = new Date(kickoff).getTime();
  const windowKey = TIP_KIND_WINDOW[tipKind];
  const spec = WINDOW_SPECS[windowKey];
  const startAt = new Date(ko - spec.fromMs);
  const endAt = new Date(ko - spec.toMs);
  return { windowKey, startAt, endAt, suggestedClock: localClock(startAt) };
}

/**
 * محاسبه همزمان پنجره تیپ A و تیپ B — خط «⏱️ بهترین زمان ثبت» فلش‌کارت.
 * اگر هر دو تیپ یک پنجره دارند → یک خط؛ وگرنه دو خط.
 */
export function computePairTiming(
  kickoff: Date | string | number,
  legsA: string[],
  oddsA: number,
  legsB: string[],
  oddsB: number,
  now: Date | number = Date.now()
): { a: TimingWindowInfo; b: TimingWindowInfo; same: boolean } {
  const a = computeTimingWindow(kickoff, deriveTipKind(legsA, oddsA), now);
  const b = computeTimingWindow(kickoff, deriveTipKind(legsB, oddsB), now);
  return { a, b, same: a.windowKey === b.windowKey };
}
