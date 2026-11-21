import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
async function main() {
  const srcs: any = await db.$queryRawUnsafe("SELECT bookmaker, COUNT(*) as n FROM OddsRecord GROUP BY bookmaker");
  for (const s of srcs as any[]) console.log(`${s.bookmaker}: ${Number(s.n)}`);
  const sample: any = await db.$queryRawUnsafe("SELECT m.homeTeam, m.awayTeam, o.bookmaker, o.bookmakerLabel, o.oddsHome, o.oddsDraw, o.oddsAway, o.oddsOver25, o.oddsUnder25 FROM OddsRecord o JOIN Match m ON m.id = o.matchId LIMIT 5");
  for (const r of sample as any[]) console.log(JSON.stringify(r));
  await db.$disconnect();
}
main();
