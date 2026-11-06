// ─────────────────────────────────────────────────────────────────────────────
// ارائه‌دهنده‌های ضرایب رایگان — Free Live Odds Providers (v5.0)
//
// ۱) ESPN Core API (بدون کلید): ضرایب بوک‌میکرها + احتمالات زنده Analytics
// ۲) Polymarket Gamma (بدون کلید): ضرایب Zero-Vig بازار پیش‌بینی آزاد
// ۳) The Odds API v4 (کلید رایگان ۵۰۰/ماه): بوک‌میکرهای حرفه‌ای
// ۴) Odds-API.io (کلید رایگان ۱۰۰/ساعت): ۴۵۰+ بوک‌میکر شامل Pinnacle
// ۵) Football-Data.co.uk (بدون کلید): مخزن CSV خطوط افتتاحیه/پایانی پیناکل برای بک‌تست CLV
//
// همه پروب‌ها با کش ۵ دقیقه‌ای — ضد Rate-Limit.
// ─────────────────────────────────────────────────────────────────────────────

import type { OddsComparisonRowDTO, OddsSourceStatusDTO } from "@/lib/types";

// ═════════════════════ ابزارها ═════════════════════

/** تبدیل ضریب آمریکایی (+150 / −120) به ضریب اعشاری استاندارد */
export function americanToDecimal(americanOdds: number): number {
  if (!americanOdds || Number.isNaN(americanOdds)) return 0;
  return americanOdds > 0
    ? Number((americanOdds / 100 + 1).toFixed(2))
    : Number((100 / Math.abs(americanOdds) + 1).toFixed(2));
}

async function fetchJson(url: string, timeoutMs = 8000): Promise<{ ok: boolean; status: number; data: unknown; headers: Headers }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: "no-store", headers: { Accept: "application/json" } });
    const data = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, data, headers: res.headers };
  } finally {
    clearTimeout(t);
  }
}

async function fetchText(url: string, timeoutMs = 12000): Promise<{ ok: boolean; status: number; text: string }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
    const text = await res.text();
    return { ok: res.ok, status: res.status, text };
  } finally {
    clearTimeout(t);
  }
}

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
};

/** عبارت American یا Decimal → Decimal */
function toDecimal(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return v > 1 ? v : null;
  const s = String(v).trim();
  if (s.startsWith("+") || s.startsWith("−") || s.startsWith("-")) {
    const d = americanToDecimal(Math.abs(parseFloat(s.replace("−", "-"))));
    return d > 1 ? d : null;
  }
  const n = parseFloat(s);
  return Number.isFinite(n) && n > 1 ? n : null;
}

// ═════════════════════ ۱) ESPN Core ═════════════════════

/** externalId با قالب espn-<slug>-<eventId> → دو جزء آن */
export function parseEspnExternalId(externalId: string | null | undefined): { slug: string; eventId: string } | null {
  if (!externalId || !externalId.startsWith("espn-")) return null;
  const parts = externalId.split("-");
  if (parts.length < 3) return null;
  const eventId = parts[parts.length - 1];
  const slug = parts.slice(1, -1).join("-");
  return slug && eventId ? { slug, eventId } : null;
}

const ESPN_PROVIDER_NAMES: Record<string, string> = {
  "2000": "Bet365",
  "31": "William Hill",
  "36": "Unibet",
  "38": "Caesars",
  "19": "DraftKings",
  "45": "BetMGM",
  "47": "FanDuel",
};

export interface EspnCoreOdds {
  bookmakers: { id: string; name: string; home: number | null; draw: number | null; away: number | null; ouLine: number | null; over: number | null; under: number | null }[];
  probabilities: { home: number | null; draw: number | null; away: number | null } | null;
}

