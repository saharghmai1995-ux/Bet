// ─────────────────────────────────────────────────────────────────────────────
// 🔬 موتور زبان پرس‌وجوی تحلیلی درون‌حافظه‌ای + تحلیل ریشه‌ای هوش مصنوعی
// «In-Memory SQL / QQL Engine + AI Root-Cause Analysis» — NeoBet v24.0
//
// سند ارتقا v24.0: سطح سامانه‌های علم داده مؤسسات مالی (DuckDB-style In-Memory
// Analytical OLAP + Counterfactual Causal RCA). سه جدول اصلی علم داده در حافظه:
//
//   ۱) historical_telemetry_warehouse — تمام بازی‌های تسویه‌شده گذشته با
//      ویژگی‌های (λ_H, λ_A, Entropy H, League, PairCode, Outcome, NetProfit, RCATag)
//   ۲) rca_failure_rules — پایگاه دانش تحلیل ریشه‌ای باخت‌ها:
//      RCA_01_LOW_FAV_XG · RCA_02_AWAY_TRANSITION_THREAT · RCA_03_AWAY_FAVORITE_DOMINANCE
//   ۳) candidate_66_matrix_pairs — تمام C(12,2)=۶۶ ترکیب دوتایی استخر باز ۱۲ آپشن
//      بوک‌میکر (M1..M12) برای مسابقه فعلی.
//
// خط لوله QQL چهار مرحله‌ای برای هر مسابقه (خروجی: executedQueryLog + aiRcaDiagnosis):
//   مرحله ۱ — historical_knn_twins: دوقلوهای تاریخی K-NN (Δλ_Fav ≤ 0.28 · Δλ_Dog ≤ 0.25 · ΔH ≤ 0.20)
//   مرحله ۲ — rca_filtered_candidates: قید impliedSum ≤ 0.865 + پوشش ≥ 0.895 + وتوی RCA
//   مرحله ۳ — امتیازدهی: empirical_win_rate×100 + double_win_prob×75 + (O_eff−1)×130
//   مرحله ۴ — LIMIT 1 → برنده اختصاصی همان بازی + ثبت لاگ کوئری اجراشده
// ─────────────────────────────────────────────────────────────────────────────

import { buildScoreMatrix } from "./coverage";
import { shannonEntropy } from "./betrouter";
import { pairCodeOfKeys } from "./quantum-solver";

// ═══════════ جدول ۱ — انبار داده پیشینه علوم داده ═══════════

export interface QqlTelemetryRow {
  matchId: string;
  league: string;
  /** کد جفت رسمی استخر کوانتومی مثل «M4↔M6» — جفت‌های خارج استخر با پیشوند RAW: */
  pairCode: string;
  favLambda: number;
  dogLambda: number;
  lambdaHome: number;
  lambdaAway: number;
  entropy: number;
  winFlag: boolean;
  doubleWinFlag: boolean;
  netProfit: number;
  outcome: string;
  settledAt: string | null;
  rcaTag: string | null;
}

/** ورودی خام از ردیف‌های IssuedSlip دیتابیس (بدون وابستگی به Prisma) */
export interface TelemetrySlipInput {
  id: string;
  league: string;
  legsA: string; // JSON: [{key, ...}]
  legsB: string; // JSON
  lambdaHome: number | null;
  lambdaAway: number | null;
  status: string;
  netProfit: number | null;
  settledAt: string | Date | null;
}

const WIN_STATUSES = new Set(["WON_A", "WON_B", "DOUBLE_WIN"]);
const SETTLED_STATUSES = new Set([...WIN_STATUSES, "MIDDLE_TRAP"]);

function parseLegKeys(json: string): string[] {
  try {
    const arr = JSON.parse(json) as { key?: string }[];
    if (!Array.isArray(arr)) return [];
    return arr.map((l) => String(l?.key ?? "")).filter((k) => k.length > 0);
  } catch {
    return [];
  }
}

/** برچسب کوانتومی از دو کلید پایه — سازگاری با جفت‌های تاریخی G1/G2/G3 */
function legacyPairLabel(keysA: string[], keysB: string[]): string {
  const pc = keysA[0] && keysB[0] ? pairCodeOfKeys(keysA[0], keysB[0]) : null;
  if (pc) return pc;
  return `RAW:${[...keysA, ...keysB].sort().join("+") || "—"}`;
}

