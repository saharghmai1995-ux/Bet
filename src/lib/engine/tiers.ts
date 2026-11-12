// ─────────────────────────────────────────────────────────────────────────────
// موتور خطوط تولید v13.0 — ۳ خط مجزا و بدون همپوشانی (3 Mutually Exclusive Slip Tiers)
//
//   خط ۱ Single Dual-Hedge  → همان فلش‌کارت‌های تاییدشده سوپروایزر (موجود است)
//   خط ۲ Smart Combos       → این فایل: buildSmartCombos()
//   خط ۳ High-Odds Sniper   → این فایل: findSniperShots()
//
// قاعده طلایی افراز (Disjoint Partitioning): هر کارت صادرشده فقط با productLine
// خودش در کارنامه شمرده می‌شود (SINGLE | COMBO | SNIPER) — دوباره‌شماری +۳۵۱.۸ و
// +۳۱۶.۱ مطلقاً حذف شده است.
// ─────────────────────────────────────────────────────────────────────────────

import type { FlashcardView } from "@/lib/autopilot-types";
import { assertNoSameGameMultiply } from "./orthogonal";

/** یک لِگ امن میکس (پایه اصلی قاضی — Anchor) */
export interface ComboLeg {
  matchId: string;
  matchLabel: string;
  league: string;
  kickoff: string;
  /** برچسب فارسی/انگلیسی انتخاب پایه */
  label: string;
  key: string;
  odds: number;
  /** احتمال مدل مونت‌کارلو برای همین لِگ (۰..۱) */
  prob: number;
}

export interface SmartCombo {
  id: string;
  kind: "DOUBLE_2_LEG" | "TREBLE_3_LEG";
  kindLabel: string;
  legs: ComboLeg[];
  totalOdds: number;
  /** ضرب احتمال لِگ‌ها — مسابقات مستقل‌اند */
  jointProb: number;
  /** استیک پیشنهادی در محدوده ۲۵..۵۰ واحد */
  stake: number;
  /** EV ترکیبی = jointProb × totalOdds − ۱ */
  evPct: number;
  /** میکس پوششی ضدباخت: استیک تک‌لِگ روی هر لِگ که اگر فقط یک لِگ ببازد، اصل برگردد */
  cover: { stakes: number[]; note: string };
}

/** یک شلیک تک‌تیرانداز (بازار تک با ضریب بالا و ارزش مثبت واقعی) */
export interface SniperShot {
  id: string;
  matchId: string;
  matchLabel: string;
  league: string;
  kickoff: string;
  marketKey: string;
  marketLabel: string;
  odds: number;
  modelProb: number;
  impliedProb: number;
  /** مزیت احتمال مدل نسبت به ضمنی بوک‌میکر (واحد: درصد) */
  edgePct: number;
  /** EV = modelProb × odds − ۱ (درصد) */
  evPct: number;
  /** استیک کلِی کسری ۰.۱۵ — سقف ۱۰..۱۵ واحد */
  stake: number;
}

const ANCHOR_MIN_PROB = 0.86; // آستانه پایه امن (Anchor Probability > 86%)
const D2_MIN = 2.7;
const D2_MAX = 3.5;
const T3_MIN = 4.4;
const T3_MAX = 6.8;
const r2 = (v: number) => Math.round(v * 100) / 100;
const r1 = (v: number) => Math.round(v * 10) / 10;

/** استخراج لِگ‌های امن از فلش‌کارت‌های تاییدشده سوپروایزر */
function anchorLegs(cards: FlashcardView[]): ComboLeg[] {
  return cards
    .filter((c) => !(c.supervisor?.veto ?? false))
    .map((c) => ({
      matchId: c.match.id,
      matchLabel: `${c.match.homeTeam} × ${c.match.awayTeam}`,
      league: c.match.league,
      kickoff: c.match.kickoff,
      label: c.pair.selectionA.label,
      key: c.pair.selectionA.key,
      odds: c.pair.selectionA.bestOdds,
      prob: c.pair.selectionA.modelProb,
    }))
    .filter((l) => l.prob > ANCHOR_MIN_PROB && l.odds >= 1.15)
    .sort((a, b) => b.prob * b.odds - a.prob * a.odds);
}