/** ضرایب + احتمالات زنده ESPN Core برای یک رویداد (بدون کلید) */
export async function fetchEspnCoreOdds(slug: string, eventId: string): Promise<EspnCoreOdds | null> {
  const base = `https://sports.core.api.espn.com/v2/sports/soccer/leagues/${slug}/events/${eventId}/competitions/${eventId}`;
  const [oddsRes, probRes] = await Promise.all([
    fetchJson(`${base}/odds`).catch(() => null),
    fetchJson(`${base}/probabilities`).catch(() => null),
  ]);

  let bookmakers: EspnCoreOdds["bookmakers"] = [];
  const oddsData = oddsRes?.data as { items?: Record<string, unknown>[] } | null;
  if (oddsData && Array.isArray(oddsData.items)) {
    bookmakers = oddsData.items.map((item) => {
      const provider = item.provider as { id?: string | number; name?: string } | undefined;
      const ml = item.moneyline as { home?: Record<string, unknown>; away?: Record<string, unknown>; draw?: Record<string, unknown> } | undefined;
      const ou = item.overUnder as { line?: unknown; over?: Record<string, unknown>; under?: Record<string, unknown> } | undefined;
      const pick = (o?: Record<string, unknown>) => toDecimal(o?.american ?? o?.decimal ?? o?.value);
      return {
        id: String(provider?.id ?? ""),
        name: provider?.name ?? ESPN_PROVIDER_NAMES[String(provider?.id ?? "")] ?? `Provider ${provider?.id ?? "?"}`,
        home: pick(ml?.home),
        draw: pick(ml?.draw),
        away: pick(ml?.away),
        ouLine: num(ou?.line),
        over: pick(ou?.over),
        under: pick(ou?.under),
      };
    }).filter((b) => b.home !== null || b.away !== null || b.over !== null);
  }

  let probabilities: EspnCoreOdds["probabilities"] = null;
  const probData = probRes?.data as { items?: Record<string, unknown>[]; statistics?: Record<string, unknown>[] } | null;
  const probItems = probData?.items ?? probData?.statistics ?? [];
  if (Array.isArray(probItems) && probItems.length > 0) {
    const first = probItems[0] as { homeTeamProbability?: { winPercentage?: unknown }; awayTeamProbability?: { winPercentage?: unknown }; drawPercentage?: unknown; tiePercentage?: unknown };
    const home = num(first?.homeTeamProbability?.winPercentage);
    const away = num(first?.awayTeamProbability?.winPercentage);
    const draw = num(first?.drawPercentage ?? first?.tiePercentage);
    if (home !== null && away !== null) {
      const s = (home + away + (draw ?? 0)) / 100 || 1;
      probabilities = { home: home / 100 / s, away: away / 100 / s, draw: (draw ?? 0) / 100 / s };
    }
  }

  if (bookmakers.length === 0 && !probabilities) return null;
  return { bookmakers, probabilities };
}

// ═════════════════════ ۲) Polymarket Gamma ═════════════════════

const POLYMARKET_URL = "https://gamma-api.polymarket.com/events?active=true&closed=false&tag_slug=soccer&limit=30";

interface PolyRow { title: string; home: string | null; draw: string | null; away: string | null; question: string }

function normTokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/\b(fc|cf|sc|ac|as|afc|cfc|united|city)\b/g, " ")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2);
}

function teamMatch(team: string, candidate: string): boolean {
  const tt = normTokens(team);
  const ct = normTokens(candidate);
  if (tt.length === 0 || ct.length === 0) return false;
  return tt.some((t) => ct.includes(t)) || ct.some((c) => tt.includes(c));
}

/** قیمت‌های بدون کارمزد بازار پیش‌بینی Polymarket — با تطبیق فازی نام تیم‌ها */
export async function fetchPolymarketSoccer(homeTeam: string, awayTeam: string): Promise<PolyRow[]> {
  const res = await fetchJson(POLYMARKET_URL).catch(() => null);
  const data = res?.data as { title?: string; markets?: { question?: string; outcomes?: string; outcomePrices?: string }[] }[] | null;
  if (!Array.isArray(data)) return [];
  const rows: PolyRow[] = [];
  for (const ev of data) {
    for (const mk of ev.markets ?? []) {
      let outcomes: string[] = [];
      let prices: string[] = [];
      try { outcomes = JSON.parse(mk.outcomes ?? "[]"); } catch { continue; }
      try { prices = JSON.parse(mk.outcomePrices ?? "[]"); } catch { continue; }
      if (outcomes.length < 2 || prices.length < 2) continue;
      // دوبی/سه‌تایی: نام تیم‌ها معمولا خود outcomes هستند
      let home: string | null = null;
      let draw: string | null = null;
      let away: string | null = null;
      for (let i = 0; i < outcomes.length; i++) {
        const price = parseFloat(prices[i]);
        if (!Number.isFinite(price) || price <= 0.01 || price >= 0.99) continue;
        const odds = (1 / price).toFixed(2);
        if (outcomes[i].toLowerCase() === "draw") draw = odds;
        else if (teamMatch(homeTeam, outcomes[i])) home = odds;
        else if (teamMatch(awayTeam, outcomes[i])) away = odds;
      }
      if (home || away) {
        rows.push({ title: ev.title ?? "", question: mk.question ?? "", home, draw, away });
      }
    }
  }
  return rows;
}

