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
import { runDixonColes, fairOdds } from "@/lib/engine/poisson";
import type { LiveFeedDTO, LiveFeedSourceDTO } from "@/lib/types";


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
  homeElo: number;
  awayElo: number;
  homePpda: number;
  awayPpda: number;
  homeFieldTilt: number;
  awayFieldTilt: number;
  weatherAdjusted: boolean;
}

/**
 * محاسبه امید گل (λ) از فرم + رکورد فصل واقعی دو تیم و اعمال تعدیل جوی
 * λ_base = avgGoals × سهم میزبانی/میهمانی × قدرت نسبی (فرم ۵۵٪ + فصل ۴۵٪)
 * تعدیل جوی: بارش > ۲mm یا باد > ۳۰km/h → λ × ۰.۹۲ (−۸٪)
 */
function deriveStrength(ev: LiveMatchEvent, weather: LiveWeather | null): DerivedStrength {
  const homeStr = 0.55 * formFactor(ev.homeForm) + 0.45 * seasonFactor(ev.homeRecord);
  const awayStr = 0.55 * formFactor(ev.awayForm) + 0.45 * seasonFactor(ev.awayRecord);

  const adverse = weather?.adverse ?? false;
  const wAdj = adverse ? 0.92 : 1.0;

  let lambdaHome = ev.avgGoals * 0.55 * homeStr * wAdj;
  let lambdaAway = ev.avgGoals * 0.45 * awayStr * wAdj;

  // همگرایی به محدوده معقول پواسون
  lambdaHome = clamp(lambdaHome, 0.3, 3.8);
  lambdaAway = clamp(lambdaAway, 0.25, 3.6);

  // استخراج ضرایب حمله/دفاع سازگار با موتور دیکسون-کولز:
  // λh = homeAttack × awayDefense × 1.35 × 1.12 → دفاع‌ها = ۱، حمله = λ / ثابت
  const homeAttack = clamp(lambdaHome / (1.35 * 1.12), 0.35, 2.3);
  const awayAttack = clamp(lambdaAway / 1.35, 0.3, 2.2);

  const homeElo = eloFromRecord(ev.homeRecord);
  const awayElo = eloFromRecord(ev.awayRecord);

  const homeFieldTilt = Math.round(clamp(50 + (homeElo - 1500) / 12, 42, 63));
  const awayFieldTilt = Math.round(clamp(50 + (awayElo - 1500) / 12, 40, 62));
  const homePpda = r2(clamp(12 - (homeStr - 1) * 7, 8.5, 15));
  const awayPpda = r2(clamp(12.4 - (awayStr - 1) * 7, 8.5, 15.5));

  return { lambdaHome: r2(lambdaHome), lambdaAway: r2(lambdaAway), homeAttack: r2(homeAttack), awayAttack: r2(awayAttack), homeElo, awayElo, homePpda, awayPpda, homeFieldTilt, awayFieldTilt, weatherAdjusted: adverse };
}

function weatherString(w: LiveWeather | null): string {
  if (!w) return "نامشخص - دیتای جوی در دسترس نیست";
  const cond = w.precipMm > 2 ? "باران" : w.precipMm > 0.3 ? "نیمه‌بارانی" : w.windKmh > 30 ? "باد شدید" : "پاک";
  return `${cond} - ${Math.round(w.tempC)}° · باد ${Math.round(w.windKmh)}km/h${w.precipMm > 0.3 ? ` · بارش ${w.precipMm.toFixed(1)}mm` : ""}`;
}

