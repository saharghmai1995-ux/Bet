import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
async function main() {
  const srcs: any = await db.$queryRawUnsafe("SELECT oddsSource, COUNT(*) as n FROM Match WHERE kickoff > datetime('now') GROUP BY oddsSource");
  for (const s of srcs as any[]) console.log(`${s.oddsSource}: ${Number(s.n)}`);
  await db.$disconnect();
}
main();
