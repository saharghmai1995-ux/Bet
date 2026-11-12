// ─────────────────────────────────────────────────────────────────────────────
// تصویرسازی کارت‌های کانال (Slip Image Facade) — v12.0 NeoBet
//
// نسخه‌های ≤ v9 از تولید تصویر هوش مصنوعی (z-ai-web-dev-sdk) استفاده می‌کردند:
//   · خطای content-filter 1301 · تأخیر ~۲۰ ثانیه · متن‌های به‌هم‌ریخته در تصویر
// v10.0: تمام تصاویر با رندر برداری قطعی (card-render.ts + sharp) ساخته می‌شوند
// v12.0: قالب‌های استادیومی 1080×1440 + لوگوی رسمی باشگاه‌ها از فید زنده ESPN
//   (کش دیسکی ۷ روزه) + برندینگ NEOBET QUANT PRO • @AINEOBET
// ─────────────────────────────────────────────────────────────────────────────

import type { IssuedSlip } from "@prisma/client";
import {
  renderMatchCardPNG,
  renderResultPNG,
  renderTeaserPNG,
  renderWinRateReportPNG,
  renderDailyReportPNG,
  renderRolloverLadderPNG,
  renderComboPosterPNG,
  renderSniperPosterPNG,
  renderLockedTeaserPNG,
  renderDailyRadarPNG,
  renderVipAdPNG,
  englishSelectionLabel,
  type ResultKind,
  type VipAdInput,
} from "./card-render";
import { fetchTeamLogoBuffer } from "./stadium-store";
import { fetchEspnEvents, normTeam } from "./live-sources";
import { computeMatchEngine } from "@/lib/engine/matchEngine";
import { score100Of } from "@/lib/supervisor";
import { TIMING_WINDOWS, type TimingWindowKey } from "@/lib/timing-window";
import { db } from "@/lib/db";

function parseLegs(json: string | null): string[] {
  if (!json) return [];
  try {
    const arr = JSON.parse(json);
    if (!Array.isArray(arr)) return [];
    return arr.map((l: unknown) => (typeof l === "object" && l !== null && "key" in l ? String((l as { key: unknown }).key) : String(l)));
  } catch {
    return [];
  }
}

/** وضعیت پنجره زمانی نسبت به اکنون — از ستون‌های مطلق کارت */
function timingStateOf(start: Date | null, end: Date | null, kickoff: Date): "OPEN" | "WAITING" | "LATE" | "KICKED_OFF" {
  const now = Date.now();
  if (now >= kickoff.getTime()) return "KICKED_OFF";
  if (!start || !end) return "WAITING";
  if (now < start.getTime()) return "WAITING";
  if (now <= end.getTime()) return "OPEN";
  return "LATE";
}

function timingLineOf(slip: IssuedSlip): { title: string; detail: string; state: "OPEN" | "WAITING" | "LATE" | "KICKED_OFF" } {
  const key = (slip.timingWindowA ?? slip.timingWindowB ?? "LINEUP_SHOCK") as TimingWindowKey;
  const meta = TIMING_WINDOWS[key] ?? TIMING_WINDOWS.LINEUP_SHOCK;
  const start = slip.timingStartA ?? slip.timingStartB ?? null;
  const end = slip.timingEndA ?? slip.timingEndB ?? null;
  const fmt = (d: Date) =>
    new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Tehran" }).format(d);
  const detail = start && end ? `Place between ${fmt(start)} - ${fmt(end)} Tehran` : "Optimal execution window";
  return { title: meta.nameEn.toUpperCase(), detail, state: timingStateOf(start, end, slip.kickoff) };
}

// ═════════════════════ لوگوی باشگاه‌ها از فید زنده ESPN (کش دیسکی) ═════════════════════

let logoFeedCache: { at: number; map: Map<string, string> } | null = null;
const LOGO_FEED_TTL = 30 * 60_000; // ۳۰ دقیقه

/** نقشه نام‌نرمال‌شده تیم → URL لوگوی ESPN */
async function logoUrlMap(): Promise<Map<string, string>> {
  if (logoFeedCache && Date.now() - logoFeedCache.at < LOGO_FEED_TTL) return logoFeedCache.map;
  const map = new Map<string, string>();
  try {
    const events = await fetchEspnEvents();
    for (const ev of events ?? []) {
      if (ev.homeLogo) map.set(normTeam(ev.homeTeam), ev.homeLogo);
      if (ev.awayLogo) map.set(normTeam(ev.awayTeam), ev.awayLogo);
    }
  } catch {
    /* فید در دسترس نیست — مونوگرام چاپ می‌شود */
  }
  logoFeedCache = { at: Date.now(), map };
  return map;
}

