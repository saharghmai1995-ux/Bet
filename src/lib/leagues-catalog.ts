// ─────────────────────────────────────────────────────────────────────────────
// 🌍 کاتالوگ جهانی رقابت‌ها — NeoBet v14.0 «Global All-Season Scanner»
// اسکنر چهارفصل: بدون توقف در تعطیلات فیفادی — لیگ ملت‌ها، مقدماتی جام جهانی،
// لیگ قهرمانان زنان اروپا، لیگ‌های دسته دوم و لیگ‌های قاره آمریکا.
// این ماژول «فقط داده» است (بدون fetch) تا هم در سرور و هم در کلاینت قابل استفاده باشد.
// ضرایب کالیبراسیون (avgGoals / rho) هر دسته دقیقاً طبق سند ارتقا v14.0 است.
// ─────────────────────────────────────────────────────────────────────────────

/** دسته‌بندی جهانی رقابت‌ها — مبنای قواعد کالیبراسیون سوپروایزر و فیلتر داشبورد */
export type LeagueCategory =
  | "CLUB_TOP5"
  | "UEFA_CLUB"
  | "NATIONAL"
  | "WOMEN_ELITE"
  | "TIER2_PRO"
  | "AMERICAS"
  | "GLOBAL_OTHER";

export interface LeagueMeta {
  slug: string; // اسلاگ ESPN
  name: string; // نام فارسی رقابت
  /** v13.5 — نام رسمی انگلیسی رقابت — برای «هیچ کلمه فارسی در تصویر» پوسترها */
  nameEn: string;
  oddsKey: string; // کلید The Odds API («» = بدون پوشش ضرایب)
  sportsDbId: string; // شناسه TheSportsDB («» = بدون فیکسچر مکمل)
  avgGoals: number; // میانگین گل تاریخی رقابت (مبنای لامبدای پایه)
  category: LeagueCategory; // دسته رقابت
  rho: number; // همبستگی دیکسون-کولز اختصاصی رقابت
}