/** احتمالات مدل دیکسون-کولز از روی استحاله مشتق‌شده (برای ضرایب fallback و T-60) */
function modelProbs(d: DerivedStrength) {
  return runDixonColes({
    homeAttack: d.homeAttack,
    awayAttack: d.awayAttack,
    homeDefense: 1.0,
    awayDefense: 1.0,
    leagueAvg: 1.35,
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
  source: "ENGINE" | "ESPN_DRAFTKINGS" | "ODDS_API";
  /** تا ۳ ردیف بوک‌میکر با کلیدهای کنونیکال (Pinnacle = کم‌حاشیه‌ترین) */
  books: { bookmaker: "PINNACLE" | "SOFT_A" | "SOFT_B"; bookmakerLabel: string; home: number; draw: number; away: number; over25: number | null; under25: number | null }[];
}

function resolveOdds(ev: LiveMatchEvent, oddsEv: OddsApiEvent | null, probs: ReturnType<typeof modelProbs>): ResolvedOdds {
  // ─── ۱) ضرایب زنده The Odds API — بهترین قیمت هر انتخاب + سه بوک نماینده ───
  if (oddsEv && oddsEv.books.length > 0) {
    const booksSorted = [...oddsEv.books].sort(
      (a, b) => 1 / a.line.home + 1 / a.line.draw + 1 / a.line.away - (1 / b.line.home + 1 / b.line.draw + 1 / b.line.away)
    );
    const canon = ["PINNACLE", "SOFT_A", "SOFT_B"] as const;
    const books = booksSorted.slice(0, 3).map((b, i) => ({
      bookmaker: canon[i],
      bookmakerLabel: `${b.label}${i === 0 ? " (Sharp)" : ""}`,
      home: b.line.home,
      draw: b.line.draw,
      away: b.line.away,
      over25: b.line.over25,
      under25: b.line.under25,
    }));
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

  // ─── ۲) خط پایه ESPN (معمولاً DraftKings) ───
  if (ev.espnOdds && ev.espnOdds.home && ev.espnOdds.draw && ev.espnOdds.away) {
    const o = ev.espnOdds;
    return {
      oddsHome: o.home,
      oddsDraw: o.draw,
      oddsAway: o.away,
      oddsOver25: o.over25 ?? fairOdds(probs.pOver25, 1.06),
      oddsUnder25: o.under25 ?? fairOdds(probs.pUnder25, 1.06),
      odds1x: fairOdds(probs.pHome + probs.pDraw, 1.06),
      source: "ESPN_DRAFTKINGS",
      books: [
        {
          bookmaker: "SOFT_A",
          bookmakerLabel: `${o.provider} (ESPN)`,
          home: o.home,
          draw: o.draw,
          away: o.away,
          over25: o.over25,
          under25: o.under25,
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
  const espnPromise = fetchEspnEvents(0, 7);
  const newsPromise = fetchEspnNews().then((n) => {
    cache.news = n;
    cache.newsAt = Date.now();
    return n;
  });
  const sdbPromise = Promise.allSettled(ESPN_LEAGUES.map((l) => fetchSportsDbNext(l.sportsDbId)));

  // ─── ۲) Odds API فقط با اجازه (هزینه اعتبار پلن رایگان) ───
  let oddsEvents: OddsApiEvent[] = [];
  let oddsUsed = false;
  let oddsThrottled = false;
  if (opts.useOddsApi) {
    const since = Date.now() - cache.oddsSyncAt;
    if (cache.oddsSyncAt > 0 && since < ODDS_THROTTLE_MS) {
      oddsThrottled = true;
    } else {
      const keys = ESPN_LEAGUES.map((l) => l.oddsKey);
      const res = await fetchOddsApiEvents(keys, oddsApiKey(opts.oddsApiKey));
      oddsEvents = res.events;
      oddsUsed = true;
      cache.oddsSyncAt = Date.now();
      if (res.requestsRemaining !== null) cache.oddsCreditsRemaining = res.requestsRemaining;
    }
  }

  const [espnEvents, , sdbResults] = await Promise.all([espnPromise, newsPromise, sdbPromise]);

  sources.push({
    key: "espn",
    label: "ESPN Scoreboard (۶ لیگ × ۸ روز)",
    ok: espnEvents.length > 0,
    detail: `${espnEvents.length} مسابقه واقعی استخراج شد`,
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

  let liveUpcoming = 0;
  let liveInPlay = 0;
  let weatherAdjustedCount = 0;
  let oddsApiMatched = 0;

  for (const ev of keepEvents) {
    const kick = Date.parse(ev.kickoff);
    const weather = weatherMap.get(ev.venueCity ?? "") ?? null;
    const d = deriveStrength(ev, weather);
    if (d.weatherAdjusted) weatherAdjustedCount += 1;
    const probs = modelProbs(d);
    const oddsEv = matchOddsEvent(ev, oddsEvents);
    if (oddsEv) oddsApiMatched += 1;
    const odds = resolveOdds(ev, oddsEv, probs);

    // v4.0: حفظ ضرایب زنده معتبر قبلی — سینک بدون Odds API نباید ضرایب بوک‌میکرها
    // را با ضرایب مدل جایگزین کند (فقط ضرایب کهنه‌تر از ۶ ساعت بازمحاسبه می‌شوند)
    const existing = await db.match.findUnique({
      where: { externalId: ev.externalId },
      select: { id: true, oddsSource: true, oddsHome: true, oddsDraw: true, oddsAway: true, oddsOver25: true, oddsUnder25: true, odds1x: true, oddsFetchedAt: true },
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
      // وضعیت ANALYZED قبلی حفظ می‌شود (فقط گذار LIVE/UPCOMING از منبع واقعی)
      status: isLive ? "LIVE" : existing?.status === "ANALYZED" ? "ANALYZED" : "UPCOMING",
    };

    const row = await db.match.upsert({
      where: { externalId: ev.externalId },
      create: { ...base, externalId: ev.externalId },
      update: base,
    });

    // بازنویسی ردیف‌های بوک‌میکر (فقط وقتی دیتای واقعی داریم؛ با حفظی‌ها دست نمی‌زنیم)
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
    } else if (!keepLiveOdds && (await db.oddsRecord.count({ where: { matchId: row.id } })) === 0) {
      // بدون دیتای زنده → ردیف نماینده از خط نهایی
      await db.oddsRecord.create({
        data: {
          matchId: row.id,
          bookmaker: "SOFT_A",
          bookmakerLabel: odds.source === "ESPN_DRAFTKINGS" ? "خط ESPN" : "مدل داخلی",
          oddsHome: odds.oddsHome,
          oddsDraw: odds.oddsDraw,
          oddsAway: odds.oddsAway,
          oddsOver25: odds.oddsOver25,
          oddsUnder25: odds.oddsUnder25,
          oddsCornersOver95: fairOdds(0.45, 1.08),
          oddsCornersUnder95: fairOdds(0.55, 1.08),
        },
      });
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
    key: "weather",
    label: "Open-Meteo",
    ok: weatherAdjustedCount > 0 || weatherMap.size > 0,
    detail: `${weatherMap.size} ورزشگاه · تعدیل جوی روی ${weatherAdjustedCount} بازی`,
    latencyMs: 0,
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
    archived: stale.count,
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
