import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

function j(s: string | null | undefined): any {
  try { return s ? JSON.parse(s) : null; } catch { return null; }
}

async function main() {
  const pending = await (db as any).issuedSlip.findMany({
    where: { status: { in: ["PENDING", "LIVE"] } },
    orderBy: { kickoff: "asc" },
  });
  console.log("=== PENDING/LIVE CARDS:", pending.length);
  for (const s of pending.slice(0, 30)) {
    const legsA = j(s.legsA) || [];
    const legsB = j(s.legsB) || [];
    console.log(`[${new Date(s.kickoff).toISOString().slice(0, 16)}] ${s.league.slice(0, 24)}: ${s.homeTeam} vs ${s.awayTeam}`);
    console.log(`   A(${s.oddsA}) [${(s.tipKindA || "?")}/${s.archetypeCode || "?"}] pA=${s.modelProbA?.toFixed(2)}: ${legsA.map((l: any) => `${l.key}(${l.prob?.toFixed?.(2) || "?"})`).join(" + ")}`);
    console.log(`   B(${s.oddsB}) pB=${s.modelProbB?.toFixed(2)}: ${legsB.map((l: any) => `${l.key}(${l.prob?.toFixed?.(2) || "?"})`).join(" + ")} | guar=${s.guaranteedProfit} | tier=${s.crownTier} | approved=${s.supervisorApproved} | card=${s.telegramCard}`);
  }

  // Upcoming matches with odds source
  const upcoming = await (db as any).match.findMany({
    where: { status: { in: ["UPCOMING", "ANALYZED", "SCHEDULED"] }, kickoff: { gte: new Date() } },
    orderBy: { kickoff: "asc" }, take: 15,
    select: { league: true, homeTeam: true, awayTeam: true, kickoff: true, oddsHome: true, oddsDraw: true, oddsAway: true, oddsOver25: true, oddsUnder25: true, oddsSource: true, oddsFetchedAt: true, externalId: true },
  });
  console.log("\n=== UPCOMING MATCHES (engine market line) ===");
  for (const m of upcoming) {
    console.log(`[${new Date(m.kickoff).toISOString().slice(0, 16)}] ${m.homeTeam} vs ${m.awayTeam} | 1X2: ${m.oddsHome}/${m.oddsDraw}/${m.oddsAway} O/U2.5: ${m.oddsOver25}/${m.oddsUnder25} | src=${m.oddsSource} @${m.oddsFetchedAt ? new Date(m.oddsFetchedAt).toISOString().slice(0, 16) : "never"}`);
  }
  await db.$disconnect();
}
main();
