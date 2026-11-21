import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

function j(s: string | null | undefined): any {
  try { return s ? JSON.parse(s) : null; } catch { return null; }
}
function pct(x: number): string { return (x * 100).toFixed(1) + "%"; }

async function main() {
  const slips = await (db as any).issuedSlip.findMany({ orderBy: { createdAt: "asc" } });
  const decided = slips.filter((s: any) => ["WON_A","WON_B","DOUBLE_WIN","MIDDLE_TRAP"].includes(s.status));

  // ---- Integrity: issued AFTER kickoff (retro / post-hoc)? ----
  console.log("=== INTEGRITY: issued after kickoff? ===");
  const retroFlag = decided.filter((s) => s.retroIssued === true).length;
  const issuedAfterKO = decided.filter((s) => new Date(s.createdAt) > new Date(s.kickoff)).length;
  const issuedBeforeKO = decided.filter((s) => new Date(s.createdAt) <= new Date(s.kickoff)).length;
  console.log(`decided=${decided.length} retroIssuedFlag=${retroFlag} createdAt>kickoff=${issuedAfterKO} createdAt<=kickoff=${issuedBeforeKO}`);

  const preKO = decided.filter((s) => new Date(s.createdAt) <= new Date(s.kickoff));
  const postKO = decided.filter((s) => new Date(s.createdAt) > new Date(s.kickoff));
  const wr = (arr: any[]) => arr.filter((s) => s.status !== "MIDDLE_TRAP").length / (arr.length || 1);
  const net = (arr: any[]) => arr.reduce((a, s) => a + (s.netProfit || 0), 0);
  console.log(`PRE-KO issued: n=${preKO.length} winRate=${pct(wr(preKO))} net=${net(preKO).toFixed(1)}u`);
  console.log(`POST-KO issued (retro): n=${postKO.length} winRate=${pct(wr(postKO))} net=${net(postKO).toFixed(1)}u`);

  // gold/silver breakdown within PRE-KO
  for (const tier of ["GOLD", "SILVER_SHADOW", null]) {
    const arr = preKO.filter((s) => (s.crownTier || null) === tier);
    if (!arr.length) continue;
    console.log(`  PRE-KO ${tier || "LEGACY"}: n=${arr.length} winRate=${pct(wr(arr))} net=${net(arr).toFixed(1)}u`);
  }

  // ---- Tip A counterfactual with REAL bookmaker odds ----
  console.log("\n=== TIP A COUNTERFACTUAL @ REAL-WORLD ODDS ===");
  // real bookmaker applies ~6% margin on fair odds: realOdds ≈ (1/prob)*0.94
  // model prob of Tip A = modelProbA (stored) else reconstruct from legsA prob
  let nA = 0, winsA = 0, cardRet = 0, realRet = 0;
  let edgeSum = 0, edgeN = 0;
  for (const s of decided) {
    const legsA = j(s.legsA) || [];
    if (!legsA.length) continue;
    // joint prob of Tip A = product of leg probs (engine assumption)
    const pA = legsA.reduce((a: number, l: any) => a * (l.prob || l.modelProb || 0.5), 1);
    if (!pA || pA <= 0.05) continue;
    nA++;
    const won = ["WON_A", "DOUBLE_WIN"].includes(s.status);
    if (won) winsA++;
    cardRet += won ? s.oddsA : 0;                 // engine-odds return (flat 1u)
    const realOdds = Math.max(1.01, 0.94 / pA);   // real bookmaker pricing
    realRet += won ? realOdds : 0;
    if (s.edgeA != null) { edgeSum += s.edgeA; edgeN++; }
  }
  console.log(`n=${nA} winRate=${pct(winsA / nA)}`);
  console.log(`ROI @ engine odds (as shown on card): ${pct(cardRet / nA - 1)}`);
  console.log(`ROI @ realistic bookmaker odds (fair×0.94): ${pct(realRet / nA - 1)}`);
  console.log(`avg claimed edgeA: ${(edgeSum / (edgeN || 1)).toFixed(1)}%`);

  // ---- modelProbA calibration: predicted prob vs actual outcome ----
  console.log("\n=== CALIBRATION: modelProbA bucket vs actual Tip A win ===");
  const buckets: Record<string, { n: number; w: number }> = {};
  for (const s of decided) {
    const legsA = j(s.legsA) || [];
    if (!legsA.length || s.modelProbA == null) continue;
    const b = s.modelProbA < 0.4 ? "<0.40" : s.modelProbA < 0.5 ? "0.40-0.50" : s.modelProbA < 0.6 ? "0.50-0.60" : s.modelProbA < 0.7 ? "0.60-0.70" : ">=0.70";
    (buckets[b] ||= { n: 0, w: 0 }).n++;
    if (["WON_A", "DOUBLE_WIN"].includes(s.status)) buckets[b].w++;
  }
  for (const b of Object.keys(buckets)) {
    const { n, w } = buckets[b];
    console.log(`${b}: n=${n} actualWinRate=${pct(w / n)}`);
  }

  // ---- tipKind distribution ----
  console.log("\n=== PER TIP KIND (Tip A) ===");
  const byKind: Record<string, any[]> = {};
  for (const s of decided) (byKind[s.tipKindA || "NONE"] ||= []).push(s);
  for (const k of Object.keys(byKind)) {
    const arr = byKind[k];
    console.log(`${k}: n=${arr.length} winRate=${pct(wr(arr))} net=${net(arr).toFixed(1)}u`);
  }

  // ---- per league (top 12) ----
  console.log("\n=== PER LEAGUE (top 12 by n) ===");
  const byLeague: Record<string, any[]> = {};
  for (const s of decided) (byLeague[s.league] ||= []).push(s);
  const leagueRows = Object.entries(byLeague).sort((a, b) => b[1].length - a[1].length).slice(0, 12);
  for (const [lg, arr] of leagueRows) {
    console.log(`${lg.slice(0, 32)}: n=${arr.length} winRate=${pct(wr(arr))} net=${net(arr).toFixed(1)}u`);
  }

  // ---- odds clamp saturation ----
  console.log("\n=== ODDS CLAMP SATURATION ===");
  const atFloor = decided.filter((s) => s.oddsA === 1.82).length;
  const atCap = decided.filter((s) => s.oddsA >= 3.95).length;
  console.log(`oddsA at floor 1.82: ${atFloor}/${decided.length} | at cap 3.95: ${atCap}/${decided.length}`);
  const atFloorB = decided.filter((s) => s.oddsB === 1.82).length;
  const atCapB = decided.filter((s) => s.oddsB >= 3.95).length;
  console.log(`oddsB at floor 1.82: ${atFloorB}/${decided.length} | at cap 3.95: ${atCapB}/${decided.length}`);

  // ---- legs sample (structure) ----
  console.log("\n=== LEGS STRUCTURE (last 6 decided) ===");
  for (const s of decided.slice(-6)) {
    const legsA = j(s.legsA) || [];
    console.log(`${s.homeTeam} vs ${s.awayTeam} | A legs: ${JSON.stringify(legsA.map((l: any) => ({ key: l.key, prob: l.prob, market: l.market, selection: l.selection })))} | oddsA=${s.oddsA} edgeA=${s.edgeA} src=${s.edgeSourceA}`);
  }

  // ---- markets used overall ----
  console.log("\n=== MARKET FREQUENCY (all legs, decided cards) ===");
  const mktCount: Record<string, number> = {};
  for (const s of decided) {
    for (const legs of [j(s.legsA) || [], j(s.legsB) || []]) {
      for (const l of legs) {
        const k = l.key || l.selection || l.market || "?";
        mktCount[k] = (mktCount[k] || 0) + 1;
      }
    }
  }
  const mktRows = Object.entries(mktCount).sort((a, b) => b[1] - a[1]).slice(0, 20);
  console.log(mktRows.map(([k, v]) => `${k}: ${v}`).join(" | "));

  // ---- settlement latency ----
  console.log("\n=== SETTLEMENT LATENCY (settledAt - kickoff) ===");
  let within36h = 0, beyond = 0;
  for (const s of decided) {
    const hrs = (new Date(s.settledAt).getTime() - new Date(s.kickoff).getTime()) / 3.6e6;
    if (hrs <= 36) within36h++; else beyond++;
  }
  console.log(`within 36h: ${within36h} | beyond 36h: ${beyond}`);

  await db.$disconnect();
}
main();
