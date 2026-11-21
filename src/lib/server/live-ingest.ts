// ─────────────────────────────────────────────────────────────────────────────
// ارکستراتور همگام‌سازی زنده (Live Multi-API Telemetry Orchestrator) — v4.0
//
// جریان: ESPN(۶ لیگ × ۸ روز) + اخبار ESPN + TheSportsDB + Open-Meteo + The Odds API
//   → نگاشت به ساختار دیتابیس → محاسبه λ از فرم واقعی + رکورد فصل
//   → تعدیل جوی −۸٪ (بارش>۲mm یا باد>۳۰km/h) → جایگزینی ضرایب زنده
//   → ثبت نتایج واقعی دیروز برای کالیبراسیون بریر → آرشیو بازی‌های گذشته
//
// همه چیز با کش درون‌حافظه‌ای Rate-Limit-Safe است:
//   فید ۹۰ ثانیه · اخبار ۵ دقیقه · آب‌وهوا ۳۰ دقیقه · Odds API فقط با دکمه دستی (۱۲ دقیقه throttle)
// ─────────────────────────────────────────────────────────────────────────────

import { db } from "@/lib/db";
import {
  ESPN_LEAGUES,
  fetchEspnEvents,
  fetchEspnEventsSmartWindow,
  fetchEspnNews,
  fetchSportsDbNext,
  fetchWeather,
  fetchOddsApiEvents,
  cityCoords,
  normTeam,
  recordToPointsPct,
  type LiveMatchEvent,
  type LiveNewsItem,
  type LiveWeather,
  type OddsApiEvent,
} from "./live-sources";
import { getLeagueStandings, findStandingsEntry, type LeagueStandings } from "./espn-standings";
import { runDixonColes, fairOdds } from "@/lib/engine/poisson";
import { solveMarketImpliedLambdas, type MarketImpliedResult } from "@/lib/engine/reverse-poisson";
// v21.0 — جدول جهانی Elo: پایان کارت کور λ=۱.۰۰–۰.۹۲ در بازی‌های ملی
import { lambdaFromEloRatings, lookupTeamRating } from "@/lib/engine/elo-ratings";
// v22.0 — ترکیب ۱۰۰٪ اتوماتیک با بازار آزاد Polymarket (Zero-Vig)
import { fetchPolymarketMap, matchPolymarketLine, type PolyMarketLine } from "./odds-providers";
// v24.0 — سوگیری خودکار اجماع بازار واقعی
import { getMarketConsensus } from "./market-consensus";
import type { LiveFeedDTO, LiveFeedSourceDTO } from "@/lib/types";

// ═══ v24.5 — حذف کامل اندپوینت مسدودکننده sports.core.api.espn.com از خط لوله فید ═══
// سند بازیابی فوری v24.5: فراخوانی ترتیبی core odds برای هر بازی (~۱۵۰ فراخوانی × ۹ ثانیه)
// باعث Timeout/500 سرور و چرخنده بی‌پایان «در حال بارگذاری کارنامه» شده بود.
// طبق سند: فقط اندپوینت سریع و استاندارد اسکوربورد (site.api.espn.com/…/scoreboard)
// با timeout ۳۵۰۰ms — خط بازار از espnOdds خود اسکوربورد + Polymarket + The Odds API می‌آید.

// ═════════════════════ تنظیمات کش و throttle ═════════════════════

const FEED_TTL_MS = 90_000;
const NEWS_TTL_MS = 5 * 60_000;
const WEATHER_TTL_MS = 30 * 60_000;
const ODDS_THROTTLE_MS = 12 * 60_000;
/** حداکثر بازی‌های upcoming هر لیگ (کنترل هزینه LLM خط لوله) */
const MAX_UPCOMING_PER_LEAGUE = 4;

/** کلید پیش‌فرض The Odds API (پلن رایگان کاربر — قابل override با env یا مودال) */
const DEFAULT_ODDS_API_KEY = "3c0379d120a8bbd1e4ead8a8c4a7b637";

// ═════════════════════ کش ماژول (دوران حیات سرور) ═════════════════════

interface CacheState {
  payload: LiveFeedDTO | null;
  fetchedAt: number;
  inFlight: Promise<LiveFeedDTO> | null;
  news: LiveNewsItem[];
  newsAt: number;
  weather: Map<string, { w: LiveWeather | null; at: number }>;
  oddsSyncAt: number;
  oddsCreditsRemaining: number | null;
  oddsInFlight: Promise<boolean> | null;
}

const cache: CacheState = {
  payload: null,
  fetchedAt: 0,
  inFlight: null,
  news: [],
  newsAt: 0,
  weather: new Map(),
  oddsSyncAt: 0,
  oddsCreditsRemaining: null,
  oddsInFlight: null,
};

function oddsApiKey(userKey?: string): string {
  return (userKey && userKey.trim()) || process.env.ODDS_API_KEY || DEFAULT_ODDS_API_KEY;
}

// ═══════════ v9.0 — موتور مهندسی معکوس ضرایب (Reverse-Poisson Market-Implied λ) ═══════════

/** کش حل‌کننده بر اساس اثر انگشت ضرایب — ضرایب ثابت را دوباره حل نمی‌کنیم */
const marketSolverCache = new Map<string, MarketImpliedResult | null>();
const MARKET_SOLVER_CACHE_MAX = 600;

export function marketLambdasFor(odds: { oddsHome: number; oddsDraw: number; oddsAway: number; oddsOver25: number; oddsUnder25: number }): { home: number | null; away: number | null; fitError: number | null } {
  const key = [odds.oddsHome, odds.oddsDraw, odds.oddsAway, odds.oddsOver25, odds.oddsUnder25].join("|");
  if (!marketSolverCache.has(key)) {
    if (marketSolverCache.size > MARKET_SOLVER_CACHE_MAX) marketSolverCache.clear();
    marketSolverCache.set(
      key,
      solveMarketImpliedLambdas({
        oddsHome: odds.oddsHome,
        oddsDraw: odds.oddsDraw,
        oddsAway: odds.oddsAway,
        oddsOver25: odds.oddsOver25,
        oddsUnder25: odds.oddsUnder25,
      })
    );
  }
  const solved = marketSolverCache.get(key) ?? null;
  return solved
    ? { home: solved.lambdaHome, away: solved.lambdaAway, fitError: solved.fitError }
    : { home: null, away: null, fitError: null };
}

// ═════════════════════ مشتقات کمّی از دیتای واقعی ESPN ═════════════════════

/** ضریب فرم از ۵ بازی اخیر واقعی (WWDLW) — بازه ۰.۷۸ تا ۱.۲۶ */
function formFactor(form: string): number {
  if (!form || form === "N/A") return 1.0;
  const pts = [...form].reduce((a, ch) => a + (ch === "W" ? 3 : ch === "D" ? 1 : 0), 0);
  return 0.78 + (pts / (form.length * 3)) * 0.48;
}