/**
 * ساخت انبار تله‌متری از ردیف‌های واقعی کارنامه تسویه‌شده — صفر عدد جعلی.
 * آنتروپی هر ردیف از λ‌های ذخیره‌شده همان کارت بازتولید می‌شود (H ماتریس دیکسون-کولز).
 * تحلیل ریشه‌ای هر باخت تاریخی (RCA tag) با قواعد همان لحظه ثبت می‌شود.
 */
export function buildTelemetryWarehouse(slips: TelemetrySlipInput[]): QqlTelemetryRow[] {
  const rows: QqlTelemetryRow[] = [];
  for (const s of slips) {
    if (!SETTLED_STATUSES.has(s.status)) continue;
    const lH = s.lambdaHome ?? 0;
    const lA = s.lambdaAway ?? 0;
    if (lH <= 0 || lA <= 0) continue;
    const keysA = parseLegKeys(s.legsA);
    const keysB = parseLegKeys(s.legsB);
    const fav = Math.max(lH, lA);
    const dog = Math.min(lH, lA);
    const entropy = shannonEntropy(buildScoreMatrix(lH, lA));
    const winFlag = WIN_STATUSES.has(s.status);
    const doubleWinFlag = s.status === "DOUBLE_WIN";
    const netProfit = s.netProfit ?? 0;
    const rcaTag = winFlag ? null : diagnoseLossRootCause({ lambdaHome: lH, lambdaAway: lA, entropy }).map((r) => r.id).join("|") || null;
    rows.push({
      matchId: s.id,
      league: s.league,
      pairCode: legacyPairLabel(keysA, keysB),
      favLambda: Math.round(fav * 1000) / 1000,
      dogLambda: Math.round(dog * 1000) / 1000,
      lambdaHome: lH,
      lambdaAway: lA,
      entropy: Math.round(entropy * 1000) / 1000,
      winFlag,
      doubleWinFlag,
      netProfit,
      outcome: s.status,
      settledAt: s.settledAt ? new Date(s.settledAt).toISOString() : null,
      rcaTag,
    });
  }
  return rows;
}

// ═══════════ جدول ۲ — پایگاه دانش تحلیل ریشه‌ای باخت‌ها (AI RCA Rules) ═══════════

export interface RcaContext {
  lambdaHome: number;
  lambdaAway: number;
  entropy?: number;
}

export interface RcaRule {
  id: string;
  title: string;
  description: string;
  /** کدهای جفت مسدودشده وقتی شرط برقرار است (طبق سند v24.0) */
  blockedPairCodes: string[];
  /** فرمان اصلاح خودکار کوئری — جفت جایگزین پیشنهادی هوش مصنوعی */
  fixPairCodes: string[];
  autoFixQuery: string;
  condition: (ctx: RcaContext) => boolean;
}

/** فرمان‌های اصلاح خودکار سند v24.0 — سه قاعده رسمی RCA */
export const RCA_FAILURE_RULES: RcaRule[] = [
  {
    id: "RCA_01_LOW_FAV_XG",
    title: "فاوریتی با امید گل پایین (خطر تله ۱-۰ / ۰-۰)",
    description:
      "وقتی λ_Fav < 1.48 باشد، گزینه Favorite Team Over 1.5 ریسک تله 1-0 / 0-0 دارد — هر جفت دارای M4 مسدود می‌شود.",
    blockedPairCodes: ["M4↔M6", "M4↔M7", "M4↔M8", "M4↔M11", "M4↔M12"],
    fixPairCodes: ["M11↔M7"],
    autoFixQuery: "SWITCH → [M11: 1X & Under 3.5] ↔ [M7: Over 2.5 Goals]",
    condition: (ctx) => Math.max(ctx.lambdaHome, ctx.lambdaAway) < 1.48,
  },
  {
    id: "RCA_02_AWAY_TRANSITION_THREAT",
    title: "تهدید ضدحمله میهمان (خطر باخت ۱-۲)",
    description:
      "وقتی تیم میهمان امید گل λ_A ≥ 1.05 دارد، گزینه 1+X ریسک باخت 1-2 دارد — هر جفت دارای M11 مسدود می‌شود.",
    blockedPairCodes: ["M11↔M7", "M11↔M12"],
    fixPairCodes: ["M8↔M9", "M4↔M6"],
    autoFixQuery: "SWITCH → [M8: BTTS Yes] ↔ [M9: Home Win to Nil] یا [M4: Home Over 1.5] ↔ [M6: Under 2.5]",
    condition: (ctx) => ctx.lambdaAway >= 1.05,
  },
  {
    id: "RCA_03_AWAY_FAVORITE_DOMINANCE",
    title: "غلبه فاوریت میهمان",
    description:
      "وقتی تیم میهمان فاوریت است (λ_A > λ_H + 0.35)، جفت‌های سمت-میزبان مسدود و به سمت میهمان سوییچ می‌شوند.",
    blockedPairCodes: ["M1↔M6", "M1↔M7", "M4↔M6", "M11↔M7", "M9↔M8"],
    fixPairCodes: ["M5↔M6", "M12↔M7"],
    autoFixQuery: "SWITCH → [M5: Away Team Over 1.5] ↔ [M6: Under 2.5] (برد دوبل در ۰-۲) یا [M12: X2 & Under 3.5] ↔ [M7: Over 2.5]",
    condition: (ctx) => ctx.lambdaAway > ctx.lambdaHome + 0.35,
  },
];

