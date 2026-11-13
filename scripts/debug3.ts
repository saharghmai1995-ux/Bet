import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
async function main() {
  // vetoReason breakdown for today's slips
  const OFF = 3.5 * 3600_000;
  const shifted = Date.now() + OFF;
  const dayStart = new Date(Math.floor(shifted / 86_400_000) * 86_400_000 - OFF);
  const slips = await db.issuedSlip.findMany({
    where: { kickoff: { gte: dayStart, lt: new Date(dayStart.getTime() + 86400000) } },
    select: { homeTeam: true, awayTeam: true, league: true, supervisorApproved: true, vetoReason: true, supervisorScore: true, jointLossRiskPct: true, status: true },
    orderBy: { kickoff: "asc" },
  });
  console.log("=== TODAY SLIPS + VETO REASON ===");
  for (const s of slips) {
    console.log(`${s.homeTeam.slice(0,16).padEnd(16)} v ${s.awayTeam.slice(0,14).padEnd(14)} | ${s.league.slice(0,28).padEnd(28)} | appr=${s.supervisorApproved?1:0} score=${s.supervisorScore?.toFixed(0) ?? "-"} risk=${s.jointLossRiskPct?.toFixed(1) ?? "-"} | ${(s.vetoReason ?? "").slice(0, 90)}`);
  }
  // league distribution of vetoes last 3 days
  const since = new Date(Date.now() - 3 * 86400000);
  const vetoes = await db.issuedSlip.findMany({
    where: { supervisorApproved: false, kickoff: { gte: since } },
    select: { league: true, vetoReason: true },
  });
  const byLeague = new Map<string, number>();
  for (const v of vetoes) byLeague.set(v.league, (byLeague.get(v.league) ?? 0) + 1);
  console.log("\n=== VETOED (3d) BY LEAGUE ===");
  for (const [l, n] of [...byLeague.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`${n}x ${l}`);
}
main().finally(() => db.$disconnect());
