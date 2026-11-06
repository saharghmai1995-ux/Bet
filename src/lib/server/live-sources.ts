// ─────────────────────────────────────────────────────────────────────────────
// منابع دیتای زنده (Zero-Key Real-Time Sources) — v4.0
//   ۱) ESPN site API  : اسکوربورد زنده، ترکیب/داور/ورزشگاه، اخبار — بدون کلید
//   ۲) TheSportsDB    : بازی‌های پیش‌رو با کلید عمومی «123» — بدون ثبت‌نام
//   ۳) Open-Meteo     : آب‌وهوای لحظه‌ای ورزشگاه — بدون کلید
//   ۴) The Odds API v4: ضرایب زنده بوک‌میکرهای اروپایی — کلید کاربر (پلن رایگان)
//
// همه فراخوانی‌ها server-side هستند؛ خروجی‌ها به ساختار کنونیکال LiveXxx نگاشت
// می‌شوند تا لایه ingest مستقل از شکل JSON منابع کار کند.
// ─────────────────────────────────────────────────────────────────────────────

/** ۶ لیگ معتبر با میانگین گل تاریخی (مبنای لامبدای پایه) */
export interface LeagueMeta {
  slug: string; // اسلاگ ESPN
  name: string; // نام فارسی لیگ
  oddsKey: string; // کلید لیگ در The Odds API
  sportsDbId: string; // شناسه لیگ در TheSportsDB
  avgGoals: number; // میانگین گل تاریخی لیگ
}

export const ESPN_LEAGUES: LeagueMeta[] = [
  { slug: "eng.1", name: "لیگ برتر انگلیس", oddsKey: "soccer_epl", sportsDbId: "4328", avgGoals: 2.85 },
  { slug: "esp.1", name: "لالیگا اسپانیا", oddsKey: "soccer_spain_la_liga", sportsDbId: "4335", avgGoals: 2.55 },
  { slug: "ita.1", name: "سری آ ایتالیا", oddsKey: "soccer_italy_serie_a", sportsDbId: "4332", avgGoals: 2.62 },
  { slug: "ger.1", name: "بوندسلیگا آلمان", oddsKey: "soccer_germany_bundesliga", sportsDbId: "4331", avgGoals: 3.12 },
  { slug: "fra.1", name: "لیگ ۱ فرانسه", oddsKey: "soccer_france_ligue_one", sportsDbId: "4334", avgGoals: 2.7 },
  { slug: "uefa.champions", name: "لیگ قهرمانان اروپا", oddsKey: "soccer_uefa_champs_league", sportsDbId: "4480", avgGoals: 2.95 },
];

// ═════════════════════ ساختارهای کنونیکال ═════════════════════

export interface LiveMatchEvent {
  externalId: string;
  leagueSlug: string;
  leagueName: string;
  avgGoals: number;
  homeTeam: string;
  awayTeam: string;
  homeLogo: string | null;
  awayLogo: string | null;
  homeForm: string; // مثل WWDLW
  awayForm: string;
  homeRecord: string | null; // مثل 3-4-2 (برده-مساوی-باخت)
  awayRecord: string | null;
  kickoff: string; // ISO
  statusDetail: string; // مثل Scheduled / HT / FT
  statusState: "pre" | "in" | "post";
  homeScore: number | null;
  awayScore: number | null;
  venueName: string | null;
  venueCity: string | null;
  /** ضرایب پایه ESPN (معمولاً DraftKings) — اعشاری */
  espnOdds: { provider: string; home: number | null; draw: number | null; away: number | null; over25: number | null; under25: number | null } | null;
}

export interface LiveNewsItem {
  headline: string;
  description: string;
  published: string;
  url: string;
  leagueSlug: string;
}

export interface LiveWeather {
  city: string;
  tempC: number;
  windKmh: number;
  precipMm: number;
  adverse: boolean; // بارش > ۲mm یا باد > ۳۰km/h → تعدیل جوی −۸٪ روی λ
}

