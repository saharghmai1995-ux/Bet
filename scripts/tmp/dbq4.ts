import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
async function main() {
  const rows = await (db as any).issuedSlip.findMany({ where: { homeTeam: { contains: "Tenerife" } }, select: { id:true, homeTeam:true, awayTeam:true, labelA:true, labelB:true, legsA:true, legsB:true, status:true, netProfit:true, homeGoals:true, awayGoals:true, productLine:true, settleNote:true } });
  for (const r of rows) { console.log("=== SLIP:", r.homeTeam, r.awayTeam, r.homeGoals, "-", r.awayGoals, "| st:", r.status, "| profit:", r.netProfit, "| line:", r.productLine); console.log("  labelA:", r.labelA); console.log("  legsA:", r.legsA); console.log("  labelB:", r.labelB); console.log("  legsB:", r.legsB); console.log("  note:", (r.settleNote||"").slice(0,120)); }
  await db.$disconnect();
}
main();