// ═════════════════════ ۳) The Odds API v4 — وضعیت و اعتبار ═════════════════════

export async function probeTheOddsApi(key: string): Promise<{ ok: boolean; detail: string; remaining: number | null }> {
  if (!key) return { ok: false, detail: "کلید وارد نشده", remaining: null };
  const res = await fetchJson(`https://api.the-odds-api.com/v4/sports/?apiKey=${encodeURIComponent(key)}`).catch(() => null);
  if (!res) return { ok: false, detail: "شبکه در دسترس نیست", remaining: null };
  const remaining = num(res.headers.get("x-requests-remaining"));
  if (res.ok) return { ok: true, detail: remaining !== null ? `فعال — اعتبار باقی‌مانده: ${remaining} درخواست` : "فعال", remaining };
  if (res.status === 401 || res.status === 422) return { ok: false, detail: "کلید نامعتبر یا منقضی", remaining };
  if (res.status === 429) return { ok: false, detail: "سهمیه ماهانه تمام شده", remaining };
  return { ok: false, detail: `خطای HTTP ${res.status}`, remaining };
}

// ═════════════════════ ۴) Odds-API.io — وضعیت ═════════════════════

export async function probeOddsApiIo(key: string): Promise<{ ok: boolean; detail: string }> {
  if (!key) return { ok: false, detail: "کلید وارد نشده — رایگان ۱۰۰ درخواست/ساعت از ۴۵۰ بوک‌میکر" };
  const res = await fetchJson(`https://odds-api.io/api/v1/sports?apiKey=${encodeURIComponent(key)}`).catch(() => null);
  if (!res) return { ok: false, detail: "شبکه در دسترس نیست" };
  if (res.ok) return { ok: true, detail: "فعال — ۴۵۰+ بوک‌میکر شامل پیناکل و 1xBet" };
  if (res.status === 401 || res.status === 403) return { ok: false, detail: "کلید نامعتبر" };
  return { ok: false, detail: `خطای HTTP ${res.status}` };
}

// ═════════════════════ ۵) Football-Data.co.uk — CSV پیناکل ═════════════════════

export interface FootballDataRow {
  date: string;
  homeTeam: string;
  awayTeam: string;
  fthg: number | null;
  ftag: number | null;
  psh: number | null;
  psd: number | null;
  psa: number | null;
  pOver25: number | null;
  pUnder25: number | null;
}

const FOOTBALL_DATA_LEAGUES: Record<string, { file: string; name: string }> = {
  E0: { file: "E0", name: "لیگ برتر انگلیس" },
  SP1: { file: "SP1", name: "لالیگا اسپانیا" },
  I1: { file: "I1", name: "سری آ ایتالیا" },
  D1: { file: "D1", name: "بوندسلیگا آلمان" },
  F1: { file: "F1", name: "لیگ ۱ فرانسه" },
};

function currentSeason(): string[] {
  const now = new Date();
  const y = now.getFullYear();
  const yy = now.getMonth() >= 6 ? y : y - 1; // از جولای فصل جدید
  const s = `${yy}`.slice(2);
  const s2 = `${yy + 1}`.slice(2);
  return [`${s}${s2}`, `${Number(s) - 1}${s}`];
}