export interface OddsApiLine {
  home: number;
  draw: number;
  away: number;
  over25: number | null;
  under25: number | null;
}

export interface OddsApiEvent {
  matchKey: string; // «hometeam::awayteam» نرمال‌شده
  homeTeam: string;
  awayTeam: string;
  commenceTime: string;
  books: { key: string; label: string; line: OddsApiLine }[];
}

export interface OddsApiResult {
  events: OddsApiEvent[];
  requestsUsed: number;
  requestsRemaining: number | null;
}

// ═════════════════════ ابزار پایه ═════════════════════

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

/** تبدیل ضرایب آمریکایی ESPN (مثل −150 یا +310) به اعشاری */
export function americanToDecimal(ml: number): number {
  if (!Number.isFinite(ml) || ml === 0) return 0;
  return ml > 0 ? Math.round((1 + ml / 100) * 100) / 100 : Math.round((1 + 100 / Math.abs(ml)) * 100) / 100;
}

/** نرمال‌سازی نام تیم برای تطبیق بین منابع (ESPN ↔ Odds API ↔ TheSportsDB) */
export function normTeam(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[éèê]/g, "e")
    .replace(/[áàâ]/g, "a")
    .replace(/[óòô]/g, "o")
    .replace(/[úùû]/g, "u")
    .replace(/[íìî]/g, "i")
    .replace(/\b(fc|cf|afc|sc|cd|ac|as|ss|ssc|calcio|club|deportivo|sv|tsv|vfl|vfb|bsc)\b/g, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** استخراج رشته فرم WWDLW از پاسخ ESPN (گاهی با فاصله/کاما می‌آید) */
function cleanForm(raw: unknown): string {
  const s = typeof raw === "string" ? raw : "";
  return s.toUpperCase().replace(/[^WDL]/g, "").slice(0, 5) || "N/A";
}

/** «3-4-2» → درصد امتیاز فصل (برده-مساوی-باخت) */
export function recordToPointsPct(rec: string | null): number | null {
  if (!rec) return null;
  const parts = rec.split("-").map((n) => parseInt(n, 10));
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
  const [w, d, l] = parts;
  const games = w + d + l;
  if (games === 0) return null;
  return (w * 3 + d) / (games * 3);
}

// ═════════════════════ ۱) ESPN — اسکوربورد ═════════════════════


function parseEspnOdds(comp: any): LiveMatchEvent["espnOdds"] {
  const oddsArr = comp?.odds;
  if (!Array.isArray(oddsArr) || oddsArr.length === 0) return null;
  const o = oddsArr[0];
  const dec = (v: any): number | null => {
    if (typeof v === "number" && Number.isFinite(v) && v >= 1.01) return v;
    if (typeof v === "number" && Number.isFinite(v) && v !== 0) return americanToDecimal(v);
    return null;
  };
  // ساختار soccer: homeTeamOdds.moneyLine / drawOdds.moneyLine / awayTeamOdds.moneyLine
  // قیمت‌های Over/Under گاهی در current یا در total ارائه می‌شوند
  const cur = o?.current ?? o;
  const over = dec(cur?.over?.price ?? cur?.over?.american ?? null);
  const under = dec(cur?.under?.price ?? cur?.under?.american ?? null);
  return {
    provider: o?.provider?.name ?? "ESPN",
    home: dec(o?.homeTeamOdds?.moneyLine ?? o?.homeTeamOdds?.moneyline ?? null),
    draw: dec(o?.drawOdds?.moneyLine ?? o?.drawOdds?.moneyline ?? null),
    away: dec(o?.awayTeamOdds?.moneyLine ?? o?.awayTeamOdds?.moneyline ?? null),
    over25: over,
    under25: under,
  };
}

function parseEspnEvent(ev: any, league: LeagueMeta): LiveMatchEvent | null {
  const comp = ev?.competitions?.[0];
  if (!comp) return null;
  const home = (comp.competitors ?? []).find((c: any) => c?.homeAway === "home");
  const away = (comp.competitors ?? []).find((c: any) => c?.homeAway === "away");
  if (!home?.team?.displayName || !away?.team?.displayName) return null;

  const recOf = (c: any): string | null => {
    const rec = (c?.records ?? []).find((r: any) => typeof r?.summary === "string" && /^\d+-\d+-\d+$/.test(r.summary));
    return rec?.summary ?? null;
  };

  const state = comp?.status?.type?.state === "in" ? "in" : comp?.status?.type?.state === "post" ? "post" : "pre";
  const num = (v: any): number | null => {
    const n = parseInt(String(v ?? ""), 10);
    return Number.isFinite(n) ? n : null;
  };

  return {
    externalId: `espn-${league.slug}-${String(ev.id)}`,
    leagueSlug: league.slug,
    leagueName: league.name,
    avgGoals: league.avgGoals,
    homeTeam: home.team.displayName,
    awayTeam: away.team.displayName,
    homeLogo: home.team?.logo ?? null,
    awayLogo: away.team?.logo ?? null,
    homeForm: cleanForm(home.form),
    awayForm: cleanForm(away.form),
    homeRecord: recOf(home),
    awayRecord: recOf(away),
    kickoff: ev.date,
    statusDetail: comp?.status?.type?.shortDetail ?? ev?.status?.type?.shortDetail ?? "Scheduled",
    statusState: state,
    homeScore: state === "pre" ? null : num(home.score),
    awayScore: state === "pre" ? null : num(away.score),
    venueName: comp?.venue?.fullName ?? null,
    venueCity: comp?.venue?.address?.city ?? null,
    espnOdds: parseEspnOdds(comp),
  };
}

/** اسکوربورد ESPN برای یک روز مشخص (فرمت YYYYMMDD) */
export async function fetchEspnScoreboardDay(slug: string, dateCompact: string): Promise<any[] | null> {
  const data = await fetchJson<any>(
    `https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/scoreboard?dates=${dateCompact}`
  );
  return data?.events ?? null;
}

/**
 * جمع‌آوری بازی‌های بازه [fromOffset..toOffset] روز نسبت به امروز برای همه لیگ‌ها.
 * ESPN محدودیت کلید ندارد و برای هر لیگ-روز یک پاسخ سبک برمی‌گرداند.
 */
export async function fetchEspnEvents(fromOffset = 0, toOffset = 7): Promise<LiveMatchEvent[]> {
  const jobs: { league: LeagueMeta; day: string }[] = [];
  const fmt = (d: Date) =>
    `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  for (const league of ESPN_LEAGUES) {
    for (let off = fromOffset; off <= toOffset; off++) {
      const d = new Date(Date.now() + off * 24 * 3600 * 1000);
      jobs.push({ league, day: fmt(d) });
    }
  }

  const settled = await Promise.allSettled(
    jobs.map(async ({ league, day }) => {
      const events = await fetchEspnScoreboardDay(league.slug, day);
      if (!events) return [];
      return events.map((ev: any) => parseEspnEvent(ev, league)).filter((x): x is LiveMatchEvent => x !== null);
    })
  );

  const byId = new Map<string, LiveMatchEvent>();
  for (const r of settled) {
    if (r.status !== "fulfilled") continue;
    for (const ev of r.value) {
      // پاسخ‌های هم‌پوشان روزها → dedup بر اساس externalId
      if (!byId.has(ev.externalId)) byId.set(ev.externalId, ev);
    }
  }
  return [...byId.values()];
}

// ═════════════════════ ۲) ESPN — اخبار زنده ═════════════════════

export async function fetchEspnNews(): Promise<LiveNewsItem[]> {
  const slugs = ["eng.1", "esp.1", "uefa.champions", "ger.1", "ita.1", "fra.1"];
  const settled = await Promise.allSettled(
    slugs.map(async (slug) => {
      const data = await fetchJson<any>(`https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/news`);
      const arts = data?.articles ?? [];
      return arts.slice(0, 6).map((a: any) => ({
        headline: String(a?.headline ?? "").trim(),
        description: String(a?.description ?? "").trim(),
        published: String(a?.published ?? ""),
        url: a?.links?.web?.href ?? "#",
        leagueSlug: slug,
      }));
    })
  );
  const all: LiveNewsItem[] = [];
  for (const r of settled) if (r.status === "fulfilled") all.push(...r.value);
  // تازه‌ترین اول + حذف تیترهای تکراری
  all.sort((a, b) => b.published.localeCompare(a.published));
  const seen = new Set<string>();
  return all.filter((n) => {
    if (!n.headline || seen.has(n.headline)) return false;
    seen.add(n.headline);
    return true;
  });
}

// ═════════════════════ ۳) TheSportsDB — بازی‌های پیش‌رو (کلید عمومی 123) ═════════════════════

export interface SportsDbEvent {
  idEvent: string;
  homeTeam: string;
  awayTeam: string;
  dateEvent: string;
  strTime: string;
  strVenue: string | null;
  strLeague: string;
}

export async function fetchSportsDbNext(sportsDbId: string): Promise<SportsDbEvent[]> {
  const data = await fetchJson<any>(
    `https://www.thesportsdb.com/api/v1/json/123/eventsnextleague.php?id=${sportsDbId}`,
    8000
  );
  const evs = data?.events ?? [];
  return evs.slice(0, 8).map((e: any) => ({
    idEvent: String(e?.idEvent ?? ""),
    homeTeam: String(e?.strHomeTeam ?? ""),
    awayTeam: String(e?.strAwayTeam ?? ""),
    dateEvent: String(e?.dateEvent ?? ""),
    strTime: String(e?.strTime ?? ""),
    strVenue: e?.strVenue ?? null,
    strLeague: String(e?.strLeague ?? ""),
  }));
}

