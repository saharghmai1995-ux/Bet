// ─────────────────────────────────────────────────────────────────────────────
// ردیاب رویدادهای زنده واقعی (Real In-Play Event Detector) — v6.1
//
// صفر شبیه‌سازی، صفر تاس‌ریزی (hash-roll حذف شد):
//   ۱) گل‌های واقعی  ← اختلاف امتیاز اسکوربورد ESPN بین دو پول متوالی
//   ۲) کارت قرمز واقعی ← keyEvents خلاصه ESPN (type «Red Card») با diff شناسه رخداد
//   ۳) دقیقه واقعی    ← displayClock رسمی ESPN (مثل 45'+2')
//   ۴) نتیجه واقعی    ← امتیاز لحظه‌ای ESPN برای محاسبه λ باقیمانده در وضعیت واقعی بازی
//
// محافظت‌ها:
//   · Snapshot پایه در اولین پول ثبت می‌شود (بدون آتش!) تا گل‌های قبل از مانیتورینگ توست نشوند
//   · کش TTL ۳۰ ثانیه‌ای + dedupe in-flight (چند کلاینت ← یک پول مشترک)
//   · خلاصه ESPN برای کارت قرمز فقط برای بازی‌های In-Play و حداکثر هر ۷۵ ثانیه
//   · نگاشت به رکورد دیتابیس با externalIdESPN و fallback نام نرمال‌شده تیم‌ها
// ─────────────────────────────────────────────────────────────────────────────

import { db } from "@/lib/db";
import { ESPN_LEAGUES, fetchEspnScoreboardDay, normTeam } from "./live-sources";

export type LiveEventType = "GOAL_HOME" | "GOAL_AWAY" | "RED_HOME" | "RED_AWAY";

export interface LiveDetectedEvent {
  eventId: string; // کلید پایدار برای dedupe کلاینت
  type: LiveEventType;
  externalId: string; // espn-<slug>-<id>
  dbMatchId: string | null; // رکورد Match دیتابیس (اگر نگاشت شد)
  leagueSlug: string;
  leagueName: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number; // نتیجه واقعی لحظه‌ای (بعد از رویداد)
  awayScore: number;
  minute: number; // دقیقه عددی واقعی از ساعت ESPN
  clock: string; // ساعت خام ESPN مثل «45'+2'»
  detectedAt: number; // epoch ms
}

export interface LiveMatchState {
  externalId: string;
  dbMatchId: string | null;
  leagueSlug: string;
  leagueName: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  clock: string;
  minute: number;
  statusDetail: string;
}

export interface LiveDetectResult {
  success: true;
  mode: "REAL_ESPN";
  events: LiveDetectedEvent[]; // رویدادهای ۸ دقیقه اخیر (کلاینت با eventId dedupe می‌کند)
  liveMatches: LiveMatchState[];
  checkedAt: number;
}

// ═════════════════════ کش ماژول (دوران حیات سرور) ═════════════════════

const DETECT_TTL_MS = 30_000; // پول اسکوربورد حداکثر هر ۳۰ ثانیه
const SUMMARY_TTL_MS = 75_000; // پول خلاصه (کارت قرمز) حداکثر هر ۷۵ ثانیه برای هر بازی
const EVENT_WINDOW_MS = 8 * 60_000; // رویدادهای ۸ دقیقه اخیر نگه داشته می‌شوند
const SCOREBOARD_OFFSETS = [-1, 0]; // دیروز + امروز (بازی‌های نیمه‌شب عبورکننده از روز UTC)

interface DetectorState {
  booted: boolean;
  bootAt: number;
  snapshot: Map<string, { home: number; away: number }>;
  redSeen: Map<string, Set<string>>;
  redBaselined: Set<string>;
  summaryAt: Map<string, number>;
  events: LiveDetectedEvent[];
  result: LiveDetectResult | null;
  pollAt: number;
  inFlight: Promise<LiveDetectResult> | null;
}

const state: DetectorState = {
  booted: false,
  bootAt: 0,
  snapshot: new Map(),
  redSeen: new Map(),
  redBaselined: new Set(),
  summaryAt: new Map(),
  events: [],
  result: null,
  pollAt: 0,
  inFlight: null,
};

// کش سبک نگاشت تیم‌ها ← رکورد DB (۵ دقیقه)
let dbMatchesCache: { at: number; rows: { id: string; externalId: string | null; homeTeam: string; awayTeam: string; kickoff: Date }[] } | null = null;

// ═════════════════════ ابزار ═════════════════════

/** دقیقه واقعی از ساعت رسمی ESPN («45'+2'» → ۴۷، «23'» → ۲۳) */
function parseMinute(displayClock: string | undefined, period: number | undefined): number {
  const fallback = Math.min(90, Math.max(1, ((period ?? 1) - 1) * 45 + 1));
  if (!displayClock) return fallback;
  const m = displayClock.match(/(\d+)'(?:\s*\+(\d+)')?/);
  if (!m) return fallback;
  const base = parseInt(m[1], 10);
  const extra = m[2] ? parseInt(m[2], 10) : 0;
  return Math.max(1, Math.min(90, base + extra));
}

