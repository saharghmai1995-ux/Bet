import { NextRequest, NextResponse } from "next/server";
// v20.1 — کش کوتاه‌مدت داشبورد: هر poll چندثانیه‌ای دیگر ESPN/موتور کامل اجرا نمی‌کند
import { pollCacheGet, pollCacheSet, pollCacheKey } from "@/lib/server/poll-cache";
import { db } from "@/lib/db";
import { ensureSeeded } from "@/lib/seed";
import { computeMatchEngine } from "@/lib/engine/matchEngine";
import { runMonteCarlo, jointStates, MC_SELECTIONS, type SelectionKey, type MonteCarloResult } from "@/lib/engine/montecarlo";
import { simultaneousKelly } from "@/lib/engine/kelly";
import { checkMiddleTrap, type SelectionKind, type TrapLeg } from "@/lib/engine/dutching";
import { generateOrthogonalComplementarySlips, buildOrthoPortfolioPair, asymmetricAlphaStakes } from "@/lib/engine/orthogonal";
import { routeBetTypes, type MarketPrices } from "@/lib/engine/betrouter";
import { runQuantumAnnealingSolver } from "@/lib/engine/quantum-solver";
import { buildTelemetryWarehouse, runQqlPipeline, type TelemetrySlipInput, type QqlCandidateInput } from "@/lib/engine/qql-rca-engine";
import { buildScoreMatrix } from "@/lib/engine/poisson";
import { getActiveRuleFor } from "@/lib/server/calibration-rules";
import type { LambdaBreakdown } from "@/lib/engine/matchEngine";
import type { PortfolioPairDTO, PortfolioResultDTO, PortfolioSelectionDTO } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type OddsRec = { bookmaker: string; oddsHome: number; oddsDraw: number; oddsAway: number; oddsOver25: number; oddsUnder25: number; oddsCornersOver95: number; oddsCornersUnder95: number };

const TRAP_MAP: Record<SelectionKey, SelectionKind> = {
  HOME: "HOME_WIN", DRAW: "DRAW", AWAY: "AWAY_WIN",
  DC_1X: "HOME_OR_DRAW", DC_X2: "AWAY_OR_DRAW",
  O25: "OVER_2_5", U25: "UNDER_2_5",
  O15: "OVER_1_5", U35: "UNDER_3_5",
  BTTS_Y: "BTTS_YES", BTTS_N: "BTTS_NO",
  C_O95: "OVER_2_5", C_U95: "UNDER_2_5", // کرنر به عنوان متغیر دوگانه رفتار می‌کند
};

/** بهترین قیمت یک انتخاب بین بوک‌میکرها */
function bestPrice(key: SelectionKey, odds: OddsRec[]): { odds: number; book: string } {
  const pick = (fn: (o: OddsRec) => number) => {
    let best = { odds: 0, book: "-" };
    for (const o of odds) {
      const v = fn(o);
      if (v > best.odds) best = { odds: v, book: o.bookmaker === "PINNACLE" ? "پیناکل" : o.bookmaker === "SOFT_A" ? "بت‌مستر" : "پرسیان‌بت" };
    }
    return best;
  };
  switch (key) {
    case "HOME": return pick((o) => o.oddsHome);
    case "DRAW": return pick((o) => o.oddsDraw);
    case "AWAY": return pick((o) => o.oddsAway);
    case "DC_1X":
    case "DC_X2": {
      // شانس مجدد: معکوس مجموع احتمالات ضمنی دو نتیجه
      let best = { odds: 0, book: "-" };
      for (const o of odds) {
        const v = key === "DC_1X" ? 1 / (1 / o.oddsHome + 1 / o.oddsDraw) : 1 / (1 / o.oddsAway + 1 / o.oddsDraw);
        if (v > best.odds) best = { odds: v, book: o.bookmaker === "PINNACLE" ? "پیناکل" : o.bookmaker === "SOFT_A" ? "بت‌مستر" : "پرسیان‌بت" };
      }
      return best;
    }
    case "O25": return pick((o) => o.oddsOver25);
    case "U25": return pick((o) => o.oddsUnder25);
    case "C_O95": return pick((o) => o.oddsCornersOver95);
    case "C_U95": return pick((o) => o.oddsCornersUnder95);
    default: return { odds: 0, book: "-" };
  }
}

function seedFromId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 2 ** 31;
}