/**
 * لوگوی دو تیم یک اسلیپ (به‌صورت بافر PNG کش‌شده) — صفر شکست سخت.
 * v13.5 — رفع باگ «لوگو در پوستر نیست»: اول لوگوی ذخیره‌شده همان بازی در ردیف Match
 * (homeLogo/awayLogo از فید ESPN هنگام ثبت بازی) خوانده می‌شود؛ فید زنده فقط فالبک است.
 * پرچم تیم‌های ملی هم با همین مسیر می‌آید (لوگوی ESPN تیم‌های ملی = پرچم رسمی).
 */
async function clubLogos(slip: IssuedSlip): Promise<{ homeLogo: Buffer | null; awayLogo: Buffer | null }> {
  try {
    const [dbRow, map] = await Promise.all([
      slip.matchId
        ? db.match.findUnique({ where: { id: slip.matchId }, select: { homeLogo: true, awayLogo: true } })
        : Promise.resolve(null),
      logoUrlMap().catch(() => new Map<string, string>()),
    ]);
    const homeUrl = dbRow?.homeLogo ?? map.get(normTeam(slip.homeTeam)) ?? null;
    const awayUrl = dbRow?.awayLogo ?? map.get(normTeam(slip.awayTeam)) ?? null;
    const [homeLogo, awayLogo] = await Promise.all([
      fetchTeamLogoBuffer(homeUrl, slip.homeTeam),
      fetchTeamLogoBuffer(awayUrl, slip.awayTeam),
    ]);
    return { homeLogo, awayLogo };
  } catch {
    return { homeLogo: null, awayLogo: null };
  }
}

async function cardBase(slip: IssuedSlip) {
  const legsA = parseLegs(slip.legsA);
  const legsB = parseLegs(slip.legsB);
  const timing = timingLineOf(slip);
  const [logos, stats] = await Promise.all([clubLogos(slip), cardStatsOf(slip)]);
  return {
    homeTeam: slip.homeTeam,
    awayTeam: slip.awayTeam,
    league: slip.league,
    kickoffIso: slip.kickoff.toISOString(),
    labelAEn: englishSelectionLabel(legsA, slip.archetype),
    oddsA: slip.oddsA,
    stakeA: slip.stakeA,
    labelBEn: englishSelectionLabel(legsB, slip.archetype),
    oddsB: slip.oddsB,
    stakeB: slip.stakeB,
    guaranteedPct: slip.marginPct,
    edgeA: slip.edgeA ?? null,
    edgeB: slip.edgeB ?? null,
    edgeSource: slip.edgeSourceA ?? "MARKET_FAIR",
    timingTitle: timing.title,
    timingDetail: timing.detail,
    timingState: timing.state,
    hashShort: slip.hash.slice(0, 12),
    espnUrl: slip.espnUrl,
    doubleWin: (slip.cellsA && slip.cellsB ? overlapCells(slip.cellsA, slip.cellsB) : false) || false,
    homeLogo: logos.homeLogo,
    awayLogo: logos.awayLogo,
    /** v13.2 — بلوک داده تجاری پوستر */
    stats,
  };
}

/** آیا خانه‌های مشترک بین دو تیپ وجود دارد؟ (فرصت Double-Win) */
function overlapCells(cellsAJson: string, cellsBJson: string): boolean {
  try {
    const a = new Set(JSON.parse(cellsAJson) as string[]);
    const b = JSON.parse(cellsBJson) as string[];
    return b.some((c) => a.has(c));
  } catch {
    return false;
  }
}

/**
 * v13.2 — بلوک داده حرفه‌ای پوستر: احتمال ۱X۲ مدل از ماتریس دیکسون-کولز،
 * λ ترکیبی، پوشش/ریسک/جکپات لحظه صدور، امتیاز سوپروایزر، رتبه/فرم تیم‌ها و استادیوم.
 * هر عدد از دیتابیس/موتور واقعی است — صفر عدد ساختگی. شکست = null (قالب بدون بلوک رندر می‌شود).
 */