/** پارس CSV فوتبال‌دیتا: خطوط PSH/PSD/PSA/P>2.5/P<2.5 پیناکل */
export async function fetchFootballDataOdds(league = "E0", limit = 12): Promise<{ leagueName: string; season: string; rows: FootballDataRow[] } | null> {
  const meta = FOOTBALL_DATA_LEAGUES[league] ?? FOOTBALL_DATA_LEAGUES.E0;
  for (const season of currentSeason()) {
    const res = await fetchText(`https://www.football-data.co.uk/mmz4281/${season}/${meta.file}.csv`).catch(() => null);
    if (!res || !res.ok || res.text.length < 100) continue;
    const lines = res.text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 5) continue;
    // حذف BOM ابتدای فایل CSV
    const header = lines[0].replace(/^\uFEFF/, "").split(",");
    const idx = (name: string) => header.findIndex((h) => h.trim().toUpperCase() === name);
    const iDiv = idx("DIV");
    const iDate = idx("DATE");
    const iHome = idx("HOMETEAM");
    const iAway = idx("AWAYTEAM");
    const iFthg = idx("FTHG");
    const iFtag = idx("FTAG");
    const iPsh = idx("PSH");
    const iPsd = idx("PSD");
    const iPsa = idx("PSA");
    const iOver = idx("P>2.5");
    const iUnder = idx("P<2.5");
    if (iHome < 0 || iAway < 0 || iPsh < 0) continue;
    const rows: FootballDataRow[] = [];
    for (let i = lines.length - 1; i >= 1 && rows.length < limit; i--) {
      const c = lines[i].split(",");
      if (c.length < header.length - 3) continue;
      if (iDiv >= 0 && c[iDiv] !== meta.file) continue;
      // فقط بازی‌هایی که خط پیناکل (PSH) منتشر شده — هدف فید، بک‌تست CLV است
      const pshRaw = iPsh >= 0 ? (c[iPsh] ?? "").trim() : "";
      if (!pshRaw) continue;
      const pickN = (v: string | undefined) => {
        const n = parseFloat((v ?? "").trim());
        return Number.isFinite(n) && n > 1 ? n : null;
      };
      rows.push({
        date: (c[iDate] ?? "").trim(),
        homeTeam: (c[iHome] ?? "").trim(),
        awayTeam: (c[iAway] ?? "").trim(),
        fthg: iFthg >= 0 ? parseInt(c[iFthg]) || null : null,
        ftag: iFtag >= 0 ? parseInt(c[iFtag]) || null : null,
        psh: pickN(c[iPsh]),
        psd: pickN(c[iPsd]),
        psa: pickN(c[iPsa]),
        pOver25: iOver >= 0 ? pickN(c[iOver]) : null,
        pUnder25: iUnder >= 0 ? pickN(c[iUnder]) : null,
      });
    }
    if (rows.length > 0) return { leagueName: meta.name, season, rows };
  }
  return null;
}

// ═════════════════════ پروب جامع ۵ منبع (کش ۵ دقیقه) ═════════════════════

interface ProbeCache {
  at: number;
  payload: OddsSourceStatusDTO[];
}
let probeCache: ProbeCache | null = null;
const PROBE_TTL_MS = 5 * 60_000;

