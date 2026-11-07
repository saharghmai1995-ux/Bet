// ─────────────────────────────────────────────────────────────────────────────
// جدول رسمی رده‌بندی فصل جاری (ESPN Standings API — بدون کلید) — v6.0
//
// منبع: https://site.api.espn.com/apis/v2/sports/soccer/{slug}/standings
// از children[0].standings.entries آمار واقعی فصل هر تیم استخراج می‌شود:
//   gamesPlayed (GP) · pointsFor (GF = گل زده) · pointsAgainst (GA = گل خورده) · rank
//
// قدرت تهاجمی/دفاعی واقعی دیکسون-کولز:
//   α_i = GF_i / (GP_i × LeagueTeamAvg)      ← نسبت حمله به میانگین لیگ
//   β_i = GA_i / (GP_i × LeagueTeamAvg)      ← نسبت دفاع به میانگین لیگ
//   λ_Home = α_Home × β_Away × LeagueTeamAvg × HomeAdv
//
// کش درون‌حافظه‌ای ۶۰ دقیقه‌ای — ضد Rate-Limit (۶ لیگ = ۶ درخواست/ساعت).
// ─────────────────────────────────────────────────────────────────────────────

import { normTeam } from "./live-sources";

export interface StandingsEntry {
  teamId: string;
  teamName: string;
  rank: number;
  gp: number; // gamesPlayed
  gf: number; // goals for (pointsFor در API فوتبال ESPN)
  ga: number; // goals against (pointsAgainst)
}

export interface LeagueStandings {
  slug: string;
  entries: StandingsEntry[];
  leagueTeamAvg: number; // میانگین گل هر تیم در هر بازی (ΣGF / ΣGP)
  totalGoalsPerGame: number; // میانگین گل کل بازی‌ها (×۲)
  fetchedAt: number;
  /** نگاشت بر اساس شناسه رسمی ESPN تیم */
  byId: Map<string, StandingsEntry>;
  /** نگاشت بر اساس نام نرمال‌شده تیم */
  byName: Map<string, StandingsEntry>;
}

interface CacheRow {
  data: LeagueStandings | null;
  at: number;
  /** پاسخ ناموفق هم برای ۵ دقیقه کش می‌شود تا طوفان درخواست رخ ندهد */
  failed: boolean;
}

const CACHE_TTL_MS = 60 * 60_000; // جدول فصل ساعتی یک‌بار تازه‌سازی می‌شود
const FAIL_TTL_MS = 5 * 60_000;

const cache = new Map<string, CacheRow>();

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

interface EspnStat {
  name: string;
  displayValue?: string;
  value?: number;
}

interface EspnStandingsEntry {
  team?: { id?: string | number; displayName?: string };
  stats?: EspnStat[];
}

function statValue(stats: EspnStat[], names: string[]): number | null {
  for (const n of names) {
    const s = stats.find((x) => x?.name === n);
    if (!s) continue;
    if (typeof s.value === "number" && Number.isFinite(s.value)) return s.value;
    const d = parseFloat(String(s.displayValue ?? ""));
    if (Number.isFinite(d)) return d;
  }
  return null;
}

/** واکشی و پارس جدول رسمی فصل یک لیگ (با کش ۶۰ دقیقه‌ای) */
export async function getLeagueStandings(slug: string): Promise<LeagueStandings | null> {
  const hit = cache.get(slug);
  if (hit) {
    if (hit.failed && Date.now() - hit.at < FAIL_TTL_MS) return hit.data;
    if (!hit.failed && Date.now() - hit.at < CACHE_TTL_MS) return hit.data;
  }

  const data = await fetchJson<{
    children?: { standings?: { entries?: EspnStandingsEntry[] } }[];
    standings?: { entries?: EspnStandingsEntry[] };
  }>(`https://site.api.espn.com/apis/v2/sports/soccer/${slug}/standings`);

  const rawEntries = data?.children?.[0]?.standings?.entries ?? data?.standings?.entries ?? null;
  if (!rawEntries || rawEntries.length < 4) {
    cache.set(slug, { data: null, at: Date.now(), failed: true });
    return null;
  }

  const entries: StandingsEntry[] = [];
  for (const e of rawEntries) {
    const id = String(e?.team?.id ?? "");
    const name = String(e?.team?.displayName ?? "");
    if (!id || !name) continue;
    const stats = e?.stats ?? [];
    const gp = statValue(stats, ["gamesPlayed", "matchesPlayed", "played"]);
    const gf = statValue(stats, ["pointsFor", "goalsFor", "goalsScored"]);
    const ga = statValue(stats, ["pointsAgainst", "goalsAgainst"]);
    const rank = statValue(stats, ["rank", "playoffSeed", "position"]);
    if (gp === null || gf === null || ga === null || gp < 1) continue;
    entries.push({
      teamId: id,
      teamName: name,
      rank: Math.round(rank ?? 0),
      gp: Math.round(gp),
      gf: Math.round(gf),
      ga: Math.round(ga),
    });
  }
  if (entries.length < 4) {
    cache.set(slug, { data: null, at: Date.now(), failed: true });
    return null;
  }

  const sumGp = entries.reduce((s, x) => s + x.gp, 0);
  const sumGf = entries.reduce((s, x) => s + x.gf, 0);
  const leagueTeamAvg = sumGp > 0 ? sumGf / sumGp : 0; // گل هر تیم در هر بازی
  const totalGoalsPerGame = leagueTeamAvg * 2;

  const byId = new Map<string, StandingsEntry>();
  const byName = new Map<string, StandingsEntry>();
  for (const e of entries) {
    byId.set(e.teamId, e);
    byName.set(normTeam(e.teamName), e);
  }

  const payload: LeagueStandings = {
    slug,
    entries,
    leagueTeamAvg,
    totalGoalsPerGame,
    fetchedAt: Date.now(),
    byId,
    byName,
  };
  cache.set(slug, { data: payload, at: Date.now(), failed: false });
  return payload;
}

/** یافتن سطر جدول یک تیم — ابتدا با شناسه رسمی، سپس با نام نرمال‌شده */
export function findStandingsEntry(
  st: LeagueStandings | null,
  teamId: string | null | undefined,
  teamName: string
): StandingsEntry | null {
  if (!st) return null;
  if (teamId && st.byId.has(String(teamId))) return st.byId.get(String(teamId)) ?? null;
  return st.byName.get(normTeam(teamName)) ?? null;
}