async function cardStatsOf(slip: IssuedSlip) {
  const out = {
    pHome: null as number | null,
    pDraw: null as number | null,
    pAway: null as number | null,
    lambdaHome: slip.lambdaHome ?? null,
    lambdaAway: slip.lambdaAway ?? null,
    coveragePct: (slip.jointLossRiskPct != null ? Math.min(100, 100 - slip.jointLossRiskPct) : null) as number | null,
    jointLossRiskPct: slip.jointLossRiskPct ?? null,
    doubleWinProbPct: slip.doubleWinProbPct ?? null,
    supervisorScore: slip.supervisorScore ?? null,
    // v15.0 — نرمال‌سازی واحد با supervisor.score100Of (بازه اتمیک [−۴۸۰..+۱۲۰])
    score100: slip.supervisorScore != null ? score100Of(slip.supervisorScore) : (null as number | null),
    fortress: slip.supervisorApproved && (slip.jointLossRiskPct ?? 99) < 7,
    archetypeCode: slip.archetypeCode ?? null,
    archetype: slip.archetype ?? null,
    homeRank: null as number | null,
    awayRank: null as number | null,
    homeForm: null as string | null,
    awayForm: null as string | null,
    venue: null as string | null,
  };
  try {
    if (slip.matchId) {
      const m = await db.match.findUnique({ where: { id: slip.matchId }, include: { referee: true } });
      if (m) {
        out.homeRank = m.homeRank ?? null;
        out.awayRank = m.awayRank ?? null;
        out.homeForm = m.homeForm ?? null;
        out.awayForm = m.awayForm ?? null;
        out.venue = m.venueName ? `${m.venueName}${m.venueCity ? ` · ${m.venueCity}` : ""}` : null;
        // احتمال ۱X۲ از ماتریس امتیاز موتور (نرمال‌شده روی ۱۰۰٪)
        const engine = computeMatchEngine(m);
        const M = engine.dc.matrix;
        let h = 0;
        let d = 0;
        let a = 0;
        for (let i = 0; i < M.length; i++) {
          for (let j = 0; j < M[i].length; j++) {
            const p = M[i][j];
            if (i > j) h += p;
            else if (i === j) d += p;
            else a += p;
          }
        }
        const total = h + d + a;
        if (total > 0.01) {
          out.pHome = h / total;
          out.pDraw = d / total;
          out.pAway = a / total;
        }
      }
    }
  } catch {
    /* آمار جانبی — شکست سخت ندارد */
  }
  return out;
}

/** تصویر کارت کامل فلش‌کارت (English broadcast card — قالب استادیومی 1080×1440) */
export async function renderSlipCardPNG(slip: IssuedSlip): Promise<Buffer> {
  return renderMatchCardPNG(await cardBase(slip));
}

/** تصویر تیزر — تیپ B قفل (Teaser) */
export async function renderSlipTeaserPNG(slip: IssuedSlip): Promise<Buffer> {
  return renderTeaserPNG(await cardBase(slip));
}

const KIND_MAP: Record<string, ResultKind> = {
  WON_A: "WON_A",
  WON_B: "WON_B",
  DOUBLE_WIN: "DOUBLE_WIN",
  MIDDLE_TRAP: "MIDDLE_TRAP",
};

