import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseEspnExternalId } from "@/lib/server/odds-providers";
import { runDixonColes } from "@/lib/engine/poisson";
import type { LineupAbsPreviewDTO, LineupPlayerDTO, LineupShockDTO } from "@/lib/types";
// v20.1 — کش کوتاه‌مدت داشبورد: هر poll چندثانیه‌ای دیگر ESPN/موتور کامل اجرا نمی‌کند
// (ریشه رشد RSS و OOM — پاسخ تکراری از کش با تأخیر ~۰ms)
import { pollCacheGet, pollCacheSet, pollCacheKey } from "@/lib/server/poll-cache";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ─────────────────────────────────────────────────────────────────────────────
// v6.0 — ترکیب واقعی T-60 از ESPN (Strict Zero-Mock)
//
// ۱) اندپوینت خلاصه بازی (بدون کلید):
//    site.api.espn.com/.../summary?event=  → اگر بازی در پنجره T-60 باشد و آرایه
//    rosters پر شده باشد، ترکیب رسمی واقعی (starter: true/false) نمایش داده می‌شود.
// ۲) در غیر این صورت فهرست واقعی بازیکنان فصل جاری دو تیم:
//    sports.core.api.espn.com/.../seasons/{year}/teams/{teamId}/athletes
//    با آمار واقعی فصل (appearances / goals / goalAssists / shotsOnTarget) از
//    اندپوینت statistics هر بازیکن.
// ۳) شاخص VAEP واقعی = (G×۰.۳۵ + A×۰.۲۵ + SoT×۰.۰۸) / appearances
// ۴) کلیک روی کلید وضعیت هر بازیکن → پیش‌نمایش اثر غیبت آن ستاره واقعی روی λ.
//
// هیچ نام بازیکن فرضی، هیچ عدد ساختگی و هیچ شبیه‌سازی در این مسیر وجود ندارد؛
// اگر آمار کافی نبود، مقدار null با برچسب شفاف «بدون آمار» برمی‌گردد.
// ─────────────────────────────────────────────────────────────────────────────

// ═════════════════════ کش درون‌حافظه‌ای (ضد Rate-Limit) ═════════════════════

interface CacheRow<T> { data: T | null; at: number }

const SUMMARY_TTL = 45_000;
const ROSTER_LIST_TTL = 30 * 60_000;
const PLAYER_TTL = 6 * 3600_000;
const SEASON_TTL = 24 * 3600_000;

const summaryCache = new Map<string, CacheRow<SummaryPayload>>();
const athleteListCache = new Map<string, CacheRow<string[]>>();
const profileCache = new Map<string, CacheRow<ProfilePayload>>();
const statsCache = new Map<string, CacheRow<SeasonStats>>();
const seasonCache = new Map<string, CacheRow<string>>();

function cacheGet<T>(map: Map<string, CacheRow<T>>, key: string, ttl: number): T | null | undefined {
  const hit = map.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > ttl) return undefined;
  return hit.data;
}

function cacheSet<T>(map: Map<string, CacheRow<T>>, key: string, data: T | null): void {
  map.set(key, { data, at: Date.now() });
}

async function fetchJson<T>(url: string, timeoutMs = 8000): Promise<T | null> {
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

/** استخر همزمانی محدود — حداکثر n فراخوانی موازی */
async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  const queue = items.map((item, i) => ({ item, i }));
  const workers = Array.from({ length: Math.min(limit, Math.max(1, queue.length)) }, async () => {
    for (;;) {
      const next = queue.shift();
      if (next === undefined) return;
      out[next.i] = await fn(next.item);
    }
  });
  await Promise.all(workers);
  return out;
}

// ═════════════════════ ساختارهای ESPN ═════════════════════

interface SummaryPayload {
  header?: {
    season?: { year?: number };
    competitions?: {
      competitors?: { homeAway?: string; id?: string; team?: { id?: string; displayName?: string } }[];
      officials?: { fullName?: string; displayName?: string }[];
    }[];
  };
  rosters?: {
    homeAway?: string;
    roster?: {
      athlete?: { id?: string; displayName?: string; age?: number };
      starter?: boolean;
      jersey?: string;
      position?: { abbreviation?: string };
    }[];
  }[];
}