/** انتخاب با تنوع لیگ — تا جای ممکن لِگ‌ها از لیگ‌های مختلف باشند */
function pickDiverse(legs: ComboLeg[], n: number): ComboLeg[] | null {
  if (legs.length < n) return null;
  const usedLeagues = new Set<string>();
  const picked: ComboLeg[] = [];
  for (const l of legs) {
    if (picked.length === n) break;
    if (usedLeagues.has(l.league)) continue;
    usedLeagues.add(l.league);
    picked.push(l);
  }
  if (picked.length < n) {
    for (const l of legs) {
      if (picked.length === n) break;
      if (picked.some((p) => p.matchId === l.matchId)) continue;
      picked.push(l);
    }
  }
  return picked.length === n && new Set(picked.map((p) => p.matchId)).size === n ? picked : null;
}

function coverStakes(legs: ComboLeg[], mainStake: number): { stakes: number[]; note: string } {
  // هر تک‌لِگ با استیک c_i = M / o_i بسته می‌شود؛ اگر فقط یک لِگ ببازد، بازگشت همان تک‌لِگ = M
  // یعنی باخت تک‌لِگ دیگر «شکست روز» نیست — پوشش ضدباخت.
  const stakes = legs.map((l) => r1(mainStake / l.odds));
  const total = r1(stakes.reduce((a, b) => a + b, 0));
  return {
    stakes,
    note: `anti-bust cover: ${stakes.map((s) => `${s}u`).join(" + ")} = ${total}u on the singles — if only one leg fails, the winning single returns the full ${mainStake}u main stake`,
  };
}

/**
 * موتور میکس ۲ و ۳ تایی — از پایه‌های امن (>۸۶٪) بازی‌های تاییدشده سوپروایزر.
 * خروجی: بهترین میکس ۲تایی امن (۲.۷۰–۳.۵۰x)، بهترین میکس ۳تایی طلایی (۴.۴۰–۶.۸۰x) و
 * در صورت امکان یک میکس پوششی جایگزین. مسابقات باید مستقل باشند (matchId متمایز).
 */
export function buildSmartCombos(cards: FlashcardView[]): { safe: SmartCombo | null; treble: SmartCombo | null } {
  const legs = anchorLegs(cards);

  let safe: SmartCombo | null = null;
  for (const pair of combos(legs, 2)) {
    // v15.0 — نگهبان رسمی روی هر میکس نهایی: ضرب هم‌بازی مطلقاً ممنوع
    try {
      assertNoSameGameMultiply(pair, "combo2");
    } catch {
      continue;
    }
    const totalOdds = r2(pair[0].odds * pair[1].odds);
    if (totalOdds < D2_MIN || totalOdds > D2_MAX) continue;
    const jointProb = pair[0].prob * pair[1].prob;
    const stake = 30;
    safe = {
      id: `combo2::${pair.map((l) => l.matchId).join("::")}`,
      kind: "DOUBLE_2_LEG",
      kindLabel: "میکس ۲ تایی امن (2-Leg Safe Double)",
      legs: pair,
      totalOdds,
      jointProb,
      stake,
      evPct: r1((jointProb * totalOdds - 1) * 100),
      cover: coverStakes(pair, stake),
    };
    break; // legs مرتب‌اند — اولین ترکیب معتبر بهترین است
  }

  let treble: SmartCombo | null = null;
  for (const triple of combos(legs, 3)) {
    // v15.0 — نگهبان رسمی روی هر میکس نهایی: ضرب هم‌بازی مطلقاً ممنوع
    try {
      assertNoSameGameMultiply(triple, "combo3");
    } catch {
      continue;
    }
    const totalOdds = r2(triple[0].odds * triple[1].odds * triple[2].odds);
    if (totalOdds < T3_MIN || totalOdds > T3_MAX) continue;
    const jointProb = triple[0].prob * triple[1].prob * triple[2].prob;
    const stake = 25;
    treble = {
      id: `combo3::${triple.map((l) => l.matchId).join("::")}`,
      kind: "TREBLE_3_LEG",
      kindLabel: "میکس ۳ تایی طلایی (3-Leg Golden Treble)",
      legs: triple,
      totalOdds,
      jointProb,
      stake,
      evPct: r1((jointProb * totalOdds - 1) * 100),
      cover: coverStakes(triple, stake),
    };
    break;
  }

  return { safe, treble };
}