export async function probeOddsSources(opts: { oddsApiKey?: string; oddsApiIoKey?: string; force?: boolean }): Promise<OddsSourceStatusDTO[]> {
  if (!opts.force && probeCache && Date.now() - probeCache.at < PROBE_TTL_MS) return probeCache.payload;

  const t0 = Date.now();
  const [espn, poly, oddsApi, oddsIo, fd] = await Promise.all([
    (async (): Promise<OddsSourceStatusDTO> => {
      const t = Date.now();
      try {
        const core = await fetchEspnCoreOdds("eng.1", "0"); // endpoint بدون رویداد → 404 قابل تشخیص
        void core;
        // پروب واقعی: یک رویداد واقعی از اسکوربورد امروز
        const sb = await fetchJson("https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard").catch(() => null);
        const events = (sb?.data as { events?: { id: string }[] } | null)?.events ?? [];
        if (events.length > 0) {
          const core2 = await fetchEspnCoreOdds("eng.1", events[0].id);
          const books = core2?.bookmakers.length ?? 0;
          return {
            key: "ESPN_CORE",
            label: "ESPN Core Odds + Analytics",
            ok: books > 0 || Boolean(core2?.probabilities),
            detail: books > 0 ? `فعال — ${books} بوک‌میکر در رویداد زنده` : core2?.probabilities ? "فعال — احتمالات Analytics زنده" : "اسکوربورد فعال — هنوز رویداد دارای ضریب نیست",
            latencyMs: Date.now() - t,
            keyRequired: false,
            keyPresent: true,
            signupUrl: "https://gist.github.com/nntrn/ee26cb2a0716de0947a0a4e9a157bc1c",
            docsUrl: "https://github.com/pseudo-r/Public-ESPN-API/blob/main/docs/sports/soccer.md",
            oddsCount: books,
          };
        }
        return {
          key: "ESPN_CORE", label: "ESPN Core Odds + Analytics", ok: Boolean(sb?.ok),
          detail: sb?.ok ? "فعال (اسکوربورد) — رویداد دارای ضریب یافت نشد" : "پاسخ نگرفت",
          latencyMs: Date.now() - t, keyRequired: false, keyPresent: true,
          signupUrl: "https://gist.github.com/nntrn/ee26cb2a0716de0947a0a4e9a157bc1c",
          docsUrl: "https://github.com/pseudo-r/Public-ESPN-API/blob/main/docs/sports/soccer.md", oddsCount: 0,
        };
      } catch {
        return { key: "ESPN_CORE", label: "ESPN Core Odds + Analytics", ok: false, detail: "خطای شبکه", latencyMs: Date.now() - t, keyRequired: false, keyPresent: true, signupUrl: "", docsUrl: "", oddsCount: 0 };
      }
    })(),
    (async (): Promise<OddsSourceStatusDTO> => {
      const t = Date.now();
      try {
        const res = await fetchJson(POLYMARKET_URL).catch(() => null);
        const evs = Array.isArray(res?.data) ? (res?.data as unknown[]).length : 0;
        return {
          key: "POLYMARKET",
          label: "Polymarket Gamma (Zero-Vig)",
          ok: evs > 0,
          detail: evs > 0 ? `فعال — ${evs} رویداد فوتبال با قیمت بدون کارمزد بازار آزاد` : "پاسخ نگرفت",
          latencyMs: Date.now() - t,
          keyRequired: false,
          keyPresent: true,
          signupUrl: "https://gamma-api.polymarket.com/events?active=true&closed=false&tag_slug=soccer&limit=30",
          docsUrl: "https://oddspapi.io/blog/polymarket-api-gamma-clob-json-format",
          oddsCount: evs,
        };
      } catch {
        return { key: "POLYMARKET", label: "Polymarket Gamma (Zero-Vig)", ok: false, detail: "خطای شبکه", latencyMs: Date.now() - t, keyRequired: false, keyPresent: true, signupUrl: "", docsUrl: "", oddsCount: 0 };
      }
    })(),
    (async (): Promise<OddsSourceStatusDTO> => {
      const t = Date.now();
      const key = opts.oddsApiKey?.trim() || "3c0379d120a8bbd1e4ead8a8c4a7b637";
      const r = await probeTheOddsApi(key).catch(() => ({ ok: false, detail: "خطای شبکه", remaining: null }));
      return {
        key: "THE_ODDS_API", label: "The Odds API v4", ok: r.ok, detail: r.detail,
        latencyMs: Date.now() - t, keyRequired: true, keyPresent: Boolean(key),
        signupUrl: "https://the-odds-api.com/liveapi/guides/v4/", docsUrl: "https://the-odds-api.com/liveapi/guides/v4/",
        oddsCount: r.remaining ?? 0,
      };
    })(),
    (async (): Promise<OddsSourceStatusDTO> => {
      const t = Date.now();
      const r = await probeOddsApiIo(opts.oddsApiIoKey?.trim() ?? "").catch(() => ({ ok: false, detail: "خطای شبکه" }));
      return {
        key: "ODDS_API_IO", label: "Odds-API.io (۴۵۰+ بوک‌میکر)", ok: r.ok, detail: r.detail,
        latencyMs: Date.now() - t, keyRequired: true, keyPresent: Boolean(opts.oddsApiIoKey?.trim()),
        signupUrl: "https://odds-api.io/", docsUrl: "https://github.com/odds-api-io/odds-api-python", oddsCount: 0,
      };
    })(),
    (async (): Promise<OddsSourceStatusDTO> => {
      const t = Date.now();
      try {
        const fd2 = await fetchFootballDataOdds("E0", 3);
        return {
          key: "FOOTBALL_DATA", label: "Football-Data.co.uk (بک‌تست CLV)", ok: Boolean(fd2),
          detail: fd2 ? `فعال — فصل ${fd2.season} با خطوط پیناکل (PSH/PSD/PSA)` : "CSV در دسترس نیست",
          latencyMs: Date.now() - t, keyRequired: false, keyPresent: true,
          signupUrl: "https://www.football-data.co.uk/notes.txt", docsUrl: "https://github.com/withqwerty/open-football",
          oddsCount: fd2?.rows.length ?? 0,
        };
      } catch {
        return { key: "FOOTBALL_DATA", label: "Football-Data.co.uk (بک‌تست CLV)", ok: false, detail: "خطای شبکه", latencyMs: Date.now() - t, keyRequired: false, keyPresent: true, signupUrl: "", docsUrl: "", oddsCount: 0 };
      }
    })(),
  ]);

  const payload = [espn, poly, oddsApi, oddsIo, fd];
  probeCache = { at: Date.now(), payload };
  if (Date.now() - t0 > 15_000) probeCache = { at: Date.now() - PROBE_TTL_MS + 60_000, payload }; // پروب کند → زودتر منقضی
  return payload;
}

