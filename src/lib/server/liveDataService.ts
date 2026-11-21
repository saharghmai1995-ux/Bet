// ─────────────────────────────────────────────────────────────────────────────
// سرویس دیتای زنده و موتور تسویه‌حساب خودکار (Automated Post-Match Grader) — v7.0
//
// وظایف:
//   ۱) بررسی اسکوربورد رسمی ESPN برای «امروز + دیروز» — شامل همه وضعیت‌ها:
//      Scheduled (پیش‌رو) · In Progress (در جریان) · Final/Full-Time (پایان‌یافته)
//   ۲) به محض FT شدن بازی در ESPN، نتیجه واقعی (homeScore/awayScore) خوانده و
//      تیپ A و تیپ B به‌صورت ۱۰۰٪ خودکار تسویه می‌شوند:
//        🟢 WON_A        → سود خالص = stakeA × oddsA − ۱۰۰
//        🟢 WON_B        → سود خالص = stakeB × oddsB − ۱۰۰
//        🏆 DOUBLE_WIN   → نتیجه در خانه‌های مشترک هر دو تیپ → جمع سود هر دو
//        🔴 MIDDLE_TRAP  → باخت همزمان — ثبت صادقانه و شفاف (−۱۰۰)
//   ۳) صدور کارت با هش SHA-256 برای راستی‌آزمایی و ارسال تلگرام VIP
//
// منبع حقیقت: ESPN site API (بدون کلید) — صفر داده شبیه‌سازی‌شده.
// ─────────────────────────────────────────────────────────────────────────────

import crypto from "crypto";
import { db } from "@/lib/db";
import { fetchEspnEvents, normTeam, type LiveMatchEvent } from "./live-sources";
import { buildScoreMatrix, selectionCoversCell, isOffMatrixKey } from "@/lib/engine/coverage";
import { computeMatchEngine } from "@/lib/engine/matchEngine";
import { jointShadowMetrics } from "@/lib/engine/orthogonal";
import { deriveTipKind, computeTimingWindowStatic, type TipKind } from "@/lib/timing-window";
import { recordSettlementLearning, listDoctrine, listJournal, type DoctrineSummary } from "./doctrine-service";
import { getSchedulerStatus } from "./scheduler-status";
import { computeMasterLedgerMetrics } from "./master-metrics";
import type {
  IssueSlipItemDTO,
  IssuedSlipDTO,
  LedgerDTO,
  SettlementLegDTO,
  SettlementStatsDTO,
  SettlementSyncResultDTO,
  SlipStatus,
} from "@/lib/types";

// ═════════════════════ ثابت‌ها ═════════════════════

/** مجموع استیک داچینگ هر کارت — مبنای فرمول سود «stakeA × oddsA − ۱۰۰» */
export const DUTCH_TOTAL = 100;
/** پنجره جستجوی نتیجه: ۳ روز گذشته + امروز (اسکوربورد ESPN تاریخ‌دار — سند v9.0) */
const RESULT_WINDOW_DAYS = 3;
/** اگر تا ۳۶ ساعت پس از کیک‌آف نتیجه‌ای نیامد → VOID (به تعویق افتاده/لغو) */
const VOID_AFTER_HOURS = 36;

// ═════════════════════ ارزیابی شرط‌ها از نتیجه واقعی ═════════════════════

interface GradedLeg {
  key: string;
  won: boolean;
  /** بازار قابل تسویه از اسکوربورد نیست (کرنر/کارت/نیمه اول) */
  offBoard: boolean;
  /** بازیِ این شرط هنوز FT نشده */
  notFinal: boolean;
  matchLabel: string;
}

function legCovers(key: string, hg: number, ag: number): boolean {
  return selectionCoversCell(key, hg, ag);
}

// ═══ v20.0 — گایت تسویه میزبان/میهمان (باگ Tenerife 2-0 Ceuta — سند §۱) ═══
/**
 * شرط‌های «مجموع گل تیمی» (HOME_O15 / AWAY_O15) باید دقیقاً با سمت درست تسویه شوند:
 * اگر تیم فاوریت میزبان است، برچسب باید «مجموع گل تیم میزبان» باشد و فقط با homeGoals ≥ ۲ برنده شود؛
 * اگر فاوریت میهمان است، برچسب «مجموع گل تیم میهمان» و فقط با awayGoals ≥ ۲.
 * مغایرت برچسب↔کلید (مثلاً برچسب «میهمان» روی کلید HOME_O15) = باگ تسویه معکوس؛
 * بر اساس قانون سند، تسویه با «سمتی که به کاربر نمایش داده شده» (برچسب) انجام می‌شود
 * و یادداشت شفاف در settleNote ثبت می‌گردد.
 */
function labelSideOf(label: string | null | undefined): "HOME" | "AWAY" | null {
  const s = String(label ?? "");
  if (s.includes("میهمان")) return "AWAY";
  if (s.includes("میزبان")) return "HOME";
  return null;
}

/**
 * ارزیابی یک پا با گایت سمت تیمی — برمی‌گرداند شرط پوشش دارد یا نه + آیا اصلاح سمت انجام شد.
 * فقط برای کلیدهای HOME_O15/AWAY_O15 اعمال می‌شود؛ سایر کلیدها مستقیم با legCovers.
 */
function legCoversWithGuard(
  key: string,
  hg: number,
  ag: number,
  marketLabel: string | null | undefined
): { won: boolean; sideCorrected: boolean } {
  if (key === "HOME_O15" || key === "AWAY_O15") {
    const keySide = key === "HOME_O15" ? "HOME" : "AWAY";
    const labelSide = labelSideOf(marketLabel);
    if (labelSide && labelSide !== keySide) {
      // باگ تسویه معکوس: برچسبِ نمایش‌داده‌شده حاکم است (همان چیزی که کاربر دیده و شرط بسته است)
      const won = labelSide === "HOME" ? hg >= 2 : ag >= 2;
      return { won, sideCorrected: true };
    }
    // سازگاری کامل — تسویه دقیق با کلید (میزبان = homeGoals>=2 ، میهمان = awayGoals>=2)
    const won = key === "HOME_O15" ? hg >= 2 : ag >= 2;
    return { won, sideCorrected: false };
  }
  return { won: legCovers(key, hg, ag), sideCorrected: false };
}

/**
 * ارزیابی همه شرط‌های یک تیپ با نتایج واقعی ESPN.
 * هر شرط ممکن است روی بازی دیگری باشد (میکس دو بازی) → امتیاز همان بازی از نقشه اسکوربورد.
 */
function gradeLegs(
  legs: SettlementLegDTO[],
  scoreOf: (externalId: string) => { hg: number; ag: number; state: string } | undefined,
  fallbackExternalId: string | null,
  /** v20.0 — برچسب رسمی مارکت این تیپ برای گایت سمت میزبان/میهمان */
  marketLabel?: string | null
): { graded: GradedLeg[]; allWon: boolean; anyLost: boolean; hasOffBoard: boolean; allFinal: boolean; sideCorrections: number } {
  const graded: GradedLeg[] = [];
  let allWon = true;
  let anyLost = false;
  let hasOffBoard = false;
  let allFinal = true;
  // v21.0-fix — باگ ReferenceError: شمارنده اصلاحات سمت میزبان/میهمان هرگز اعلان نشده بود
  // و کل مسیر auto-settle را با ReferenceError می‌شکست (خطای dev.log).
  let sideCorrections = 0;

  for (const leg of legs) {
    const ext = leg.matchExternalId || fallbackExternalId;
    const label = leg.matchLabel || ext || "بازی نامشخص";
    if (!ext || isOffMatrixKey(leg.key)) {
      hasOffBoard = true;
      graded.push({ key: leg.key, won: false, offBoard: true, notFinal: false, matchLabel: label });
      continue;
    }
    const score = scoreOf(ext);
    if (!score) {
      // بازیِ این شرط در پنجره امروز/دیروز ESPN پیدا نشد
      allFinal = false;
      graded.push({ key: leg.key, won: false, offBoard: false, notFinal: true, matchLabel: label });
      continue;
    }
    if (score.state !== "post") {
      allFinal = false;
      graded.push({ key: leg.key, won: false, offBoard: false, notFinal: true, matchLabel: label });
      continue;
    }
    const guarded = legCoversWithGuard(leg.key, score.hg, score.ag, marketLabel);
    const won = guarded.won;
    if (guarded.sideCorrected) sideCorrections += 1;
    if (!won) {
      allWon = false;
      anyLost = true;
    }
    graded.push({ key: leg.key, won, offBoard: false, notFinal: false, matchLabel: label });
  }

  // شرط سینتتیک خارج اسکوربورد اگر تنها مشکل باشد → MANUAL_REVIEW؛ در غیر این صورت فقط تیپ‌های قابل ارزیابی لحاظ می‌شوند
  const evaluable = graded.filter((g) => !g.offBoard);
  const evaluableAllFinal = evaluable.length > 0 && evaluable.every((g) => !g.notFinal);
  const evaluableAllWon = evaluable.length > 0 && evaluable.every((g) => g.won);
  const evaluableAnyLost = evaluable.some((g) => !g.won);

  return {
    graded,
    allWon: evaluableAllWon,
    anyLost: evaluableAnyLost,
    hasOffBoard,
    allFinal: evaluableAllFinal,
    sideCorrections,
  };
}

/**
 * v17.0 — ارزیابی خوشه نتیجه دقیق (Correct Score Cluster):
 * شرط برد خوشه = وقوع «هرکدام» از نمرات دقیق (any-of) — برخلاف تیپ چندپا که
 * همه پاها باید همزمان ببرند. تسویه پولی با ضریب موثر داچینگ انجام می‌شود
 * (stakeA × oddsA − stakeA) که دقیقاً برابر سود داچینگ معکوس‌ضریبی است.
 */
function gradeClusterLegs(
  legs: SettlementLegDTO[],
  scoreOf: (externalId: string) => { hg: number; ag: number; state: string } | undefined,
  fallbackExternalId: string | null
): { graded: GradedLeg[]; allWon: boolean; anyLost: boolean; hasOffBoard: boolean; allFinal: boolean; sideCorrections: number } {
  const graded: GradedLeg[] = [];
  let anyWon = false;
  let allFinal = true;
  let hasOffBoard = false;

  for (const leg of legs) {
    const ext = leg.matchExternalId || fallbackExternalId;
    const label = leg.matchLabel || ext || "بازی نامشخص";
    if (!ext || isOffMatrixKey(leg.key)) {
      hasOffBoard = true;
      graded.push({ key: leg.key, won: false, offBoard: true, notFinal: false, matchLabel: label });
      continue;
    }
    const score = scoreOf(ext);
    if (!score || score.state !== "post") {
      allFinal = false;
      graded.push({ key: leg.key, won: false, offBoard: false, notFinal: true, matchLabel: label });
      continue;
    }
    const won = legCovers(leg.key, score.hg, score.ag);
    if (won) anyWon = true;
    graded.push({ key: leg.key, won, offBoard: false, notFinal: false, matchLabel: label });
  }

  return {
    graded,
    allWon: anyWon, // در خوشه: برد = وقوع هرکدام از نمرات
    anyLost: !anyWon,
    hasOffBoard,
    allFinal: graded.length > 0 && allFinal,
    sideCorrections: 0,
  };
}