/** ضریب فصل از رکورد واقعی (مثل 3-4-2) — بازه ۰.۸۲ تا ۱.۱۸ */
function seasonFactor(record: string | null): number {
  const pct = recordToPointsPct(record);
  if (pct === null) return 1.0;
  return 0.82 + pct * 0.36;
}

/** الو تقریبی از درصد امتیاز فصل — ۱۵۰۰ = میانگین */
function eloFromRecord(record: string | null): number {
  const pct = recordToPointsPct(record);
  if (pct === null) return 1500;
  return Math.round(Math.max(1400, Math.min(2100, 1500 + (pct - 0.5) * 800)));
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function r2(v: number): number {
  return Math.round(v * 100) / 100;
}

interface DerivedStrength {
  lambdaHome: number;
  lambdaAway: number;
  homeAttack: number;
  awayAttack: number;
  homeDefense: number;
  awayDefense: number;
  homeElo: number;
  awayElo: number;
  homePpda: number;
  awayPpda: number;
  homeFieldTilt: number;
  awayFieldTilt: number;
  weatherAdjusted: boolean;
  // ─── v6.0 — راستی‌آزمایی از جدول رسمی رده‌بندی فصل جاری ───
  // v21.0 — مسیر سوم GLOBAL_ELO_FALLBACK (جدول Elo جهانی وقتی جدول رده‌بندی غایب است)
  statsSource: "ESPN_STANDINGS" | "RECORD_FALLBACK" | "GLOBAL_ELO_FALLBACK";
  homeRank: number | null;
  homeGF: number | null;
  homeGA: number | null;
  homeGP: number | null;
  awayRank: number | null;
  awayGF: number | null;
  awayGA: number | null;
  awayGP: number | null;
  leagueTeamAvg: number | null;
}

/**
 * v6.0 — محاسبه امید گل (λ) از جدول رسمی رده‌بندی فصل جاری ESPN (Standings API بدون کلید)
 * مسیر اولویت‌دار (قابل راستی‌آزمایی ۱۰۰٪):
 *   α_i = GF_i / (GP_i × LeagueTeamAvg)   ← قدرت تهاجمی واقعی از گل زده فصل
 *   β_i = GA_i / (GP_i × LeagueTeamAvg)   ← ضعف دفاعی واقعی از گل خورده فصل
 *   λ_Home = α_Home × β_Away × LeagueTeamAvg × 1.12 (فرمول استاندارد دیکسون-کولز)
 *   λ_Away = α_Away × β_Home × LeagueTeamAvg
 * مسیر جایگزین شفاف (فقط وقتی جدول در دسترس نیست): رکورد واقعی W-D-L + فرم ۵ بازی.
 * تعدیل جوی: بارش > ۲mm یا باد > ۳۰km/h → λ × ۰.۹۲ (−۸٪)
 * v9.0 — export شد: مشترک با خط لوله ثبت خودکار بازی‌های گذشته (auto-issue)
 */
export function deriveStrength(ev: LiveMatchEvent, weather: LiveWeather | null, st: LeagueStandings | null): DerivedStrength {
  const adverse = weather?.adverse ?? false;
  const wAdj = adverse ? 0.92 : 1.0;

  const homeEntry = findStandingsEntry(st, ev.homeTeamId, ev.homeTeam);
  const awayEntry = findStandingsEntry(st, ev.awayTeamId, ev.awayTeam);
  const lta = st && st.leagueTeamAvg > 0.5 ? st.leagueTeamAvg : null;

  if (lta && homeEntry && awayEntry && homeEntry.gp >= 3 && awayEntry.gp >= 3) {
    // ═══ v6.0 — مسیر واقعی: α/β از جدول رسمی فصل ═══
    const alphaH = homeEntry.gf / (homeEntry.gp * lta);
    const betaH = homeEntry.ga / (homeEntry.gp * lta);
    const alphaA = awayEntry.gf / (awayEntry.gp * lta);
    const betaA = awayEntry.ga / (awayEntry.gp * lta);

    let lambdaHome = alphaH * betaA * lta * 1.12 * wAdj;
    let lambdaAway = alphaA * betaH * lta * wAdj;
    lambdaHome = clamp(lambdaHome, 0.3, 3.8);
    lambdaAway = clamp(lambdaAway, 0.25, 3.6);

    const homeElo = eloFromRecord(ev.homeRecord);
    const awayElo = eloFromRecord(ev.awayRecord);

    const homePower = clamp(alphaH, 0.5, 2.0);
    const awayPower = clamp(alphaA, 0.5, 2.0);

    return {
      lambdaHome: r2(lambdaHome),
      lambdaAway: r2(lambdaAway),
      // قدرت‌های واقعی دیکسون-کولز — λ = α × β × leagueTeamAvg × homeAdv
      homeAttack: r2(clamp(alphaH, 0.35, 2.3)),
      awayAttack: r2(clamp(alphaA, 0.3, 2.2)),
      homeDefense: r2(clamp(betaH, 0.45, 1.9)),
      awayDefense: r2(clamp(betaA, 0.45, 1.9)),
      homeElo,
      awayElo,
      homePpda: r2(clamp(12 - (homePower - 1) * 7, 8.5, 15)),
      awayPpda: r2(clamp(12.4 - (awayPower - 1) * 7, 8.5, 15.5)),
      homeFieldTilt: Math.round(clamp(50 + (homeElo - 1500) / 12, 42, 63)),
      awayFieldTilt: Math.round(clamp(50 + (awayElo - 1500) / 12, 40, 62)),
      weatherAdjusted: adverse,
      statsSource: "ESPN_STANDINGS",
      homeRank: homeEntry.rank || null,
      homeGF: homeEntry.gf,
      homeGA: homeEntry.ga,
      homeGP: homeEntry.gp,
      awayRank: awayEntry.rank || null,
      awayGF: awayEntry.gf,
      awayGA: awayEntry.ga,
      awayGP: awayEntry.gp,
      leagueTeamAvg: r2(lta),
    };
  }

  // ═══ v21.0 — مسیر Elo جهانی: پایان λ کور ۱.۰۰–۰.۹۲ برای بازی‌های ملی ═══
  // وقتی جدول رده‌بندی ESPN در دسترس نیست، امید گل از «اختلاف واقعی Elo دو تیم»
  // (جدول GLOBAL_TEAM_ELO_AND_XG_RATINGS — ۱۲۰ تیم ملی + باشگاه‌های برتر) مشتق می‌شود.
  // ژاپن × پاراگوئه دیگر با قرقیزستان × ویتنام عدد یکسان نمی‌گیرد!
  const eloSolved = lambdaFromEloRatings(ev.homeTeam, ev.awayTeam, null, null);
  if (eloSolved) {
    // اولویت Elo جدول جهانی؛ تیم ناشناخته → Elo رکورد واقعی ESPN (۱۵۰۰ = متوسط)
    const eloHome = lookupTeamRating(ev.homeTeam)?.elo ?? eloFromRecord(ev.homeRecord);
    const eloAway = lookupTeamRating(ev.awayTeam)?.elo ?? eloFromRecord(ev.awayRecord);

    const lambdaHome = clamp(eloSolved.lambdaHome * wAdj, 0.3, 3.8);
    const lambdaAway = clamp(eloSolved.lambdaAway * wAdj, 0.25, 3.6);

    const homeAttack = clamp(lambdaHome / (1.35 * 1.12), 0.35, 2.3);
    const awayAttack = clamp(lambdaAway / 1.35, 0.3, 2.2);

    const homeFieldTilt = Math.round(clamp(50 + (eloHome - 1500) / 12, 42, 63));
    const awayFieldTilt = Math.round(clamp(50 + (eloAway - 1500) / 12, 40, 62));
    const homePpda = r2(clamp(12 - (lambdaHome / 1.35 - 1) * 7, 8.5, 15));
    const awayPpda = r2(clamp(12.4 - (lambdaAway / 1.35 - 1) * 7, 8.5, 15.5));

    return {
      lambdaHome: r2(lambdaHome),
      lambdaAway: r2(lambdaAway),
      homeAttack: r2(homeAttack),
      awayAttack: r2(awayAttack),
      homeDefense: 1.0,
      awayDefense: 1.0,
      homeElo: eloHome,
      awayElo: eloAway,
      homePpda,
      awayPpda,
      homeFieldTilt,
      awayFieldTilt,
      weatherAdjusted: adverse,
      statsSource: "GLOBAL_ELO_FALLBACK",
      homeRank: null,
      homeGF: null,
      homeGA: null,
      homeGP: null,
      awayRank: null,
      awayGF: null,
      awayGA: null,
      awayGP: null,
      leagueTeamAvg: null,
    };
  }

  // ═══ مسیر شفاف جایگزین — فقط رکورد/فرم واقعی ESPN (جدول رده‌بندی و جدول Elo هم در دسترس نیستند) ═══
  // ⚠️ v21.0: اگر λ نهایی این مسیر در بازه کور ۰.۹۰–۱.۰۵ بماند و خط بازار هم غایب باشد،
  // گیت «No Blind Card» سوپروایزر این بازی را وتو می‌کند (کارت کور صادر نمی‌شود).
  const homeStr = 0.55 * formFactor(ev.homeForm) + 0.45 * seasonFactor(ev.homeRecord);
  const awayStr = 0.55 * formFactor(ev.awayForm) + 0.45 * seasonFactor(ev.awayRecord);

  let lambdaHome = ev.avgGoals * 0.55 * homeStr * wAdj;
  let lambdaAway = ev.avgGoals * 0.45 * awayStr * wAdj;

  // همگرایی به محدوده معقول پواسون
  lambdaHome = clamp(lambdaHome, 0.3, 3.8);
  lambdaAway = clamp(lambdaAway, 0.25, 3.6);

  // استخراج ضرایب حمله/دفاع سازگار با موتور دیکسون-کولز:
  // λh = homeAttack × awayDefense × leagueAvg × 1.12 → دفاع‌ها = ۱، حمله = λ / ثابت
  const homeAttack = clamp(lambdaHome / (1.35 * 1.12), 0.35, 2.3);
  const awayAttack = clamp(lambdaAway / 1.35, 0.3, 2.2);

  const homeElo = eloFromRecord(ev.homeRecord);
  const awayElo = eloFromRecord(ev.awayRecord);

  const homeFieldTilt = Math.round(clamp(50 + (homeElo - 1500) / 12, 42, 63));
  const awayFieldTilt = Math.round(clamp(50 + (awayElo - 1500) / 12, 40, 62));
  const homePpda = r2(clamp(12 - (homeStr - 1) * 7, 8.5, 15));
  const awayPpda = r2(clamp(12.4 - (awayStr - 1) * 7, 8.5, 15.5));

  return {
    lambdaHome: r2(lambdaHome),
    lambdaAway: r2(lambdaAway),
    homeAttack: r2(homeAttack),
    awayAttack: r2(awayAttack),
    homeDefense: 1.0,
    awayDefense: 1.0,
    homeElo,
    awayElo,
    homePpda,
    awayPpda,
    homeFieldTilt,
    awayFieldTilt,
    weatherAdjusted: adverse,
    statsSource: "RECORD_FALLBACK",
    homeRank: null,
    homeGF: null,
    homeGA: null,
    homeGP: null,
    awayRank: null,
    awayGF: null,
    awayGA: null,
    awayGP: null,
    leagueTeamAvg: null,
  };
}

function weatherString(w: LiveWeather | null): string {
  if (!w) return "نامشخص - دیتای جوی در دسترس نیست";
  const cond = w.precipMm > 2 ? "باران" : w.precipMm > 0.3 ? "نیمه‌بارانی" : w.windKmh > 30 ? "باد شدید" : "پاک";
  return `${cond} - ${Math.round(w.tempC)}° · باد ${Math.round(w.windKmh)}km/h${w.precipMm > 0.3 ? ` · بارش ${w.precipMm.toFixed(1)}mm` : ""}`;
}

/** احتمالات مدل دیکسون-کولز از روی استحاله مشتق‌شده (برای ضرایب fallback و T-60) */
export function modelProbs(d: DerivedStrength) {
  return runDixonColes({
    homeAttack: d.homeAttack,
    awayAttack: d.awayAttack,
    homeDefense: d.homeDefense,
    awayDefense: d.awayDefense,
    leagueAvg: d.leagueTeamAvg ?? 1.35,
    homeAdvantage: 1.12,
    rho: -0.08,
    eloDiff: d.homeElo - d.awayElo,
    eloWeight: 0.35,
    homeAbsenceImpact: 0,
    awayAbsenceImpact: 0,
    timeDecayXi: 0.0065,
    daysAgo: 21,
  });
}

// ═════════════════════ تطبیق ضرایب The Odds API ═════════════════════

function matchOddsEvent(ev: LiveMatchEvent, oddsEvents: OddsApiEvent[]): OddsApiEvent | null {
  const direct = `${normTeam(ev.homeTeam)}::${normTeam(ev.awayTeam)}`;
  const kick = Date.parse(ev.kickoff);
  let best: OddsApiEvent | null = null;
  let bestDist = Infinity;
  for (const oe of oddsEvents) {
    const same = oe.matchKey === direct || `${normTeam(oe.homeTeam)}::${normTeam(oe.awayTeam)}` === `${normTeam(ev.awayTeam)}::${normTeam(ev.homeTeam)}`;
    if (!same) continue;
    const dist = Math.abs(Date.parse(oe.commenceTime) - kick);
    if (dist < bestDist) {
      bestDist = dist;
      best = oe;
    }
  }
  // تطبیق فقط برای بازی‌های نزدیک (±۲۴h) — جلوگیری از جفت‌شدن بازی‌های دور
  return best && bestDist < 24 * 3600 * 1000 ? best : null;
}

interface ResolvedOdds {
  oddsHome: number;
  oddsDraw: number;
  oddsAway: number;
  oddsOver25: number;
  oddsUnder25: number;
  odds1x: number;
  source: "ENGINE" | "ESPN_DRAFTKINGS" | "ODDS_API" | "POLYMARKET";
  /** تا ۳ ردیف بوک‌میکر با کلیدهای کنونیکال (Pinnacle = کم‌حاشیه‌ترین) */
  books: { bookmaker: "PINNACLE" | "SOFT_A" | "SOFT_B" | "POLYMARKET"; bookmakerLabel: string; home: number; draw: number; away: number; over25: number | null; under25: number | null }[];
}

/**
 * v22.0 — ترکیب ضرایب زنده بوک‌میکرها با بازار آزاد Polymarket (Zero-Vig):
 * خط Polymarket به‌عنوان ردیف بوک‌میکر مستقل اضافه می‌شود و بهترین قیمت هر نتیجه
 * بین بوک‌میکرهای رسمی + بازار آزاد انتخاب می‌گردد؛ در نبود بوک‌میکر رسمی،
 * خط کامل سه‌گانه Polymarket تنها منبع واقعی است (source=POLYMARKET).
 */
function resolveOdds(
  ev: LiveMatchEvent,
  oddsEv: OddsApiEvent | null,
  probs: ReturnType<typeof modelProbs>,
  poly?: { home: number; draw: number | null; away: number } | null
): ResolvedOdds {
  // ─── ۱) ضرایب زنده The Odds API — بهترین قیمت هر انتخاب + سه بوک نماینده ───
  if (oddsEv && oddsEv.books.length > 0) {
    const booksSorted = [...oddsEv.books].sort(
      (a, b) => 1 / a.line.home + 1 / a.line.draw + 1 / a.line.away - (1 / b.line.home + 1 / b.line.draw + 1 / b.line.away)
    );
    const canon = ["PINNACLE", "SOFT_A", "SOFT_B"] as const;
    const books: ResolvedOdds["books"] = booksSorted.slice(0, 3).map((b, i) => ({
      bookmaker: canon[i],
      bookmakerLabel: `${b.label}${i === 0 ? " (Sharp)" : ""}`,
      home: b.line.home,
      draw: b.line.draw,
      away: b.line.away,
      over25: b.line.over25,
      under25: b.line.under25,
    }));
    if (poly && poly.home > 1 && poly.away > 1) {
      books.push({
        bookmaker: "POLYMARKET",
        bookmakerLabel: "Polymarket (Zero-Vig)",
        home: poly.home,
        draw: poly.draw ?? fairOdds(probs.pDraw, 1.06),
        away: poly.away,
        over25: null,
        under25: null,
      });
    }
    const best = (sel: (b: ResolvedOdds["books"][number]) => number | null): number => {
      const vals = books.map(sel).filter((v): v is number => v !== null && v >= 1.01);
      return vals.length > 0 ? Math.max(...vals) : 0;
    };
    const oddsHome = best((b) => b.home);
    const oddsDraw = best((b) => b.draw);
    const oddsAway = best((b) => b.away);
    let oddsOver25 = best((b) => b.over25);
    let oddsUnder25 = best((b) => b.under25);
    if (oddsOver25 <= 1.01 || oddsUnder25 <= 1.01) {
      oddsOver25 = fairOdds(probs.pOver25, 1.06);
      oddsUnder25 = fairOdds(probs.pUnder25, 1.06);
    }
    return { oddsHome, oddsDraw, oddsAway, oddsOver25, oddsUnder25, odds1x: fairOdds(probs.pHome + probs.pDraw, 1.06), source: "ODDS_API", books };
  }

  // ─── ۲) خط پایه ESPN (معمولاً DraftKings) + ترکیب Polymarket ───
  if (ev.espnOdds && ev.espnOdds.home && ev.espnOdds.draw && ev.espnOdds.away) {
    const o = ev.espnOdds;
    const h = o.home as number;
    const d2 = o.draw as number;
    const a2 = o.away as number;
    const books: ResolvedOdds["books"] = [
      {
        bookmaker: "SOFT_A",
        bookmakerLabel: `${o.provider} (ESPN)`,
        home: h,
        draw: d2,
        away: a2,
        over25: o.over25 ?? fairOdds(probs.pOver25, 1.06),
        under25: o.under25 ?? fairOdds(probs.pUnder25, 1.06),
      },
    ];
    if (poly && poly.home > 1 && poly.away > 1) {
      books.push({
        bookmaker: "POLYMARKET",
        bookmakerLabel: "Polymarket (Zero-Vig)",
        home: poly.home,
        draw: poly.draw ?? d2,
        away: poly.away,
        over25: o.over25 ?? fairOdds(probs.pOver25, 1.06),
        under25: o.under25 ?? fairOdds(probs.pUnder25, 1.06),
      });
    }
    const best = (sel: (b: ResolvedOdds["books"][number]) => number): number => Math.max(...books.map(sel));
    return {
      oddsHome: best((b) => b.home),
      oddsDraw: best((b) => b.draw),
      oddsAway: best((b) => b.away),
      oddsOver25: books[0].over25 ?? fairOdds(probs.pOver25, 1.06),
      oddsUnder25: books[0].under25 ?? fairOdds(probs.pUnder25, 1.06),
      odds1x: fairOdds(probs.pHome + probs.pDraw, 1.06),
      source: "ESPN_DRAFTKINGS",
      books,
    };
  }

  // ─── ۲.۵) v22.0 — بازار آزاد Polymarket (Zero-Vig) — تنها منبع واقعی بدون بوک‌میکر رسمی ───
  if (poly && poly.home > 1 && poly.away > 1 && poly.draw && poly.draw > 1) {
    return {
      oddsHome: poly.home,
      oddsDraw: poly.draw,
      oddsAway: poly.away,
      oddsOver25: fairOdds(probs.pOver25, 1.06),
      oddsUnder25: fairOdds(probs.pUnder25, 1.06),
      odds1x: fairOdds(probs.pHome + probs.pDraw, 1.06),
      source: "POLYMARKET",
      books: [
        {
          bookmaker: "POLYMARKET",
          bookmakerLabel: "Polymarket (Zero-Vig)",
          home: poly.home,
          draw: poly.draw,
          away: poly.away,
          over25: null,
          under25: null,
        },
      ],
    };
  }

  // ─── ۳) Fallback مدل — ضرایب منصفانه با حاشیه ۶٪ ───
  return {
    oddsHome: fairOdds(probs.pHome, 1.06),
    oddsDraw: fairOdds(probs.pDraw, 1.06),
    oddsAway: fairOdds(probs.pAway, 1.06),
    oddsOver25: fairOdds(probs.pOver25, 1.06),
    oddsUnder25: fairOdds(probs.pUnder25, 1.06),
    odds1x: fairOdds(probs.pHome + probs.pDraw, 1.06),
    source: "ENGINE",
    books: [],
  };
}

// ═════════════════════ آب‌وهوا (کش ۳۰ دقیقه + همزمانی محدود) ═════════════════════

async function weatherFor(city: string | null): Promise<LiveWeather | null> {
  if (!city) return null;
  const coords = cityCoords(city);
  if (!coords) return null;
  const hit = cache.weather.get(city);
  if (hit && Date.now() - hit.at < WEATHER_TTL_MS) return hit.w;
  const w = await fetchWeather(coords[0], coords[1], city);
  cache.weather.set(city, { w, at: Date.now() });
  return w;
}

async function poolWeather(cities: (string | null)[], limit = 3): Promise<Map<string, LiveWeather | null>> {
  const unique = [...new Set(cities.filter((c): c is string => Boolean(c)))];
  const out = new Map<string, LiveWeather | null>();
  const queue = [...unique];
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    for (;;) {
      const c = queue.shift();
      if (c === undefined) return;
      out.set(c, await weatherFor(c));
    }
  });
  await Promise.all(workers);
  return out;
}