// ═════════════════════ مقایسه ضرایب یک بازی بین منابع ═════════════════════

/**
 * جدول مقایسه‌ای تب ۲: ESPN Core (بوک‌میکرها) ↔ Polymarket (Zero-Vig) ↔
 * احتمالات Analytics ESPN ↔ خط پایه فعلی سیستم
 */
export async function fetchMatchOddsComparison(m: {
  externalId?: string | null;
  homeTeam: string;
  awayTeam: string;
  oddsHome: number;
  oddsDraw: number;
  oddsAway: number;
}): Promise<{ rows: OddsComparisonRowDTO[]; espnProbabilities: { home: number; draw: number; away: number } | null }> {
  const rows: OddsComparisonRowDTO[] = [];
  let espnProbabilities: { home: number; draw: number; away: number } | null = null;

  const parsed = parseEspnExternalId(m.externalId);
  if (parsed) {
    const core = await fetchEspnCoreOdds(parsed.slug, parsed.eventId).catch(() => null);
    if (core) {
      // بهترین قیمت هر نتیجه بین بوک‌میکرهای ESPN
      const best = (k: "home" | "draw" | "away") => {
        let v: number | null = null;
        let name = "";
        for (const b of core.bookmakers) {
          const val = b[k];
          if (val && (v === null || val > v)) {
            v = val;
            name = b.name;
          }
        }
        return { odds: v, book: name };
      };
      const h = best("home");
      const d = best("draw");
      const a = best("away");
      if (h.odds || a.odds) {
        rows.push({
          source: "ESPN_CORE",
          sourceLabel: `ESPN Core — بهترین بوک‌میکر (${h.book || a.book || d.book || "—"})`,
          home: h.odds, draw: d.odds, away: a.odds,
          note: "تبدیل American→Decimal از sports.core.api (بدون کلید)",
        });
      }
      if (core.probabilities) {
        const pr = core.probabilities;
        if (pr.home !== null && pr.draw !== null && pr.away !== null) {
          espnProbabilities = { home: pr.home, draw: pr.draw, away: pr.away };
          rows.push({
            source: "ESPN_ANALYTICS",
            sourceLabel: "ESPN Analytics Predictor",
            home: Number((1 / pr.home).toFixed(2)),
            draw: Number((1 / pr.draw).toFixed(2)),
            away: Number((1 / pr.away).toFixed(2)),
            note: "احتمال زنده ESPN → معکوس به ضریب عادلانه",
          });
        }
      }
    }
  }

  try {
    const poly = await fetchPolymarketSoccer(m.homeTeam, m.awayTeam);
    const hit = poly[0];
    if (hit) {
      rows.push({
        source: "POLYMARKET",
        sourceLabel: "Polymarket (Zero-Vig)",
        home: hit.home ? parseFloat(hit.home) : null,
        draw: hit.draw ? parseFloat(hit.draw) : null,
        away: hit.away ? parseFloat(hit.away) : null,
        note: "1/price بازار پیش‌بینی آزاد — بدون حاشیه بوک‌میکر",
      });
    }
  } catch {
    // منبع اختیاری است
  }

  rows.push({
    source: "SYSTEM_BASELINE",
    sourceLabel: "خط پایه فعلی سیستم",
    home: m.oddsHome,
    draw: m.oddsDraw,
    away: m.oddsAway,
    note: "ESPN Scoreboard / The Odds API / موتور",
  });

  return { rows, espnProbabilities };
}
