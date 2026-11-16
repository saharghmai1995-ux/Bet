import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
async function main() {
  const outbox = await (db as any).telegramOutbox.findMany({ orderBy: { createdAt: "desc" }, take: 18 });
  for (const o of outbox) console.log("OUTBOX:", o.dedupeKey, "| chat:", o.chatId, "|", o.status, "|", (o.caption||"").slice(0,45).replace(/\n/g," "), "|", o.createdAt?.toISOString?.());
  const settings = await (db as any).setting.findMany({ where: { key: { contains: "telegram" } } });
  for (const s of settings) console.log("SETTING:", s.key, "=", (s.value||"").slice(0,25));
  const approved = await (db as any).issuedSlip.count({ where: { supervisorApproved: true, retroIssued: false } });
  const cardSent = await (db as any).issuedSlip.count({ where: { supervisorApproved: true, retroIssued: false, telegramCard: true } });
  const resSent = await (db as any).issuedSlip.count({ where: { supervisorApproved: true, retroIssued: false, telegramResult: true } });
  const settled = await (db as any).issuedSlip.count({ where: { supervisorApproved: true, retroIssued: false, status: { in: ["WON_A","WON_B","DOUBLE_WIN","MIDDLE_TRAP","VOID"] } } });
  const pendCards = settled - resSent;
  console.log(`SLIPS: approved=${approved} cardSent=${cardSent} settled=${settled} resultSent=${resSent} resultsNotSent=${pendCards}`);
  const byStatus: any = await (db as any).issuedSlip.groupBy({ by: ["status"], _count: true, where: { supervisorApproved: true, retroIssued: false } });
  console.log("STATUS DIST:", JSON.stringify(byStatus.map((s:any)=>({st:s.status,n:s._count}))));
  const accRows = await (db as any).issuedSlip.findMany({ where: { homeTeam: { startsWith: "ACC" } }, select: { id:true, homeTeam:true, awayTeam:true, status:true, netProfit:true, homeGoals:true, awayGoals:true, externalId:true, settledAt:true }, take: 12 });
  for (const a of accRows) console.log("ACCROW:", a.homeTeam, a.awayTeam, "| st:", a.status, "| profit:", a.netProfit, "| goals:", a.homeGoals, "-", a.awayGoals, "| ext:", a.externalId, "| settled:", a.settledAt?.toISOString?.() ?? "never");
  await db.$disconnect();
}
main();