async function fetchJson<T>(url: string, timeoutMs = 9000): Promise<T | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: "no-store", headers: { accept: "application/json" } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** نگاشت بازی ESPN به رکورد دیتابیس — اولویت externalId، fallback نام نرمال‌شده */
function mapDbMatch(
  externalId: string,
  homeTeam: string,
  awayTeam: string,
  kickoffIso: string
): string | null {
  if (!dbMatchesCache || Date.now() - dbMatchesCache.at > 5 * 60_000) return null; // فقط کش گرم
  const byId = dbMatchesCache.rows.find((r) => r.externalId === externalId);
  if (byId) return byId.id;
  const nh = normTeam(homeTeam);
  const na = normTeam(awayTeam);
  const ko = Date.parse(kickoffIso);
  const byName = dbMatchesCache.rows.find((r) => {
    if (normTeam(r.homeTeam) !== nh || normTeam(r.awayTeam) !== na) return false;
    return Math.abs(Date.parse(String(r.kickoff)) - ko) < 8 * 3600_000;
  });
  return byName?.id ?? null;
}

/** واکشی keyEvents خلاصه ESPN برای یک بازی In-Play — کارت‌های قرمز واقعی */
async function fetchRedCards(
  slug: string,
  espnEventId: string
): Promise<{ id: string; teamName: string }[]> {
  const data = await fetchJson<any>(
    `https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/summary?event=${espnEventId}`,
    8500
  );
  const keyEvents: any[] = data?.keyEvents ?? [];
  const out: { id: string; teamName: string }[] = [];
  for (const e of keyEvents) {
    const text = String(e?.type?.text ?? "");
    if (!text.toLowerCase().includes("red card")) continue;
    out.push({
      id: String(e?.id ?? `${text}-${(e?.clock?.displayValue ?? "")}-${(e?.team?.displayName ?? "")}`),
      teamName: String(e?.team?.displayName ?? ""),
    });
  }
  return out;
}

// ═════════════════════ تشخیص اصلی ═════════════════════