/** تحلیل ریشه‌ای یک نتیجه — قواعد فعال در زمینه λ همان بازی */
export function diagnoseLossRootCause(ctx: RcaContext): RcaRule[] {
  return RCA_FAILURE_RULES.filter((r) => r.condition(ctx));
}

// ═══════════ جدول ۳ — ۶۶ ترکیب کاندیدای مسابقه فعلی ═══════════

export interface QqlCandidateInput {
  pairCode: string;
  keyA: string;
  keyB: string;
  oddsA: number;
  oddsB: number;
  /** matrix_union_prob — پوشش اجتماع سلول‌ها */
  unionProb: number;
  /** double_win_prob — احتمال اشتراک برد دوبل */
  doubleWinProb: number;
  jointLossProb: number;
}

export interface QqlWinner {
  pairCode: string;
  keyA: string;
  keyB: string;
  empiricalWinRate: number;
  histWinRate: number | null;
  histDoubleWinRate: number | null;
  histAvgProfit: number | null;
  histSample: number;
  effectiveOverlapOdds: number;
  score: number;
}

export interface QqlTwinGroup {
  pairCode: string;
  sample: number;
  histWinRate: number;
  histDoubleWinRate: number;
  histAvgProfit: number;
}

export interface QqlRunResult {
  winner: QqlWinner | null;
  /** متن کوئری اجراشده (QQL Pipeline ۴ مرحله‌ای) — روی کارت ذخیره می‌شود */
  executedQueryLog: string[];
  /** تحلیل ریشه‌ای هوش مصنوعی — روی کارت ذخیره می‌شود */
  aiRcaDiagnosis: string;
  firedRules: RcaRule[];
  vetoedPairs: string[];
  twinGroups: QqlTwinGroup[];
  twinsCount: number;
  knnSummary: string | null;
  stageCounts: { stage0: number; stage1: number; stage2: number; stage3: number };
}

/** تحمل‌های K-NN سند v24.0: Δλ_Fav ≤ 0.28 · Δλ_Dog ≤ 0.25 · ΔH ≤ 0.20 */
export const QQL_KNN_TOLERANCE = { fav: 0.28, dog: 0.25, entropy: 0.2 } as const;
/** قیدهای سخت سند: مجموع ضمنی ≤ ۰.۸۶۵ و پوشش ماتریس ≥ ۰.۸۹۵ */
export const QQL_IMPLIED_SUM_MAX = 0.865;
export const QQL_UNION_PROB_MIN = 0.895;

/**
 * ⚡ runQqlPipeline — اجرای کوئری تحلیلی ۴ مرحله‌ای سند v24.0 برای یک مسابقه.
 * معادل SQL سند:
 *   WITH historical_knn_twins AS (SELECT pair_code, AVG(win_flag) ... WHERE |Δλ| ≤ tol GROUP BY pair_code),
 *   rca_filtered_candidates AS (SELECT ... WHERE impliedSum ≤ 0.865 AND union ≥ 0.895 AND NOT EXISTS blocked ...),
 *   SELECT * ... ORDER BY (empirical_win_rate*100 + double_win_prob*75 + (O_eff−1)*130) DESC LIMIT 1;
 */