interface ProfilePayload {
  id?: string;
  displayName?: string;
  age?: number;
  position?: { abbreviation?: string; displayName?: string };
}

interface SeasonStats {
  appearances: number | null;
  goals: number | null;
  assists: number | null;
  shotsOnTarget: number | null;
  totalShots: number | null;
}

const SITE_BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer";
const CORE_BASE = "https://sports.core.api.espn.com/v2/sports/soccer/leagues";

/** سال فصل جاری لیگ (کش ۲۴ ساعته) */
async function seasonYearOf(slug: string, fallback?: number): Promise<string> {
  if (fallback && fallback > 2000) return String(fallback);
  const hit = cacheGet(seasonCache, slug, SEASON_TTL);
  if (hit !== undefined) return hit ?? String(fallback ?? new Date().getUTCFullYear());
  const data = await fetchJson<{ items?: { id?: string }[] }>(`${CORE_BASE}/${slug}/seasons?limit=1`);
  const year = data?.items?.[0]?.id ?? null;
  cacheSet(seasonCache, slug, year);
  return year ?? String(fallback ?? new Date().getUTCFullYear());
}

/** خلاصه بازی (کش ۴۵ ثانیه) */
async function getSummary(slug: string, eventId: string): Promise<SummaryPayload | null> {
  const key = `${slug}:${eventId}`;
  const hit = cacheGet(summaryCache, key, SUMMARY_TTL);
  if (hit !== undefined) return hit;
  const data = await fetchJson<SummaryPayload>(`${SITE_BASE}/${slug}/summary?event=${eventId}`);
  cacheSet(summaryCache, key, data);
  return data;
}

/** شناسه‌های بازیکنان فصل جاری یک تیم از Core API (کش ۳۰ دقیقه) */
async function teamAthleteIds(slug: string, season: string, teamId: string): Promise<string[] | null> {
  const key = `${slug}:${season}:${teamId}`;
  const hit = cacheGet(athleteListCache, key, ROSTER_LIST_TTL);
  if (hit !== undefined) return hit;
  const data = await fetchJson<{ items?: { $ref?: string }[] }>(
    `${CORE_BASE}/${slug}/seasons/${season}/teams/${teamId}/athletes?limit=30`
  );
  const ids: string[] = [];
  for (const it of data?.items ?? []) {
    const m = /\/athletes\/(\d+)\?/.exec(it?.$ref ?? "");
    if (m?.[1]) ids.push(m[1]);
  }
  cacheSet(athleteListCache, key, ids.length > 0 ? ids.slice(0, 18) : null);
  return ids.length > 0 ? ids.slice(0, 18) : null;
}

/** پروفایل واقعی بازیکن: نام، سن، پست (کش ۶ ساعته) */
async function athleteProfile(slug: string, season: string, athleteId: string): Promise<ProfilePayload | null> {
  const key = `${slug}:${season}:${athleteId}`;
  const hit = cacheGet(profileCache, key, PLAYER_TTL);
  if (hit !== undefined) return hit;
  const data = await fetchJson<ProfilePayload>(`${CORE_BASE}/${slug}/seasons/${season}/athletes/${athleteId}`);
  cacheSet(profileCache, key, data);
  return data;
}

function statNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/** آمار واقعی فصل جاری بازیکن از اندپوینت statistics (کش ۶ ساعته) */
async function athleteSeasonStats(slug: string, season: string, athleteId: string): Promise<SeasonStats | null> {
  const key = `${slug}:${season}:${athleteId}`;
  const hit = cacheGet(statsCache, key, PLAYER_TTL);
  if (hit !== undefined) return hit;
  const data = await fetchJson<{
    splits?: { categories?: { name?: string; stats?: { name?: string; value?: unknown; displayValue?: string }[] }[] };
  }>(`${CORE_BASE}/${slug}/seasons/${season}/types/1/athletes/${athleteId}/statistics/0`);
  let out: SeasonStats | null = null;
  const cats = data?.splits?.categories ?? [];
  const pick = (cat: string[], names: string[]): number | null => {
    for (const c of cats) {
      if (!cat.includes(String(c?.name ?? ""))) continue;
      for (const s of c.stats ?? []) {
        if (s?.name && names.includes(s.name)) {
          const v = statNum(s.value ?? s.displayValue);
          if (v !== null) return v;
        }
      }
    }
    return null;
  };
  out = {
    appearances: pick(["general"], ["appearances", "gamesPlayed"]),
    goals: pick(["offensive"], ["totalGoals", "goals"]),
    assists: pick(["offensive"], ["goalAssists", "assists"]),
    shotsOnTarget: pick(["offensive"], ["shotsOnTarget", "onTargetShots"]),
    totalShots: pick(["offensive"], ["totalShots", "shots"]),
  };
  if (out.appearances === null && out.goals === null && out.assists === null && out.shotsOnTarget === null) out = null;
  cacheSet(statsCache, key, out);
  return out;
}

const POS_MAP: Record<string, string> = { G: "GK", GK: "GK", D: "DEF", DEF: "DEF", M: "MID", MID: "MID", F: "FW", FW: "FW", S: "FW" };

/** ساخت بازیکن واقعی از پروفایل + آمار فصل */
function buildPlayer(
  name: string,
  posAbbrev: string | null,
  age: number | null,
  stats: SeasonStats | null,
  starter: boolean | null
): LineupPlayerDTO {
  const position = POS_MAP[(posAbbrev ?? "").toUpperCase()] ?? (posAbbrev ? "MID" : "SQUAD");
  const apps = stats?.appearances ?? null;
  const g = stats?.goals ?? null;
  const a = stats?.assists ?? null;
  const sot = stats?.shotsOnTarget ?? null;
  const vaep = apps !== null && apps > 0 && g !== null && a !== null && sot !== null
    ? Math.round(((g * 0.35 + a * 0.25 + sot * 0.08) / apps) * 1000) / 1000
    : null;
  const xT = apps !== null && apps > 0 && g !== null && a !== null && sot !== null
    ? Math.round(((g * 0.45 + a * 0.3 + sot * 0.1) / apps) * 1000) / 1000
    : null;
  return {
    name,
    position,
    age,
    appearances: apps,
    goals: g,
    assists: a,
    shotsOnTarget: sot,
    vaep,
    xT,
    starter,
    status: vaep === null ? "NO_STATS" : starter === true ? "STARTER" : starter === false ? "BENCH" : "SQUAD",
    isKey: false,
  };
}

/** محاسبه شوک ترکیب از بازیکنان واقعی (VAEP شاخص فصل) */
function shockOf(players: LineupPlayerDTO[]): {
  xiVaep: number; xiXt: number; fullStrengthVaep: number; shockDelta: number;
  missingKeyPlayers: { name: string; position: string; xT: number; vaep: number; status: string }[];
  unavailableCount: number;
} {
  const withVaep = players.filter((p) => p.vaep !== null);
  const sorted = [...withVaep].sort((a, b) => (b.vaep ?? 0) - (a.vaep ?? 0));
  const fullStrengthVaep = sorted.slice(0, 11).reduce((s, p) => s + (p.vaep ?? 0), 0);

  // XI واقعی: ترکیب اعلام‌شده؛ در حالت SEASON = ۱۱ شاخص برتر فصل (شفاف‌سازی می‌شود)
  const starters = withVaep.filter((p) => p.starter === true);
  const xiPool = starters.length >= 7 ? starters : sorted.slice(0, 11);
  const xiVaep = xiPool.reduce((s, p) => s + (p.vaep ?? 0), 0);
  const xiXt = [...withVaep].sort((a, b) => (b.xT ?? 0) - (a.xT ?? 0)).slice(0, 11).reduce((s, p) => s + (p.xT ?? 0), 0);

  const shockDelta = fullStrengthVaep > 0 ? Math.max(-0.5, Math.min(0.15, (xiVaep - fullStrengthVaep) / fullStrengthVaep)) : 0;

  // بازیکنان کلیدی (۴ شاخص برتر) که در ترکیب رسمی نیستند — با برچسب شفاف «خارج از ترکیب»
  const keySet = new Set(sorted.slice(0, 4).map((p) => p.name));
  for (const p of players) p.isKey = keySet.has(p.name);
  const missingKeyPlayers = keySet.size > 0 && starters.length >= 7
    ? players
        .filter((p) => p.isKey && p.starter !== true && p.vaep !== null)
        .map((p) => ({ name: p.name, position: p.position, xT: p.xT ?? 0, vaep: p.vaep ?? 0, status: "OUT_OF_XI" }))
    : [];

  return {
    xiVaep: Math.round(xiVaep * 1000) / 1000,
    xiXt: Math.round(xiXt * 1000) / 1000,
    fullStrengthVaep: Math.round(fullStrengthVaep * 1000) / 1000,
    shockDelta,
    missingKeyPlayers,
    unavailableCount: missingKeyPlayers.length,
  };
}