/** ۱۹ رقابت جهانی دسته‌بندی‌شده — دقیقاً طبق سند ارتقا v14.0 */
export const GLOBAL_ESPN_SOCCER_LEAGUES: LeagueMeta[] = [
  // الف) ۵ لیگ برتر باشگاهی اروپا + رقابت‌های یوفا مردان
  { slug: "eng.1", name: "لیگ برتر انگلیس (EPL)", nameEn: "English Premier League (EPL)", oddsKey: "soccer_epl", sportsDbId: "4328", avgGoals: 2.85, category: "CLUB_TOP5", rho: -0.08 },
  { slug: "esp.1", name: "لالیگا اسپانیا (LaLiga)", nameEn: "Spanish LaLiga", oddsKey: "soccer_spain_la_liga", sportsDbId: "4335", avgGoals: 2.55, category: "CLUB_TOP5", rho: -0.1 },
  { slug: "ita.1", name: "سری آ ایتالیا (Serie A)", nameEn: "Italian Serie A", oddsKey: "soccer_italy_serie_a", sportsDbId: "4332", avgGoals: 2.62, category: "CLUB_TOP5", rho: -0.09 },
  { slug: "ger.1", name: "بوندسلیگا آلمان (Bundesliga)", nameEn: "German Bundesliga", oddsKey: "soccer_germany_bundesliga", sportsDbId: "4331", avgGoals: 3.12, category: "CLUB_TOP5", rho: -0.06 },
  { slug: "fra.1", name: "لیگ ۱ فرانسه (Ligue 1)", nameEn: "French Ligue 1", oddsKey: "soccer_france_ligue_one", sportsDbId: "4334", avgGoals: 2.7, category: "CLUB_TOP5", rho: -0.08 },
  { slug: "uefa.champions", name: "لیگ قهرمانان اروپا (UCL)", nameEn: "UEFA Champions League (UCL)", oddsKey: "soccer_uefa_champs_league", sportsDbId: "4480", avgGoals: 2.95, category: "UEFA_CLUB", rho: -0.07 },
  { slug: "uefa.europa", name: "لیگ اروپا (UEL)", nameEn: "UEFA Europa League (UEL)", oddsKey: "soccer_uefa_europa_league", sportsDbId: "4481", avgGoals: 2.82, category: "UEFA_CLUB", rho: -0.07 },

  // ب) مسابقات حساس ملی جهان (فعال در تعطیلات فیفادی!)
  { slug: "uefa.nations", name: "لیگ ملت‌های اروپا (UEFA Nations League)", nameEn: "UEFA Nations League", oddsKey: "soccer_uefa_nations_league", sportsDbId: "4482", avgGoals: 2.52, category: "NATIONAL", rho: -0.13 },
  { slug: "fifa.worldq.uefa", name: "مقدماتی جام جهانی — اروپا (WCQ UEFA)", nameEn: "FIFA World Cup Qualifying — UEFA", oddsKey: "", sportsDbId: "", avgGoals: 2.78, category: "NATIONAL", rho: -0.1 },
  { slug: "fifa.worldq.conmebol", name: "مقدماتی جام جهانی — آمریکای جنوبی (CONMEBOL)", nameEn: "FIFA World Cup Qualifying — CONMEBOL", oddsKey: "", sportsDbId: "", avgGoals: 2.28, category: "NATIONAL", rho: -0.13 },
  { slug: "fifa.worldq.afc", name: "مقدماتی جام جهانی — آسیا (WCQ AFC)", nameEn: "FIFA World Cup Qualifying — AFC", oddsKey: "", sportsDbId: "", avgGoals: 2.65, category: "NATIONAL", rho: -0.11 },
  { slug: "fifa.worldq.caf", name: "مقدماتی جام جهانی — آفریقا (WCQ CAF)", nameEn: "FIFA World Cup Qualifying — CAF", oddsKey: "", sportsDbId: "", avgGoals: 2.2, category: "NATIONAL", rho: -0.14 },
  { slug: "fifa.friendly", name: "مسابقات دوستانه بین‌المللی فیفا", nameEn: "International Friendly", oddsKey: "", sportsDbId: "", avgGoals: 2.6, category: "NATIONAL", rho: -0.09 },

  // ج) لیگ قهرمانان زنان اروپا (UWCL — فعال در وسط هفته و تعطیلات)
  { slug: "uefa.wchampions", name: "لیگ قهرمانان زنان اروپا (UWCL)", nameEn: "UEFA Women's Champions League (UWCL)", oddsKey: "", sportsDbId: "", avgGoals: 3.35, category: "WOMEN_ELITE", rho: -0.05 },

  // د) لیگ‌های سطح دوم اروپا و لیگ‌های تراز اول قاره آمریکا
  { slug: "eng.2", name: "چمپیونشیپ انگلیس (EFL Championship)", nameEn: "EFL Championship", oddsKey: "soccer_efl_champ", sportsDbId: "4329", avgGoals: 2.64, category: "TIER2_PRO", rho: -0.09 },
  { slug: "esp.2", name: "لالیگا ۲ اسپانیا (Segunda División)", nameEn: "Spanish Segunda División", oddsKey: "soccer_spain_segunda_division", sportsDbId: "4338", avgGoals: 2.25, category: "TIER2_PRO", rho: -0.13 },
  { slug: "bra.1", name: "سری آ برزیل (Brasileirão)", nameEn: "Brazilian Serie A (Brasileirão)", oddsKey: "soccer_brazil_campeonato", sportsDbId: "4351", avgGoals: 2.48, category: "AMERICAS", rho: -0.11 },
  { slug: "arg.1", name: "لیگ حرفه‌ای آرژانتین (Liga Profesional)", nameEn: "Argentine Liga Profesional", oddsKey: "soccer_argentina_primera_division", sportsDbId: "4356", avgGoals: 2.22, category: "AMERICAS", rho: -0.13 },
  { slug: "usa.1", name: "لیگ حرفه‌ای آمریکا (MLS)", nameEn: "Major League Soccer (MLS)", oddsKey: "soccer_usa_mls", sportsDbId: "4346", avgGoals: 3.05, category: "AMERICAS", rho: -0.06 },
];

const BY_SLUG = new Map(GLOBAL_ESPN_SOCCER_LEAGUES.map((l) => [l.slug, l]));
const BY_NAME = new Map(GLOBAL_ESPN_SOCCER_LEAGUES.map((l) => [l.name.trim(), l]));