async function runDetect(): Promise<LiveDetectResult> {
  const now = Date.now();

  // ─── ۱) اسکوربورد امروز + دیروز همه لیگ‌ها (بدون کلید، سبک) ───
  const jobs: { slug: string; day: string }[] = [];
  const fmt = (d: Date) =>
    `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  for (const league of ESPN_LEAGUES) {
    for (const off of SCOREBOARD_OFFSETS) {
      jobs.push({ slug: league.slug, day: fmt(new Date(now + off * 24 * 3600 * 1000)) });
    }
  }

  interface RawLive {
    slug: string;
    leagueName: string;
    ev: any;
  }
  const settled = await Promise.allSettled(
    jobs.map(async ({ slug, day }) => {
      const events = await fetchEspnScoreboardDay(slug, day);
      return { slug, events: events ?? [] };
    })
  );

  const liveRaws: RawLive[] = [];
  const seenRawIds = new Set<string>();
  for (const r of settled) {
    if (r.status !== "fulfilled") continue;
    const league = ESPN_LEAGUES.find((l) => l.slug === r.value.slug);
    if (!league) continue;
    for (const ev of r.value.events) {
      const comp = ev?.competitions?.[0];
      if (!comp) continue;
      const stState = comp?.status?.type?.state;
      if (stState !== "in") continue; // فقط بازی‌های در جریان
      const id = `espn-${r.value.slug}-${String(ev.id)}`;
      if (seenRawIds.has(id)) continue;
      seenRawIds.add(id);
      liveRaws.push({ slug: r.value.slug, leagueName: league.name, ev });
    }
  }

  // ─── ۲) وضعیت لحظه‌ای بازی‌های زنده + تشخیص گل واقعی از اختلاف امتیاز ───
  const liveMatches: LiveMatchState[] = [];
  const newEvents: LiveDetectedEvent[] = [];
  const pushEvent = (ev: LiveDetectedEvent) => {
    if (state.events.some((x) => x.eventId === ev.eventId)) return;
    newEvents.push(ev);
    state.events.push(ev);
  };

  for (const { slug, leagueName, ev } of liveRaws) {
    const comp = ev.competitions[0];
    const home = (comp.competitors ?? []).find((c: any) => c?.homeAway === "home");
    const away = (comp.competitors ?? []).find((c: any) => c?.homeAway === "away");
    if (!home?.team?.displayName || !away?.team?.displayName) continue;

    const externalId = `espn-${slug}-${String(ev.id)}`;
    const clock = String(comp?.status?.displayClock ?? "");
    const period = Number(comp?.status?.period ?? 1);
    const minute = parseMinute(clock, period);
    const num = (v: any): number => {
      const n = parseInt(String(v ?? ""), 10);
      return Number.isFinite(n) ? Math.max(0, n) : 0;
    };
    const homeScore = num(home.score);
    const awayScore = num(away.score);
    const dbMatchId = mapDbMatch(externalId, home.team.displayName, away.team.displayName, String(ev.date ?? ""));

    liveMatches.push({
      externalId,
      dbMatchId,
      leagueSlug: slug,
      leagueName,
      homeTeam: home.team.displayName,
      awayTeam: away.team.displayName,
      homeScore,
      awayScore,
      clock,
      minute,
      statusDetail: String(comp?.status?.type?.shortDetail ?? "In-Play"),
    });

    // ─── تشخیص گل واقعی: اختلاف امتیاز نسبت به snapshot قبلی ───
    const prev = state.snapshot.get(externalId);
    state.snapshot.set(externalId, { home: homeScore, away: awayScore });
    if (state.booted && prev && (homeScore > prev.home || awayScore > prev.away)) {
      if (homeScore > prev.home) {
        pushEvent({
          eventId: `${externalId}:GOAL_HOME:${minute}:${homeScore}-${awayScore}`,
          type: "GOAL_HOME",
          externalId,
          dbMatchId,
          leagueSlug: slug,
          leagueName,
          homeTeam: home.team.displayName,
          awayTeam: away.team.displayName,
          homeScore,
          awayScore,
          minute,
          clock,
          detectedAt: now,
        });
      }
      if (awayScore > prev.away) {
        pushEvent({
          eventId: `${externalId}:GOAL_AWAY:${minute}:${homeScore}-${awayScore}`,
          type: "GOAL_AWAY",
          externalId,
          dbMatchId,
          leagueSlug: slug,
          leagueName,
          homeTeam: home.team.displayName,
          awayTeam: away.team.displayName,
          homeScore,
          awayScore,
          minute,
          clock,
          detectedAt: now,
        });
      }
    }

    // ─── تشخیص کارت قرمز واقعی: keyEvents خلاصه ESPN (throttle ۷۵ ثانیه) ───
    const lastSummary = state.summaryAt.get(externalId) ?? 0;
    if (!prev || now - lastSummary < SUMMARY_TTL_MS) continue;
    state.summaryAt.set(externalId, now);

    const espnEventId = String(ev.id);
    const reds = await fetchRedCards(slug, espnEventId);
    if (reds.length === 0) continue;

    if (!state.redBaselined.has(externalId)) {
      // پایه‌گذاری: کارت‌های قبل از شروع رصد توست نمی‌شوند
      state.redSeen.set(externalId, new Set(reds.map((r) => r.id)));
      state.redBaselined.add(externalId);
      continue;
    }
    const seen = state.redSeen.get(externalId) ?? new Set<string>();
    for (const red of reds) {
      if (seen.has(red.id)) continue;
      seen.add(red.id);
      const redHome = normTeam(red.teamName) === normTeam(home.team.displayName);
      const redAway = normTeam(red.teamName) === normTeam(away.team.displayName);
      if (!redHome && !redAway) continue;
      pushEvent({
        eventId: `${externalId}:${redHome ? "RED_HOME" : "RED_AWAY"}:${red.id}`,
        type: redHome ? "RED_HOME" : "RED_AWAY",
        externalId,
        dbMatchId,
        leagueSlug: slug,
        leagueName,
        homeTeam: home.team.displayName,
        awayTeam: away.team.displayName,
        homeScore,
        awayScore,
        minute,
        clock,
        detectedAt: now,
      });
    }
    state.redSeen.set(externalId, seen);
  }

  if (!state.booted) {
    state.booted = true;
    state.bootAt = now;
  }

  // ─── ۳) پاک‌سازی رویدادهای منقضی و بازی‌های تمام‌شده از snapshot ───
  state.events = state.events.filter((e) => now - e.detectedAt < EVENT_WINDOW_MS);
  const liveIds = new Set(liveMatches.map((m) => m.externalId));
  for (const key of [...state.snapshot.keys()]) {
    if (!liveIds.has(key)) state.snapshot.delete(key);
  }

  return {
    success: true,
    mode: "REAL_ESPN",
    events: [...state.events].sort((a, b) => b.detectedAt - a.detectedAt),
    liveMatches,
    checkedAt: now,
  };
}

/**
 * نقطه ورود عمومی — با کش TTL و dedupe in-flight.
 * «booted=false» فقط snapshot پایه می‌سازد و رویدادی آتش نمی‌شود
 * (جلوگیری از توست کاذب برای گل‌های قبل از شروع رصد).
 */
export async function detectLiveEvents(): Promise<LiveDetectResult> {
  const now = Date.now();
  if (state.result && now - state.pollAt < DETECT_TTL_MS) return state.result;
  if (state.inFlight) return state.inFlight;

  if (!dbMatchesCache) {
    // گرم کردن کش نگاشت DB (بدون مسدودکردن مسیر اصلی)
    db.match
      .findMany({
        where: { status: { not: "ARCHIVED" } },
        select: { id: true, externalId: true, homeTeam: true, awayTeam: true, kickoff: true },
      })
      .then((rows) => {
        dbMatchesCache = { at: Date.now(), rows };
      })
      .catch(() => {});
  }

  state.inFlight = runDetect()
    .then((result) => {
      state.result = result;
      state.pollAt = Date.now();
      return result;
    })
    .finally(() => {
      state.inFlight = null;
    });
  return state.inFlight;
}