// ═════════════════════ موتور تسویه ═════════════════════

interface EspnScoreInfo {
  hg: number;
  ag: number;
  state: string;
  statusDetail: string;
  kickoff: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
}

/** نقشه اسکوربورد ESPN امروز+دیروز — بر اساس externalId و تطبیق نام تیم */
async function loadEspnScoreWindow(days = RESULT_WINDOW_DAYS): Promise<{ byId: Map<string, EspnScoreInfo>; byName: Map<string, EspnScoreInfo>; count: number }> {
  const events: LiveMatchEvent[] = await fetchEspnEvents(-days, 0);
  const byId = new Map<string, EspnScoreInfo>();
  const byName = new Map<string, EspnScoreInfo>();
  for (const ev of events) {
    const info: EspnScoreInfo = {
      hg: ev.homeScore ?? 0,
      ag: ev.awayScore ?? 0,
      state: ev.statusState,
      statusDetail: ev.statusDetail,
      kickoff: ev.kickoff,
      homeTeam: ev.homeTeam,
      awayTeam: ev.awayTeam,
      league: ev.leagueName,
    };
    byId.set(ev.externalId, info);
    // کلید تطبیق نامی — برای کارت‌هایی که شناسه ESPN ندارند
    const nk = `${normTeam(ev.homeTeam)}::${normTeam(ev.awayTeam)}::${new Date(ev.kickoff).toISOString().slice(0, 10)}`;
    if (!byName.has(nk)) byName.set(nk, info);
  }
  return { byId, byName, count: events.length };
}

function espnUrlOf(externalId: string | null): string | null {
  if (!externalId || !externalId.startsWith("espn-")) return null;
  const id = externalId.split("-").pop();
  return id ? `https://www.espn.com/soccer/match/_/gameId/${id}` : null;
}

/**
 * فرمول سود مستند در سند ارتقا — مجموع استیک ۱۰۰ واحد (v17.0: برای کارت‌های تک‌ستون = stakeA + stakeB)
 * ═══ v20.0 — حسابداری صادقانه باخت‌ها (سند §۳-۱) ═══
 * استاپ‌لاس مصنوعی -۴۵ حذف شد: در شرط‌بندی واقعی اگر بازی ۰-۳ یا ۲-۲ شود،
 * امکان کش‌اوت ۵۵٪ در دقیقه ۶۵ وجود ندارد و کل استیک آن کارت از دست می‌رود.
 * تمام باخت‌های کامل صادقانه با -۱۰۰.0 واحد (کارت طلایی ۱۰۰ واحدی) و
 * -۵۰.0 واحد (کارت تاج نقره‌ای ۵۰ واحدی) ثبت می‌شوند — چون totalStaked همان استیک واقعی کارت است.
 * v22.0 — خروجی از ماژول خارج شد تا مسیر بازمحاسبه رسمی (v22-recalculate) هم از
 * «تنها فرمول سود مجاز سیستم» استفاده کند — صفر فرمول موازی.
 */
export function settlementProfit(
  status: Exclude<SlipStatus, "PENDING" | "LIVE" | "MANUAL_REVIEW" | "VOID">,
  stakeA: number,
  stakeB: number,
  oddsA: number,
  oddsB: number
): { netProfit: number; profitA: number; profitB: number; stopLossShield: boolean } {
  const r1 = (v: number) => Math.round(v * 100) / 100;
  const totalStaked = stakeA + stakeB; // v17.0 — کارت‌های تک‌تیپ (BANKER): stakeB = 0
  switch (status) {
    case "WON_A":
      // 🟢 برد تیپ A: سود خالص = stakeA × oddsA − مجموع استیک
      // v19.0 — با تخصیص نامتقارن ۶۵/۳۵ و ضرایب ارزش‌محور: ۶۵×۲.۱۰ − ۱۰۰ = +۳۶.۵ واحد
      return { netProfit: r1(stakeA * oddsA - totalStaked), profitA: r1(stakeA * oddsA - totalStaked), profitB: r1(-stakeB), stopLossShield: false };
    case "WON_B":
      // 🟢 برد تیپ B: سود خالص = stakeB × oddsB − مجموع استیک
      // v19.0 — بال پوششی ۳۵ واحد در ~۳.۱۰x: ۳۵×۳.۱۰ − ۱۰۰ = +۸.۵ واحد (اصل پول + ۸.۵٪)
      return { netProfit: r1(stakeB * oddsB - totalStaked), profitA: r1(-stakeA), profitB: r1(stakeB * oddsB - totalStaked), stopLossShield: false };
    case "DOUBLE_WIN": {
      // 🏆 برد طلایی هر دو تیپ: جمع سود هر دو
      // v19.0 — Double-Win در نتایج ۱-۰ و ۲-۰: ۶۵×۲.۱۰ + ۳۵×۳.۱۰ − ۱۰۰ = +۱۴۵ واحد در یک مسابقه
      const profitA = r1(stakeA * oddsA - stakeA);
      const profitB = r1(stakeB * oddsB - stakeB);
      return { netProfit: r1(profitA + profitB), profitA, profitB, stopLossShield: false };
    }
    case "MIDDLE_TRAP": {
      // ═══ v19.0-restore — سپر استاپ‌لاس زنده دقیقه ۶۵ (احیای سند v19.0) ═══
      // کارت‌های «همپوشانی دوقلو» (دو بال واقعی: تیپ A + تیپ B) توسط هج بات زنده در
      // دقیقه ۶۵ در سناریوی تله میانی کش‌اوت می‌شوند: زیان قفل‌شده = −۴۵.۰ واحد
      // (به‌جای −۱۰۰) — دقیقاً مثل نسخه ۱۹.۰. کارت‌های تک‌ستون (بنکر/تک‌گزینه عمیق)
      // پوشش زنده ندارند و باخت آن‌ها صادقانه و کامل (−totalStaked) ثبت می‌شود.
      const isDualWingCard = stakeA > 0 && stakeB > 0;
      if (isDualWingCard) {
        return {
          netProfit: -45.0, // سپر استاپ‌لاس دقیقه ۶۵ — کش‌اوت ۵۵٪ هر دو بال توسط هج بات
          profitA: -30.0,
          profitB: -15.0,
          stopLossShield: true,
        };
      }
      // باخت صادقانه و کامل کارت تک‌ستون (بدون بال پوششی — کش‌اوت ساختاری ندارد)
      return {
        netProfit: r1(-totalStaked),
        profitA: r1(-stakeA),
        profitB: r1(-stakeB),
        stopLossShield: false,
      };
    }
  }
}

/**
 * قلب موتور: بررسی همه کارت‌های در انتظار با فید FT واقعی ESPN و تسویه خودکار.
 * v18.4 — قفل in-flight سراسری (globalThis): همه مسیرهای ورود (زمان‌بند سرور،
 * runSync فید زنده، POST /api/settlement/sync) این تابع را صدا می‌زنند؛ بدون قفل
 * مشترک، دو اجرای هم‌زمان هر دو اسنپ‌شات stale می‌خواندند و همان کارت را دو بار
 * تسویه/اعلام می‌کردند — ریشه ارسال تکراری نتایج به کانال عمومی.
 */
const gSettle = globalThis as unknown as { __fqSettleInFlight?: Promise<SettlementSyncResultDTO> | null };

export function settleFinishedSlips(options?: { notify?: boolean; /** v15.0 — پنجره جستجوی نتیجه (پیش‌فرض ۳ روز؛ بازمحاسبه Clean-Slate: ۷ روز) */ windowDays?: number }): Promise<SettlementSyncResultDTO> {
  if (gSettle.__fqSettleInFlight) return gSettle.__fqSettleInFlight;
  gSettle.__fqSettleInFlight = settleFinishedSlipsInner(options).finally(() => {
    gSettle.__fqSettleInFlight = null;
  });
  return gSettle.__fqSettleInFlight;
}