// ═════════════════════ ۴) Open-Meteo — آب‌وهوای لحظه‌ای ورزشگاه ═════════════════════

/** فرهنگ مختصات شهرهای فوتبالی بزرگ — جایگزین سبک برای Geocoding خارجی */
const CITY_COORDS: Record<string, [number, number]> = {
  london: [51.5072, -0.1276], manchester: [53.4808, -2.2426], liverpool: [53.4084, -2.9916],
  birmingham: [52.4862, -1.8904], leeds: [53.8008, -1.5491], "newcastle upon tyne": [54.9783, -1.6178],
  newcastle: [54.9783, -1.6178], sunderland: [54.9069, -1.3838], nottingham: [52.9548, -1.1581],
  brighton: [50.8225, -0.1372], bournemouth: [50.7192, -1.8808], southampton: [50.9097, -1.4044],
  sheffield: [53.3811, -1.4701], middlesbrough: [54.5742, -1.2359], wolverhampton: [52.4862, -2.0036],
  burnley: [53.7894, -2.2495], watford: [51.6565, -0.3903], norwich: [52.6309, 1.2974],
  coventry: [52.4068, -1.5197], hull: [53.7676, -0.3274], "stoke-on-trent": [53.0027, -2.1794],
  wigan: [53.5451, -2.6318], bristol: [51.4545, -2.5879], plymouth: [50.3755, -4.1427],
  cardiff: [51.4816, -3.1791], swansea: [51.6214, -3.9436],
  madrid: [40.4168, -3.7038], barcelona: [41.3874, 2.1686], sevilla: [37.3891, -5.9845],
  valencia: [39.4699, -0.3763], bilbao: [43.263, -2.935], "san sebastián": [43.3183, -1.9812],
  "san sebastian": [43.3183, -1.9812], villarreal: [39.9448, -0.1024], girona: [41.9794, 2.8214],
  cadiz: [36.5271, -6.2886], mallorca: [39.5696, 2.6502], pamplona: [42.7951, -1.6362],
  getafe: [40.3082, -3.7315],
  munich: [48.1351, 11.582], münchen: [48.1351, 11.582], dortmund: [51.5136, 7.4653],
  berlin: [52.52, 13.405], hamburg: [53.5511, 9.9937], frankfurt: [50.1109, 8.6821],
  "frankfurt am main": [50.1109, 8.6821], stuttgart: [48.7758, 9.1829], leverkusen: [51.0305, 6.9842],
  leipzig: [51.3397, 12.3731], bremen: [53.0793, 8.8017], köln: [50.9375, 6.9603],
  cologne: [50.9375, 6.9603], hannover: [52.3759, 9.732], freiburg: [47.999, 7.8421],
  mainz: [49.9929, 8.2473], augsburg: [48.3713, 10.8983], bochum: [51.4818, 7.2165],
  wolfsburg: [52.4227, 10.7865], "mönchengladbach": [51.1866, 6.4096], gladbach: [51.1866, 6.4096],
  milan: [45.4642, 9.19], milano: [45.4642, 9.19], rome: [41.9028, 12.4964], roma: [41.9028, 12.4964],
  turin: [45.0703, 7.6869], torino: [45.0703, 7.6869], naples: [40.8518, 14.2681], napoli: [40.8518, 14.2681],
  florence: [43.7696, 11.2558], firenze: [43.7696, 11.2558], bologna: [44.4949, 11.3426],
  genoa: [44.4056, 8.9463], genova: [44.4056, 8.9463], verona: [45.4384, 10.9916],
  udine: [46.0711, 13.2346], bergamo: [45.6983, 9.6773], lecce: [40.3515, 18.175],
  cagliari: [39.2238, 9.1217], empoli: [43.5949, 10.9474], parma: [44.8015, 10.3279],
  como: [45.8081, 9.0852], venezia: [45.4408, 12.3155],
  paris: [48.8566, 2.3522], marseille: [43.2965, 5.3698], lyon: [45.764, 4.8357],
  monaco: [43.7384, 7.4246], nice: [43.7102, 7.262], lille: [50.6292, 3.0573],
  rennes: [48.1173, -1.6778], toulouse: [43.6047, 1.4442], montpellier: [43.6108, 3.8767],
  bordeaux: [44.8378, -0.5792], nantes: [47.2184, -1.5536], strasbourg: [48.5734, 7.7521],
  lens: [50.4515, 2.5599], brest: [48.3904, -4.4861],
  amsterdam: [52.3676, 4.9041], rotterdam: [51.9244, 4.4777], lisbon: [38.7223, -9.1393],
  lisboa: [38.7223, -9.1393], porto: [41.1579, -8.6291], bruges: [51.2093, 3.2247],
  glasgow: [55.8642, -4.2518], edinburgh: [55.9533, -3.1883], vienna: [48.2082, 16.3738],
  wien: [48.2082, 16.3738], salzburg: [47.8095, 13.055], zurich: [47.3769, 8.5417],
  zürich: [47.3769, 8.5417], basel: [47.5596, 7.5886], copenhagen: [55.6761, 12.5683],
  "københavn": [55.6761, 12.5683], athens: [37.9838, 23.7275], istanbul: [41.0082, 28.9784],
};

