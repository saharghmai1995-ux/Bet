import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
async function main() {
  const srcs: any = await db.$queryRawUnsafe("SELECT oddsSource, COUNT(*) as n FROM Match GROUP BY oddsSource");
  for (const s of srcs as any[]) console.log(`${s.oddsSource}: ${Number(s.n)}`);
  const lam: any = await db.$queryRawUnsafe("SELECT lambdaSource, COUNT(*) as n FROM Match GROUP BY lambdaSource");
  for (const s of lam as any[]) console.log(`lambda ${s.lambdaSource || "NULL"}: ${Number(s.n)}`);
  const withReal = await (db as any).match.findMany({ where: { oddsSource: { in: ["ODDS_API", "ESPN_DRAFTKINGS", "POLYMARKET"] }, kickoff: { gte: new Date() } }, select: { homeTeam: true, awayTeam: true, oddsHome: true, oddsDraw: true, oddsAway: true, oddsOver25: true, oddsUnder25: true, oddsSource: true }, take: 10 });
  console.log("REAL-LINE UPCOMING:", JSON.stringify(withReal, null, 0).slice(0, 900));
  await db.$disconnect();
}
main();