export function runQqlPipeline(input: {
  lambdaHome: number;
  lambdaAway: number;
  entropy: number;
  candidates: QqlCandidateInput[];
  telemetry: QqlTelemetryRow[];
}): QqlRunResult {
  const fav = Math.max(input.lambdaHome, input.lambdaAway);
  const dog = Math.min(input.lambdaHome, input.lambdaAway);
  const executedQueryLog: string[] = [];

  // ─── مرحله ۱ — historical_knn_twins (دوقلوهای K-NN انبار پیشینه) ───
  executedQueryLog.push(
    `WITH historical_knn_twins AS (SELECT pair_code, AVG(win_flag) AS hist_win_rate, AVG(double_win_flag) AS hist_double_win_rate, AVG(net_profit) AS hist_avg_profit FROM historical_telemetry_warehouse WHERE ABS(fav_lambda - ${fav.toFixed(2)}) <= ${QQL_KNN_TOLERANCE.fav} AND ABS(dog_lambda - ${dog.toFixed(2)}) <= ${QQL_KNN_TOLERANCE.dog} AND ABS(entropy - ${input.entropy.toFixed(2)}) <= ${QQL_KNN_TOLERANCE.entropy} GROUP BY pair_code)`
  );
  const twins = input.telemetry.filter(
    (t) =>
      Math.abs(t.favLambda - fav) <= QQL_KNN_TOLERANCE.fav &&
      Math.abs(t.dogLambda - dog) <= QQL_KNN_TOLERANCE.dog &&
      Math.abs(t.entropy - input.entropy) <= QQL_KNN_TOLERANCE.entropy
  );
  const twinMap = new Map<string, { n: number; w: number; dw: number; profit: number }>();
  for (const t of twins) {
    const g = twinMap.get(t.pairCode) ?? { n: 0, w: 0, dw: 0, profit: 0 };
    g.n += 1;
    g.w += t.winFlag ? 1 : 0;
    g.dw += t.doubleWinFlag ? 1 : 0;
    g.profit += t.netProfit;
    twinMap.set(t.pairCode, g);
  }
  const twinGroups: QqlTwinGroup[] = [...twinMap.entries()]
    .map(([pairCode, g]) => ({
      pairCode,
      sample: g.n,
      histWinRate: g.w / g.n,
      histDoubleWinRate: g.dw / g.n,
      histAvgProfit: g.profit / g.n,
    }))
    .sort((a, b) => b.sample - a.sample);

  // ─── مرحله ۲ — rca_filtered_candidates (قیدها + وتوی RCA) ───
  const firedRules = diagnoseLossRootCause({ lambdaHome: input.lambdaHome, lambdaAway: input.lambdaAway, entropy: input.entropy });
  const blockedCodes = new Set(firedRules.flatMap((r) => r.blockedPairCodes));
  const vetoedPairs: string[] = [];
  executedQueryLog.push(
    `rca_filtered_candidates AS (SELECT c.*, COALESCE(h.hist_win_rate, c.matrix_union_prob) AS empirical_win_rate, (1.0/((1.0/c.odds_a)+(1.0/c.odds_b))) AS effective_overlap_odds FROM candidate_66_matrix_pairs c LEFT JOIN historical_knn_twins h ON c.pair_code = h.pair_code WHERE ((1.0/c.odds_a)+(1.0/c.odds_b)) <= ${QQL_IMPLIED_SUM_MAX} AND c.matrix_union_prob >= ${QQL_UNION_PROB_MIN} AND NOT EXISTS (SELECT 1 FROM rca_failure_rules r WHERE r.blocked_pair_code = c.pair_code AND r.condition_matched = TRUE))`
  );

  const stage1 = input.candidates;
  const stage2 = stage1.filter((c) => {
    const impliedSum = 1 / Math.max(1.01, c.oddsA) + 1 / Math.max(1.01, c.oddsB);
    return impliedSum <= QQL_IMPLIED_SUM_MAX && c.unionProb >= QQL_UNION_PROB_MIN;
  });
  const stage3 = stage2.filter((c) => {
    if (blockedCodes.has(c.pairCode)) {
      vetoedPairs.push(c.pairCode);
      return false;
    }
    return true;
  });

  // ─── مرحله ۳ — امتیازدهی نهایی + LIMIT 1 ───
  executedQueryLog.push(
    `SELECT * FROM rca_filtered_candidates ORDER BY (empirical_win_rate * 100 + double_win_prob * 75 + (effective_overlap_odds - 1) * 130) DESC LIMIT 1`
  );

  let winner: QqlWinner | null = null;
  for (const c of stage3) {
    const h = twinMap.get(c.pairCode);
    const empiricalWinRate = h ? h.w / h.n : c.unionProb;
    const effectiveOverlapOdds = 1 / (1 / Math.max(1.01, c.oddsA) + 1 / Math.max(1.01, c.oddsB));
    const score = empiricalWinRate * 100 + c.doubleWinProb * 75 + (effectiveOverlapOdds - 1) * 130;
    if (!winner || score > winner.score) {
      winner = {
        pairCode: c.pairCode,
        keyA: c.keyA,
        keyB: c.keyB,
        empiricalWinRate: Math.round(empiricalWinRate * 1000) / 1000,
        histWinRate: h ? Math.round((h.w / h.n) * 1000) / 1000 : null,
        histDoubleWinRate: h ? Math.round((h.dw / h.n) * 1000) / 1000 : null,
        histAvgProfit: h ? Math.round((g(h)) * 100) / 100 : null,
        histSample: h?.n ?? 0,
        effectiveOverlapOdds: Math.round(effectiveOverlapOdds * 1000) / 1000,
        score: Math.round(score * 10) / 10,
      };
    }
  }

  // ─── مرحله ۴ — تحلیل ریشه‌ای + خلاصه دوقلوها (aiRcaDiagnosis) ───
  const knnSummary =
    twinGroups.length > 0
      ? `در ${twins.length} بازی مشابه قبلی (K-NN Δλ/ΔH) — بهترین الگوی تاریخی [${twinGroups[0].pairCode}]: وین‌ریت ${(twinGroups[0].histWinRate * 100).toFixed(1)}٪ و ${twinGroups[0].sample} نمونه`
      : null;
  const diagnosisParts: string[] = [];
  if (firedRules.length > 0) {
    for (const r of firedRules) {
      diagnosisParts.push(`🛡️ ${r.id}: ${r.description} ← فرمان اصلاح خودکار کوئری: ${r.autoFixQuery}`);
    }
    if (vetoedPairs.length > 0) {
      diagnosisParts.push(`جفت‌های وتوشده RCA در این بازی: ${vetoedPairs.join(" · ")}`);
    }
  }
  if (winner) {
    diagnosisParts.push(
      `🔎 QQL SELECT: [${winner.pairCode}] (Score: ${winner.score.toFixed(1)}${winner.histSample > 0 ? ` · پیشینه ${winner.histSample} دوقلوی K-NN با وین‌ریت ${(winner.histWinRate! * 100).toFixed(1)}٪` : " · بدون دوقلوی تاریخی — احتمال ماتریس مبنا"})`
    );
  } else if (stage3.length === 0 && stage2.length === 0) {
    diagnosisParts.push("هیچ کاندیدایی قیدهای سخت سند (مجموع ضمنی ≤ ۰.۸۶۵ و پوشش ≥ ۸۹.۵٪) را پاس نکرد — بازی به دفتر سایه می‌رود.");
  }

  return {
    winner,
    executedQueryLog,
    aiRcaDiagnosis: diagnosisParts.join(" | "),
    firedRules,
    vetoedPairs,
    twinGroups,
    twinsCount: twins.length,
    knnSummary,
    stageCounts: { stage0: stage1.length, stage1: stage2.length, stage2: stage3.length, stage3: winner ? 1 : 0 },
  };
}