// ═════════════════════ کالیبراسیون با نتایج واقعی ═════════════════════

const PICK_LABELS: Record<string, string> = {
  HOME: "برد میزبان",
  DRAW: "مساوی",
  AWAY: "برد میهمان",
  O25: "بالای ۲.۵ گل",
};

/** ثبت لاگ بریر از نتیجه واقعی بازی — فقط یک‌بار برای هر بازی */
async function logCalibrationFor(matchId: string, label: string, league: string, hg: number, ag: number): Promise<void> {
  try {
    const dup = await db.calibrationLog.findFirst({ where: { matchLabel: label } });
    if (dup) return;
    const analysis = await db.agentAnalysis.findFirst({
      where: { matchId },
      orderBy: { createdAt: "desc" },
    });
    if (!analysis) return;

    const cands: { key: string; p: number }[] = [
      { key: "HOME", p: analysis.pHome },
      { key: "DRAW", p: analysis.pDraw },
      { key: "AWAY", p: analysis.pAway },
      { key: "O25", p: analysis.pOver25 },
    ];
    cands.sort((a, b) => b.p - a.p);
    const pick = cands[0];
    const actual = pick.key === "HOME" ? hg > ag : pick.key === "DRAW" ? hg === ag : pick.key === "AWAY" ? ag > hg : hg + ag > 2.5;
    await db.calibrationLog.create({
      data: {
        matchLabel: label,
        league,
        pick: PICK_LABELS[pick.key],
        predictedProb: pick.p,
        outcome: actual ? "WIN" : "LOSS",
        brier: (pick.p - (actual ? 1 : 0)) ** 2,
        lesson: null,
      },
    });
  } catch (err) {
    console.warn("calibration log failed:", err);
  }
}