// ═════════════════════ هندلر اصلی ═════════════════════

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      matchId?: string;
      depth?: "FULL" | "LIGHT";
      absentName?: string;
      absentSide?: "HOME" | "AWAY";
    };
    const matchId = body.matchId;
    const depth = body.depth === "LIGHT" ? "LIGHT" : "FULL";
    if (!matchId) {
      return NextResponse.json({ success: false, error: "matchId الزامی است" }, { status: 400 });
    }

    // v20.1 — کش ۲۰ثانیه‌ای per-(matchId,depth,absent*) — سناریوهای what-if مستقل باقی می‌مانند
    const lineupCacheKey = pollCacheKey("lineup", {
      matchId,
      depth,
      absentName: body.absentName ?? "",
      absentSide: body.absentSide ?? "",
    });
    const lineupCached = pollCacheGet<LineupShockDTO>(lineupCacheKey, 20_000);
    if (lineupCached) return NextResponse.json(lineupCached);

    const match = await db.match.findUnique({ where: { id: matchId } });
    if (!match) {
      return NextResponse.json({ success: false, error: "بازی یافت نشد" }, { status: 404 });
    }

    const parsed = parseEspnExternalId(match.externalId);
    if (!parsed) {
      // بازی بدون شناسه ESPN — هیچ دیتای فرضی تولید نمی‌شود (قانون طلایی v6.0)
      return NextResponse.json({
        success: false,
        error: "این بازی شناسه رسمی ESPN ندارد — دیتای ترکیب فقط از منابع واقعی ارائه می‌شود (هیچ شبیه‌سازی‌ای انجام نمی‌شود)",
      } as { success: false; error: string }, { status: 422 });
    }
    const { slug, eventId } = parsed;
    const espnEventUrl = `https://www.espn.com/soccer/match/_/gameId/${eventId}`;
    const sources: string[] = [
      `summary: site.api.espn.com/.../soccer/${slug}/summary?event=${eventId}`,
    ];

    // ─── ۱) خلاصه بازی — شناسه تیم‌ها + ترکیب رسمی (در صورت اعلام) ───
    const summary = await getSummary(slug, eventId);
    const comps = summary?.header?.competitions?.[0]?.competitors ?? [];
    const homeTeamId = comps.find((c) => c.homeAway === "home")?.team?.id ?? match.homeTeamId;
    const awayTeamId = comps.find((c) => c.homeAway === "away")?.team?.id ?? match.awayTeamId;
    const officialRef = summary?.header?.competitions?.[0]?.officials?.[0];
    const refereeName = officialRef?.fullName ?? officialRef?.displayName ?? null;

    const kickoffMs = new Date(match.kickoff).getTime();
    const withinWindow = kickoffMs - Date.now() < 120 * 60_000 && Date.now() - kickoffMs < 4 * 3600_000;

    const sumRoster = (side: "home" | "away") =>
      summary?.rosters?.find((r) => r.homeAway === side)?.roster ?? [];

    const homeOfficial = sumRoster("home");
    const awayOfficial = sumRoster("away");
    const hasOfficial =
      withinWindow && homeOfficial.length >= 7 && awayOfficial.length >= 7;

    const season = await seasonYearOf(slug, summary?.header?.season?.year);

    // ─── ۲) ساخت فهرست بازیکنان واقعی دو تیم ───
    type RawAth = { id: string; name: string; pos: string | null; age: number | null; starter: boolean | null };

    const rawOf = async (side: "home" | "away", teamId: string | null): Promise<RawAth[]> => {
      if (hasOfficial) {
        const lst = sumRoster(side);
        return lst
          .filter((e) => e.athlete?.displayName)
          .map((e) => ({
            id: String(e.athlete?.id ?? ""),
            name: String(e.athlete?.displayName),
            pos: e.position?.abbreviation ?? (e.athlete as { position?: { abbreviation?: string } } | undefined)?.position?.abbreviation ?? null,
            age: e.athlete?.age ?? null,
            starter: Boolean(e.starter),
          }));
      }
      if (!teamId) return [];
      const ids = await teamAthleteIds(slug, season, teamId);
      sources.push(`roster: sports.core.api.espn.com/.../seasons/${season}/teams/${teamId}/athletes`);
      if (!ids || ids.length === 0) return [];
      return ids.map((id) => ({ id, name: "", pos: null, age: null, starter: null }));
    };

    const [rawHome, rawAway] = await Promise.all([rawOf("home", homeTeamId ?? null), rawOf("away", awayTeamId ?? null)]);

    // v6.0 — در اسکن سبک پس‌زمینه، اگر واکشی کامل هنوز انجام نشده، پاسخ شفاف با شوک ذخیره‌شده
    // برمی‌گردد (نه خطا) — خط لوله خلبان نباید به‌خاطر نبود کش، استیج T-60 را ERROR کند.
    const lightFallback = (): LineupShockDTO => ({
      success: true,
      matchId: match.id,
      mode: "SEASON",
      fetchedAt: new Date().toISOString(),
      sources,
      espnEventUrl,
      espnEventId: eventId,
      players: { home: [], away: [] },
      absPreview: null,
      home: {
        team: match.homeTeam,
        xiVaep: 0,
        xiXt: 0,
        fullStrengthVaep: 0,
        shockDelta: match.lineupShockHome ?? 0,
        missingKeyPlayers: [],
        unavailableCount: 0,
      },
      away: {
        team: match.awayTeam,
        xiVaep: 0,
        xiXt: 0,
        fullStrengthVaep: 0,
        shockDelta: match.lineupShockAway ?? 0,
        missingKeyPlayers: [],
        unavailableCount: 0,
      },
      isShock: false,
      message: "واکشی کامل بازیکنان واقعی ESPN هنوز انجام نشده — دکمه «واکشی بازیکنان واقعی» در تب T-60 را بزنید.",
      topPlayers: [],
    });

    if (rawHome.length === 0 && rawAway.length === 0) {
      if (depth === "LIGHT") return NextResponse.json(lightFallback());
      return NextResponse.json({
        success: false,
        error: "فهرست بازیکنان واقعی از ESPN هنوز منتشر نشده است — هیچ دیتای فرضی ساخته نمی‌شود",
      } as { success: false; error: string }, { status: 503 });
    }

    // ─── ۳) تکمیل پروفایل + آمار فصل (فقط FULL؛ در LIGHT از کش) ───
    const resolvePlayers = async (raw: RawAth[]): Promise<LineupPlayerDTO[]> => {
      const enriched = await pool(
        raw.filter((r) => r.id),
        5,
        async (r): Promise<LineupPlayerDTO> => {
          let name = r.name;
          let pos = r.pos;
          let age = r.age;
          if (!name || age === null) {
            const pKey = `${slug}:${season}:${r.id}`;
            const cachedProfile = cacheGet(profileCache, pKey, PLAYER_TTL);
            const profile = depth === "FULL" || cachedProfile !== undefined
              ? cachedProfile !== undefined ? cachedProfile : await athleteProfile(slug, season, r.id)
              : null;
            if (profile) {
              name = name || profile.displayName || "";
              pos = pos ?? profile.position?.abbreviation ?? null;
              age = age ?? profile.age ?? null;
            }
          }
          const sKey = `${slug}:${season}:${r.id}`;
          const cachedStats = cacheGet(statsCache, sKey, PLAYER_TTL);
          const stats = depth === "FULL" || cachedStats !== undefined
            ? cachedStats !== undefined ? cachedStats : await athleteSeasonStats(slug, season, r.id)
            : null;
          return buildPlayer(name || "بازیکن ESPN", pos, age, stats, r.starter);
        }
      );
      return enriched.filter((p) => p.name && p.name !== "بازیکن ESPN");
    };

    const [homePlayers, awayPlayers] = await Promise.all([resolvePlayers(rawHome), resolvePlayers(rawAway)]);
    if (homePlayers.length === 0 && awayPlayers.length === 0) {
      if (depth === "LIGHT") return NextResponse.json(lightFallback());
      return NextResponse.json({
        success: false,
        error: "آمار واقعی بازیکنان هنوز از ESPN در دسترس نیست — دیتای فرضی تولید نمی‌شود",
      } as { success: false; error: string }, { status: 503 });
    }

    const homeShock = shockOf(homePlayers);
    const awayShock = shockOf(awayPlayers);
    const mode: "OFFICIAL" | "SEASON" = hasOfficial ? "OFFICIAL" : "SEASON";

    // ─── ۴) پیش‌نمایش غیبت بازیکن واقعی (کلیک روی کلید وضعیت) ───
    let absPreview: LineupAbsPreviewDTO | null = null;
    const lg = match.leagueTeamAvg ?? 1.35;
    const baseLambdaHome = match.homeAttack * match.awayDefense * lg * 1.12;
    const baseLambdaAway = match.awayAttack * match.homeDefense * lg;
    const baselineProbs = runDixonColes({
      homeAttack: baseLambdaHome / (lg * 1.12),
      awayAttack: baseLambdaAway / lg,
      homeDefense: 1,
      awayDefense: 1,
      leagueAvg: lg,
      homeAdvantage: 1.12,
      rho: -0.08,
      eloDiff: match.homeElo - match.awayElo,
      eloWeight: 0.35,
      homeAbsenceImpact: 0,
      awayAbsenceImpact: 0,
      timeDecayXi: 0.0065,
      daysAgo: 21,
    });

    if (body.absentName) {
      const side: "HOME" | "AWAY" = body.absentSide === "AWAY" ? "AWAY" : "HOME";
      const poolPlayers = side === "HOME" ? homePlayers : awayPlayers;
      const target = poolPlayers.find((p) => p.name === body.absentName);
      if (!target || target.vaep === null) {
        absPreview = null;
      } else {
        const xiVaep = side === "HOME" ? homeShock.xiVaep : awayShock.xiVaep;
        const share = xiVaep > 0 ? target.vaep / xiVaep : 0;
        const shock = Math.max(-0.5, Math.min(0, -share * 0.55));
        let lambdaHome = baseLambdaHome;
        let lambdaAway = baseLambdaAway;
        if (side === "HOME") lambdaHome = Math.max(0.15, lambdaHome * (1 + shock));
        else lambdaAway = Math.max(0.15, lambdaAway * (1 + shock));
        const probs = runDixonColes({
          homeAttack: lambdaHome / (lg * 1.12),
          awayAttack: lambdaAway / lg,
          homeDefense: 1,
          awayDefense: 1,
          leagueAvg: lg,
          homeAdvantage: 1.12,
          rho: -0.08,
          eloDiff: match.homeElo - match.awayElo,
          eloWeight: 0.35,
          homeAbsenceImpact: 0,
          awayAbsenceImpact: 0,
          timeDecayXi: 0.0065,
          daysAgo: 21,
        });
        absPreview = {
          name: target.name,
          side,
          vaepShare: Math.round(share * 1000) / 1000,
          shockDelta: shock,
          lambdaHome: Math.round(lambdaHome * 100) / 100,
          lambdaAway: Math.round(lambdaAway * 100) / 100,
          pHome: probs.pHome,
          pDraw: probs.pDraw,
          pAway: probs.pAway,
          baseline: {
            lambdaHome: Math.round(baseLambdaHome * 100) / 100,
            lambdaAway: Math.round(baseLambdaAway * 100) / 100,
            pHome: baselineProbs.pHome,
            pDraw: baselineProbs.pDraw,
            pAway: baselineProbs.pAway,
          },
        };
      }
    }

    // ─── ۵) ماندگاری: شناسه‌های رسمی + شوک واقعی + داور واقعی ───
    try {
      await db.match.update({
        where: { id: match.id },
        data: {
          homeTeamId: homeTeamId ?? null,
          awayTeamId: awayTeamId ?? null,
          ...(refereeName ? { refereeName } : {}),
          ...(mode === "OFFICIAL"
            ? {
                lineupAnnounced: true,
                lineupShockHome: homeShock.shockDelta,
                lineupShockAway: awayShock.shockDelta,
              }
            : {}),
        },
      });
    } catch {
      // ماندگاری اختیاری است — پاسخ اصلی از منبع زنده ساخته شده
    }

    const topPlayers = [...homePlayers, ...awayPlayers]
      .sort((a, b) => (b.vaep ?? -1) - (a.vaep ?? -1))
      .slice(0, 16)
      .map((p) => ({
        side: (homePlayers.includes(p) ? "HOME" : "AWAY") as "HOME" | "AWAY",
        name: p.name,
        position: p.position,
        xT: p.xT ?? 0,
        vaep: p.vaep ?? 0,
        status: p.status,
        isKey: p.isKey,
      }));

    const isShock = Math.abs(homeShock.shockDelta) >= 0.06 || Math.abs(awayShock.shockDelta) >= 0.06 || homeShock.missingKeyPlayers.length > 0 || awayShock.missingKeyPlayers.length > 0;

    const parts: string[] = [];
    if (mode === "OFFICIAL") {
      parts.push("ترکیب رسمی واقعی از ESPN دریافت شد (starter واقعی، بدون شبیه‌سازی).");
      if (homeShock.missingKeyPlayers.length > 0) {
        parts.push(`${match.homeTeam}: ستاره کلیدی «${homeShock.missingKeyPlayers[0].name}» خارج از ترکیب اصلی است.`);
      }
      if (awayShock.missingKeyPlayers.length > 0) {
        parts.push(`${match.awayTeam}: ستاره کلیدی «${awayShock.missingKeyPlayers[0].name}» خارج از ترکیب اصلی است.`);
      }
      if (!isShock) parts.push("ترکیب اعلام‌شده با قدرتمندترین ۱۱ نفر فصل هم‌خوانی دارد — شوک معناداری نیست.");
    } else {
      parts.push("ترکیب رسمی هنوز اعلام نشده — فهرست، بازیکنان واقعی فصل جاری از ESPN Roster است.");
      parts.push("روی «پیش‌نمایش غیبت» هر بازیکن واقعی کلیک کنید تا اثر آن ستاره روی امید گل (λ) دیده شود.");
    }
    parts.push("VAEP هر بازیکن = (گل×۰.۳۵ + پاس‌گل×۰.۲۵ + شوت در چارچوب×۰.۰۸) ÷ تعداد بازی فصل.");

    const result: LineupShockDTO = {
      success: true,
      matchId: match.id,
      mode,
      fetchedAt: new Date().toISOString(),
      sources,
      espnEventUrl,
      espnEventId: eventId,
      players: { home: homePlayers, away: awayPlayers },
      absPreview,
      home: { team: match.homeTeam, ...homeShock },
      away: { team: match.awayTeam, ...awayShock },
      isShock,
      message: parts.join(" "),
      topPlayers,
    };

    pollCacheSet(lineupCacheKey, result);
    return NextResponse.json(result);
  } catch (error) {
    console.error("POST /api/lineup error:", error);
    return NextResponse.json({ success: false, error: "خطا در دریافت ترکیب واقعی از ESPN" }, { status: 500 });
  }
}