/** مونت‌کارلو + جدول انتخاب‌های یک بازی (کش per-request — بدون رقابت بین درخواست‌های موازی) */
function analyzeMatch(mcInput: { matchId: string; homeTeam: string; awayTeam: string; matchLabel: string }, odds: OddsRec[], cache: Map<string, unknown>): { mc: MonteCarloResult; selections: PortfolioSelectionDTO[]; lambdas: { home: number; away: number }; breakdown: LambdaBreakdown } {
  const match = cache.get(mcInput.matchId);
  if (!match) throw new Error("match not cached");
  const engine = computeMatchEngine(match as never);
  const mc = runMonteCarlo({
    matrix: engine.dc.matrix,
    lambdaCorners: engine.lambdaCorners,
    lambdaCards: engine.lambdaCards,
    sims: 10000,
    seed: seedFromId(mcInput.matchId),
  });

  const selections: PortfolioSelectionDTO[] = MC_SELECTIONS.map((key) => {
    const price = bestPrice(key, odds);
    const prob = mc.flags[key] ? mc.flags[key].reduce((s: number, v: number) => s + v, 0) / mc.flags[key].length : 0;
    const sharpPin = odds.find((o) => o.bookmaker === "PINNACLE");
    const sharpOdds = sharpPin
      ? key === "HOME" ? sharpPin.oddsHome : key === "DRAW" ? sharpPin.oddsDraw : key === "AWAY" ? sharpPin.oddsAway
      : key === "O25" ? sharpPin.oddsOver25 : key === "U25" ? sharpPin.oddsUnder25
      : key === "C_O95" ? sharpPin.oddsCornersOver95 : key === "C_U95" ? sharpPin.oddsCornersUnder95 : null
      : null;
    return {
      key,
      label: selectionLabel(key),
      matchId: mcInput.matchId,
      matchLabel: mcInput.matchLabel,
      modelProb: prob,
      bestOdds: price.odds,
      bestBook: price.book,
      sharpOdds,
      evPct: prob * price.odds - 1,
    };
  });

  return { mc, selections, lambdas: { home: engine.dc.lambdaHome, away: engine.dc.lambdaAway }, breakdown: engine.lambdaBreakdown };
}

const selectionLabels: Record<SelectionKey, string> = {
  HOME: "برد میزبان",
  DRAW: "مساوی",
  AWAY: "برد میهمان",
  DC_1X: "شانس مجدد میزبان (1X)",
  DC_X2: "شانس مجدد میهمان (X2)",
  O25: "بالای ۲.۵ گل",
  U25: "زیر ۲.۵ گل",
  O15: "بالای ۱.۵ گل",
  U35: "زیر ۳.۵ گل",
  BTTS_Y: "هر دو تیم گل می‌زنند",
  BTTS_N: "گل نزدن حداقل یک تیم",
  C_O95: "بالای ۹.۵ کرنر",
  C_U95: "زیر ۹.۵ کرنر",
};
function selectionLabel(k: SelectionKey): string {
  return selectionLabels[k];
}

// v4.0: کش per-request (به‌جای ماژول-سطح) — اسکن موازی خلبان خودکار دیگر رقابت ندارد

/**
 * POST /api/agent/portfolio { matchId, bankroll?, secondMatchId? }
 * موتور پرتفوی: مونت‌کارلو کاپولا (۱۰هزار شبیه‌سازی) → کشف زوج‌های کم‌ریسک → کلِی همزمان
 */