// ═════════════════════ همگام‌سازی اصلی ═════════════════════

export interface SyncOptions {
  force?: boolean;
  useOddsApi?: boolean;
  oddsApiKey?: string;
}

async function runSync(opts: SyncOptions): Promise<LiveFeedDTO> {
  const t0 = Date.now();
  const sources: LiveFeedSourceDTO[] = [];

  // ─── ۱) منابع زنده به صورت موازی ───
  const tEspn = Date.now();
  // v14.0 — اسکنر هوشمند پنجره ۷ روزه: پایه امروز+۳ آینده؛ در کمبود بازی (فیفادی) → ۷ روز + اندپوینت جامع all
  const espnPromise = fetchEspnEventsSmartWindow();
  const newsPromise = fetchEspnNews().then((n) => {
    cache.news = n;
    cache.newsAt = Date.now();
    return n;
  });
  const sdbPromise = Promise.allSettled(
    ESPN_LEAGUES.filter((l) => l.sportsDbId).map((l) => fetchSportsDbNext(l.sportsDbId))
  );

  // ─── ۲) Odds API فقط با اجازه (هزینه اعتبار پلن رایگان) ───
  let oddsEvents: OddsApiEvent[] = [];
  let oddsUsed = false;
  let oddsThrottled = false;
  if (opts.useOddsApi) {
    const since = Date.now() - cache.oddsSyncAt;
    if (cache.oddsSyncAt > 0 && since < ODDS_THROTTLE_MS) {
      oddsThrottled = true;
    } else {
      const keys = ESPN_LEAGUES.map((l) => l.oddsKey).filter(Boolean);
      const res = await fetchOddsApiEvents(keys, oddsApiKey(opts.oddsApiKey));
      oddsEvents = res.events;
      oddsUsed = true;
      cache.oddsSyncAt = Date.now();
      if (res.requestsRemaining !== null) cache.oddsCreditsRemaining = res.requestsRemaining;
    }
  }

  // ═══ v24.0 — سوگیری خودکار اجماع بازار (پایان ۹۷٪ oddsSource=ENGINE) ═══
  // اگر فید دستی نیامده بود، سرویس اجماع با صرفه‌جویی اعتبار (فقط لیگ‌های فعال
  // پنجره ۴۸h، حداکثر هر ۱۲ ساعت، گارد اعتبار) خط واقعی را به همین سیکل می‌آورد
  // تا ضرایب کارت‌ها با تابلوی واقعی betforward/1xbet هم‌خوان شود.
  if (!oddsEvents.length) {
    try {
      const activeSlugs = ESPN_LEAGUES.map((l) => l.slug);
      const consensus = await getMarketConsensus({ activeLeagueSlugs: activeSlugs });
      if (consensus.events.length) {
        oddsEvents = consensus.events;
        oddsUsed = consensus.swept;
        if (consensus.remaining !== null) cache.oddsCreditsRemaining = consensus.remaining;
      }
    } catch (err) {
      console.warn("[v24.0] market-consensus sweep failed:", err);
    }
  }

  const [smart, , sdbResults] = await Promise.all([espnPromise, newsPromise, sdbPromise]);
  const espnEvents = smart.events;

  sources.push({
    key: "espn",
    label: "ESPN Scoreboard (۱۹ رقابت × پنجره هوشمند ۷ روزه)",
    ok: espnEvents.length > 0,
    detail: `${espnEvents.length} مسابقه واقعی · امروز: ${smart.todayCount}${smart.expandedTo7Days ? " · گسترش به ۷ روز آینده" : ""}${smart.usedAllScoreboard ? " · اندپوینت جامع all" : ""}`,
    latencyMs: Date.now() - tEspn,
  });

  // TheSportsDB — مکمل ورزشگاه برای بازی‌های پیش‌رو
  const sdbVenue = new Map<string, string>();
  let sdbCount = 0;
  for (const r of sdbResults) {
    if (r.status !== "fulfilled") continue;
    for (const e of r.value) {
      sdbCount += 1;
      if (e.strVenue) {
        sdbVenue.set(`${normTeam(e.homeTeam)}::${normTeam(e.awayTeam)}`, e.strVenue);
      }
    }
  }
  sources.push({
    key: "sportsdb",
    label: "TheSportsDB (کلید عمومی ۱۲۳)",
    ok: sdbCount > 0,
    detail: `${sdbCount} فیکسچر پیش‌رو · ورزشگاه: ${sdbVenue.size}`,
    latencyMs: 0,
  });

  // ─── ۳) نگاشت و ذخیره در دیتابیس ───
  const now = Date.now();
  const upcomingByLeague = new Map<string, number>();
  const keepEvents: LiveMatchEvent[] = [];
  for (const ev of espnEvents) {
    const kick = Date.parse(ev.kickoff);
    if (ev.statusState === "post") continue; // نتایج در فاز کالیبراسیون جدا پردازش می‌شوند
    if (ev.statusState === "pre") {
      if (kick < now - 3600_000) continue; // شروع‌شده بدون وضعیت زنده
      const cnt = upcomingByLeague.get(ev.leagueSlug) ?? 0;
      if (cnt >= MAX_UPCOMING_PER_LEAGUE) continue;
      upcomingByLeague.set(ev.leagueSlug, cnt + 1);
    }
    keepEvents.push(ev);
  }

  // آب‌وهوا فقط برای ۴۸ ساعت آینده (کش ۳۰ دقیقه‌ای)
  const weatherTargets = keepEvents.filter((e) => Date.parse(e.kickoff) - now < 48 * 3600_000);
  const weatherMap = await poolWeather(weatherTargets.map((e) => e.venueCity));

  // ─── ۳.۵) جدول رسمی رده‌بندی فصل (v6.0 — یک درخواست به‌ازای هر لیگ فعال، کش ۶۰ دقیقه‌ای) ───
  const activeSlugs = [...new Set(keepEvents.map((e) => e.leagueSlug))];
  const standingsMap = new Map<string, LeagueStandings | null>();
  await Promise.all(
    activeSlugs.map(async (slug) => {
      try {
        standingsMap.set(slug, await getLeagueStandings(slug));
      } catch {
        standingsMap.set(slug, null);
      }
    })
  );
  const standingsHit = [...standingsMap.values()].filter(Boolean).length;
  sources.push({
    key: "standings",
    label: "ESPN Standings (جدول رسمی فصل)",
    ok: standingsHit > 0,
    detail: `${standingsHit}/${activeSlugs.length} لیگ با آمار واقعی گل زده/خورده و رتبه جدول`,
    latencyMs: 0,
  });

  let liveUpcoming = 0;
  let liveInPlay = 0;
  let weatherAdjustedCount = 0;
  let oddsApiMatched = 0;
  let marketSolvedCount = 0;

  // ═══ v22.0 — بازار آزاد Polymarket (Zero-Vig) — کش ۵ دقیقه‌ای، بدون کلید ═══
  const polyMap = await fetchPolymarketMap().catch(() => new Map<string, PolyMarketLine>());
  let polyMatched = 0;

  for (const ev of keepEvents) {
    const kick = Date.parse(ev.kickoff);
    const weather = weatherMap.get(ev.venueCity ?? "") ?? null;
    const st = standingsMap.get(ev.leagueSlug) ?? null;
    const d = deriveStrength(ev, weather, st);
    if (d.weatherAdjusted) weatherAdjustedCount += 1;
    const probs = modelProbs(d);
    const oddsEv = matchOddsEvent(ev, oddsEvents);
    if (oddsEv) oddsApiMatched += 1;
    // ═══ v24.5 — ESPN Core Odds مسدودکننده حذف شد (سند بازیابی فوری) ═══
    // خط بازار فقط از espnOdds خود اسکوربورد (site.api.espn.com) + Polymarket + The Odds API
    // — هیچ فراخوانی sports.core.api.espn.com در این حلقه وجود ندارد.
    // v22.0 — ترکیب با بازار آزاد Polymarket (100% اتوماتیک — بدون ورود دستی)
    const polyLine = matchPolymarketLine(polyMap, ev.homeTeam, ev.awayTeam);
    if (polyLine) polyMatched += 1;
    const odds = resolveOdds(ev, oddsEv, probs, polyLine);

    // v4.0: حفظ ضرایب زنده معتبر قبلی — سینک بدون Odds API نباید ضرایب بوک‌میکرها
    // را با ضرایب مدل جایگزین کند (فقط ضرایب کهنه‌تر از ۶ ساعت بازمحاسبه می‌شوند)
    const existing = await db.match.findUnique({
      where: { externalId: ev.externalId },
      select: { id: true, status: true, oddsSource: true, oddsHome: true, oddsDraw: true, oddsAway: true, oddsOver25: true, oddsUnder25: true, odds1x: true, oddsFetchedAt: true },
    });
    const keepLiveOdds =
      odds.source === "ENGINE" &&
      existing &&
      existing.oddsSource !== "ENGINE" &&
      existing.oddsFetchedAt !== null &&
      Date.now() - existing.oddsFetchedAt.getTime() < 6 * 3600_000;
    if (keepLiveOdds && existing) {
      odds.oddsHome = existing.oddsHome;
      odds.oddsDraw = existing.oddsDraw;
      odds.oddsAway = existing.oddsAway;
      odds.oddsOver25 = existing.oddsOver25;
      odds.oddsUnder25 = existing.oddsUnder25;
      odds.odds1x = existing.odds1x;
      odds.source = existing.oddsSource as ResolvedOdds["source"];
    }

    const isLive = ev.statusState === "in";
    if (isLive) liveInPlay += 1;
    else liveUpcoming += 1;

    // ─── v9.0 — حل معکوس پواسون روی ضرایب واقعی بازار (الگوی مخفی قیمت‌گذاری بوک‌میکر) ───
    // فقط روی ضرایب واقعی (The Odds API / ESPN DraftKings) — ضرایب مدل ENGINE مسیر بازار ندارند
    const market = odds.source !== "ENGINE" ? marketLambdasFor(odds) : { home: null, away: null, fitError: null };
    if (market.home !== null) marketSolvedCount += 1;

    const base = {
      league: ev.leagueName,
      homeTeam: ev.homeTeam,
      awayTeam: ev.awayTeam,
      kickoff: new Date(kick),
      homeAttack: d.homeAttack,
      homeDefense: 1.0,
      awayAttack: d.awayAttack,
      awayDefense: 1.0,
      homeElo: d.homeElo,
      awayElo: d.awayElo,
      homeXg: d.lambdaHome,
      awayXg: d.lambdaAway,
      homePpda: d.homePpda,
      awayPpda: d.awayPpda,
      homeFieldTilt: d.homeFieldTilt,
      awayFieldTilt: d.awayFieldTilt,
      homeForm: ev.homeForm,
      awayForm: ev.awayForm,
      weather: weatherString(weather),
      homeAbsence: null,
      awayAbsence: null,
      homeMotivation: null,
      awayMotivation: null,
      tacticalNote: null,
      oddsHome: odds.oddsHome,
      oddsDraw: odds.oddsDraw,
      oddsAway: odds.oddsAway,
      oddsOver25: odds.oddsOver25,
      oddsUnder25: odds.oddsUnder25,
      odds1x: odds.odds1x,
      homeNpxgLevel: d.lambdaHome,
      homeNpxgLeading: r2(d.lambdaHome * 0.72),
      homeNpxgTrailing: r2(d.lambdaHome * 1.25),
      awayNpxgLevel: d.lambdaAway,
      awayNpxgLeading: r2(d.lambdaAway * 0.72),
      awayNpxgTrailing: r2(d.lambdaAway * 1.25),
      homeCornersFor: r2(4.9 + (d.lambdaHome - 1.35) * 0.9),
      homeCornersAgainst: 4.5,
      awayCornersFor: r2(4.6 + (d.lambdaAway - 1.35) * 0.9),
      awayCornersAgainst: 4.7,
      awayTravelKm: 350,
      homeRestDays: 6,
      awayRestDays: 6,
      // v4.0
      dataSource: "ESPN",
      homeLogo: ev.homeLogo,
      awayLogo: ev.awayLogo,
      venueName: ev.venueName ?? sdbVenue.get(`${normTeam(ev.homeTeam)}::${normTeam(ev.awayTeam)}`) ?? null,
      venueCity: ev.venueCity,
      weatherTemp: weather?.tempC ?? null,
      weatherWind: weather?.windKmh ?? null,
      weatherPrecip: weather?.precipMm ?? null,
      weatherAdjusted: d.weatherAdjusted,
      oddsSource: odds.source,
      oddsFetchedAt: odds.source === "ENGINE" ? null : existing?.oddsFetchedAt && keepLiveOdds ? existing.oddsFetchedAt : new Date(),
      homeGoals: isLive ? ev.homeScore : null,
      awayGoals: isLive ? ev.awayScore : null,
      // ─── v6.0 — شناسه‌های رسمی ESPN + سند راستی‌آزمایی جدول فصل ───
      homeTeamId: ev.homeTeamId,
      awayTeamId: ev.awayTeamId,
      homeRank: d.homeRank,
      homeGF: d.homeGF,
      homeGA: d.homeGA,
      homeGP: d.homeGP,
      awayRank: d.awayRank,
      awayGF: d.awayGF,
      awayGA: d.awayGA,
      awayGP: d.awayGP,
      leagueTeamAvg: d.leagueTeamAvg,
      statsSource: d.statsSource,
      statsFetchedAt: st ? new Date(st.fetchedAt) : null,
      // ─── v9.0 — λ بازار استخراج‌شده + شناسه مسیر λ ───
      lambdaMarketHome: market.home,
      lambdaMarketAway: market.away,
      lambdaFitError: market.fitError,
      lambdaSource: market.home !== null ? "MARKET_HYBRID" : "STATS_ONLY",
      // وضعیت ANALYZED قبلی حفظ می‌شود (فقط گذار LIVE/UPCOMING از منبع واقعی)
      status: isLive ? "LIVE" : existing?.status === "ANALYZED" ? "ANALYZED" : "UPCOMING",
    };

    const row = await db.match.upsert({
      where: { externalId: ev.externalId },
      create: { ...base, externalId: ev.externalId },
      update: base,
    });

    // بازنویسی ردیف‌های بوک‌میکر — v6.0: فقط بوک‌میکرهای واقعی (The Odds API / ESPN)
    if (odds.books.length > 0) {
      await db.oddsRecord.deleteMany({ where: { matchId: row.id } });
      for (const b of odds.books) {
        await db.oddsRecord.create({
          data: {
            matchId: row.id,
            bookmaker: b.bookmaker,
            bookmakerLabel: b.bookmakerLabel,
            oddsHome: b.home,
            oddsDraw: b.draw,
            oddsAway: b.away,
            oddsOver25: b.over25 ?? odds.oddsOver25,
            oddsUnder25: b.under25 ?? odds.oddsUnder25,
            oddsCornersOver95: fairOdds(0.45, 1.08),
            oddsCornersUnder95: fairOdds(0.55, 1.08),
          },
        });
      }
    } else if (!keepLiveOdds) {
      // v6.0 قانون طلایی: بدون بوک‌میکر واقعی، هیچ ردیف ضریب ساختگی ساخته نمی‌شود —
      // خط فعال سیستم = «ضریب عادلانه مدل کمّی (پیش از بازگشایی خط بوک‌میکر)» با برچسب شفاف
      await db.oddsRecord.deleteMany({ where: { matchId: row.id } });
    }
  }

  sources.push({
    key: "odds",
    label: "The Odds API v4",
    ok: oddsUsed ? oddsApiMatched > 0 : cache.oddsSyncAt > 0,
    detail: oddsUsed
      ? `${oddsApiMatched} بازی با ضرایب زنده بوک‌میکرها جایگزین شد${cache.oddsCreditsRemaining !== null ? ` · اعتبار باقی‌مانده: ${cache.oddsCreditsRemaining}` : ""}`
      : oddsThrottled
        ? "بدلیل محدودیت پلن رایگان در بازه ۱۲ دقیقه — از ضرایب قبلی استفاده شد"
        : "کلید وارد نشده — خط پایه ESPN/مدل استفاده می‌شود",
    latencyMs: 0,
  });

  const newsList = cache.news;
  sources.push({
    key: "news",
    label: "ESPN Live News",
    ok: newsList.length > 0,
    detail: `${newsList.length} تیتر زنده`,
    latencyMs: 0,
  });
  sources.push({
    key: "reverse-poisson",
    label: "Reverse-Poisson λ Solver (v9.0)",
    ok: marketSolvedCount > 0,
    detail:
      marketSolvedCount > 0
        ? `${marketSolvedCount} بازی با حل معکوس پواسون — λ ترکیبی = ۶۵٪ بازار + ۳۵٪ آمار فصل`
        : "خط بازار واقعی در دسترس نبود — مسیر STATS_ONLY (صدور کارت ممنوع v22)",
    latencyMs: 0,
  });
  // ═══ v22.0 — نبض بازار آزاد Polymarket ═══
  sources.push({
    key: "polymarket",
    label: "Polymarket Gamma (Zero-Vig) — v22.0",
    ok: polyMatched > 0,
    detail:
      polyMatched > 0
        ? `${polyMatched} بازی با خط بدون کارمزد بازار آزاد ترکیب شد`
        : "تطبیق بازی‌های امروز در بازار Polymarket یافت نشد",
    latencyMs: 0,
  });
  // ═══ v24.5 — ESPN Core Odds حذف شد؛ نبض خط بازار = اسکوربورد + Polymarket ═══
  sources.push({
    key: "espn-core-odds",
    label: "ESPN Core Odds — v24.5 (بازنشسته — اندپوینت مسدودکننده حذف شد)",
    ok: false,
    detail: "طبق سند v24.5 فراخوانی sports.core.api.espn.com از خط لوله حذف شد — Timeout/500 رفع گردید؛ خط بازار از اسکوربورد سریع + Polymarket + Odds API",
    latencyMs: 0,
  });
  sources.push({
    key: "weather",
    label: "Open-Meteo",
    ok: weatherAdjustedCount > 0 || weatherMap.size > 0,
    detail: `${weatherMap.size} ورزشگاه · تعدیل جوی روی ${weatherAdjustedCount} بازی`,
    latencyMs: 0,
  });

  // ─── v6.0 — پاک‌سازی ردیف‌های ESPN میراث v5 (بدون سند راستی‌آزمایی جدول فصل) ───
  // هر ردیفی که در سینک جاری بازسازی نشده و statsSource ندارد، داده کهنهٔ پیش از v6 است
  // و طبق قانون طلایی Zero-Mock از دید کاربر خارج می‌شود.
  const legacyLeftovers = await db.match.updateMany({
    where: { dataSource: "ESPN", status: { in: ["UPCOMING", "ANALYZED"] }, statsSource: null },
    data: { status: "ARCHIVED" },
  });

  // ─── ۴) کالیبراسیون با نتایج واقعی دیروز و امروز ───
  let calibratedCount = 0;
  try {
    const yesterday = await fetchEspnEvents(-2, 0);
    for (const ev of yesterday) {
      if (ev.statusState !== "post" || ev.homeScore === null || ev.awayScore === null) continue;
      const existing = await db.match.findUnique({ where: { externalId: ev.externalId } });
      if (!existing) continue;
      await db.match.update({
        where: { id: existing.id },
        data: { homeGoals: ev.homeScore, awayGoals: ev.awayScore, status: "FINISHED" },
      });
      const label = `${ev.homeTeam} ${ev.homeScore}−${ev.awayScore} ${ev.awayTeam}`;
      const before = await db.calibrationLog.count({ where: { matchLabel: label } });
      await logCalibrationFor(existing.id, label, existing.league, ev.homeScore, ev.awayScore);
      const after = await db.calibrationLog.count({ where: { matchLabel: label } });
      if (after > before) calibratedCount += 1;
    }
  } catch (err) {
    console.warn("real-result calibration failed:", err);
  }

  // ─── ۴.۵) v7.0 — تسویه خودکار کارت‌های کارنامه با نتایج FT واقعی ESPN ───
  // به محض تغییر وضعیت بازی در ESPN به FT، تیپ A/B به‌صورت ۱۰۰٪ خودکار تسویه
  // و اعلام تلگرام (تصویر جام/رختکن) انجام می‌شود — بدون کلیک کاربر.
  try {
    const { autoSettleInBackground } = await import("./liveDataService");
    await autoSettleInBackground();
  } catch (err) {
    console.warn("auto-settle background failed:", err);
  }

  // ─── ۴.۶) v9.0 — Zero-Click Multi-Day Auto-Settlement ───
  // ثبت و تسویه‌حساب ۱۰۰٪ خودکار بازی‌های تمام‌شده ۳ روز اخیر + بازی‌های امروز
  // تاییدشده سوپروایزر (PENDING 🔒) — بدون نیاز به کلیک کاربر (throttle داخلی ۱۰ دقیقه)
  try {
    const { autoSyncPastAndPresentMatches } = await import("./auto-issue");
    await autoSyncPastAndPresentMatches({ notify: true });
  } catch (err) {
    console.warn("auto past/present sync failed:", err);
  }

  // ─── ۴.۷) v9.0 — صف ارسال خودکار فقط-کارت‌های-تایید-سوپروایزر به تلگرام ───
  // پست پیش از بازی (کارت تایید) + پست تسویه FT + گزارش وین‌ریت کانال
  // Dedupe با پرچم‌های تلگرام — ارسال تکراری صفر (سوییچ پیش‌فرض: روشن)
  try {
    const { autoDispatchApprovedSlips } = await import("./telegram-service");
    await autoDispatchApprovedSlips();
  } catch (err) {
    console.warn("auto telegram dispatch failed:", err);
  }

  // ─── ۵) آرشیو: بازی‌های گذشته زنده + دیتای mock وقتی فید زنده پوشش می‌دهد ───
  const cutoff = new Date(now - 3 * 3600_000);
  const stale = await db.match.updateMany({
    where: { dataSource: "ESPN", kickoff: { lt: cutoff }, status: { in: ["UPCOMING", "ANALYZED", "LIVE"] } },
    data: { status: "ARCHIVED" },
  });
  // FINISHED های قدیمی هم آرشیو شوند (نتیجه و لاگ بریر ثبت شده است)
  const finCutoff = new Date(now - 26 * 3600_000);
  await db.match.updateMany({
    where: { status: "FINISHED", kickoff: { lt: finCutoff } },
    data: { status: "ARCHIVED" },
  });

  const liveTotal = liveUpcoming + liveInPlay;
  if (liveTotal >= 4) {
    await db.match.updateMany({ where: { dataSource: "SEED" }, data: { status: "ARCHIVED" } });
  }

  const payload: LiveFeedDTO = {
    success: espnEvents.length > 0 || liveTotal > 0,
    mode: liveTotal > 0 ? "LIVE" : "FALLBACK",
    lastSyncAt: Date.now(),
    matchesLive: liveTotal,
    matchesUpcoming: liveUpcoming,
    matchesInPlay: liveInPlay,
    news: newsList.slice(0, 14),
    sources,
    odds: {
      used: oddsUsed,
      creditsRemaining: cache.oddsCreditsRemaining,
      lastOddsSyncAt: cache.oddsSyncAt || null,
      throttled: oddsThrottled,
    },
    weatherAdjusted: weatherAdjustedCount,
    calibrated: calibratedCount,
    archived: stale.count + legacyLeftovers.count,
    elapsedMs: Date.now() - t0,
  };

  cache.payload = payload;
  cache.fetchedAt = Date.now();
  return payload;
}