export function leagueBySlug(slug: string): LeagueMeta | null {
  return BY_SLUG.get(slug) ?? null;
}

export function leagueByName(name: string): LeagueMeta | null {
  return BY_NAME.get(name.trim()) ?? null;
}

// ═══ v13.5 — «هیچ کلمه فارسی در تصویر» ═══
// برچسب‌های پوستر باید ۱۰۰٪ لاتین باشند. نام فارسی/عربی هر رقابت به معادل رسمی انگلیسی
// نگاشت می‌شود؛ اگر رقابت ناشناخته بود بخش لاتین داخل پرانتز (مثل «(EPL)») یا
// برچسب خنثی چاپ می‌شود — کاراکتر فارسی/عربی هرگز وارد تصویر نمی‌شود.

const HAS_FA_AR = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/;

/** نگاشت مستقیم نام فارسی → انگلیسی (برای ردیف‌های قدیمی دیتابیس) */
const FA_TO_EN = new Map<string, string>(
  GLOBAL_ESPN_SOCCER_LEAGUES.map((l) => [l.name.trim(), l.nameEn])
);

/**
 * برچسب انگلیسی امن برای چاپ روی پوستر:
 *  ۱) نگاشت دقیق کاتالوگ  ۲) پرانتز لاتین داخل نام (مثل «لیگ برتر انگلیس (EPL)»)  ۳) حذف نویسه‌های فارسی
 */
