import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSeeded } from "@/lib/seed";
import { computeMatchEngine } from "@/lib/engine/matchEngine";
import { runMonteCarlo, jointStates, MC_SELECTIONS, type SelectionKey, type MonteCarloResult } from "@/lib/engine/montecarlo";
import { simultaneousKelly } from "@/lib/engine/kelly";
import { checkMiddleTrap, type SelectionKind, type TrapLeg } from "@/lib/engine/dutching";
import type { PortfolioPairDTO, PortfolioResultDTO, PortfolioSelectionDTO } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type OddsRec = { bookmaker: string; oddsHome: number; oddsDraw: number; oddsAway: number; oddsOver25: number; oddsUnder25: number; oddsCornersOver95: number; oddsCornersUnder95: number };

const TRAP_MAP: Record<SelectionKey, SelectionKind> = {
  HOME: "HOME_WIN", DRAW: "DRAW", AWAY: "AWAY_WIN",
  DC_1X: "HOME_OR_DRAW", DC_X2: "AWAY_OR_DRAW",
  O25: "OVER_2_5", U25: "UNDER_2_5",
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

/** مونت‌کارلو + جدول انتخاب‌های یک بازی */
function analyzeMatch(mcInput: { matchId: string; homeTeam: string; awayTeam: string; matchLabel: string }, odds: OddsRec[]): { mc: MonteCarloResult; selections: PortfolioSelectionDTO[]; lambdas: { home: number; away: number } } {
  const match = mcInputCache.get(mcInput.matchId);
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

  return { mc, selections, lambdas: { home: engine.dc.lambdaHome, away: engine.dc.lambdaAway } };
}

const selectionLabels: Record<SelectionKey, string> = {
  HOME: "برد میزبان",
  DRAW: "مساوی",
  AWAY: "برد میهمان",
  DC_1X: "شانس مجدد میزبان (1X)",
  DC_X2: "شانس مجدد میهمان (X2)",
  O25: "بالای ۲.۵ گل",
  U25: "زیر ۲.۵ گل",
  BTTS_Y: "هر دو تیم گل می‌زنند",
  BTTS_N: "گل نزدن حداقل یک تیم",
  C_O95: "بالای ۹.۵ کرنر",
  C_U95: "زیر ۹.۵ کرنر",
};
function selectionLabel(k: SelectionKey): string {
  return selectionLabels[k];
}

// کش موقت بازی‌های بارگذاری‌شده برای این درخواست
const mcInputCache = new Map<string, unknown>();

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

    mcInputCache.clear();
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

    const prim = analyzeMatch({ matchId: primary.id, homeTeam: primary.homeTeam, awayTeam: primary.awayTeam, matchLabel: label(primary) }, primaryOdds);
    const sec = second
      ? analyzeMatch({ matchId: second.id, homeTeam: second.homeTeam, awayTeam: second.awayTeam, matchLabel: label(second) }, secondOdds)
      : null;

    const allSelections = [...prim.selections, ...(sec?.selections ?? [])];

    // ─── ساخت زوج‌های کاندید ───
    const candidates: { a: PortfolioSelectionDTO; b: PortfolioSelectionDTO; kind: "SINGLE_MATCH_BUILDER" | "TWO_MATCH_MIX" }[] = [];

    // الف) تک‌بازی: پایه امن × متغیر (باتلر بیلدر) — و زوج‌های هم‌بسته خلاقانه
    const primaries = prim.selections.filter((s) => ["DC_1X", "DC_X2"].includes(s.key) && s.modelProb >= 0.62);
    const vars = prim.selections.filter((s) => ["O25", "U25", "C_O95", "C_U95", "BTTS_Y", "BTTS_N"].includes(s.key));
    for (const base of primaries) {
      for (const v of vars) candidates.push({ a: base, b: v, kind: "SINGLE_MATCH_BUILDER" });
    }

    // ب) میکس دو بازی: پایه امن بازی اول × متغیر بازی دوم
    if (sec) {
      const secVars = sec.selections.filter((s) => ["O25", "U25"].includes(s.key));
      for (const base of primaries) {
        for (const v of secVars) candidates.push({ a: base, b: v, kind: "TWO_MATCH_MIX" });
      }
    }

    const pairs: PortfolioPairDTO[] = [];
    const batchId = `pf-${Date.now()}`;

    for (const c of candidates) {
      if (c.a.bestOdds <= 1.01 || c.b.bestOdds <= 1.01) continue;

      const isBuilder = c.kind === "SINGLE_MATCH_BUILDER";
      const aKey = c.a.key as SelectionKey;
      const bKey = c.b.key as SelectionKey;
      const oppKey = oppositeKey(bKey);

      // انتخاب مقابل در همان بازیِ متغیر (بالای↔زیر / بله↔خیر)
      const varSelections = isBuilder ? prim.selections : sec!.selections;
      const oppSel = varSelections.find((s) => s.key === oppKey);
      if (!oppSel || oppSel.bestOdds <= 1.01) continue;

      // ضریب کل هر تیپ = پایه × متغیر (هر دو حالت: بت‌بیلدر و میکس دو بازی)
      const oddsA = Math.round(c.a.bestOdds * c.b.bestOdds * 100) / 100;
      const oddsB = Math.round(c.a.bestOdds * oppSel.bestOdds * 100) / 100;
      if (oddsA <= 1.05 || oddsB <= 1.05 || Math.abs(oddsA - oddsB) < 0.01) continue;

      // فلگ ترکیبی per-sim: برد همزمان پایه و متغیر
      // میکس دو بازی: پایه از مونت‌کارلو بازی اول، متغیر از بازی دوم (اندیسی = استقلال)
      const secMc = sec!.mc;
      const flagsA = combineFlags(prim.mc.flags[aKey], isBuilder ? prim.mc.flags[bKey] : secMc.flags[bKey]);
      const flagsB = combineFlags(prim.mc.flags[aKey], isBuilder ? prim.mc.flags[oppKey] : secMc.flags[oppKey]);

      const joint = jointStates(flagsA, flagsB);
      // آستانه: تا وقتی پایه امن است، بالای/زیر کل فضای متغیر را می‌پوشانند
      if (joint.bothLose > 0.35) continue;

      // بررسی ساختاری تله با منطق Mutually Covering
      const trapLegsA: TrapLeg[] = isBuilder
        ? [
            { match: label(primary), selection: TRAP_MAP[aKey] },
            { match: label(primary), selection: TRAP_MAP[bKey] },
          ]
        : [{ match: label(primary), selection: TRAP_MAP[aKey] }];
      const trapLegsB: TrapLeg[] = isBuilder
        ? [
            { match: label(primary), selection: TRAP_MAP[aKey] },
            { match: label(primary), selection: oppositeTrap(bKey) },
          ]
        : [{ match: sec ? label(second!) : "", selection: TRAP_MAP[bKey] }];
      const trap = checkMiddleTrap(trapLegsA, trapLegsB);
      if (trap.verdict === "CRITICAL") continue;

      // داچینگ سود برابر
      const impliedSum = 1 / oddsA + 1 / oddsB;
      const stakeA = bankroll * (1 / oddsA) / impliedSum;
      const stakeB = bankroll * (1 / oddsB) / impliedSum;
      const profit = bankroll * (oddsA * oddsB) / (oddsA + oddsB) - bankroll;

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

      const guaranteedMarginPct = (1 - impliedSum) * 100;
      const pA = joint.bothWin + joint.aOnly;
      const pB = joint.bothWin + joint.bOnly;

      pairs.push({
        id: `${c.a.key}-${c.b.key}-${c.kind}`,
        kind: c.kind,
        labelA: isBuilder ? `${c.a.label} × ${c.b.label}` : `${c.a.label} + ${c.b.label} (${c.b.matchLabel})`,
        labelB: isBuilder ? `${c.a.label} × ${oppSel.label}` : `${c.a.label} + ${oppSel.label} (${oppSel.matchLabel})`,
        selectionA: {
          ...c.a,
          label: `${c.a.label} × ${c.b.label}`,
          modelProb: pA,
          bestOdds: oddsA,
          bestBook: "ترکیبی",
          evPct: pA * oddsA - 1,
        },
        selectionB: {
          ...oppSel,
          matchId: c.b.matchId,
          matchLabel: c.b.matchLabel,
          label: `${c.a.label} × ${oppSel.label}`,
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
        kelly: { fA: Math.round(kelly.fA * 1000) / 1000, fB: Math.round(kelly.fB * 1000) / 1000, growth: kelly.growth },
        trap,
        verdict:
          guaranteedMarginPct > 4 && joint.bothLose < 0.05
            ? "پوشش ممتاز — سود تضمینی بالا با ریسک باخت همزمان ناچیز"
            : guaranteedMarginPct > 0
              ? "پوشش معتبر — سود تضمینی مثبت"
              : "پوشش نسبی — صرفاً برای کاهش واریانس",
      });
    }

    // رتبه‌بندی: امتیاز = حاشیه تضمینی − جریمه باخت همزمان + پاداش رشد کلی
    const score = (p: PortfolioPairDTO) => p.guaranteedMarginPct - p.jointStates.bothLose * 80 + p.kelly.growth * 100;
    pairs.sort((x, y) => score(y) - score(x));
    const seen = new Set<string>();
    const topPairs = pairs.filter((p) => {
      const sig = `${p.selectionA.key}-${p.selectionB.key}`;
      if (seen.has(sig)) return false;
      seen.add(sig);
      return true;
    }).slice(0, 4);

    // ─── ذخیره TipSet برای زوج برتر ───
    let recommendedId: string | null = null;
    if (topPairs.length > 0) {
      for (const [i, p] of topPairs.entries()) {
        const tip = await db.tipSet.create({
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
              rank: i,
            }),
            batchId,
            notes: p.verdict,
          },
        });
        if (i === 0) recommendedId = tip.id;
      }
    }

    const result: PortfolioResultDTO = {
      success: true,
      primary: {
        matchId: primary.id,
        matchLabel: label(primary),
        lambdaHome: prim.lambdas.home,
        lambdaAway: prim.lambdas.away,
      },
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
    };

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

function oppositeKey(k: SelectionKey): SelectionKey {
  switch (k) {
    case "O25": return "U25";
    case "U25": return "O25";
    case "C_O95": return "C_U95";
    case "C_U95": return "C_O95";
    case "BTTS_Y": return "BTTS_N";
    case "BTTS_N": return "BTTS_Y";
    default: return k;
  }
}

function oppositeLabel(l: string): string {
  if (l.includes("بالای ۲.۵")) return l.replace("بالای ۲.۵", "زیر ۲.۵");
  if (l.includes("زیر ۲.۵")) return l.replace("زیر ۲.۵", "بالای ۲.۵");
  if (l.includes("بالای ۹.۵")) return l.replace("بالای ۹.۵", "زیر ۹.۵");
  if (l.includes("زیر ۹.۵")) return l.replace("زیر ۹.۵", "بالای ۹.۵");
  if (l.includes("می‌زنند")) return "گل نزدن حداقل یک تیم";
  if (l.includes("نزدن")) return "هر دو تیم گل می‌زنند";
  return l;
}

function oppositeTrap(k: SelectionKey): SelectionKind {
  return TRAP_MAP[oppositeKey(k)];
}
