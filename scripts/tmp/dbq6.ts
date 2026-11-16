import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
async function main() {
  const r = await (db as any).issuedSlip.findFirst({ where: { homeTeam: { contains: "Tenerife" } }, select: { supervisorApproved:true, retroIssued:true, autoIssued:true, externalId:true, league:true, crownTier:true, createdAt:true, kickoff:true } });
  console.log("TENERIFE:", JSON.stringify(r));
  const counts: any = await db.$queryRawUnsafe(`SELECT externalId, COUNT(*) n FROM IssuedSlip WHERE supervisorApproved=1 AND retroIssued=0 AND (externalId LIKE '%esp.2%' OR externalId LIKE '%usa.1%' OR externalId LIKE '%fifa.friendly%') GROUP BY externalId`);
  console.log("TOXIC APPROVED RAW:", JSON.stringify(counts));
  const allToxic: any = await db.$queryRawUnsafe(`SELECT homeTeam, awayTeam, externalId, supervisorApproved, retroIssued, status, netProfit FROM IssuedSlip WHERE externalId LIKE '%esp.2%' OR externalId LIKE '%usa.1%' OR externalId LIKE '%fifa.friendly%' LIMIT 20`);
  for (const t of allToxic) console.log("TOXICROW:", JSON.stringify(t));
  await db.$disconnect();
}
main();