export function enLeagueLabel(league: string | null | undefined): string {
  const raw = String(league ?? "").trim();
  if (!raw) return "FOOTBALL";
  if (!HAS_FA_AR.test(raw)) return raw; // لاتین خالص — دست‌نخورده
  const mapped = FA_TO_EN.get(raw);
  if (mapped) return mapped;
  // پرانتز لاتین داخل نام فارسی (مثل «(EPL)») — رایج‌ترین شناسه رقابت
  const paren = raw.match(/\(([A-Za-z][A-Za-z0-9 .·&'’\-]{1,40})\)/);
  if (paren) return paren[1].trim().toUpperCase();
  // فالبک: حذف همه نویسه‌های فارسی/عربی — اگر چیزی نماند برچسب خنثی
  const stripped = raw.replace(/[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/g, " ").replace(/\s+/g, " ").trim();
  return stripped.length >= 3 ? stripped : "INTERNATIONAL FOOTBALL";
}

/** استخراج دسته رقابت از نام لیگ (exact → کلیدواژه) — برای ردیف‌های قدیمی دیتابیس هم کار می‌کند */
export function categoryForLeagueName(league: string | null | undefined): LeagueCategory {
  if (!league) return "GLOBAL_OTHER";
  const exact = BY_NAME.get(league.trim());
  if (exact) return exact.category;
  const s = league.replace(/\(.*?\)/g, " ").toLowerCase();
  if (s.includes("زنان") || s.includes("uwcl") || s.includes("women")) return "WOMEN_ELITE";
  if (
    s.includes("ملت") ||
    s.includes("مقدماتی") ||
    s.includes("دوستانه") ||
    s.includes("nations") ||
    s.includes("qualif") ||
    s.includes("world cup") ||
    s.includes("friendly")
  ) {
    return "NATIONAL";
  }
  if (
    s.includes("چمپیونشیپ") ||
    s.includes("championship") ||
    s.includes("سگوندا") ||
    s.includes("segunda") ||
    s.includes("دسته دوم")
  ) {
    return "TIER2_PRO";
  }
  if (
    s.includes("برزیل") ||
    s.includes("brazil") ||
    s.includes("آرژانتین") ||
    s.includes("argentin") ||
    s.includes("ام‌ال‌اس") ||
    s.includes("mls") ||
    s.includes("آمریکا")
  ) {
    return "AMERICAS";
  }
  if (
    s.includes("قهرمانان اروپا") ||
    s.includes("champions") ||
    s.includes("لیگ اروپا") ||
    s.includes("europa")
  ) {
    return "UEFA_CLUB";
  }
  if (
    s.includes("انگلیس") ||
    s.includes("لالیگا") ||
    s.includes("سری آ") ||
    s.includes("بوندسلیگا") ||
    s.includes("لیگ ۱") ||
    s.includes("epl") ||
    s.includes("laliga") ||
    s.includes("serie a") ||
    s.includes("bundes") ||
    s.includes("ligue")
  ) {
    return "CLUB_TOP5";
  }
  return "GLOBAL_OTHER";
}

/** ρ اختصاصی رقابت از نام لیگ (fallback: −0.08) */
export function rhoForLeagueName(league: string | null | undefined): number {
  const meta = league ? leagueByName(league.trim()) : null;
  return meta ? meta.rho : -0.08;
}

// ═══════════ قواعد کالیبراسیون سوپروایزر بر اساس دسته (بخش ۳ سند v14.0) ═══════════

/** وزن بازار در فرمول ترکیبی — بازی‌های ملی: ۷۵٪ مهندسی معکوس بوک‌میکر / ۲۵٪ فرم ملی */
export const DEFAULT_MARKET_WEIGHT = 0.65;
export const NATIONAL_MARKET_WEIGHT = 0.75;

export function marketWeightForCategory(cat: LeagueCategory): number {
  return cat === "NATIONAL" ? NATIONAL_MARKET_WEIGHT : DEFAULT_MARKET_WEIGHT;
}

export interface CategoryPatternBoost {
  code: "A1" | "A2" | "A3" | "A4";
  points: number;
  label: string;
}

/**
 * پاداش الگوی اختصاصی هر دسته:
 *  · NATIONAL     → +۱۵ امتیاز به الگوی «قفل تدافعی / زیر ۲.۵ گل» (A1)
 *  · WOMEN_ELITE  → +۱۸ امتیاز به الگوی «فتح فاوریت با بالای ۲.۵ / هندیکپ منفی» (A2)
 */
export function patternBoostForCategory(cat: LeagueCategory): CategoryPatternBoost | null {
  if (cat === "NATIONAL") {
    return { code: "A1", points: 15, label: "قفل تدافعی / زیر ۲.۵ گل (+۱۵)" };
  }
  if (cat === "WOMEN_ELITE") {
    return { code: "A2", points: 18, label: "فتح فاوریت با بالای ۲.۵ / هندیکپ منفی (+۱۸)" };
  }
  return null;
}

/** برچسب فارسی هر دسته (نمایش روی فلش‌کارت و فیلتر داشبورد) */
export const CATEGORY_LABEL_FA: Record<LeagueCategory, string> = {
  CLUB_TOP5: "🏆 ۵ لیگ اول اروپا",
  UEFA_CLUB: "🏆 رقابت‌های یوفا مردان",
  NATIONAL: "🏳️ بازی‌های ملی و فیفادی",
  WOMEN_ELITE: "👑 لیگ قهرمانان زنان (UWCL)",
  TIER2_PRO: "⚔️ چمپیونشیپ و دسته دوم",
  AMERICAS: "⚔️ لیگ‌های قاره آمریکا",
  GLOBAL_OTHER: "🌍 سایر رقابت‌های جهانی",
};

// ═══════════ نوار فیلتر سریع رقابت‌ها در بالای داشبورد ═══════════

export type DashboardFilterKey = "ALL" | "NATIONAL" | "TOP5_UCL" | "WOMEN_ELITE" | "AMERICAS_T2";

export const DASHBOARD_FILTERS: { key: DashboardFilterKey; label: string }[] = [
  { key: "ALL", label: "🌍 همه رقابت‌های فعال" },
  { key: "NATIONAL", label: "🏳️ بازی‌های ملی و فیفادی" },
  { key: "TOP5_UCL", label: "🏆 ۵ لیگ اول و UCL مردان" },
  { key: "WOMEN_ELITE", label: "👑 لیگ قهرمانان زنان (UWCL)" },
  { key: "AMERICAS_T2", label: "⚔️ چمپیونشیپ و لیگ‌های آمریکا" },
];

export function filterMatchesCategory(filter: DashboardFilterKey, cat: LeagueCategory): boolean {
  switch (filter) {
    case "NATIONAL":
      return cat === "NATIONAL";
    case "TOP5_UCL":
      return cat === "CLUB_TOP5" || cat === "UEFA_CLUB";
    case "WOMEN_ELITE":
      return cat === "WOMEN_ELITE";
    case "AMERICAS_T2":
      return cat === "TIER2_PRO" || cat === "AMERICAS";
    case "ALL":
    default:
      return true;
  }
}