/** همه ترکیب‌های n تایی از استخر لِگ‌ها (مرتب — بدون تکرار matchId) */
function combos(legs: ComboLeg[], n: 2 | 3): ComboLeg[][] {
  const out: ComboLeg[][] = [];
  const rec = (start: number, acc: ComboLeg[]) => {
    if (acc.length === n) {
      out.push([...acc]);
      return;
    }
    for (let i = start; i < legs.length; i++) {
      if (acc.some((a) => a.matchId === legs[i].matchId)) continue;
      acc.push(legs[i]);
      rec(i + 1, acc);
      acc.pop();
    }
  };
  rec(0, []);
  // ترجیح تنوع لیگ: ترکیب‌هایی با لیگ‌های متمایز جلوتر
  return out
    .map((c) => ({ c, div: new Set(c.map((x) => x.league)).size }))
    .sort((a, b) => b.div - a.div)
    .map((x) => x.c);
}

/**
 * موتور تک‌تیرانداز ضریب بالا (High-Odds Sniper 4.00x–9.50x):
 * بازارهای تکی که مدل کمّی حداقل ۸ واحد درصد بالاتر از احتمال ضمنی بوک‌میکر
 * قیمت‌گذاری کرده و EV ≥ +۱۲٪ دارند. استیک = ۰.۱۵ × کلِی، سقف سخت ۱۰..۱۵ واحد.
 */
export function findSniperShots(cards: FlashcardView[]): SniperShot[] {
  const shots: SniperShot[] = [];
  for (const c of cards) {
    if (c.supervisor?.veto) continue; // بازی وتوشده هرگز شکار نمی‌شود
    for (const sel of c.pair.selections ?? []) {
      const odds = sel.bestOdds;
      if (!Number.isFinite(odds) || odds < 4.0 || odds > 9.5) continue;
      const p = sel.modelProb;
      if (!Number.isFinite(p) || p <= 0 || p >= 1) continue;
      const implied = 1 / odds;
      const edgePct = (p - implied) * 100;
      if (edgePct < 8) continue; // مزیت حداقل ۸ واحد درصدی
      const evPct = (p * odds - 1) * 100;
      if (evPct < 12) continue; // ارزش حداقل +۱۲٪
      const kelly = (p * odds - 1) / (odds - 1); // کلِی کامل
      const stake = Math.max(10, Math.min(15, Math.round(kelly * 0.15 * 100 * 10) / 10));
      shots.push({
        id: `sniper::${c.match.id}::${sel.key}`,
        matchId: c.match.id,
        matchLabel: `${c.match.homeTeam} × ${c.match.awayTeam}`,
        league: c.match.league,
        kickoff: c.match.kickoff,
        marketKey: sel.key,
        marketLabel: sel.label,
        odds: r2(odds),
        modelProb: p,
        impliedProb: r2(implied),
        edgePct: r1(edgePct),
        evPct: r1(evPct),
        stake,
      });
    }
  }
  return shots.sort((a, b) => b.evPct - a.evPct).slice(0, 6);
}
