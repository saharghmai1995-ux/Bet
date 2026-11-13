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

/**
 * ارزیابی همه شرط‌های یک تیپ با نتایج واقعی ESPN.
 * هر شرط ممکن است روی بازی دیگری باشد (میکس دو بازی) → امتیاز همان بازی از نقشه اسکوربورد.
 */
function gradeLegs(
  legs: SettlementLegDTO[],
  scoreOf: (externalId: string) => { hg: number; ag: number; state: string } | undefined,
  fallbackExternalId: string | null
): { graded: GradedLeg[]; allWon: boolean; anyLost: boolean; hasOffBoard: boolean; allFinal: boolean } {
  const graded: GradedLeg[] = [];
  let allWon = true;
  let anyLost = false;
  let hasOffBoard = false;
  let allFinal = true;

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
    const won = legCovers(leg.key, score.hg, score.ag);
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
): { graded: GradedLeg[]; allWon: boolean; anyLost: boolean; hasOffBoard: boolean; allFinal: boolean } {
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

/** فرمول سود مستند در سند ارتقا — مجموع استیک ۱۰۰ واحد (v17.0: برای کارت‌های تک‌ستون = stakeA + stakeB) */
function settlementProfit(
  status: Exclude<SlipStatus, "PENDING" | "LIVE" | "MANUAL_REVIEW" | "VOID">,
  stakeA: number,
  stakeB: number,
  oddsA: number,
  oddsB: number
): { netProfit: number; profitA: number; profitB: number } {
  const r1 = (v: number) => Math.round(v * 100) / 100;
  const totalStaked = stakeA + stakeB; // v17.0 — کارت‌های تک‌تیپ (BANKER): stakeB = 0
  switch (status) {
    case "WON_A":
      // 🟢 برد تیپ A: سود خالص = stakeA × oddsA − مجموع استیک
      return { netProfit: r1(stakeA * oddsA - totalStaked), profitA: r1(stakeA * oddsA - totalStaked), profitB: r1(-stakeB) };
    case "WON_B":
      // 🟢 برد تیپ B: سود خالص = stakeB × oddsB − مجموع استیک
      return { netProfit: r1(stakeB * oddsB - totalStaked), profitA: r1(-stakeA), profitB: r1(stakeB * oddsB - totalStaked) };
    case "DOUBLE_WIN":
      // 🏆 برد طلایی هر دو تیپ: جمع سود هر دو
      return {
        netProfit: r1(stakeA * oddsA + stakeB * oddsB - totalStaked),
        profitA: r1(stakeA * oddsA - stakeA),
        profitB: r1(stakeB * oddsB - stakeB),
      };
    case "MIDDLE_TRAP":
      // 🔴 باخت همزمان — ثبت صادقانه
      return { netProfit: r1(-totalStaked), profitA: r1(-stakeA), profitB: r1(-stakeB) };
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
        : gradeLegs(legsA, scoreOf, slip.externalId);
      // v17.0 — کارت تک‌تیپ (BANKER): تیپ B فاقد شرط است — همیشه «برنده» فرض می‌شود
      const gradedB = legsB.length === 0
        ? { graded: [], allWon: true, anyLost: false, hasOffBoard: false, allFinal: true }
        : gradeLegs(legsB, scoreOf, slip.externalId);

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
        if (aWon && bWon) {
          status = "DOUBLE_WIN";
          note = isClusterA
            ? "🏆 خوشه نتیجه دقیق برنده شد — یکی از نمرات خوشه وقوع یافت (تسویه با ضریب موثر داچینگ)"
            : "🏆 نتیجه در خانه‌های مشترک هر دو تیپ — برد طلایی (Jackpot)";
        } else if (aWon) {
          status = "WON_A";
          note = "🟢 تیپ A برد — تسویه خودکار با نتیجه واقعی ESPN";
        } else if (bWon) {
          status = "WON_B";
          note = "🟢 تیپ B برد — تسویه خودکار با نتیجه واقعی ESPN";
        } else {
          status = "MIDDLE_TRAP";
          note = isClusterA
            ? "🔴 هیچ‌یک از نمرات خوشه وقوع نکرد — باخت صادقانه و شفاف خوشه"
            : "🔴 تله میانی — هر دو تیپ باختند؛ ثبت صادقانه و شفاف";
        }
      }

      if ((status as string) === "PENDING" || (status as string) === "LIVE") continue;

      const hg = info.hg;
      const ag = info.ag;
      const prof =
        status === "WON_A" || status === "WON_B" || status === "DOUBLE_WIN" || status === "MIDDLE_TRAP"
          ? settlementProfit(status, slip.stakeA, slip.stakeB, slip.oddsA, slip.oddsB)
          : { netProfit: null, profitA: null, profitB: null };

      await db.issuedSlip.update({
        where: { id: slip.id },
        data: {
          status,
          homeGoals: hg,
          awayGoals: ag,
          profitA: prof.profitA,
          profitB: prof.profitB,
          netProfit: prof.netProfit,
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
  const stakes =
    item.stakeA && item.stakeB && item.stakeA + item.stakeB > 0
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
  const lH = item.lambdaHome ?? 1.35;
  const lA = item.lambdaAway ?? 1.25;
  const probA = legProbability(lH, lA, item.legsA ?? []);
  const probB = legProbability(lH, lA, item.legsB ?? []);

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
  const edgeSourceA = edgeA !== null ? (pinA !== null ? "PINNACLE" : "MARKET_FAIR") : null;
  const edgeSourceB = edgeB !== null ? (pinB !== null ? "PINNACLE" : "MARKET_FAIR") : null;
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

      const tipKindA = s.tipKindA ?? (edgeA !== null ? deriveTipKind(legsA.map((l) => l.key), s.oddsA) : null);
      const tipKindB = s.tipKindB ?? (edgeB !== null ? deriveTipKind(legsB.map((l) => l.key), s.oddsB) : null);
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
  const slipsView = slips.slice(0, 120); // سقف نمایش جدول کارنامه
  // ─── v11.0 — آمار تیتر کارنامه فقط از کارت‌های تایید سوپروایزر؛ وتوها به «دفتر سایه» می‌روند ───
  // v13.2 — کارت‌های بازخوانی (retroIssued — بازی FT پیش از صدور) از آمار اصلی حذف و به دسته ه می‌روند
  // v18.0 — کارت‌های تاج نقره‌ای (crownTier=SILVER_SHADOW) از کتاب طلایی جدا شده‌اند
  // (افراز مجزای Two-Tier Crown — استیک ۵۰u Half-Kelly) و در silverHarvest شمرده می‌شوند.
  const goldSlips = slips.filter((s) => s.supervisorApproved && !s.retroIssued && s.crownTier !== "SILVER_SHADOW");
  const silverSlips = slips.filter((s) => s.supervisorApproved && !s.retroIssued && s.crownTier === "SILVER_SHADOW");
  const approvedSlips = goldSlips;
  const retroSlips = slips.filter((s) => s.retroIssued);
  const stats: SettlementStatsDTO = {
    total: approvedSlips.length,
    pending: 0,
    live: 0,
    wonA: 0,
    wonB: 0,
    doubleWin: 0,
    middleTrap: 0,
    manual: 0,
    void: 0,
    settled: 0,
    netProfit: 0,
    netProfitPct: 0,
    staked: 0,
  };
  for (const s of approvedSlips) {
    switch (s.status) {
      case "PENDING": stats.pending += 1; break;
      case "LIVE": stats.live += 1; break;
      case "WON_A": stats.wonA += 1; break;
      case "WON_B": stats.wonB += 1; break;
      case "DOUBLE_WIN": stats.doubleWin += 1; break;
      case "MIDDLE_TRAP": stats.middleTrap += 1; break;
      case "MANUAL_REVIEW": stats.manual += 1; break;
      case "VOID": stats.void += 1; break;
    }
    if (["WON_A", "WON_B", "DOUBLE_WIN", "MIDDLE_TRAP"].includes(s.status)) {
      stats.settled += 1;
      stats.netProfit += s.netProfit ?? 0;
      stats.staked += s.stakeA + s.stakeB;
    }
  }
  stats.netProfit = Math.round(stats.netProfit * 100) / 100;
  stats.netProfitPct = stats.staked > 0 ? Math.round((stats.netProfit / stats.staked) * 1000) / 10 : 0;

  // ─── v11.0 — دفتر سایه: تسویه کاغذی کارت‌های وتوشده (paper P&L — هرگز واقعی نبوده) ───
  // v13.5.1 — کارت‌های بازخوانی (retroIssued) از دفتر سایه خارج شدند؛ سایه فقط وتوهای زنده است
  const shadowSlips = slips.filter((s) => !s.supervisorApproved && !s.retroIssued);
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
  const curveRows = await db.issuedSlip.findMany({
    where: {
      supervisorApproved: true,
      retroIssued: false,
      crownTier: { not: "SILVER_SHADOW" },
      status: { in: ["WON_A", "WON_B", "DOUBLE_WIN", "MIDDLE_TRAP"] },
      settledAt: { not: null },
    },
    select: { netProfit: true, settledAt: true },
    orderBy: { settledAt: "asc" },
  });
  const START_BANK = 1000;
  let equityAcc = START_BANK;
  const equityPoints = [equityAcc];
  for (const r of curveRows) {
    equityAcc += r.netProfit ?? 0;
    equityPoints.push(Math.round(equityAcc * 100) / 100);
  }
  const firstSettled = curveRows[0]?.settledAt ?? null;
  const lastSettled = curveRows[curveRows.length - 1]?.settledAt ?? null;
  const equity = {
    startBank: START_BANK,
    points: equityPoints,
    finalBank: Math.round(equityAcc * 100) / 100,
    roiPct: Math.round(((equityAcc - START_BANK) / START_BANK) * 1000) / 10,
    basis: curveRows.length,
    /** v13.5.1 — بازه زمانی واقعی منحنی برای برچسب محور زیر نمودار */
    firstSettledAt: firstSettled ? firstSettled.toISOString() : null,
    lastSettledAt: lastSettled ? lastSettled.toISOString() : null,
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

  return {
    success: true,
    slips: slipsView,
    stats,
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