/** تصویر نتیجه پس از FT — برد طلایی همزمان طراحی طلایی اختصاصی دارد */
export async function renderSlipResultPNG(slip: IssuedSlip): Promise<Buffer> {
  const kind = KIND_MAP[slip.status] ?? "WON_A";
  const formula =
    slip.status === "WON_A"
      ? `${slip.stakeA.toFixed(1)} x ${slip.oddsA.toFixed(2)} - 100`
      : slip.status === "WON_B"
        ? `${slip.stakeB.toFixed(1)} x ${slip.oddsB.toFixed(2)} - 100`
        : slip.status === "DOUBLE_WIN"
          ? `${slip.stakeA.toFixed(1)} x ${slip.oddsA.toFixed(2)} + ${slip.stakeB.toFixed(1)} x ${slip.oddsB.toFixed(2)} - 100`
          : "both tips lost";

  // وین‌ریت لحظه‌ای کانال (فقط کارت‌های تاییدشده — بدون کارت‌های بازخوانی) برای نوار پایینی WIN
  let winRatePct: number | null = null;
  try {
    const { db } = await import("@/lib/db");
    const rows = await db.issuedSlip.findMany({
      where: { supervisorApproved: true, retroIssued: false, status: { in: ["WON_A", "WON_B", "DOUBLE_WIN", "MIDDLE_TRAP"] } },
      select: { status: true },
    });
    if (rows.length > 0) {
      const wins = rows.filter((r) => r.status !== "MIDDLE_TRAP").length;
      winRatePct = (wins / rows.length) * 100;
    }
  } catch {
    /* آمار جانبی — شکست سخت ندارد */
  }

  // v13.5 — «هیچ کلمه فارسی در تصویر»: درس تسویه که قبلاً فارسی (settleNote) در پوستر چاپ
  // می‌شد با معادل انگلیسیِ وضعیت جایگزین شد.
  const lessonEn = EN_LESSON[slip.status] ?? null;

  const logos = await clubLogos(slip);
  return renderResultPNG({
    homeTeam: slip.homeTeam,
    awayTeam: slip.awayTeam,
    score: `${slip.homeGoals ?? 0}-${slip.awayGoals ?? 0}`,
    league: slip.league,
    kind,
    netProfit: slip.netProfit ?? 0,
    profitA: slip.profitA ?? null,
    profitB: slip.profitB ?? null,
    stakeAHint: slip.stakeA,
    stakeBHint: slip.stakeB,
    oddsAHint: slip.oddsA,
    oddsBHint: slip.oddsB,
    winRatePct,
    lesson: lessonEn,
    formula,
    hashShort: slip.hash.slice(0, 12),
    homeLogo: logos.homeLogo,
    awayLogo: logos.awayLogo,
  });
}

/** درس انگلیسی هر وضعیت تسویه — جایگزین settleNote فارسی روی پوستر (منع متن فارسی در تصویر) */
const EN_LESSON: Record<string, string> = {
  WON_A: "Tip A cashed — auto-graded on the official ESPN final score",
  WON_B: "Tip B cashed — auto-graded on the official ESPN final score",
  DOUBLE_WIN: "Both tips cashed the same moment — golden sweep recorded",
  MIDDLE_TRAP: "Both tips lost — honestly recorded, shadow doctrine updated",
};

export { renderWinRateReportPNG, renderDailyReportPNG, renderRolloverLadderPNG };
export type { WinRateReportInput, DailyReportInput, RolloverLadderInput } from "./card-render";
// v13.0 — پوسترهای خودساز خطوط تولید جدید + قیف کانال (بدون هیچ آپلود)
export {
  renderComboPosterPNG,
  renderSniperPosterPNG,
  renderLockedTeaserPNG,
  renderDailyRadarPNG,
};
export type { ComboPosterInput, ComboPosterLeg, SniperPosterInput, LockedTeaserInput, DailyRadarInput } from "./card-render";

// ═══════════════════ v13.5 — بنر بازاریابی ساعتی VIP (KPI واقعی + قیمت انگلیسی) ═══════════════════

/**
 * بنر بازاریابی VIP با اعداد واقعی کانال (وین‌ریت/تعداد تسویه/سود تجمعی).
 * قیمت‌ها فقط انگلیسی داخل تصویر: USDT + تومان با ارقام لاتین (منع متن فارسی در پوستر).
 */
export async function renderVipAdBannerPNG(input: Omit<VipAdInput, "winRatePct" | "settled" | "netProfit" | "priceToman" | "priceUsdt">): Promise<Buffer> {
  let winRatePct: number | null = null;
  let settled: number | null = null;
  let netProfit: number | null = null;
  try {
    const rows = await db.issuedSlip.findMany({
      where: { supervisorApproved: true, retroIssued: false, status: { in: ["WON_A", "WON_B", "DOUBLE_WIN", "MIDDLE_TRAP"] } },
      select: { status: true, netProfit: true },
    });
    if (rows.length > 0) {
      const wins = rows.filter((r) => r.status !== "MIDDLE_TRAP").length;
      winRatePct = (wins / rows.length) * 100;
      settled = rows.length;
      netProfit = rows.reduce((a, r) => a + (r.netProfit ?? 0), 0);
    }
  } catch {
    /* آمار جانبی — بنر بدون KPI هم رندر می‌شود */
  }
  return renderVipAdPNG({
    ...input,
    winRatePct,
    settled,
    netProfit,
    priceUsdt: "FROM 25 USDT",
    priceToman: "LIFETIME 50 USDT ★",
  });
}
