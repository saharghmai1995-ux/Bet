import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
async function main() {
  const total = await db.issuedSlip.count();
  const approved = await db.issuedSlip.count({ where: { supervisorApproved: true } });
  const approvedEver = await db.issuedSlip.count({ where: { supervisorScore: { not: null } } });
  console.log(`slips total=${total} approved=${approved} hasScore=${approvedEver}`);

  const jvi = await db.issuedSlip.findFirst({
    where: { homeTeam: "Jordan", status: "PENDING", telegramCard: true },
    select: { id: true, homeTeam: true, awayTeam: true, supervisorApproved: true, supervisorScore: true, telegramCard: true, telegramResult: true, kickoff: true },
  });
  console.log("jordan slip:", JSON.stringify(jvi));
  if (jvi) {
    const ob = await db.telegramOutbox.findMany({ where: { slipId: jvi.id }, orderBy: { createdAt: "asc" } });
    for (const o of ob) console.log(`  outbox ${o.createdAt.toISOString()} ${o.kind} ok=${o.ok} ${o.detail.slice(0, 50)}`);
  }

  const recent = await db.issuedSlip.findMany({
    where: { supervisorApproved: true },
    orderBy: { createdAt: "desc" },
    take: 8,
    select: { homeTeam: true, awayTeam: true, kickoff: true, createdAt: true, status: true, telegramCard: true, telegramResult: true, retroIssued: true },
  });
  console.log("\n=== RECENT APPROVED SLIPS ===");
  for (const s of recent) console.log(`${s.createdAt.toISOString()} ko=${s.kickoff.toISOString()} ${s.homeTeam} v ${s.awayTeam} ${s.status} card=${s.telegramCard?1:0} res=${s.telegramResult?1:0} retro=${s.retroIssued?1:0}`);
}
main().finally(() => db.$disconnect());