export async function POST(req: NextRequest) {
  try {
    await ensureSeeded();
    const body = await req.json();
    const matchId: string = body.matchId;
    const bankroll = Math.max(1, Number(body.bankroll) || 100);
    if (!matchId) {
      return NextResponse.json({ success: false, error: "matchId الزامی است" }, { status: 400 });
    }

    // v20.1 — کش ۳۰ثانیه‌ای per-(matchId,secondMatchId,bankroll) — پاسخ تکراری از حافظه
    const portfolioCacheKey = pollCacheKey("portfolio", {
      matchId,
      secondMatchId: body.secondMatchId ?? "",
      bankroll,
    });
    const portfolioCached = pollCacheGet<unknown>(portfolioCacheKey, 30_000);
    if (portfolioCached) return NextResponse.json(portfolioCached as never);

    const mcInputCache = new Map<string, unknown>();
    const primary = await db.match.findUnique({ where: { id: matchId } });
    if (!primary) {
      return NextResponse.json({ success: false, error: "بازی یافت نشد" }, { status: 404 });
    }
    mcInputCache.set(primary.id, primary);
    const primaryOdds = await db.oddsRecord.findMany({ where: { matchId: primary.id } });

    const second =
      body.secondMatchId && body.secondMatchId !== primary.id
        ? await db.match.findUnique({ where: { id: body.secondMatchId } })
        : await db.match.findFirst({
            where: { id: { not: primary.id }, kickoff: { gte: new Date() } },
            orderBy: { kickoff: "asc" },
          });
    if (second) {
      mcInputCache.set(second.id, second);
    }
    const secondOdds = second ? await db.oddsRecord.findMany({ where: { matchId: second.id } }) : [];

    const label = (m: { homeTeam: string; awayTeam: string }) => `${m.homeTeam} - ${m.awayTeam}`;

    // ─── v9.0 — بردار قانون فعال کالیبراسیون لیگ این بازی (درس سیستمی → عدد) ───
    const activeRule = await getActiveRuleFor(primary.league);

    const prim = analyzeMatch({ matchId: primary.id, homeTeam: primary.homeTeam, awayTeam: primary.awayTeam, matchLabel: label(primary) }, primaryOdds, mcInputCache);
    const sec = second
      ? analyzeMatch({ matchId: second.id, homeTeam: second.homeTeam, awayTeam: second.awayTeam, matchLabel: label(second) }, secondOdds, mcInputCache)
      : null;

    const allSelections = [...prim.selections, ...(sec?.selections ?? [])];

    // ─── ساخت زوج‌های کاندید (v3.0 — فرم صریح: پایه × متغیرA ↔ پایه × متغیرB) ───
    type Candidate = {
      base: PortfolioSelectionDTO;
      varA: PortfolioSelectionDTO;
      varB: PortfolioSelectionDTO;
      kind: "SINGLE_MATCH_BUILDER" | "TWO_MATCH_MIX";
      band: "O15_U25" | "O25_U35" | null;
      synthetic: boolean;
      doubleWin: boolean;
    };
    const candidates: Candidate[] = [];

    const primaries = prim.selections.filter((s) => ["DC_1X", "DC_X2"].includes(s.key) && s.modelProb >= 0.62);
    const classicVars = prim.selections.filter((s) => ["O25", "U25", "C_O95", "C_U95", "BTTS_Y", "BTTS_N"].includes(s.key));
    const selOf = (list: PortfolioSelectionDTO[], k: string) => list.find((s) => s.key === k);
    const oppositeOf = (k: string) =>
      (({ O25: "U25", U25: "O25", C_O95: "C_U95", C_U95: "C_O95", BTTS_Y: "BTTS_N", BTTS_N: "BTTS_Y" }) as Record<string, string>)[k] ?? k;

    // خط سینتتیک باندی O15/U35 از احتمال مدل (بدون قیمت واقعی بوک‌میکر — حاشیه ۴.۵٪)
    const synthVar = (k: "O15" | "U35"): PortfolioSelectionDTO | null => {
      const flags = prim.mc.flags[k];
      const p = flags ? flags.reduce((s: number, v: number) => s + v, 0) / flags.length : 0;
      if (p < 0.15 || p > 0.93) return null;
      const odds = Math.max(1.02, Math.round((1 / p) * 0.955 * 100) / 100);
      return {
        key: k,
        label: selectionLabel(k),
        matchId: primary.id,
        matchLabel: label(primary),
        modelProb: p,
        bestOdds: odds,
        bestBook: "خط سینتتیک",
        sharpOdds: null,
        evPct: p * odds - 1,
      };
    };

    for (const base of primaries) {
      // الف) بت‌بیلدر کلاسیک: پایه × متغیر ↔ پایه × مقابل متغیر (هر دو با هم پوشش کامل متغیر)
      for (const v of classicVars) {
        const opp = selOf(prim.selections, oppositeOf(v.key));
        if (!opp) continue;
        candidates.push({ base, varA: v, varB: opp, kind: "SINGLE_MATCH_BUILDER", band: null, synthetic: false, doubleWin: false });
      }

      // ب) زوج باندی با ناحیه طلایی Double-Win:
      //    1X+بالای ۱.۵ ↔ 1X+زیر ۲.۵ (تلاقی = دقیقاً ۲ گل: ۱-۱ یا ۲-۰)
      const o15 = synthVar("O15");
      const u25 = selOf(prim.selections, "U25");
      if (o15 && u25 && u25.bestOdds > 1.01) {
        candidates.push({ base, varA: o15, varB: u25, kind: "SINGLE_MATCH_BUILDER", band: "O15_U25", synthetic: true, doubleWin: true });
      }
      //    بالای ۲.۵ ↔ زیر ۳.۵ (تلاقی = دقیقاً ۳ گل: ۲-۱ یا ۳-۰)
      const u35 = synthVar("U35");
      const o25 = selOf(prim.selections, "O25");
      if (u35 && o25 && o25.bestOdds > 1.01) {
        candidates.push({ base, varA: o25, varB: u35, kind: "SINGLE_MATCH_BUILDER", band: "O25_U35", synthetic: true, doubleWin: true });
      }

      // ج) زوج دو-برد بین‌بازاری: 1X+زیر ۲.۵ ↔ 1X+هر دو گل می‌زنند (تلاقی = دقیقاً ۱-۱)
      const bttsY = selOf(prim.selections, "BTTS_Y");
      if (u25 && bttsY && u25.bestOdds > 1.01 && bttsY.bestOdds > 1.01) {
        candidates.push({ base, varA: u25, varB: bttsY, kind: "SINGLE_MATCH_BUILDER", band: null, synthetic: false, doubleWin: true });
      }

      // د) میکس دو بازی: پایه امن بازی اول × زوج متغیر بازی دوم
      if (sec) {
        const secVars = sec.selections.filter((s) => ["O25", "U25"].includes(s.key));
        for (const v of secVars) {
          const opp = selOf(sec.selections, oppositeOf(v.key));
          if (!opp) continue;
          candidates.push({ base, varA: v, varB: opp, kind: "TWO_MATCH_MIX", band: null, synthetic: false, doubleWin: false });
        }
      }
    }

    const pairs: PortfolioPairDTO[] = [];
    const batchId = `pf-${Date.now()}`;

    for (const c of candidates) {
      if (c.base.bestOdds <= 1.01 || c.varA.bestOdds <= 1.01 || c.varB.bestOdds <= 1.01) continue;

      const isBuilder = c.kind === "SINGLE_MATCH_BUILDER";
      const baseKey = c.base.key as SelectionKey;
      const varAKey = c.varA.key as SelectionKey;
      const varBKey = c.varB.key as SelectionKey;

      // ضریب کل هر تیپ = پایه × متغیر (هر دو حالت: بت‌بیلدر و میکس دو بازی)
      const oddsA = Math.round(c.base.bestOdds * c.varA.bestOdds * 100) / 100;
      const oddsB = Math.round(c.base.bestOdds * c.varB.bestOdds * 100) / 100;
      if (oddsA <= 1.05 || oddsB <= 1.05 || Math.abs(oddsA - oddsB) < 0.01) continue;

      // فلگ ترکیبی per-sim: برد همزمان پایه و متغیر
      // میکس دو بازی: پایه از مونت‌کارلو بازی اول، متغیر از بازی دوم (اندیسی = استقلال)
      const varMc = isBuilder ? prim.mc : sec!.mc;
      const flagsA = combineFlags(prim.mc.flags[baseKey], varMc.flags[varAKey]);
      const flagsB = combineFlags(prim.mc.flags[baseKey], varMc.flags[varBKey]);

      const joint = jointStates(flagsA, flagsB);
      // v4.0: آستانه بازتنظیم‌شده برای ضرایب واقعی بوک‌میکرها — در بازارهای متوازن
      // باخت همزمان ≈ ۱ − P(پایه) است (پایه ۶۴٪ → ریسک ۳۶٪). آستانه ۰.۵ یعنی
      // «پایه» باید حداقل احتمال ۵۰٪ داشته باشد؛ گرید بندی صادقانه در verdict انجام می‌شود
      if (joint.bothLose > 0.5) continue;

      // بررسی ساختاری تله با منطق Mutually Covering (هر دو تیپ پایه مشترک دارند)
      const baseTrap: TrapLeg = { match: label(primary), selection: TRAP_MAP[baseKey] };
      const varATrap: TrapLeg = {
        match: isBuilder ? label(primary) : label(second!),
        selection: TRAP_MAP[varAKey],
      };
      const varBTrap: TrapLeg = {
        match: isBuilder ? label(primary) : label(second!),
        selection: TRAP_MAP[varBKey],
      };
      const trap = checkMiddleTrap([baseTrap, varATrap], [baseTrap, varBTrap]);
      if (trap.verdict === "CRITICAL") continue;

      // v19.0 — تخصیص نامتقارن آلفا (پیش‌فرض فعال ۶۵/۳۵) — جایگزین داچینگ سود برابر
      const impliedSum = 1 / oddsA + 1 / oddsB;
      const alphaStakes = asymmetricAlphaStakes(oddsA, oddsB);
      const stakeA = alphaStakes.stakeA;
      const stakeB = alphaStakes.stakeB;
      const profit = alphaStakes.guaranteed;

      // کلِی همزمان روی توزیع همزمان واقعی
      const kelly = simultaneousKelly(
        [
          { p: joint.bothWin, aWins: true, bWins: true },
          { p: joint.aOnly, aWins: true, bWins: false },
          { p: joint.bOnly, aWins: false, bWins: true },
          { p: joint.bothLose, aWins: false, bWins: false },
        ],
        oddsA,
        oddsB
      );

      // v19.0 — مارجین کارت با استیک نامتقارن = کمینه سود دو بال (واحد = درصد روی ۱۰۰u)
      const guaranteedMarginPct = alphaStakes.guaranteed;
      const pA = joint.bothWin + joint.aOnly;
      const pB = joint.bothWin + joint.bOnly;

      // لبه CLV تقریبی نسبت به خط شارپ پیناکل (فقط وقتی همه پاها خط واقعی دارند)
      let sharpEdgePct: number | null = null;
      if (!c.synthetic) {
        const pinPrim = primaryOdds.find((o) => o.bookmaker === "PINNACLE");
        const pinVar = isBuilder ? pinPrim : secondOdds.find((o) => o.bookmaker === "PINNACLE");
        if (pinPrim && pinVar) {
          const sharpBase =
            baseKey === "DC_1X"
              ? 1 / (1 / pinPrim.oddsHome + 1 / pinPrim.oddsDraw)
              : 1 / (1 / pinPrim.oddsAway + 1 / pinPrim.oddsDraw);
          const pinVarOdds = (k: SelectionKey): number | null => {
            switch (k) {
              case "O25": return pinVar.oddsOver25;
              case "U25": return pinVar.oddsUnder25;
              case "C_O95": return pinVar.oddsCornersOver95;
              case "C_U95": return pinVar.oddsCornersUnder95;
              default: return null; // BTTS بدون قیمت پیناکل در دیتاست
            }
          };
          const sva = pinVarOdds(varAKey);
          const svb = pinVarOdds(varBKey);
          if (sva && svb) {
            const eA = pA * Math.round(sharpBase * sva * 100) / 100 - 1;
            const eB = pB * Math.round(sharpBase * svb * 100) / 100 - 1;
            sharpEdgePct = Math.round(((eA + eB) / 2) * 1000) / 10;
          }
        }
      }

      pairs.push({
        id: `${baseKey}-${varAKey}-${varBKey}-${c.kind}`,
        kind: c.kind,
        labelA: isBuilder ? `${c.base.label} × ${c.varA.label}` : `${c.base.label} + ${c.varA.label} (${c.varA.matchLabel})`,
        labelB: isBuilder ? `${c.base.label} × ${c.varB.label}` : `${c.base.label} + ${c.varB.label} (${c.varB.matchLabel})`,
        structure: {
          baseKey,
          varAKey,
          varBKey,
          varAMatchId: c.varA.matchId,
          varBMatchId: c.varB.matchId,
          band: c.band,
          synthetic: c.synthetic,
          doubleWin: c.doubleWin && joint.bothWin > 0.02,
        },
        selectionA: {
          ...c.base,
          label: `${c.base.label} × ${c.varA.label}`,
          modelProb: pA,
          bestOdds: oddsA,
          bestBook: "ترکیبی",
          evPct: pA * oddsA - 1,
        },
        selectionB: {
          ...c.varB,
          matchId: c.varB.matchId,
          matchLabel: c.varB.matchLabel,
          label: `${c.base.label} × ${c.varB.label}`,
          modelProb: pB,
          bestOdds: oddsB,
          bestBook: "ترکیبی",
          evPct: pB * oddsB - 1,
        },
        totalOddsA: oddsA,
        totalOddsB: oddsB,
        jointStates: joint,
        impliedSum,
        guaranteedMarginPct,
        equalProfit: { stakeA: Math.round(stakeA * 10) / 10, stakeB: Math.round(stakeB * 10) / 10, profit: Math.round(profit * 10) / 10 },
        // v19.0 — accelerator همیشه فعال با ۶۵/۳۵
        accelerator: {
          active: true,
          stakeA: alphaStakes.stakeA,
          stakeB: alphaStakes.stakeB,
          profitOnA: alphaStakes.profitOnA,
          profitOnB: alphaStakes.profitOnB,
          guaranteed: alphaStakes.guaranteed,
          profitOnDoubleWin: alphaStakes.profitOnDoubleWin,
          note: alphaStakes.note,
        },
        kelly: { fA: Math.round(kelly.fA * 1000) / 1000, fB: Math.round(kelly.fB * 1000) / 1000, growth: kelly.growth },
        sharpEdgePct,
        trap,
        verdict:
          guaranteedMarginPct > 4 && joint.bothLose < 0.05
            ? "پوشش ممتاز — سود تضمینی بالا با ریسک باخت همزمان ناچیز"
            : joint.bothLose < 0.2
              ? "پوشش معتبر — پایه امن، سود تضمینی در سناریوی پایه"
              : joint.bothLose < 0.38
                ? "پوشش نسبی — مشروط به برد پایه؛ ریسک باخت همزمان متوسط"
                : "پوشش پرریسک — پایه ضعیف؛ صرفاً برای کاهش واریانس",
      });
    }

    // رتبه‌بندی: امتیاز = حاشیه تضمینی − جریمه باخت همزمان + پاداش رشد کلی + پاداش دو-برد
    const score = (p: PortfolioPairDTO) =>
      p.guaranteedMarginPct - p.jointStates.bothLose * 80 + p.kelly.growth * 100 + (p.structure.doubleWin ? 1.5 : 0);
    pairs.sort((x, y) => score(y) - score(x));

    // حذف تکرار آینه‌ای (O25→U25 همان زوج U25→O25 است)
    const sigOf = (p: PortfolioPairDTO) => {
      const [x, y] = [p.structure.varAKey, p.structure.varBKey].sort();
      return `${p.structure.baseKey}|${x}|${y}|${p.kind}`;
    };
    const seen = new Set<string>();
    const deduped = pairs.filter((p) => {
      const sig = sigOf(p);
      if (seen.has(sig)) return false;
      seen.add(sig);
      return true;
    });

    // تضمین تنوع: بهترین زوج هر خانواده (باندی / دو-برد / بیلدر / میکس) حتماً حضور دارد
    const bucketOf = (p: PortfolioPairDTO) => (p.structure.band ? "BAND" : p.structure.doubleWin ? "DW" : p.kind);
    const bestOf = new Map<string, PortfolioPairDTO>();
    for (const p of deduped) {
      const b = bucketOf(p);
      const cur = bestOf.get(b);
      if (!cur || score(p) > score(cur)) bestOf.set(b, p);
    }
    const picked = [...bestOf.values()];
    const rest = deduped.filter((p) => !picked.includes(p));
    const topPairs = [...picked, ...rest].slice(0, 6);

    // ─── v5.0: ادغام زوج متعامد پیشنهادی (۱۵ بازار، بدون شرط تکراری) ───
    // موتور ارتوگونال برای همین بازی اجرا و بهترین الگو به صدر فهرست تیپ‌ها می‌رود
    try {
      const primCached = mcInputCache.get(primary.id) as Parameters<typeof computeMatchEngine>[0] | undefined;
      if (primCached) {
        const eng = computeMatchEngine(primCached);
        const pinOdds = primaryOdds.find((o) => o.bookmaker === "PINNACLE") ?? primaryOdds[0];
        const orthoCtx = {
          lambdaHome: eng.dc.lambdaHome,
          lambdaAway: eng.dc.lambdaAway,
          matrix: eng.dc.matrix,
          lambdaCorners: eng.lambdaCorners,
          lambdaCards: eng.lambdaCards,
          prices: pinOdds
            ? {
                HOME: pinOdds.oddsHome,
                DRAW: pinOdds.oddsDraw,
                AWAY: pinOdds.oddsAway,
                DC_1X: 1 / (1 / pinOdds.oddsHome + 1 / pinOdds.oddsDraw),
                DC_X2: 1 / (1 / pinOdds.oddsAway + 1 / pinOdds.oddsDraw),
                O25: pinOdds.oddsOver25,
                U25: pinOdds.oddsUnder25,
                C_O95: pinOdds.oddsCornersOver95,
                C_U95: pinOdds.oddsCornersUnder95,
              }
            : undefined,
        };
        const ortho = generateOrthogonalComplementarySlips(orthoCtx);
        const rec = ortho.archetypes.find((a) => a.code === ortho.recommended) ?? ortho.archetypes[0];
        if (rec) {
          const orthoPair = buildOrthoPortfolioPair(rec, primary, bankroll);
          if (!topPairs.some((p) => p.id === orthoPair.id)) {
            topPairs.unshift(orthoPair);
            if (topPairs.length > 7) topPairs.length = 7;
          }
        }
      }
    } catch (orthoErr) {
      console.error("orthogonal merge failed:", orthoErr);
    }

    // ─── v17.0 — مسیریاب غیرخطی ۵ رژیمی Bet-Type (Non-Linear Multi-Regime Router) ───
    // برای هر مسابقه آنتروپی شانون ماتریس ۶×۶، نسبت عدم تقارن قدرت Rλ و مجموع
    // ۴ خانه برتر محاسبه و بازی به مناسب‌ترین استراتژی از ۵ روش تخصصی هدایت می‌شود:
    // BANKER / COMBO / CORRECT SCORE CLUSTER / DUAL-HEDGE (+ ACCUMULATOR سطح پرتفوی روز)
    let betTypeRouter: import("@/lib/engine/betrouter").BetTypeRouteResult | null = null;
    try {
      const priceOf = (key: "HOME" | "DRAW" | "AWAY" | "O25" | "U25"): number => {
        let best = 0;
        for (const o of primaryOdds) {
          const v = key === "HOME" ? o.oddsHome : key === "DRAW" ? o.oddsDraw : key === "AWAY" ? o.oddsAway : key === "O25" ? o.oddsOver25 : o.oddsUnder25;
          if (v > best) best = v;
        }
        if (best > 1.01) return best;
        // fallback: خط اجماعی خود بازی
        return key === "HOME" ? primary.oddsHome : key === "DRAW" ? primary.oddsDraw : key === "AWAY" ? primary.oddsAway : key === "O25" ? primary.oddsOver25 : primary.oddsUnder25;
      };
      const prices: MarketPrices = {
        oddsHome: priceOf("HOME"),
        oddsDraw: priceOf("DRAW"),
        oddsAway: priceOf("AWAY"),
        oddsOver25: priceOf("O25"),
        oddsUnder25: priceOf("U25"),
      };
      // ضریب اعتبار لیگ از بردار قانون کالیبراسیون (انحراف λ → اعتماد معکوس)
      const leagueReliability = activeRule?.lambdaMultiplier
        ? Math.min(1.15, Math.max(0.85, activeRule.lambdaMultiplier))
        : 1;
      betTypeRouter = routeBetTypes({
        matrix: buildScoreMatrix(prim.lambdas.home, prim.lambdas.away),
        lambdaHome: prim.lambdas.home,
        lambdaAway: prim.lambdas.away,
        prices,
        pairs: topPairs,
        league: primary.league,
        leagueReliability,
      });
    } catch (routerErr) {
      console.error("bet-type router failed:", routerErr);
    }

    // ─── v24.0 — موتور QQL درون‌حافظه‌ای + تحلیل ریشه‌ای هوش مصنوعی (AI RCA) ───
    // ۱) انبار تله‌متری از کارت‌های تسویه‌شده واقعی دیتابیس (صفر عدد جعلی)
    // ۲) ۶۶ کاندیدای کوانتومی همین بازی به‌عنوان candidate_66_matrix_pairs
    // ۳) خط لوله ۴ مرحله‌ای: K-NN twins → فیلتر قید → وتوی RCA → LIMIT 1
    let qqlTrace: import("@/lib/types").PortfolioResultDTO["qql"] = null;
    try {
      const settledSlips = await db.issuedSlip.findMany({
        where: { status: { in: ["WON_A", "WON_B", "DOUBLE_WIN", "MIDDLE_TRAP"] } },
        select: { id: true, league: true, legsA: true, legsB: true, lambdaHome: true, lambdaAway: true, status: true, netProfit: true, settledAt: true },
        orderBy: { settledAt: "desc" },
        take: 400,
      });
      const telemetry = buildTelemetryWarehouse(settledSlips as TelemetrySlipInput[]);
      const routerMatrix = buildScoreMatrix(prim.lambdas.home, prim.lambdas.away);
      const entropyOf = (m: number[][]): number => {
        let sum = 0;
        for (const row of m) for (const v of row) sum += v;
        let H = 0;
        for (const row of m) for (const v of row) {
          const p = sum > 0 ? v / sum : 0;
          if (p > 1e-12) H -= p * Math.log(p);
        }
        return H;
      };
      const qSolver = runQuantumAnnealingSolver({
        lambdaHome: prim.lambdas.home,
        lambdaAway: prim.lambdas.away,
        matrix: routerMatrix,
        lambdaCorners: 0,
        lambdaCards: 0,
      });
      const qqlCandidates: QqlCandidateInput[] = qSolver.candidates.map((c) => ({
        pairCode: c.pairCode,
        keyA: c.keyA,
        keyB: c.keyB,
        oddsA: c.oddsA,
        oddsB: c.oddsB,
        unionProb: c.unionProb,
        doubleWinProb: c.overlapProb,
        jointLossProb: 1 - c.unionProb,
      }));
      const qql = runQqlPipeline({
        lambdaHome: prim.lambdas.home,
        lambdaAway: prim.lambdas.away,
        entropy: entropyOf(routerMatrix),
        candidates: qqlCandidates,
        telemetry,
      });
      qqlTrace = {
        executedQueryLog: qql.executedQueryLog,
        aiRcaDiagnosis: qql.aiRcaDiagnosis,
        firedRules: qql.firedRules.map((r) => r.id),
        vetoedPairs: qql.vetoedPairs,
        knnTwins: qql.twinsCount,
        knnSummary: qql.knnSummary,
        winnerPairCode: qql.winner?.pairCode ?? null,
        stageCounts: qql.stageCounts,
        quantumBestPairCode: qSolver.best?.pairCode ?? null,
        quantumCardLine: qSolver.selectionLine,
        quantumQualifying: qSolver.qualifying,
        quantumEvaluated: qSolver.evaluated,
      };
    } catch (qqlErr) {
      console.error("qql-rca pipeline failed:", qqlErr);
    }

    // ─── ذخیره TipSet برای زوج برتر ───
    const recommendedId = topPairs[0]?.id ?? null;
    if (topPairs.length > 0) {
      for (const [i, p] of topPairs.entries()) {
        await db.tipSet.create({
          data: {
            label: `${p.kind === "TWO_MATCH_MIX" ? "میکس دو بازی" : "بت‌بیلدر تک‌بازی"}: ${p.labelA} ↔ ${p.labelB}`,
            strategy: "EQUAL_PROFIT",
            mode: p.kind === "TWO_MATCH_MIX" ? "TWO_MATCH" : "SINGLE_MATCH",
            legs: JSON.stringify([p.selectionA, p.selectionB]),
            totalOdds: p.totalOddsA,
            stake: p.equalProfit.stakeA,
            potentialReturn: p.equalProfit.stakeA * p.totalOddsA,
            guaranteedProfit: p.equalProfit.profit,
            coverageProb: 1 - p.jointStates.bothLose,
            coverageOk: p.impliedSum < 1 && p.jointStates.bothLose < 0.1,
            trapRisk: p.trap.verdict,
            jointLossProb: p.jointStates.bothLose,
            meta: JSON.stringify({
              kelly: p.kelly,
              oddsB: p.totalOddsB,
              stakeB: p.equalProfit.stakeB,
              jointStates: p.jointStates,
              mc: { sims: prim.mc.sims, corr: prim.mc.corrGoalsCorners },
              structure: p.structure,
              sharpEdgePct: p.sharpEdgePct,
              rank: i,
            }),
            batchId,
            notes: p.verdict,
          },
        });
      }
    }

    const result: PortfolioResultDTO = {
      success: true,
      primary: {
        matchId: primary.id,
        matchLabel: label(primary),
        lambdaHome: prim.lambdas.home,
        lambdaAway: prim.lambdas.away,
        // ─── v9.0 — شفافیت کامل λ (بازار / آمار فصل / ترکیبی نهایی) ───
        lambdaMarketHome: prim.breakdown.marketHome,
        lambdaMarketAway: prim.breakdown.marketAway,
        lambdaStatsHome: prim.breakdown.statsHome,
        lambdaStatsAway: prim.breakdown.statsAway,
        lambdaFitError: prim.breakdown.fitError,
        lambdaCalibrationHome: prim.breakdown.calibrationHome,
        lambdaCalibrationAway: prim.breakdown.calibrationAway,
      },
      calibrationRule: activeRule?.rules ?? [],
      monteCarlo: {
        sims: prim.mc.sims,
        pHome: prim.mc.pHome,
        pDraw: prim.mc.pDraw,
        pAway: prim.mc.pAway,
        pOver25: prim.mc.pOver25,
        pBtts: prim.mc.pBtts,
        cornersOver95: prim.mc.cornersOver95,
        cardsOver35: prim.mc.cardsOver35,
        avgCorners: prim.mc.avgCorners,
        avgCards: prim.mc.avgCards,
        corrGoalsCorners: prim.mc.corrGoalsCorners,
      },
      selections: allSelections.filter((s) => s.bestOdds > 1.01),
      pairs: topPairs,
      recommendedId,
      batchId,
      bankroll,
      betTypeRouter,
      qql: qqlTrace,
    };

    pollCacheSet(portfolioCacheKey, result);
    return NextResponse.json(result);
  } catch (error) {
    console.error("POST /api/agent/portfolio error:", error);
    return NextResponse.json({ success: false, error: "خطا در اجرای موتور پرتفوی" }, { status: 500 });
  }
}

/** فلگ per-sim برای ترکیب پایه × متغیر */
function combineFlags(flagsBase: Uint8Array, flagsVar: Uint8Array): Uint8Array {
  const n = Math.min(flagsBase.length, flagsVar.length);
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = flagsBase[i] && flagsVar[i] ? 1 : 0;
  }
  return out;
}
