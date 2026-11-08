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
async function loadEspnScoreWindow(): Promise<{ byId: Map<string, EspnScoreInfo>; byName: Map<string, EspnScoreInfo>; count: number }> {
  const events: LiveMatchEvent[] = await fetchEspnEvents(-RESULT_WINDOW_DAYS, 0);
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

/** فرمول سود مستند در سند ارتقا — مجموع استیک ۱۰۰ واحد */
function settlementProfit(
  status: Exclude<SlipStatus, "PENDING" | "LIVE" | "MANUAL_REVIEW" | "VOID">,
  stakeA: number,
  stakeB: number,
  oddsA: number,
  oddsB: number
): { netProfit: number; profitA: number; profitB: number } {
  const r1 = (v: number) => Math.round(v * 100) / 100;
  switch (status) {
    case "WON_A":
      // 🟢 برد تیپ A: سود خالص = stakeA × oddsA − ۱۰۰
      return { netProfit: r1(stakeA * oddsA - DUTCH_TOTAL), profitA: r1(stakeA * oddsA - DUTCH_TOTAL), profitB: r1(-stakeB) };
    case "WON_B":
      // 🟢 برد تیپ B: سود خالص = stakeB × oddsB − ۱۰۰
      return { netProfit: r1(stakeB * oddsB - DUTCH_TOTAL), profitA: r1(-stakeA), profitB: r1(stakeB * oddsB - DUTCH_TOTAL) };
    case "DOUBLE_WIN":
      // 🏆 برد طلایی هر دو تیپ: جمع سود هر دو
      return {
        netProfit: r1(stakeA * oddsA + stakeB * oddsB - DUTCH_TOTAL),
        profitA: r1(stakeA * oddsA - stakeA),
        profitB: r1(stakeB * oddsB - stakeB),
      };
    case "MIDDLE_TRAP":
      // 🔴 باخت همزمان — ثبت صادقانه
      return { netProfit: r1(-DUTCH_TOTAL), profitA: r1(-stakeA), profitB: r1(-stakeB) };
  }
}

/**
 * قلب موتور: بررسی همه کارت‌های در انتظار با فید FT واقعی ESPN و تسویه خودکار.
 */
export async function settleFinishedSlips(options?: { notify?: boolean }): Promise<SettlementSyncResultDTO> {
  const t0 = Date.now();
  const notify = options?.notify !== false;
  const settled: SettlementSyncResultDTO["settled"] = [];
  let liveCount = 0;
  let notified = 0;
  let ftFound = 0;
  /** v9.0 — سقف اعلام تصویری هر پاس (تولید تصویر ~۲۰ ثانیه هر پیام — حفظ تأخیر سینک) */
  const NOTIFY_CAP = 4;
  let notifyBudget = NOTIFY_CAP;

  const [{ byId, byName, count }, pendingSlips] = await Promise.all([
    loadEspnScoreWindow(),
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
      const gradedA = gradeLegs(legsA, scoreOf, slip.externalId);
      const gradedB = gradeLegs(legsB, scoreOf, slip.externalId);

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
          note = "🏆 نتیجه در خانه‌های مشترک هر دو تیپ — برد طلایی (Jackpot)";
        } else if (aWon) {
          status = "WON_A";
          note = "🟢 تیپ A برد — تسویه خودکار با نتیجه واقعی ESPN";
        } else if (bWon) {
          status = "WON_B";
          note = "🟢 تیپ B برد — تسویه خودکار با نتیجه واقعی ESPN";
        } else {
          status = "MIDDLE_TRAP";
          note = "🔴 تله میانی — هر دو تیپ باختند؛ ثبت صادقانه و شفاف";
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
        where: { status: { in: ["WON_A", "WON_B", "DOUBLE_WIN", "MIDDLE_TRAP"] }, telegramResult: false },
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
  const edgeA = computeEdge(probA, item.oddsA);
  const edgeB = computeEdge(probB, item.oddsB);
  const edgeSourceA = edgeA !== null ? "MARKET_FAIR" : null;
  const edgeSourceB = edgeB !== null ? "MARKET_FAIR" : null;
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
      modelProbA: probA,
      modelProbB: probB,
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
      status: "PENDING",
    },
  });
  return { created: true, slip: mapSlip(row) };
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
  const [rows, outboxRows, tgStatus] = await Promise.all([
    db.issuedSlip.findMany({ orderBy: [{ status: "asc" }, { kickoff: "desc" }], take: 120 }),
    db.telegramOutbox.findMany({ orderBy: { createdAt: "desc" }, take: 25, include: { slip: { select: { hash: true } } } }),
    import("./telegram-service").then((m) => m.telegramStatus()),
  ]);

  const slips = rows.map((s) => mapSlip(s));
  const stats: SettlementStatsDTO = {
    total: slips.length,
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
  for (const s of slips) {
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

  // ─── v10.0 — ژورنال + دفتر دکترین + وضعیت اتوماسیون سرور ───
  const [journal, doctrine, sched] = await Promise.all([
    listJournal(30).catch(() => []),
    listDoctrine().catch(() => [] as DoctrineSummary[]),
    Promise.resolve(getSchedulerStatus()),
  ]);

  return {
    success: true,
    slips,
    stats,
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