function g(t: { profit: number; n: number }): number {
  return t.profit / t.n;
}

// ═══════════ کنسول تعاملی QQL — چهار کوئری آماده ۱ کلیکی (سند v24.0 بخش ۳) ═══════════

export interface QqlConsoleResult {
  queryId: string;
  title: string;
  columns: string[];
  rows: (string | number | null)[][];
  note: string;
}

/** Query 1 — SELECT top_performing_pairs WHERE double_win_rate > 15% */
export function qqlTopPerformingPairs(telemetry: QqlTelemetryRow[], minDoubleWinRate = 0.15): QqlConsoleResult {
  const map = new Map<string, { n: number; w: number; dw: number; profit: number }>();
  for (const t of telemetry) {
    const g = map.get(t.pairCode) ?? { n: 0, w: 0, dw: 0, profit: 0 };
    g.n += 1;
    g.w += t.winFlag ? 1 : 0;
    g.dw += t.doubleWinFlag ? 1 : 0;
    g.profit += t.netProfit;
    map.set(t.pairCode, g);
  }
  const rows: (string | number | null)[][] = [];
  for (const [pairCode, g] of map) {
    const dwRate = g.dw / g.n;
    if (dwRate > minDoubleWinRate) {
      rows.push([pairCode, g.n, `${((g.w / g.n) * 100).toFixed(1)}٪`, `${(dwRate * 100).toFixed(1)}٪`, `${g.profit >= 0 ? "+" : ""}${g.profit.toFixed(1)}u`]);
    }
  }
  rows.sort((a, b) => Number(String(b[2]).replace("٪", "")) - Number(String(a[2]).replace("٪", "")));
  return {
    queryId: "Q1",
    title: "SELECT top_performing_pairs WHERE double_win_rate > 15% — الگوهای دارای بیشترین جکپات دو برد",
    columns: ["pair_code", "settled", "win_rate", "double_win_rate", "net_profit"],
    rows,
    note: `${rows.length} الگو از ${map.size} الگوی تاریخی آستانه برد دوبل ۱۵٪ را پاس کردند`,
  };
}

