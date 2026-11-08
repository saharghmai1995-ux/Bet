// ─────────────────────────────────────────────────────────────────────────────
// تصویرسازی کارت‌های کانال (Slip Image Facade) — v10.0
//
// نسخه‌های ≤ v9 از تولید تصویر هوش مصنوعی (z-ai-web-dev-sdk) استفاده می‌کردند:
//   · خطای content-filter 1301 · تأخیر ~۲۰ ثانیه · متن‌های به‌هم‌ریخته در تصویر
//     (باگ نمایشی — نام تیم/اعداد اشتباه رندر می‌شد)
// v10.0: تمام تصاویر با رندر برداری قطعی (card-render.ts + sharp) ساخته می‌شوند
//   · متن = دقیقاً داده واقعی (صفر توهم) · <۱۰۰ms · صفر خطای فیلتر محتوا
// ─────────────────────────────────────────────────────────────────────────────

import type { IssuedSlip } from "@prisma/client";
import {
  renderMatchCardPNG,
  renderResultPNG,
  renderTeaserPNG,
  renderWinRateReportPNG,
  englishSelectionLabel,
  type ResultKind,
} from "./card-render";
import { TIMING_WINDOWS, type TimingWindowKey } from "@/lib/timing-window";

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

function cardBase(slip: IssuedSlip) {
  const legsA = parseLegs(slip.legsA);
  const legsB = parseLegs(slip.legsB);
  const timing = timingLineOf(slip);
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

/** تصویر کارت کامل فلش‌کارت (English broadcast card) */
export async function renderSlipCardPNG(slip: IssuedSlip): Promise<Buffer> {
  return renderMatchCardPNG(cardBase(slip));
}

/** تصویر تیزر — تیپ B قفل (Teaser) */
export async function renderSlipTeaserPNG(slip: IssuedSlip): Promise<Buffer> {
  return renderTeaserPNG(cardBase(slip));
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
  return renderResultPNG({
    homeTeam: slip.homeTeam,
    awayTeam: slip.awayTeam,
    score: `${slip.homeGoals ?? 0}-${slip.awayGoals ?? 0}`,
    league: slip.league,
    kind,
    netProfit: slip.netProfit ?? 0,
    formula,
    hashShort: slip.hash.slice(0, 12),
  });
}

export { renderWinRateReportPNG };
export type { WinRateReportInput } from "./card-render";