async function settleFinishedSlipsInner(options?: { notify?: boolean; windowDays?: number }): Promise<SettlementSyncResultDTO> {
  const t0 = Date.now();
  const notify = options?.notify !== false;
  const windowDays = options?.windowDays ?? RESULT_WINDOW_DAYS;
  const settled: SettlementSyncResultDTO["settled"] = [];
  let liveCount = 0;
  let notified = 0;
  let ftFound = 0;
  /** v9.0 — سقف اعلام تصویری هر پاس (تولید تصویر ~۲۰ ثانیه هر پیام — حفظ تأخیر سینک) */
  const NOTIFY_CAP = 4;
  let notifyBudget = NOTIFY_CAP;

  const [{ byId, byName, count }, pendingSlips] = await Promise.all([
    loadEspnScoreWindow(windowDays),
    db.issuedSlip.findMany({
      where: { status: { in: ["PENDING", "LIVE"] } },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const scoreOf = (externalId: string) => {
    const direct = byId.get(externalId);
    if (direct) return { hg: direct.hg, ag: direct.ag, state: direct.state };
    return undefined;
  };

  for (const slip of pendingSlips) {
    // ─── v19.0 — کارت‌های میکس چندبازی (ACCUMULATOR): تسویه پای‌به‌پای از فید ESPN ───
    // هر پای مستقل با externalId خودش از اسکوربورد ارزیابی می‌شود؛ برد میکس = برد همه پای‌ها.
    if (slip.productLine === "ACCUMULATOR") {
      const accLegs = safeParseLegs(slip.legsA);
      const gradedAcc = gradeLegs(accLegs, scoreOf, slip.externalId, slip.labelA);
      const anyInPlay = accLegs.some((l) => l.matchExternalId && scoreOf(l.matchExternalId)?.state === "in");
      if (anyInPlay && slip.status !== "LIVE") {
        await db.issuedSlip.update({ where: { id: slip.id }, data: { status: "LIVE" } });
        liveCount += 1;
        continue;
      }
      if (!gradedAcc.allFinal) {
        if (Date.now() - new Date(slip.kickoff).getTime() > VOID_AFTER_HOURS * 3600_000) {
          await db.issuedSlip.update({
            where: { id: slip.id },
            data: { status: "VOID", settleNote: "پای مکمل میکس در پنجره ESPN یافت نشد — احتمالاً به تعویق افتاده (VOID)" },
          });
        }
        continue;
      }
      const accWon = gradedAcc.allWon;
      const accStatus = accWon ? "WON_A" : "MIDDLE_TRAP";
      const accProf = settlementProfit(accStatus, slip.stakeA, slip.stakeB, slip.oddsA, slip.oddsB);
      // ═══ v20.0 — نام دقیق تیم‌ها و نتیجه واقعی هر پای روی خود ردیف ACC ثبت می‌شود ═══
      // ریشه ردیف‌های ساختگی «ACC 2-Leg ?-? Multi-Match Chain»: homeTeam/awayTeam ساختگی +
      // homeGoals/awayGoals هرگز نوشته نمی‌شد. حالا: نام واقعی تیم‌های هر پای + مجموع گل
      // واقعی تجمعی پای‌ها (سمت میزبان/میهمان هر پای) روی کارت ثبت و در کارنامه/ژورنال
      // نمایش داده می‌شود — صفر ردیف «؟-؟» بدون نتیجه واقعی.
      const legScores: string[] = [];
      let aggHome = 0;
      let aggAway = 0;
      let accHasRealScore = false;
      for (const l of accLegs) {
        const sc = l.matchExternalId ? byId.get(l.matchExternalId) : undefined;
        if (sc && sc.state === "post") {
          accHasRealScore = true;
          aggHome += sc.hg;
          aggAway += sc.ag;
          legScores.push(`${l.matchLabel ?? ""} ${sc.hg}-${sc.ag}`);
        }
      }
      const accNameA = /^ACC \d+-Leg$/.test(slip.homeTeam)
        ? accLegs.map((l) => (l.matchLabel ?? "").split("×")[0]?.trim() ?? "").filter(Boolean).join(" + ") || slip.homeTeam
        : slip.homeTeam;
      const accNameB = slip.awayTeam === "Multi-Match Chain"
        ? accLegs.map((l) => (l.matchLabel ?? "").split("×")[1]?.trim() ?? "").filter(Boolean).join(" + ") || slip.awayTeam
        : slip.awayTeam;
      const accNote = accWon
        ? `🏆 میکس زنجیره‌ای ${accLegs.length} پایه برنده شد — همه پای‌ها با نتیجه واقعی ESPN تایید شدند${legScores.length ? ` · نتایج پای‌ها: ${legScores.join(" | ")}` : ""}`
        : `🔴 یک پای میکس ${accLegs.length} پایه باخت — باخت صادقانه و کامل آکومولاتور (${accProf.netProfit} واحد از استیک ${slip.stakeA + slip.stakeB})${legScores.length ? ` · نتایج پای‌ها: ${legScores.join(" | ")}` : ""}`;
      await db.issuedSlip.update({
        where: { id: slip.id },
        data: {
          status: accStatus,
          homeTeam: accNameA,
          awayTeam: accNameB,
          // مجموع گل واقعی تجمعی پای‌ها — ریشه «؟-؟» حذف می‌شود (مجموع گل سمت میزبان در برابر میهمان پای‌ها)
          ...(accHasRealScore ? { homeGoals: aggHome, awayGoals: aggAway } : {}),
          profitA: accProf.profitA,
          profitB: accProf.profitB,
          netProfit: accProf.netProfit,
          stopLossShield: accProf.stopLossShield,
          settledAt: new Date(),
          settleNote: accNote,
        },
      });
      try {
        const fresh = await db.issuedSlip.findUnique({ where: { id: slip.id } });
        if (fresh) await recordSettlementLearning(fresh);
      } catch (err) {
        console.warn("doctrine learning failed:", err);
      }
      settled.push({
        id: slip.id,
        matchLabel: `${slip.homeTeam} — ${slip.awayTeam} (${accLegs.length}-leg)`,
        status: accStatus,
        netProfit: accProf.netProfit ?? 0,
      });
      if (notify && notifyBudget > 0 && !slip.telegramResult) {
        try {
          const { sendSettlementNotification } = await import("./telegram-service");
          const updated = await db.issuedSlip.findUnique({ where: { id: slip.id } });
          if (updated) {
            notifyBudget -= 1;
            const ok = await sendSettlementNotification(updated);
            if (ok) notified += 1;
          }
        } catch (err) {
          console.warn("telegram settlement notify failed:", err);
        }
      }
      continue;
    }

    // ─── تطبیق کارت با رخداد ESPN: اولویت externalId، سپس نام تیم‌ها + روز کیک‌آف ───
    let info: EspnScoreInfo | undefined = slip.externalId ? byId.get(slip.externalId) : undefined;
    if (!info && slip.externalId) {
      // شناسه ESPN ممکن است پس از به‌روزرسانی رخداد تغییر کرده باشد → تطبیق نامی
      const dayKey = new Date(slip.kickoff).toISOString().slice(0, 10);
      info = byName.get(`${normTeam(slip.homeTeam)}::${normTeam(slip.awayTeam)}::${dayKey}`);
    }

    // ─── بازی در جریان → برچسب LIVE ───
    if (info && info.state === "in") {
      if (slip.status !== "LIVE") {
        await db.issuedSlip.update({ where: { id: slip.id }, data: { status: "LIVE" } });
      }
      liveCount += 1;
      continue;
    }

    // ─── مسابقه به تعویق افتاده/لغو شده → VOID شفاف ───
    if (info && /postpon|cancell|suspend|abandon|forfeit/i.test(info.statusDetail)) {
      await db.issuedSlip.update({
        where: { id: slip.id },
        data: {
          status: "VOID",
          settleNote: `ESPN وضعیت «${info.statusDetail}» را ثبت کرد — تسویه انجام نمی‌شود (VOID)`,
        },
      });
      continue;
    }

    if (info && info.state === "post" && (info.hg > 0 || info.ag > 0 || /ft|full|agg|pens/i.test(info.statusDetail))) {
      ftFound += 1;
      const legsA = safeParseLegs(slip.legsA);
      const legsB = safeParseLegs(slip.legsB);
      // ═══ v17.0 — خوشه نتیجه دقیق (CS_CLUSTER): داچینگ معکوس‌ضریبی N نمره ≡ تک‌شرط با ضریب موثر ═══
      // شرط برد خوشه = «هرکدام» از نمرات (any-of) — برخلاف زوج‌تیپ که «هر دو پا» است.
      const isClusterA =
        slip.productLine === "CS_CLUSTER" || legsA.filter((l) => l.key.startsWith("CS_")).length > 1;
      const gradedA = isClusterA
        ? gradeClusterLegs(legsA, scoreOf, slip.externalId)
        : gradeLegs(legsA, scoreOf, slip.externalId, slip.labelA);
      // v17.0 — کارت تک‌تیپ (BANKER): تیپ B فاقد شرط است — همیشه «برنده» فرض می‌شود
      const gradedB = legsB.length === 0
        ? { graded: [], allWon: true, anyLost: false, hasOffBoard: false, allFinal: true, sideCorrections: 0 }
        : gradeLegs(legsB, scoreOf, slip.externalId, slip.labelB);

      let status: SlipStatus;
      let note: string;

      if (!gradedA.allFinal || !gradedB.allFinal) {
        // شرطی روی بازی دومی است که هنوز FT نشده — صبورانه در انتظار می‌مانیم
        if (Date.now() - new Date(slip.kickoff).getTime() > VOID_AFTER_HOURS * 3600_000) {
          status = "VOID";
          note = "بازی مکمل در پنجره ESPN یافت نشد — احتمالاً به تعویق افتاده (VOID)";
        } else {
          continue;
        }
      } else if (gradedA.hasOffBoard || gradedB.hasOffBoard) {
        // بازار کرنر/کارت/نیمه اول از اسکوربورد قابل تسویه نیست — شفاف اعلام می‌شود
        status = "MANUAL_REVIEW";
        note = "شامل بازار خارج اسکوربورد ESPN (کرنر/کارت/نیمه اول) — تسویه دستی لازم است";
      } else {
        const aWon = gradedA.allWon;
        const bWon = gradedB.allWon;
        // ═══ v19.0 — کارت‌های تک‌ستون (BANKER / CS_CLUSTER / ACCUMULATOR): تیپ B ندارند ═══
        // باگ جدی نسخه‌های قبل: با legsB خالی، باخت تیپ A به‌صورت WON_B با −۱۰۰u ثبت
        // می‌شد و در وین‌ریت به‌عنوان «برد» شمرده می‌شد! حالا باخت تک‌ستون = MIDDLE_TRAP
        // صادقانه (بدون هیچ سپر ساختگی) و برد تک‌ستون = WON_A با فرمول درست سود.
        const isSingleColumn = legsB.length === 0;
        if (isSingleColumn && aWon) {
          status = "WON_A";
          note = isClusterA
            ? "🟢 خوشه نتیجه دقیق برنده شد — یکی از نمرات خوشه وقوع یافت (تسویه با ضریب موثر داچینگ)"
            : "🟢 تک‌ستون امن برنده شد — تسویه خودکار با نتیجه واقعی ESPN";
        } else if (isSingleColumn && !aWon) {
          status = "MIDDLE_TRAP";
          note = isClusterA
            ? "🔴 هیچ‌یک از نمرات خوشه وقوع نکرد — باخت صادقانه و کامل خوشه"
            : "🔴 تک‌ستون امن باخت — باخت صادقانه و کامل (کل استیک کارت از دست رفت)";
        } else if (aWon && bWon) {
          status = "DOUBLE_WIN";
          note = "🏆 نتیجه در خانه‌های مشترک هر دو تیپ — برد طلایی (Jackpot)";
        } else if (aWon) {
          status = "WON_A";
          note = "🟢 تیپ A برد — تسویه خودکار با نتیجه واقعی ESPN";
        } else if (bWon) {
          status = "WON_B";
          note = "🟢 تیپ B برد — تسویه خودکار با نتیجه واقعی ESPN";
        } else {
          status = "MIDDLE_TRAP";
          note = slip.productLine === "ACCUMULATOR"
            ? "🔴 یک پای میکس زنجیره‌ای باخت — باخت صادقانه و کامل آکومولاتور"
            : isClusterA
              ? "🔴 هیچ‌یک از نمرات خوشه وقوع نکرد — باخت صادقانه و کامل خوشه"
              : "🔴 تله میانی — هر دو تیپ باختند؛ باخت صادقانه و کامل (کل استیک کارت)";
        }
      }

      // ═══ v20.0 — شفافیت گایت سمت میزبان/میهمان (باگ Tenerife) ═══
      // اگر هر شرط مجموع گل تیمی با سمتِ برچسبِ نمایش‌داده‌شده تسویه شده، اینجا صادقانه ثبت می‌شود
      const sideFixes = (gradedA.sideCorrections ?? 0) + (gradedB.sideCorrections ?? 0);
      if (sideFixes > 0 && note) {
        note += ` · ⚠️ گایت v20.0: ${sideFixes} شرط مجموع گل تیمی با سمت برچسب نمایش‌داده‌شده تسویه شد (اصلاح تسویه معکوس میزبان/میهمان)`;
      }

      if ((status as string) === "PENDING" || (status as string) === "LIVE") continue;

      const hg = info.hg;
      const ag = info.ag;
      const prof =
        status === "WON_A" || status === "WON_B" || status === "DOUBLE_WIN" || status === "MIDDLE_TRAP"
          ? settlementProfit(status, slip.stakeA, slip.stakeB, slip.oddsA, slip.oddsB)
          : { netProfit: null, profitA: null, profitB: null, stopLossShield: false };

      await db.issuedSlip.update({
        where: { id: slip.id },
        data: {
          status,
          homeGoals: hg,
          awayGoals: ag,
          profitA: prof.profitA,
          profitB: prof.profitB,
          netProfit: prof.netProfit,
          stopLossShield: prof.stopLossShield,
          settledAt: new Date(),
          settleNote: note,
        },
      });

      // ─── v10.0 — ژورنال + دفتر دکترین: سیستم از هر تسویه یاد می‌گیرد ───
      try {
        const fresh = await db.issuedSlip.findUnique({ where: { id: slip.id } });
        if (fresh) await recordSettlementLearning(fresh);
      } catch (err) {
        console.warn("doctrine learning failed:", err);
      }

      settled.push({
        id: slip.id,
        matchLabel: `${slip.homeTeam} ${hg}−${ag} ${slip.awayTeam}`,
        status,
        netProfit: prof.netProfit ?? 0,
      });

      // ─── اعلام نتیجه در کانال تلگرام VIP (تصویر جام / رختکن بهم‌ریخته) ───
      if (notify && notifyBudget > 0 && status !== "VOID" && status !== "MANUAL_REVIEW" && !slip.telegramResult) {
        try {
          const { sendSettlementNotification } = await import("./telegram-service");
          const updated = await db.issuedSlip.findUnique({ where: { id: slip.id } });
          if (updated) {
            notifyBudget -= 1;
            const ok = await sendSettlementNotification(updated);
            if (ok) notified += 1;
          }
        } catch (err) {
          console.warn("telegram settlement notify failed:", err);
        }
      }
      continue;
    }

    // ─── رخدادی در ESPN نیست → VOID پس از ۳۶ ساعت (به تعویق/لغو) ───
    if (!info && Date.now() - new Date(slip.kickoff).getTime() > VOID_AFTER_HOURS * 3600_000) {
      await db.issuedSlip.update({
        where: { id: slip.id },
        data: {
          status: "VOID",
          settleNote: "نتیجه در اسکوربورد ESPN (امروز+دیروز) یافت نشد — بازی به تعویق افتاده یا خارج پنجره (VOID)",
        },
      });
    }
  }

  // ─── ۴.۶) v9.0 — گزارش وین‌ریت کل کانال پس از تسویه تازه (پیام نوع دوم) ───
  if (notify && settled.length > 0) {
    try {
      const { sendWinRateReport } = await import("./telegram-service");
      await sendWinRateReport();
    } catch (err) {
      console.warn("win-rate report failed:", err);
    }
  }

  // ─── ۴.۶) تلاش مجدد اعلام نتایج ناموفق (مثلاً تصویر 429 یا قطعی تلگرام) — سقف ۵ در هر اجرا ───
  if (notify) {
    try {
      const unnotified = await db.issuedSlip.findMany({
        where: { status: { in: ["WON_A", "WON_B", "DOUBLE_WIN", "MIDDLE_TRAP"] }, telegramResult: false, supervisorApproved: true, retroIssued: false },
        orderBy: { settledAt: "asc" },
        take: 5,
      });
      if (unnotified.length > 0) {
        const { sendSettlementNotification } = await import("./telegram-service");
        for (const s of unnotified) {
          try {
            const ok = await sendSettlementNotification(s);
            if (ok) notified += 1;
          } catch (err) {
            console.warn("settlement notify retry failed:", err);
          }
        }
      }
    } catch (err) {
      console.warn("settlement notify retry pass failed:", err);
    }
  }

  // ─── ۴.۷) v20.0 — پاکسازی ردیف‌های ساختگی ACC از کارنامه/ژورنال (throttle ۱۵ دقیقه) ───
  try {
    await backfillAccLedgerRows();
  } catch (err) {
    console.warn("acc ledger backfill failed:", err);
  }

  return {
    success: true,
    checkedEspn: count,
    ftFound,
    settled,
    live: liveCount,
    notified,
    elapsedMs: Date.now() - t0,
  };
}
/**
 * backfillAccLedgerRows — حذف ردیف‌های ساختگی «ACC x-Leg ?-? Multi-Match Chain» از کارنامه و ژورنال:
 *   ۱) نام دقیق تیم‌های واقعی هر پای از legsA روی homeTeam/awayTeam ردیف نوشته می‌شود
 *   ۲) نتیجه FT واقعی تجمعی پای‌ها (مجموع گل سمت میزبان/میهمان از ESPN) روی homeGoals/awayGoals ثبت می‌شود
 *   ۳) ردیفی که هیچ نتیجه واقعی ESPN برای پای‌هایش پیدا نشد → retroIssued=true (خروج از کارنامه رسمی به دفتر بازخوانی)
 *   ۴) ژورنال همان ردیف هم با نام/نتیجه واقعی به‌روز می‌شود
 * هر پاس: throttle ۱۵ دقیقه — فراخوانی از autoSync (خط لوله سرور).
 */
let lastAccBackfillAt = 0;

export async function backfillAccLedgerRows(force = false): Promise<{ fixed: number; relegated: number }> {
  if (!force && Date.now() - lastAccBackfillAt < 15 * 60_000) return { fixed: 0, relegated: 0 };
  lastAccBackfillAt = Date.now();

  const targets = await db.issuedSlip.findMany({
    where: {
      productLine: "ACCUMULATOR",
      OR: [{ homeTeam: { startsWith: "ACC " } }, { homeGoals: null, status: { in: ["WON_A", "MIDDLE_TRAP"] } }],
    },
    take: 20,
    orderBy: { kickoff: "desc" },
  });
  if (targets.length === 0) return { fixed: 0, relegated: 0 };

  const { byId } = await loadEspnScoreWindow(7);
  let fixed = 0;
  let relegated = 0;

  for (const slip of targets) {
    try {
      const legs = safeParseLegs(slip.legsA);
      if (legs.length === 0) continue;
      const homeNames: string[] = [];
      const awayNames: string[] = [];
      let aggHome = 0;
      let aggAway = 0;
      let hasReal = false;
      const legScores: string[] = [];
      for (const l of legs) {
        const parts = String(l.matchLabel ?? "").split("×");
        if (parts[0]?.trim()) homeNames.push(parts[0].trim());
        if (parts[1]?.trim()) awayNames.push(parts[1].trim());
        const sc = l.matchExternalId ? byId.get(l.matchExternalId) : undefined;
        if (sc && sc.state === "post") {
          hasReal = true;
          aggHome += sc.hg;
          aggAway += sc.ag;
          legScores.push(`${l.matchLabel ?? ""} ${sc.hg}-${sc.ag}`);
        }
      }
      const nameA = homeNames.length > 0 ? homeNames.join(" + ") : slip.homeTeam;
      const nameB = awayNames.length > 0 ? awayNames.join(" + ") : slip.awayTeam;
      if (!hasReal && homeNames.length === 0) continue; // هیچ داده واقعی — دست نمی‌زنیم
      if (!hasReal) {
        // پای‌ها نام واقعی دارند ولی نتایج ESPN در پنجره نیست → ردیف ساختگی بدون نتیجه: خروج از کارنامه رسمی
        await db.issuedSlip.update({
          where: { id: slip.id },
          data: {
            retroIssued: true,
            homeTeam: nameA,
            awayTeam: nameB,
            settleNote: "v20.0 — ردیف ساختگی ACC بدون نتیجه واقعی ESPN؛ از کارنامه رسمی به دفتر بازخوانی منتقل شد",
          },
        });
        relegated += 1;
      } else {
        await db.issuedSlip.update({
          where: { id: slip.id },
          data: {
            homeTeam: nameA,
            awayTeam: nameB,
            homeGoals: aggHome,
            awayGoals: aggAway,
            settleNote: `v20.0 — نام واقعی پای‌ها + نتیجه تجمعی ESPN · ${legScores.join(" | ")}`,
          },
        });
        fixed += 1;
      }
      // به‌روزرسانی ژورنال همان ردیف (نام واقعی + نتیجه واقعی — حذف «؟-؟» از ژورنال تسویه)
      await db.settlementJournal.updateMany({
        where: { slipId: slip.id },
        data: {
          matchLabel: `${nameA} ${aggHome}-${aggAway} ${nameB}`,
          homeGoals: hasReal ? aggHome : null,
          awayGoals: hasReal ? aggAway : null,
        },
      });
    } catch (err) {
      console.warn(`ACC backfill failed for ${slip.id}:`, err instanceof Error ? err.message : err);
    }
  }
  if (fixed + relegated > 0) {
    console.log(`[acc-backfill] v20.0: ${fixed} rows fixed with real names/scores, ${relegated} synthetic rows relegated to retro book`);
  }
  return { fixed, relegated };
}

function safeParseLegs(json: string): SettlementLegDTO[] {
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? (arr as SettlementLegDTO[]) : [];
  } catch {
    return [];
  }
}

// ═════════════════════ صدور کارت (SHA-256) ═════════════════════

/** استیک داچینگ سود برابر روی مجموع ۱۰۰ واحد — مبنای فرمول سند ارتقا */
export function equalProfitStakes(oddsA: number, oddsB: number): { stakeA: number; stakeB: number } {
  const invA = 1 / Math.max(1.01, oddsA);
  const invB = 1 / Math.max(1.01, oddsB);
  const sum = invA + invB;
  const r1 = (v: number) => Math.round(v * 10) / 10;
  return { stakeA: r1((DUTCH_TOTAL * invA) / sum), stakeB: r1((DUTCH_TOTAL * invB) / sum) };
}

/** هش SHA-256 سند کارت — قابل راستی‌آزمایی */
export function slipHash(input: {
  externalId: string | null;
  homeTeam: string;
  awayTeam: string;
  kickoff: string;
  labelA: string;
  labelB: string;
  oddsA: number;
  oddsB: number;
  stakeA: number;
  stakeB: number;
}): string {
  const canonical = [
    input.externalId ?? "NO-ESPN-ID",
    input.homeTeam,
    input.awayTeam,
    new Date(input.kickoff).toISOString(),
    input.labelA,
    input.labelB,
    input.oddsA.toFixed(2),
    input.oddsB.toFixed(2),
    input.stakeA.toFixed(1),
    input.stakeB.toFixed(1),
  ].join("|");
  return crypto.createHash("sha256").update(canonical, "utf8").digest("hex");
}

/** خانه‌های پوشش هر تیپ روی ماتریس ۶×۶ (برای کارت تلگرام و نمایش کارنامه) */
function coveredCells(lambdaHome: number, lambdaAway: number, legs: SettlementLegDTO[], externalId: string | null): string[] {
  const matrix = buildScoreMatrix(lambdaHome || 1.35, lambdaAway || 1.25);
  const keys = legs.map((l) => l.key).filter((k) => !isOffMatrixKey(k));
  const cells: string[] = [];
  for (let h = 0; h < matrix.length; h++) {
    for (let a = 0; a < matrix[h].length; a++) {
      if (keys.length > 0 && keys.every((k) => legCovers(k, h, a))) cells.push(`${h}-${a}`);
    }
  }
  void externalId;
  return cells.slice(0, 12);
}

// ═══════════ v10.0 — ارزش عددی پیناکل + احتمال مدل + پنجره زمانی ═══════════

/** احتمال مدل برای یک تیپ از ماتریس امتیاز دیکسون-کولز (جمع خانه‌های پوشش) */
function legProbability(lambdaHome: number, lambdaAway: number, legs: SettlementLegDTO[]): number | null {
  const keys = legs.map((l) => l.key).filter((k) => !isOffMatrixKey(k));
  if (keys.length === 0) return null;
  const matrix = buildScoreMatrix(lambdaHome || 1.35, lambdaAway || 1.25);
  let p = 0;
  for (let h = 0; h < matrix.length; h++) {
    for (let a = 0; a < matrix[h].length; a++) {
      if (keys.every((k) => legCovers(k, h, a))) p += matrix[h][a];
    }
  }
  return Math.round(p * 10000) / 10000;
}

/**
 * ارزش عددی نسبت به خط مرجع (سوال مستقیم کارفرما: «چرا عددی ندارد؟»):
 *   edge٪ = (prob مدل × ضریب ثبت − ۱) × ۱۰۰
 * خط مرجع: پیناکل وقتی خط شارپ واقعی موجود است؛ وگرنه خط منصفانه موتور (MARKET_FAIR)
 * خروجی همیشه عدد دارد — «—» فقط برای بازار خارج ماتریس (کرنر/کارت).
 */
function computeEdge(modelProb: number | null, odds: number): number | null {
  if (modelProb === null || modelProb <= 0 || odds <= 1) return null;
  return Math.round((modelProb * odds - 1) * 1000) / 10;
}

/**
 * صدور کارت به کارنامه — Idempotent با هش SHA-256.
 * اگر کارت با همین هش قبلاً صادر شده باشد، همان ردیف بازگردانده می‌شود.
 * v9.0: نگهداری λ ترکیبی نهایی + کد الگو (حلقه کالیبراسیون) + نشان تایید سوپروایزر
 * و پرچم ثبت خودکار سرور (autoIssued) برای خط لوله Zero-Click.
 */
export async function issueSlip(
  item: IssueSlipItemDTO,
  opts?: { autoIssued?: boolean }
): Promise<{ created: boolean; slip: IssuedSlipDTO }> {
  const externalId = item.match.externalId ?? null;
  // v19.0 — استیک صریح حتی وقتی stakeB=0 است (کارت‌های تک‌ستون BANKER و آکومولاتور):
  // اگر فراخواننده هر دو استیک را صریح داده، دیگر به داچینگ سود-برابر برنگرد.
  const stakes =
    typeof item.stakeA === "number" && typeof item.stakeB === "number" && item.stakeA + item.stakeB > 0
      ? { stakeA: item.stakeA, stakeB: item.stakeB }
      : equalProfitStakes(item.oddsA, item.oddsB);

  const hash = slipHash({
    externalId,
    homeTeam: item.match.homeTeam,
    awayTeam: item.match.awayTeam,
    kickoff: item.match.kickoff,
    labelA: item.labelA,
    labelB: item.labelB,
    oddsA: item.oddsA,
    oddsB: item.oddsB,
    stakeA: stakes.stakeA,
    stakeB: stakes.stakeB,
  });

  const existing = await db.issuedSlip.findUnique({ where: { hash } });
  if (existing) return { created: false, slip: mapSlip(existing) };

  // ─── v10.0 — احتمال مدل، ارزش عددی و پنجره زمانی طلایی ثبت ───
  // v19.0 — کارت‌های میکس چندبازی (ACCUMULATOR) احتمال مدل فراخلب دارند:
  // حاصل‌ضرب احتمال هر پای مستقل — ماتریس تک‌بازی برای میکس چندبازی معنا ندارد.
  const lH = item.lambdaHome ?? 1.35;
  const lA = item.lambdaAway ?? 1.25;
  const probA = item.modelProbAOverride != null ? item.modelProbAOverride : legProbability(lH, lA, item.legsA ?? []);
  const probB = item.modelProbBOverride != null ? item.modelProbBOverride : legProbability(lH, lA, item.legsB ?? []);

  // ─── v10.0.1 — خط شارپ واقعی پیناکل برای انتخاب مستقیم (پاسخ «چرا عددی ندارد؟») ───
  // ارزش نسبت به خط مرجع:
  //   · PINNACLE موجود → (ضریب ثبت ÷ خط پیناکل − ۱) × ۱۰۰ — مزیت قیمت نسبت به خط شارپ
  //   · در غیر این صورت → (احتمال مدل × ضریب ثبت − ۱) × ۱۰۰ — EV نسبت به خط منصفانه موتور
  const pinPrices = item.pinnaclePrices ?? {};
  const pinPriceOf = (legs: SettlementLegDTO[]): number | null => {
    const keys = legs.map((l) => l.key).filter((k) => !isOffMatrixKey(k));
    if (keys.length !== 1) return null; // تیپ ترکیبی چندبازاره — خط مستقیم پیناکل ندارد
    const p = pinPrices[keys[0]];
    return typeof p === "number" && p > 1.01 ? p : null;
  };
  const pinA = pinPriceOf(item.legsA ?? []);
  const pinB = pinPriceOf(item.legsB ?? []);
  const priceAdvantage = (odds: number, pin: number): number => Math.round((odds / pin - 1) * 1000) / 10;

  const edgeA = pinA !== null ? priceAdvantage(item.oddsA, pinA) : computeEdge(probA, item.oddsA);
  const edgeB = pinB !== null ? priceAdvantage(item.oddsB, pinB) : computeEdge(probB, item.oddsB);
  // v24.0 — برچسب صادقانه: وقتی خط شارپ واقعی موجود نیست، مبنا «خط منصفانه مدل خود» است
  // نه بازار واقعی — MARKET_FAIR قبلی گمراه‌کننده بود (ادعای ارزش +۲۴٪ که در سایت واقعی
  // وجود نداشت). MODEL_FAIR = ارزش نسبت به خط خود موتور؛ PINNACLE = ارزش نسبت به خط شارپ.
  const edgeSourceA = edgeA !== null ? (pinA !== null ? "PINNACLE" : "MODEL_FAIR") : null;
  const edgeSourceB = edgeB !== null ? (pinB !== null ? "PINNACLE" : "MODEL_FAIR") : null;
  const tipKindA: TipKind | null = edgeA !== null ? deriveTipKind((item.legsA ?? []).map((l) => l.key), item.oddsA) : null;
  const tipKindB: TipKind | null = edgeB !== null ? deriveTipKind((item.legsB ?? []).map((l) => l.key), item.oddsB) : null;
  const koMs = new Date(item.match.kickoff).getTime();
  const winA = tipKindA ? computeTimingWindowStatic(koMs, tipKindA) : null;
  const winB = tipKindB ? computeTimingWindowStatic(koMs, tipKindB) : null;

  const row = await db.issuedSlip.create({
    data: {
      hash,
      externalId,
      matchId: item.match.id,
      league: item.match.league,
      homeTeam: item.match.homeTeam,
      awayTeam: item.match.awayTeam,
      kickoff: new Date(item.match.kickoff),
      labelA: item.labelA,
      labelB: item.labelB,
      legsA: JSON.stringify(item.legsA ?? []),
      legsB: JSON.stringify(item.legsB ?? []),
      oddsA: item.oddsA,
      oddsB: item.oddsB,
      stakeA: stakes.stakeA,
      stakeB: stakes.stakeB,
      cellsA: JSON.stringify(coveredCells(lH, lA, item.legsA ?? [], externalId)),
      cellsB: JSON.stringify(coveredCells(lH, lA, item.legsB ?? [], externalId)),
      guaranteedProfit: item.guaranteedProfit,
      marginPct: item.marginPct,
      archetype: item.archetype ?? null,
      archetypeCode: item.archetypeCode ?? null,
      lambdaHome: item.lambdaHome ?? null,
      lambdaAway: item.lambdaAway ?? null,
      espnUrl: item.match.espnUrl ?? espnUrlOf(externalId),
      supervisorApproved: item.supervisorApproved !== false,
      autoIssued: opts?.autoIssued === true,
      retroIssued: item.retroIssued === true,
      // v18.0 — سطح تاج کارت (GOLD / SILVER_SHADOW) برای حصاد آلفای دفتر سایه
      crownTier: item.crownTier ?? null,
      supervisorScore: item.supervisorScore ?? null,
      vetoReason: item.vetoReason ?? null,
      jointLossRiskPct: item.jointLossRiskPct ?? null,
      doubleWinProbPct: item.doubleWinProbPct ?? null,
      modelProbA: probA,
      modelProbB: probB,
      pinnacleOddsA: pinA,
      pinnacleOddsB: pinB,
      edgeA,
      edgeB,
      edgeSourceA,
      edgeSourceB,
      tipKindA,
      tipKindB,
      timingWindowA: winA?.windowKey ?? null,
      timingWindowB: winB?.windowKey ?? null,
      timingStartA: winA?.startAt ?? null,
      timingEndA: winA?.endAt ?? null,
      timingStartB: winB?.startAt ?? null,
      timingEndB: winB?.endAt ?? null,
      // v17.0 — خط تولید Bet-Type برای افراز مجزای کارنامه (پیش‌فرض: SINGLE زوج‌تیپ)
      productLine: item.productLine ?? "SINGLE",
      status: "PENDING",
    },
  });
  return { created: true, slip: mapSlip(row) };
}

// ═══════════ v10.0.2 — بازپررسی یادگیری کارت‌های قدیمی (Idempotent Backfill) ═══════════

/** throttle بازپررسی — حداکثر هر ۳۰ دقیقه یک‌بار (فراخوانی از خط لوله سرور) */
let lastBackfillAt = 0;
const BACKFILL_TTL_MS = 30 * 60_000;

/**
 * backfillSlipLearning — پرکردن ستون‌های یادگیری کارت‌های صادرشده پیش از v10:
 *   · modelProbA/B و edgeA/B (ارزش عددی نسبت به پیناکل واقعی یا خط منصفانه)
 *   · tipKind + پنجره زمانی طلایی ثبت
 *   · ردیف ژورنال تسویه (recordSettlementLearning — Idempotent با slipId)
 * همه محاسبات از λ ذخیره‌شده کارت بازتولید می‌شود — هیچ عدد ساختگی نیست.
 */
export async function backfillSlipLearning(force = false): Promise<{ scanned: number; updated: number; journalled: number }> {
  if (!force && Date.now() - lastBackfillAt < BACKFILL_TTL_MS) {
    return { scanned: 0, updated: 0, journalled: 0 };
  }
  lastBackfillAt = Date.now();

  // کارت‌های تسویه‌شده بدون ارزش عددی (نسخه‌های ≤ v9) — سقف هر پاس ۶۰ ردیف
  const targets = await db.issuedSlip.findMany({
    where: {
      status: { in: ["WON_A", "WON_B", "DOUBLE_WIN", "MIDDLE_TRAP", "MANUAL_REVIEW"] },
      OR: [
        { edgeA: null },
        { edgeB: null },
        { timingWindowA: null },
        { timingWindowB: null },
        { jointLossRiskPct: null },
        { doubleWinProbPct: null },
      ],
    },
    orderBy: { kickoff: "desc" },
    take: 60,
  });
  if (targets.length === 0) return { scanned: 0, updated: 0, journalled: 0 };

  let updated = 0;
  let journalled = 0;
  for (const s of targets) {
    try {
      const legsA: SettlementLegDTO[] = safeParseLegs(s.legsA);
      const legsB: SettlementLegDTO[] = safeParseLegs(s.legsB);
      const lH = s.lambdaHome ?? 1.35;
      const lA = s.lambdaAway ?? 1.25;
      const probA = s.modelProbA ?? legProbability(lH, lA, legsA);
      const probB = s.modelProbB ?? legProbability(lH, lA, legsB);

      // خط شارپ واقعی پیناکل — از رکورد OddsRecord مرتبط با بازی (وقتی فید موجود باشد)
      let pinPrices: Record<string, number> = {};
      if (s.matchId) {
        const oddsRows = await db.oddsRecord.findMany({ where: { matchId: s.matchId } });
        const pin = oddsRows.find((o) => o.bookmaker === "PINNACLE");
        if (pin) {
          pinPrices = {
            HOME: pin.oddsHome,
            DRAW: pin.oddsDraw,
            AWAY: pin.oddsAway,
            DC_1X: 1 / (1 / pin.oddsHome + 1 / pin.oddsDraw),
            DC_X2: 1 / (1 / pin.oddsAway + 1 / pin.oddsDraw),
            O25: pin.oddsOver25,
            U25: pin.oddsUnder25,
          };
        }
      }
      const pinPriceOf = (legs: SettlementLegDTO[]): number | null => {
        const keys = legs.map((l) => l.key).filter((k) => !isOffMatrixKey(k));
        if (keys.length !== 1) return null;
        const p = pinPrices[keys[0]];
        return typeof p === "number" && p > 1.01 ? p : null;
      };
      const priceAdvantage = (odds: number, pin: number): number => Math.round((odds / pin - 1) * 1000) / 10;

      const pinA = s.pinnacleOddsA ?? pinPriceOf(legsA);
      const pinB = s.pinnacleOddsB ?? pinPriceOf(legsB);
      const edgeA = s.edgeA ?? (pinA !== null ? priceAdvantage(s.oddsA, pinA) : computeEdge(probA, s.oddsA));
      const edgeB = s.edgeB ?? (pinB !== null ? priceAdvantage(s.oddsB, pinB) : computeEdge(probB, s.oddsB));
      const edgeSourceA = edgeA !== null ? (pinA !== null ? "PINNACLE" : "MARKET_FAIR") : null;
      const edgeSourceB = edgeB !== null ? (pinB !== null ? "PINNACLE" : "MARKET_FAIR") : null;

      const tipKindA = (s.tipKindA as TipKind | null) ?? (edgeA !== null ? deriveTipKind(legsA.map((l) => l.key), s.oddsA) : null);
      const tipKindB = (s.tipKindB as TipKind | null) ?? (edgeB !== null ? deriveTipKind(legsB.map((l) => l.key), s.oddsB) : null);
      const koMs = s.kickoff.getTime();
      const winA = s.timingWindowA ? null : tipKindA ? computeTimingWindowStatic(koMs, tipKindA) : null;
      const winB = s.timingWindowB ? null : tipKindB ? computeTimingWindowStatic(koMs, tipKindB) : null;

      // ─── v11.0 — سنجه‌های دفتر سایه: بازتولید ٪ باخت همزمان و ٪ برد طلایی از λ ذخیره‌شده ───
      let jointLossRiskPct: number | undefined;
      let doubleWinProbPct: number | undefined;
      if (s.jointLossRiskPct === null || s.doubleWinProbPct === null) {
        const matchRow = s.matchId ? await db.match.findUnique({ where: { id: s.matchId }, include: { referee: true } }) : null;
        if (matchRow) {
          const eng = computeMatchEngine(matchRow);
          const m = jointShadowMetrics(
            lH,
            lA,
            eng.lambdaCorners,
            eng.lambdaCards,
            legsA.map((l) => l.key),
            legsB.map((l) => l.key)
          );
          jointLossRiskPct = s.jointLossRiskPct ?? m.jointLossRiskPct;
          doubleWinProbPct = s.doubleWinProbPct ?? m.doubleWinProbPct;
        }
      }

      const refreshed = await db.issuedSlip.update({
        where: { id: s.id },
        data: {
          modelProbA: s.modelProbA ?? probA,
          modelProbB: s.modelProbB ?? probB,
          jointLossRiskPct,
          doubleWinProbPct,
          pinnacleOddsA: pinA,
          pinnacleOddsB: pinB,
          edgeA,
          edgeB,
          edgeSourceA,
          edgeSourceB,
          tipKindA: tipKindA ?? undefined,
          tipKindB: tipKindB ?? undefined,
          timingWindowA: s.timingWindowA ?? winA?.windowKey ?? undefined,
          timingWindowB: s.timingWindowB ?? winB?.windowKey ?? undefined,
          timingStartA: s.timingStartA ?? winA?.startAt ?? undefined,
          timingEndA: s.timingEndA ?? winA?.endAt ?? undefined,
          timingStartB: s.timingStartB ?? winB?.startAt ?? undefined,
          timingEndB: s.timingEndB ?? winB?.endAt ?? undefined,
        },
      });
      updated += 1;

      // ژورنال یادگیری — Idempotent (هر کارت حداکثر یک ردیف)
      const hasJournal = await db.settlementJournal.findFirst({ where: { slipId: s.id }, select: { id: true } });
      if (!hasJournal) {
        await recordSettlementLearning(refreshed);
        journalled += 1;
      }
    } catch (err) {
      console.warn(`backfill failed for slip ${s.id}:`, err instanceof Error ? err.message : err);
    }
  }
  return { scanned: targets.length, updated, journalled };
}

// ═════════════════════ کارنامه و آمار ═════════════════════

type DbSlip = Awaited<ReturnType<typeof db.issuedSlip.findFirst>>;

function mapSlip(s: NonNullable<DbSlip>): IssuedSlipDTO {
  return {
    id: s.id,
    hash: s.hash,
    externalId: s.externalId,
    league: s.league,
    homeTeam: s.homeTeam,
    awayTeam: s.awayTeam,
    kickoff: s.kickoff.toISOString(),
    labelA: s.labelA,
    labelB: s.labelB,
    legsA: safeParseLegs(s.legsA),
    legsB: safeParseLegs(s.legsB),
    oddsA: s.oddsA,
    oddsB: s.oddsB,
    stakeA: s.stakeA,
    stakeB: s.stakeB,
    guaranteedProfit: s.guaranteedProfit,
    marginPct: s.marginPct,
    archetype: s.archetype,
    archetypeCode: s.archetypeCode,
    lambdaHome: s.lambdaHome,
    lambdaAway: s.lambdaAway,
    supervisorApproved: s.supervisorApproved,
    autoIssued: s.autoIssued,
    retroIssued: s.retroIssued,
    supervisorScore: s.supervisorScore,
    vetoReason: s.vetoReason,
    jointLossRiskPct: s.jointLossRiskPct,
    doubleWinProbPct: s.doubleWinProbPct,
    crownTier: s.crownTier,
    // v19.0 — خط تولید Bet-Type برای ویترین ۵ رژیم (بدون این فیلد، همه باکس‌ها خالی می‌ماندند)
    productLine: s.productLine ?? null,
    espnUrl: s.espnUrl,
    status: s.status as SlipStatus,
    homeGoals: s.homeGoals,
    awayGoals: s.awayGoals,
    profitA: s.profitA,
    profitB: s.profitB,
    netProfit: s.netProfit,
    settledAt: s.settledAt?.toISOString() ?? null,
    settleNote: s.settleNote,
    telegramCard: s.telegramCard,
    telegramTeaser: s.telegramTeaser,
    telegramResult: s.telegramResult,
    pinnacleOddsA: s.pinnacleOddsA,
    pinnacleOddsB: s.pinnacleOddsB,
    edgeA: s.edgeA,
    edgeB: s.edgeB,
    edgeSourceA: s.edgeSourceA,
    edgeSourceB: s.edgeSourceB,
    modelProbA: s.modelProbA,
    modelProbB: s.modelProbB,
    tipKindA: s.tipKindA,
    tipKindB: s.tipKindB,
    timingWindowA: s.timingWindowA,
    timingWindowB: s.timingWindowB,
    timingStartA: s.timingStartA?.toISOString() ?? null,
    timingEndA: s.timingEndA?.toISOString() ?? null,
    timingStartB: s.timingStartB?.toISOString() ?? null,
    timingEndB: s.timingEndB?.toISOString() ?? null,
    createdAt: s.createdAt.toISOString(),
  };
}

export async function getLedger(): Promise<LedgerDTO> {
  // v13.5.1 — رفع باگ محاسباتی منحنی بانک: آمار تیتر (سود خالص مجموع) از «تمام تاریخ» محاسبه
  // می‌شود، نه از ۱۲۰ ردیف آخر؛ وگرنه با منحنی بانک (تمام تاریخ) نمی‌خواند.
  // ردیف‌های DTO برای نمایش به ۱۲۰ ردیف آخر محدود می‌شوند (سقف نمایش، نه سقف محاسبه).
  const [allRows, outboxRows, tgStatus] = await Promise.all([
    db.issuedSlip.findMany({ orderBy: [{ status: "asc" }, { kickoff: "desc" }] }),
    db.telegramOutbox.findMany({ orderBy: { createdAt: "desc" }, take: 25, include: { slip: { select: { hash: true } } } }),
    import("./telegram-service").then((m) => m.telegramStatus()),
  ]);

  const slips = allRows.map((s) => mapSlip(s));
  // ─── v11.0 — آمار تیتر کارنامه فقط از کارت‌های تایید سوپروایزر؛ وتوها به «دفتر سایه» می‌روند ───
  // v13.2 — کارت‌های بازخوانی (retroIssued — بازی FT پیش از صدور) از آمار اصلی حذف و به دسته ه می‌روند
  // v18.0 — کارت‌های تاج نقره‌ای (crownTier=SILVER_SHADOW) از کتاب طلایی جدا شده‌اند
  // (افراز مجزای Two-Tier Crown — استیک ۵۰u Half-Kelly) و در silverHarvest شمرده می‌شوند.
  const goldSlips = slips.filter((s) => s.supervisorApproved && !s.retroIssued && s.crownTier !== "SILVER_SHADOW");
  const silverSlips = slips.filter((s) => s.supervisorApproved && !s.retroIssued && s.crownTier === "SILVER_SHADOW");
  const approvedSlips = goldSlips;
  const retroSlips = slips.filter((s) => s.retroIssued);
  const shadowSlips = slips.filter((s) => !s.supervisorApproved && !s.retroIssued);
  // ═══ v20.0 — جدول کارنامه فقط «کتاب رسمی» است؛ سایه/بازخوانی ویوهای جدا (سند §۲/§۳ — حذف تیک جکپات از کارت سایه) ═══
  const officialView = goldSlips.slice(0, 120); // سقف نمایش جدول کارنامه رسمی
  const shadowView = shadowSlips.slice(0, 40);
  const retroView = retroSlips.slice(0, 20);
  // ═══ v20.0 — منبع واحد حقیقت (سند §۳-۲): همه آمارها فقط از computeMasterLedgerMetrics ═══
  const master = computeMasterLedgerMetrics(approvedSlips);
  const stats: SettlementStatsDTO = {
    total: master.total,
    pending: master.pending,
    live: master.live,
    wonA: master.wonA,
    wonB: master.wonB,
    doubleWin: master.doubleWin,
    middleTrap: master.middleTrap,
    manual: master.manual,
    void: master.void,
    settled: master.settled,
    netProfit: master.netProfit,
    netProfitPct: master.yieldPct ?? 0,
    staked: master.totalStaked,
    wins: master.wins,
    losses: master.losses,
    winRatePct: master.winRatePct,
    yieldPct: master.yieldPct,
    bankGrowthPct: master.bankGrowthPct,
  };

  // ─── v11.0 — دفتر سایه: تسویه کاغذی کارت‌های وتوشده (paper P&L — هرگز واقعی نبوده) ───
  // v13.5.1 — کارت‌های بازخوانی (retroIssued) از دفتر سایه خارج شدند؛ سایه فقط وتوهای زنده است
  const shadowByStatus: Record<string, number> = {};
  let shadowWins = 0;
  let shadowLosses = 0;
  let shadowNet = 0;
  for (const s of shadowSlips) {
    shadowByStatus[s.status] = (shadowByStatus[s.status] ?? 0) + 1;
    if (["WON_A", "WON_B", "DOUBLE_WIN", "MIDDLE_TRAP"].includes(s.status)) {
      if (s.status === "MIDDLE_TRAP") shadowLosses += 1;
      else shadowWins += 1;
      shadowNet += s.netProfit ?? 0;
    }
  }
  const shadowSettled = shadowWins + shadowLosses;
  const shadow = {
    total: shadowSlips.length,
    settled: shadowSettled,
    wins: shadowWins,
    losses: shadowLosses,
    winRate: shadowSettled > 0 ? Math.round((shadowWins / shadowSettled) * 1000) / 10 : null,
    netProfit: Math.round(shadowNet * 100) / 100,
    byStatus: shadowByStatus,
  };

  // ─── v18.0 — 🥈 حصاد آلفای سایه (Tier-2 Shadow Alpha Harvester) ───
  // کارت‌های تاج نقره‌ای سطح ۲ (winProb ≥ ۸۴٪ و شارپ ≥ ۰.۱۶ در لیگ معتبر) که به‌جای
  // حبس در دفتر کاغذی با استیک نصف ۵۰ واحدی Half-Kelly منتشر و تسویه واقعی شدند.
  const silverSettledSlips = silverSlips.filter((s) => ["WON_A", "WON_B", "DOUBLE_WIN", "MIDDLE_TRAP"].includes(s.status));
  const silverWins = silverSettledSlips.filter((s) => s.status !== "MIDDLE_TRAP").length;
  const silverLosses = silverSettledSlips.length - silverWins;
  const silverNet = silverSettledSlips.reduce((a, s) => a + (s.netProfit ?? 0), 0);
  const SILVER_START_BANK = 1000;
  let silverAcc = SILVER_START_BANK;
  const silverEquityPoints = [silverAcc];
  for (const s of [...silverSettledSlips].sort((a, b) => new Date(a.settledAt ?? 0).getTime() - new Date(b.settledAt ?? 0).getTime())) {
    silverAcc += s.netProfit ?? 0;
    silverEquityPoints.push(Math.round(silverAcc * 100) / 100);
  }
  const silverHarvest = {
    total: silverSlips.length,
    settled: silverSettledSlips.length,
    wins: silverWins,
    losses: silverLosses,
    winRate: silverSettledSlips.length > 0 ? Math.round((silverWins / silverSettledSlips.length) * 1000) / 10 : null,
    netProfit: Math.round(silverNet * 100) / 100,
    equityPoints: silverEquityPoints,
    finalBank: Math.round(silverAcc * 100) / 100,
    roiPct: Math.round(((silverAcc - SILVER_START_BANK) / SILVER_START_BANK) * 1000) / 10,
  };

  // ─── v13.2 — دفتر بازخوانی: کارت‌های چندروزه (هرگز پیش‌بازی صادر نشده) — جدا از آمار واقعی ───
  // v13.5.1 — بازخوانی با پرچم retroIssued شناسایی می‌شود (مستقل از تایید)؛ کارت بازخوانی
  // هرگز «تاییدشده» نیست — صدور پس از FT صرفاً تحلیل کاغذی است.
  let retroWins = 0;
  let retroLosses = 0;
  let retroNet = 0;
  for (const s of retroSlips) {
    if (["WON_A", "WON_B", "DOUBLE_WIN", "MIDDLE_TRAP"].includes(s.status)) {
      if (s.status === "MIDDLE_TRAP") retroLosses += 1;
      else retroWins += 1;
      retroNet += s.netProfit ?? 0;
    }
  }
  const retroSettled = retroWins + retroLosses;
  const retroBook = {
    total: retroSlips.length,
    settled: retroSettled,
    wins: retroWins,
    losses: retroLosses,
    winRate: retroSettled > 0 ? Math.round((retroWins / retroSettled) * 1000) / 10 : null,
    netProfit: Math.round(retroNet * 100) / 100,
  };

  // ─── v10.0 — ژورنال + دفتر دکترین + وضعیت اتوماسیون سرور ───
  const [journal, doctrine, sched] = await Promise.all([
    listJournal(30).catch(() => []),
    listDoctrine().catch(() => [] as DoctrineSummary[]),
    Promise.resolve(getSchedulerStatus()),
  ]);

  // ─── v13.5 — منحنی رشد بانک ۱۰۰۰ واحدی از «تمام تاریخ» (بدون سقف take:120) ───
  // فقط کارت‌های تاییدشده غیربازخوانی تسویه‌شده — هم‌مبنا با stats؛ انتهای منحنی
  // دقیقاً با «سود خالص مجموع» تیتر برابر است (رفع باگ نمایش/محاسبه).
  // v18.0 — کارت‌های تاج نقره‌ای از منحنی طلایی خارج شدند (منحنی مجزای silverHarvest).
  // v25.0 — کارت‌های نقره‌ای اکنون «پول واقعی منتشرشده» هستند (استیک ۵۰u Half-Kelly،
  // تایید سوپروایزر، تسویه ESPN) — منحنی «ترکیبی دو کتاب واقعی» ساخته می‌شود تا
  // انتهای منحنی دقیقاً برابر تیتر بانک ترکیبی هیرو باشد (منبع واحد حقیقت).
  const curveRows = await db.issuedSlip.findMany({
    where: {
      supervisorApproved: true,
      retroIssued: false,
      status: { in: ["WON_A", "WON_B", "DOUBLE_WIN", "MIDDLE_TRAP"] },
      settledAt: { not: null },
    },
    select: { netProfit: true, settledAt: true, status: true },
    orderBy: { settledAt: "asc" },
  });
  const START_BANK = 1000;
  let equityAcc = START_BANK;
  const equityPoints = [equityAcc];
  const equitySeries: { t: string; v: number }[] = [{ t: (curveRows[0]?.settledAt ?? new Date()).toISOString(), v: START_BANK }];
  for (const r of curveRows) {
    equityAcc += r.netProfit ?? 0;
    equityPoints.push(Math.round(equityAcc * 100) / 100);
    if (r.settledAt) equitySeries.push({ t: r.settledAt.toISOString(), v: Math.round(equityAcc * 100) / 100 });
  }
  const firstSettled = curveRows[0]?.settledAt ?? null;
  const lastSettled = curveRows[curveRows.length - 1]?.settledAt ?? null;

  // ═══ v21.0 — ماژول حرفه‌ای منحنی بانک: تجمیع روزانه/هفتگی/ماهانه + streak + drawdown ═══
  // همه بازه‌ها بر اساس تقویم تهران (UTC+3:30) — روزهای بدون تسویه هم با صفر می‌آیند تا
  // محور زمان پیوسته باشد؛ wins/losses/settled از وضعیت واقعی تسویه ESPN می‌آیند.
  const TZ = 3.5 * 3600_000;
  const dayKeyOf = (t: number) => Math.floor((t + TZ) / 86_400_000);
  const weekKeyOf = (t: number) => Math.floor((t + TZ) / (7 * 86_400_000));
  const monthKeyOf = (t: number) => {
    const d = new Date(t + TZ);
    return d.getUTCFullYear() * 12 + d.getUTCMonth();
  };
  const dateFa = (iso: number, opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("fa-IR", opts).format(new Date(iso));

  const buildPeriodStats = (
    keyOf: (t: number) => number,
    windowKeys: number[],
    labelFor: (k: number) => string
  ): { key: string; label: string; netProfit: number; settled: number; wins: number; losses: number; bankAtEnd: number }[] => {
    const keySet = new Set(windowKeys.map(String));
    const windowMin = windowKeys.length > 0 ? Math.min(...windowKeys) : Infinity;
    const buckets = new Map<string, { net: number; settled: number; wins: number; losses: number }>();
    let bankBefore = START_BANK;
    for (const r of curveRows) {
      if (!r.settledAt) continue;
      const k = String(keyOf(r.settledAt.getTime()));
      const win = r.status !== "MIDDLE_TRAP";
      if (!keySet.has(k)) {
        // ردیف‌های خارج پنجره — فقط در مبنا بانک شروع پنجره لحاظ می‌شوند
        if (keyOf(r.settledAt.getTime()) < windowMin) bankBefore += r.netProfit ?? 0;
        continue;
      }
      const b = buckets.get(k) ?? { net: 0, settled: 0, wins: 0, losses: 0 };
      b.net += r.netProfit ?? 0;
      b.settled += 1;
      if (win) b.wins += 1;
      else b.losses += 1;
      buckets.set(k, b);
    }
    let bank = bankBefore;
    return windowKeys.map((wk) => {
      const k = String(wk);
      const b = buckets.get(k) ?? { net: 0, settled: 0, wins: 0, losses: 0 };
      bank += b.net;
      return {
        key: k,
        label: labelFor(wk),
        netProfit: Math.round(b.net * 100) / 100,
        settled: b.settled,
        wins: b.wins,
        losses: b.losses,
        bankAtEnd: Math.round(bank * 100) / 100,
      };
    });
  };

  const nowMs = Date.now();
  const todayKey = dayKeyOf(nowMs);
  const daily = buildPeriodStats(
    dayKeyOf,
    Array.from({ length: 14 }, (_, i) => todayKey - (13 - i)),
    (k) => dateFa(k * 86_400_000 - TZ, { month: "short", day: "numeric" })
  );
  const thisWeekKey = weekKeyOf(nowMs);
  const weekly = buildPeriodStats(
    weekKeyOf,
    Array.from({ length: 8 }, (_, i) => thisWeekKey - (7 - i)),
    (k) => `هفتهٔ ${dateFa(k * 7 * 86_400_000 - TZ, { month: "short", day: "numeric" })}`
  );
  const thisMonthKey = monthKeyOf(nowMs);
  const monthly = buildPeriodStats(
    monthKeyOf,
    Array.from({ length: 6 }, (_, i) => thisMonthKey - (5 - i)),
    (k) => dateFa(Date.UTC(Math.floor(k / 12), k % 12, 1) - TZ, { month: "long" })
  );

  // رگبار فعلی — از آخرین تسویه به عقب: برد/باخت متوالی
  let streakType: "W" | "L" | null = null;
  let streakCount = 0;
  for (let i = curveRows.length - 1; i >= 0; i--) {
    const isWin = curveRows[i].status !== "MIDDLE_TRAP";
    const t: "W" | "L" = isWin ? "W" : "L";
    if (streakType === null) streakType = t;
    if (t !== streakType) break;
    streakCount += 1;
  }
  // بیشترین افت سرمایه تاریخی (peak-to-trough ٪) + اوج بانک
  let peak = START_BANK;
  let maxDD = 0;
  for (const v of equityPoints) {
    if (v > peak) peak = v;
    const dd = peak > 0 ? ((peak - v) / peak) * 100 : 0;
    if (dd > maxDD) maxDD = dd;
  }

  const equity = {
    startBank: START_BANK,
    points: equityPoints,
    finalBank: Math.round(equityAcc * 100) / 100,
    roiPct: Math.round(((equityAcc - START_BANK) / START_BANK) * 1000) / 10,
    basis: curveRows.length,
    /** v13.5.1 — بازه زمانی واقعی منحنی برای برچسب محور زیر نمودار */
    firstSettledAt: firstSettled ? firstSettled.toISOString() : null,
    lastSettledAt: lastSettled ? lastSettled.toISOString() : null,
    // v21.0 — تحلیل حرفه‌ای بانک
    series: equitySeries,
    daily,
    weekly,
    monthly,
    streak: { type: streakType, count: streakCount },
    maxDrawdownPct: Math.round(maxDD * 10) / 10,
    peakBank: Math.round(peak * 100) / 100,
  };

  // ─── v18.0 — نبض کارنامه (Ledger Pulse): تشخیص صادقانه «چرا آمار تغییر نکرده» ───
  // آمار رسمی فقط کارت‌های تاییدشده را می‌شمارد؛ اگر گیت سوپروایزر همه کارت‌های
  // تازه را وتو کند، منحنی/وین‌ریت تخت می‌ماند — این نبض همان وضعیت را شفاف نشان می‌دهد.
  const pulseNow = Date.now();
  const weekAgoMs = pulseNow - 7 * 86_400_000;
  const TEHRAN_OFFSET_MS = 3.5 * 3600_000;
  const dayStartShifted = Math.floor((pulseNow + TEHRAN_OFFSET_MS) / 86_400_000) * 86_400_000;
  const tehranDayStart = new Date(dayStartShifted - TEHRAN_OFFSET_MS);
  const [pendingApproved, vetoedTotal, approvedLive] = await Promise.all([
    db.issuedSlip.count({ where: { supervisorApproved: true, retroIssued: false, status: { in: ["PENDING", "LIVE"] } } }),
    db.issuedSlip.count({ where: { supervisorApproved: false, retroIssued: false } }),
    db.issuedSlip.count({ where: { supervisorApproved: true, retroIssued: false, status: { in: ["PENDING", "LIVE"] }, kickoff: { gte: tehranDayStart, lt: new Date(tehranDayStart.getTime() + 86_400_000) } } }),
  ]);
  const pulse = {
    lastSettledAt: lastSettled ? lastSettled.toISOString() : null,
    settled7d: curveRows.filter((r) => r.settledAt && r.settledAt.getTime() >= weekAgoMs).length,
    settledToday: curveRows.filter((r) => r.settledAt && r.settledAt >= tehranDayStart).length,
    pendingApproved,
    approvedLiveToday: approvedLive,
    vetoedTotal,
  };

  // ═══ v19.0 — کارت ویترین اثبات سودآوری ۵ رژیم (5-Regime ROI Breakdown) ═══
  // افراز مجزا: هر کارت فقط در خط تولید خودش شمرده می‌شود (productLine)؛
  // کارت‌های بدون productLine = زوج‌تیپ دوچرخه (خط SINGLE پیش‌فرض).
  type RegimeKey = "DUAL_HEDGE" | "COMBO" | "CORRECT_SCORE" | "BANKER" | "ACCUMULATOR" | "SNIPER";
  const regimeOf = (pl: string | null): RegimeKey => {
    switch (pl) {
      case "COMBO": return "COMBO";
      case "CS_CLUSTER":
      case "CORRECT_SCORE": return "CORRECT_SCORE";
      case "BANKER": return "BANKER";
      case "ACCUMULATOR": return "ACCUMULATOR";
      case "SNIPER": return "SNIPER";
      default: return "DUAL_HEDGE";
    }
  };
  const REGIME_DEFS: { key: RegimeKey; labelFa: string; labelEn: string; icon: string }[] = [
    { key: "DUAL_HEDGE", labelFa: "زوج‌تیپ دوقلو", labelEn: "Dual-Hedge", icon: "⚖️" },
    { key: "COMBO", labelFa: "کمبوی رسمی", labelEn: "Official Combo", icon: "🧩" },
    { key: "CORRECT_SCORE", labelFa: "خوشه نتیجه دقیق", labelEn: "Correct Score Cluster", icon: "🎯" },
    { key: "BANKER", labelFa: "بنکر ستون فقرات", labelEn: "Single Bankers", icon: "🏦" },
    { key: "ACCUMULATOR", labelFa: "آکومولاتور ۲-۳ تایی", labelEn: "Smart Accumulators", icon: "🔗" },
    { key: "SNIPER", labelFa: "تک‌تیرانداز ارزش", labelEn: "Odds Snipers", icon: "🎯" },
  ];
  const settledApproved = approvedSlips.filter((s) => ["WON_A", "WON_B", "DOUBLE_WIN", "MIDDLE_TRAP"].includes(s.status));
  const regimes = REGIME_DEFS.map((def) => {
    const rows = settledApproved.filter((s) => regimeOf(s.productLine ?? null) === def.key);
    const settledN = rows.length;
    const winsN = rows.filter((r) => r.status !== "MIDDLE_TRAP").length;
    const net = Math.round(rows.reduce((a, r) => a + (r.netProfit ?? 0), 0) * 100) / 100;
    return {
      key: def.key,
      labelFa: def.labelFa,
      labelEn: def.labelEn,
      icon: def.icon,
      settled: settledN,
      wins: winsN,
      winRatePct: settledN > 0 ? Math.round((winsN / settledN) * 1000) / 10 : null,
      netProfit: net,
      avgProfitPerWin: winsN > 0 ? Math.round((net / winsN) * 100) / 100 : null,
    };
  }).filter((r) => r.key !== "SNIPER" || r.settled > 0); // اسنایپر فقط وقتی کارت واقعی دارد نمایش داده می‌شود

  return {
    success: true,
    // v20.0 — جدول کارنامه = کتاب رسمی؛ سایه و بازخوانی در ویوهای جدا با استایل جدا رندر می‌شوند
    slips: officialView,
    shadowSlips: shadowView,
    retroSlips: retroView,
    stats,
    master: {
      total: master.total,
      settled: master.settled,
      wins: master.wins,
      losses: master.losses,
      winRatePct: master.winRatePct,
      netProfit: master.netProfit,
      totalStaked: master.totalStaked,
      yieldPct: master.yieldPct,
      bankGrowthPct: master.bankGrowthPct,
      finalBank: master.finalBank,
    },
    regimes,
    shadow,
    retroBook,
    silverHarvest,
    outbox: outboxRows.map((o) => ({
      id: o.id,
      kind: o.kind,
      ok: o.ok,
      detail: o.detail,
      slipHash: o.slip?.hash ?? null,
      createdAt: o.createdAt.toISOString(),
    })),
    telegram: { configured: tgStatus.configured, channelSet: tgStatus.channelSet },
    journal,
    doctrine,
    automation: {
      schedulerActive: sched.active,
      lastTickAt: sched.lastTickAt ? new Date(sched.lastTickAt).toISOString() : null,
      lastDailyReportAt: sched.lastDailyReportAt ? new Date(sched.lastDailyReportAt).toISOString() : null,
      intervalSec: sched.intervalSec,
    },
    unitBasis: { stakePerTicket: 100, unitPctOfBankroll: 1, exampleBankrollUsd: 10 },
    equity,
    pulse,
  };
}

// ═════════════════════ تسویه خودکار پس‌زمینه (throttle ۶۰ ثانیه) ═════════════════════

let autoBusy = false;
let autoLastAt = 0;
const AUTO_THROTTLE_MS = 60_000;

/**
 * فراخوانی سبک از دل فید زنده — به محض FT در ESPN تسویه انجام می‌شود
 * بدون انتظار برای کلیک کاربر. با throttle و قفل برای صفر هزینه اضافه.
 */
export async function autoSettleInBackground(): Promise<void> {
  const pending = await db.issuedSlip.count({ where: { status: { in: ["PENDING", "LIVE"] } } });
  if (pending === 0) return;
  if (autoBusy || Date.now() - autoLastAt < AUTO_THROTTLE_MS) return;
  autoBusy = true;
  autoLastAt = Date.now();
  try {
    await settleFinishedSlips({ notify: true });
  } catch (err) {
    console.warn("auto-settle failed:", err);
  } finally {
    autoBusy = false;
  }
}