/** مختصات شهر — با تطبیق جزئی برای واریانت‌های نام */
export function cityCoords(city: string | null): [number, number] | null {
  if (!city) return null;
  const key = city.toLowerCase().normalize("NFKD").trim();
  if (CITY_COORDS[key]) return CITY_COORDS[key];
  for (const [k, v] of Object.entries(CITY_COORDS)) {
    if (key.includes(k) || k.includes(key)) return v;
  }
  return null;
}

/** آب‌وهوای لحظه‌ای — خطا/۴۲۹ → null (بدون تعدیل) */
export async function fetchWeather(lat: number, lon: number, city: string): Promise<LiveWeather | null> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,precipitation,wind_speed_10m&wind_speed_unit=kmh&timezone=UTC`;
  const data = await fetchJson<any>(url, 6000);
  const cur = data?.current;
  if (!cur || typeof cur.temperature_2m !== "number") return null;
  const precip = Number(cur.precipitation ?? 0);
  const wind = Number(cur.wind_speed_10m ?? 0);
  return {
    city,
    tempC: cur.temperature_2m,
    windKmh: wind,
    precipMm: precip,
    adverse: precip > 2 || wind > 30,
  };
}

// ═════════════════════ ۵) The Odds API v4 — ضرایب زنده بوک‌میکرها ═════════════════════

interface OddsApiRawEvent {
  id: string;
  sport_key: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: {
    key: string;
    title: string;
    markets: { key: string; outcomes: { name: string; price: number; point?: number }[] }[];
  }[];
}

/**
 * فراخوانی اندپوینت odds — هزینه‌بر (هر لیگ × هر مارکت = اعتبار پلن رایگان).
 * فقط در همگام‌سازی دستی (دکمه 🔄) فراخوانی می‌شود و سرور آن را throttle می‌کند.
 */
export async function fetchOddsApiEvents(
  leagueKeys: string[],
  apiKey: string,
  regions = "eu,uk",
  markets = "h2h,totals"
): Promise<OddsApiResult> {
  const settled = await Promise.allSettled(
    leagueKeys.map(async (key) => {
      const url =
        `https://api.the-odds-api.com/v4/sports/${key}/odds/?regions=${regions}&markets=${markets}` +
        `&oddsFormat=decimal&apiKey=${encodeURIComponent(apiKey)}`;
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 9000);
      try {
        const res = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
        const remaining = res.headers.get("x-requests-remaining");
        const used = res.headers.get("x-requests-used");
        if (!res.ok) {
          return { events: [], remaining, used };
        }
        const raw = (await res.json()) as OddsApiRawEvent[];
        const events: OddsApiEvent[] = [];
        for (const ev of raw ?? []) {
          const books: OddsApiEvent["books"] = [];
          for (const bk of ev.bookmakers ?? []) {
            const h2h = bk.markets?.find((m) => m.key === "h2h");
            const totals = bk.markets?.find((m) => m.key === "totals");
            if (!h2h) continue;
            const priceOf = (name: string): number | null => {
              const o = h2h.outcomes?.find((x) => x.name === name);
              return o && Number.isFinite(o.price) && o.price >= 1.01 ? o.price : null;
            };
            const home = priceOf(ev.home_team);
            const away = priceOf(ev.away_team);
            const draw = priceOf("Draw");
            if (!home || !away || !draw) continue;
            const over = totals?.outcomes?.find((x) => x.name === "Over" && Math.abs((x.point ?? 2.5) - 2.5) < 0.01);
            const under = totals?.outcomes?.find((x) => x.name === "Under" && Math.abs((x.point ?? 2.5) - 2.5) < 0.01);
            books.push({
              key: bk.key,
              label: bk.title,
              line: {
                home,
                draw,
                away,
                over25: over && Number.isFinite(over.price) ? over.price : null,
                under25: under && Number.isFinite(under.price) ? under.price : null,
              },
            });
          }
          if (books.length > 0) {
            events.push({
              matchKey: `${normTeam(ev.home_team)}::${normTeam(ev.away_team)}`,
              homeTeam: ev.home_team,
              awayTeam: ev.away_team,
              commenceTime: ev.commence_time,
              books,
            });
          }
        }
        return { events, remaining, used };
      } catch {
        return { events: [], remaining: null, used: null };
      } finally {
        clearTimeout(t);
      }
    })
  );

  const events: OddsApiEvent[] = [];
  let remaining: number | null = null;
  let used = 0;
  for (const r of settled) {
    if (r.status !== "fulfilled") continue;
    events.push(...r.value.events);
    if (r.value.remaining !== null) remaining = parseInt(r.value.remaining, 10);
    if (r.value.used !== null) used += parseInt(r.value.used, 10);
  }
  return { events, requestsUsed: used, requestsRemaining: remaining };
}
