import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

function j(s: string | null | undefined): any {
  try { return s ? JSON.parse(s) : null; } catch { return null; }
}
function pct(x: number): string { return (x * 100).toFixed(1) + "%"; }

async function main() {
  const slips = await (db as any).issuedSlip.findMany({
    orderBy: { createdAt: "asc" },
  });

  console.log("=== TOTAL SLIPS:", slips.length);

  const settled = slips.filter((s: any) => s.settledAt != null && ["WON_A","WON_B","DOUBLE_WIN","MIDDLE_TRAP","VOID","MANUAL_REVIEW"].includes(s.status));
  const realSettled = settled.filter((s: any) => ["WON_A","WON_B","DOUBLE_WIN","MIDDLE_TRAP"].includes(s.status));
  console.log("=== SETTLED (decided):", realSettled.length, "| VOID/MANUAL:", settled.length - realSettled.length);

  // ---- Per-day settlement summary ----
  console.log("\n=== DAILY SETTLEMENT (date | n | wonA | wonB | doubleWin | trap | netProfit) ===");
  const byDay: Record<string, any[]> = {};
  for (const s of realSettled) {
    const d = new Date(s.settledAt).toISOString().slice(0, 10);
    (byDay[d] ||= []).push(s);
  }
  for (const d of Object.keys(byDay).sort()) {
    const arr = byDay[d];
    const net = arr.reduce((a, s) => a + (s.netProfit || 0), 0);
    const c = (st: string) => arr.filter((s) => s.status === st).length;
    console.log(`${d} | ${arr.length} | ${c("WON_A")} | ${c("WON_B")} | ${c("DOUBLE_WIN")} | ${c("MIDDLE_TRAP")} | ${net.toFixed(1)}u`);
  }

  // ---- Tip A counterfactual ----
  console.log("\n=== TIP-A COUNTERFACTUAL (if only Tip A stake had been placed, 1u flat) ===");
  let aStake = 0, aRet = 0, aWins = 0, aN = 0;
  let bStake = 0, bRet = 0, bWins = 0, bN = 0;
  const tipAstatuses = ["WON_A", "DOUBLE_WIN"];
  const tipBstatuses = ["WON_B", "DOUBLE_WIN"];
  for (const s of realSettled) {
    if (!s.oddsA || !s.stakeA) continue;
    // normalize stake to 1 unit flat for comparability
    aStake += 1; aN++;
    if (tipAstatuses.includes(s.status)) { aRet += s.oddsA; aWins++; }
    if (s.oddsB && s.stakeB) {
      bStake += 1; bN++;
      if (tipBstatuses.includes(s.status)) { bRet += s.oddsB; bWins++; }
    }
  }
  console.log(`Tip A: n=${aN} wins=${aWins} winrate=${pct(aN ? aWins / aN : 0)} ROI(flat 1u)=${pct(aStake ? (aRet - aStake) / aStake : 0)}`);
  console.log(`Tip B: n=${bN} wins=${bWins} winrate=${pct(bN ? bWins / bN : 0)} ROI(flat 1u)=${pct(bStake ? (bRet - bStake) / bStake : 0)}`);
  console.log(`Combined Dutching actual net (per-card stakes): ${realSettled.reduce((a, s) => a + (s.netProfit || 0), 0).toFixed(1)}u over ${realSettled.length} cards`);

  // ---- Actual dutching stakes ROI ----
  const totStake = realSettled.reduce((a, s) => a + (s.stakeA || 0) + (s.stakeB || 0), 0);
  const totNet = realSettled.reduce((a, s) => a + (s.netProfit || 0), 0);
  console.log(`Actual dutching ROI (staked ${totStake.toFixed(0)}u): ${pct(totStake ? totNet / totStake : 0)}`);

  // ---- Per crownTier ----
  console.log("\n=== PER CROWN TIER ===");
  const byTier: Record<string, any[]> = {};
  for (const s of realSettled) (byTier[s.crownTier || "LEGACY"] ||= []).push(s);
  for (const t of Object.keys(byTier)) {
    const arr = byTier[t];
    const net = arr.reduce((a, s) => a + (s.netProfit || 0), 0);
    const stake = arr.reduce((a, s) => a + (s.stakeA || 0) + (s.stakeB || 0), 0);
    const wins = arr.filter((s) => s.status !== "MIDDLE_TRAP").length;
    console.log(`${t}: n=${arr.length} winRate(non-trap)=${pct(arr.length ? wins / arr.length : 0)} net=${net.toFixed(1)}u ROI=${pct(stake ? net / stake : 0)}`);
  }

  // ---- Per productLine ----
  console.log("\n=== PER PRODUCT LINE ===");
  const byLine: Record<string, any[]> = {};
  for (const s of realSettled) (byLine[s.productLine || "SINGLE"] ||= []).push(s);
  for (const t of Object.keys(byLine)) {
    const arr = byLine[t];
    const net = arr.reduce((a, s) => a + (s.netProfit || 0), 0);
    console.log(`${t}: n=${arr.length} net=${net.toFixed(1)}u`);
  }

  // ---- Per archetype ----
  console.log("\n=== PER ARCHETYPE ===");
  const byArch: Record<string, any[]> = {};
  for (const s of realSettled) (byArch[s.archetypeCode || "NONE"] ||= []).push(s);
  for (const t of Object.keys(byArch).sort()) {
    const arr = byArch[t];
    const net = arr.reduce((a, s) => a + (s.netProfit || 0), 0);
    const wr = arr.filter((s) => s.status !== "MIDDLE_TRAP").length / (arr.length || 1);
    console.log(`${t}: n=${arr.length} winRate=${pct(wr)} net=${net.toFixed(1)}u`);
  }

  // ---- Odds range analysis: are odds realistic? ----
  console.log("\n=== ODDS DISTRIBUTION (issued cards) ===");
  const oddsA = realSettled.map((s) => s.oddsA).filter(Boolean).sort((a: number, b: number) => a - b);
  const oddsB = realSettled.map((s) => s.oddsB).filter(Boolean).sort((a: number, b: number) => a - b);
  const q = (arr: number[], p: number) => arr.length ? arr[Math.min(arr.length - 1, Math.floor(p * arr.length))] : 0;
  console.log(`oddsA: min=${oddsA[0]} p25=${q(oddsA, .25)} median=${q(oddsA, .5)} p75=${q(oddsA, .75)} max=${oddsA[oddsA.length - 1]}`);
  console.log(`oddsB: min=${oddsB[0]} p25=${q(oddsB, .25)} median=${q(oddsB, .5)} p75=${q(oddsB, .75)} max=${oddsB[oddsB.length - 1]}`);

  // ---- Sample of recent cards with legs for manual verification vs real sites ----
  console.log("\n=== LAST 15 SETTLED CARDS (for manual odds verification) ===");
  for (const s of [...realSettled].slice(-15)) {
    const legsA = j(s.legsA) || [];
    const legsB = j(s.legsB) || [];
    console.log(`[${new Date(s.kickoff).toISOString().slice(0, 16)}] ${s.league}: ${s.homeTeam} vs ${s.awayTeam} => ${s.homeGoals}-${s.awayGoals} | A(${s.oddsA}): ${legsA.map((l: any) => `${l.selection || l.market}`).join(" + ")} | B(${s.oddsB}): ${legsB.map((l: any) => `${l.selection || l.market}`).join(" + ")} | ${s.status} net=${(s.netProfit || 0).toFixed(1)}`);
  }

  // ---- Broadcast outbox integrity ----
  const outbox = await (db as any).telegramOutbox.findMany({ orderBy: { createdAt: "desc" }, take: 500 });
  const okCount = outbox.filter((o: any) => o.ok).length;
  console.log(`\n=== TELEGRAM OUTBOX (last 500): ok=${okCount}/${outbox.length}`);
  const byKind: Record<string, any[]> = {};
  for (const o of outbox) (byKind[o.kind] ||= []).push(o);
  for (const k of Object.keys(byKind)) {
    const arr = byKind[k];
    console.log(`${k}: n=${arr.length} ok=${arr.filter((o: any) => o.ok).length} last=${new Date(arr[0].createdAt).toISOString()}`);
  }

  // ---- Pinnacle/edge fields populated? ----
  const withEdge = realSettled.filter((s: any) => s.edgeA != null).length;
  const withPinnacle = realSettled.filter((s: any) => s.pinnacleOddsA != null).length;
  console.log(`\n=== EDGE FIELDS: cards with edgeA=${withEdge}/${realSettled.length}, with pinnacleOddsA=${withPinnacle}/${realSettled.length}`);

  // ---- oddsSource distribution on matches ----
  const srcs: any = await db.$queryRawUnsafe(`SELECT oddsSource, COUNT(*) n FROM Match GROUP BY oddsSource`);
  console.log("=== MATCH oddsSource:", JSON.stringify(srcs));

  await db.$disconnect();
}
main();