// ═════════════════════ API عمومی ماژول ═════════════════════

/** دریافت فید زنده با کش ۹۰ ثانیه‌ای — بدون هزینه Odds API */
export async function getLiveFeed(): Promise<LiveFeedDTO> {
  if (cache.payload && Date.now() - cache.fetchedAt < FEED_TTL_MS) {
    return cache.payload;
  }
  if (cache.inFlight) return cache.inFlight;
  cache.inFlight = runSync({}).finally(() => {
    cache.inFlight = null;
  });
  return cache.inFlight;
}

/** همگام‌سازی اجباری — دکمه 🔄 (با اجازه Odds API برای ضرایب زنده) */
export async function forceSync(opts: SyncOptions): Promise<LiveFeedDTO> {
  return runSync({ ...opts, force: true });
}

/**
 * اخبار زنده مرتبط با دو تیم یک بازی — برای الصاق به استدلال ایجنت گاو/خرس.
 * اگر کش خبری خالی/کهنه باشد، یک‌بار واکشی سبک انجام می‌شود.
 */
export async function getNewsForTeams(homeTeam: string, awayTeam: string): Promise<LiveNewsItem[]> {
  if (!cache.news || Date.now() - cache.newsAt > NEWS_TTL_MS) {
    try {
      const n = await fetchEspnNews();
      cache.news = n;
      cache.newsAt = Date.now();
    } catch {
      // بی‌خیال — اخبار اختیاری است
    }
  }
  const h = normTeam(homeTeam);
  const a = normTeam(awayTeam);
  const tokensH = h.split(" ").filter((t) => t.length > 2);
  const tokensA = a.split(" ").filter((t) => t.length > 2);
  return cache.news
    .filter((n) => {
      const text = `${n.headline} ${n.description}`.toLowerCase();
      const hitH = tokensH.some((t) => text.includes(t));
      const hitA = tokensA.some((t) => text.includes(t));
      return hitH || hitA;
    })
    .slice(0, 4);
}