/** Query 2 — RCA_AUDIT ON lost_matches GROUP BY failure_root_cause */
export function qqlRcaAudit(telemetry: QqlTelemetryRow[]): QqlConsoleResult {
  const map = new Map<string, { n: number; loss: number; profit: number; fix: string }>();
  for (const t of telemetry) {
    if (t.winFlag) continue;
    const tags = (t.rcaTag ?? "UNTAGGED").split("|");
    for (const tag of tags) {
      const rule = RCA_FAILURE_RULES.find((r) => r.id === tag);
      const key = rule ? rule.id : t.pairCode.startsWith("RAW:") ? "RCA_UNCLASSIFIED" : "NO_RCA_MATCH";
      const g = map.get(key) ?? { n: 0, loss: 0, profit: 0, fix: rule?.autoFixQuery ?? "—" };
      g.n += 1;
      g.loss += 1;
      g.profit += t.netProfit;
      map.set(key, g);
    }
  }
  const rows: (string | number | null)[][] = [...map.entries()].map(([id, g]) => [
    id,
    g.n,
    `${g.profit.toFixed(1)}u`,
    g.fix,
  ]);
  return {
    queryId: "Q2",
    title: "RCA_AUDIT ON lost_matches GROUP BY failure_root_cause — کالبدشکافی ریشه‌ای تله‌های میانی",
    columns: ["failure_root_cause", "occurrences", "paper_loss", "auto_fix_query"],
    rows,
    note: "راه‌حل خودکار هوش مصنوعی برای هر ریشه در ستون آخر — قواعد در rca_failure_rules ثبت شده‌اند",
  };
}

/** Query 4 — COMPARE counterfactual_roi ACROSS all 12_market_operators */
export function qqlCounterfactualRoi(telemetry: QqlTelemetryRow[]): QqlConsoleResult {
  // بازده خلاف واقع هر آپشن M1..M12: سهم تاریخی هر اپراتور در کارت‌های تسویه‌شده
  const M_CODES = ["M1", "M2", "M3", "M4", "M5", "M6", "M7", "M8", "M9", "M10", "M11", "M12"];
  const rows: (string | number | null)[][] = [];
  for (const code of M_CODES) {
    const involved = telemetry.filter((t) => t.pairCode.includes(code));
    const n = involved.length;
    const w = involved.filter((t) => t.winFlag).length;
    const profit = involved.reduce((s, t) => s + t.netProfit, 0);
    rows.push([
      code,
      n,
      n > 0 ? `${((w / n) * 100).toFixed(1)}٪` : "—",
      n > 0 ? `${profit >= 0 ? "+" : ""}${(profit / n).toFixed(1)}u` : "—",
      `${profit >= 0 ? "+" : ""}${profit.toFixed(1)}u`,
    ]);
  }
  return {
    queryId: "Q4",
    title: "COMPARE counterfactual_roi ACROSS all 12_market_operators — بازده هر ۱۲ آپشن روی انبار تاریخی",
    columns: ["operator", "involved_settled", "win_rate", "avg_net_per_card", "total_net"],
    rows,
    note: "تحلیل خلاف واقع (Counterfactual Attribution) — سهم هر اپراتور در کارت‌های تسویه‌شده واقعی",
  };
}
