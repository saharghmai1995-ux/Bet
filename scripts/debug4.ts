import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
async function main() {
  const OFF = 3.5 * 3600_000;
  const shifted = Date.now() + OFF;
  const dayStart = new Date(Math.floor(shifted / 86_400_000) * 86_400_000 - OFF);
  const approved = await db.issuedSlip.findMany({
    where: { supervisorApproved: true, retroIssued: false, kickoff: { gte: dayStart, lt: new Date(dayStart.getTime() + 86400000) } },
    select: { homeTeam: true, awayTeam: true, kickoff: true, supervisorScore: true, jointLossRiskPct: true, telegramCard: true, vetoReason: true, status: true },
    orderBy: { supervisorScore: "desc" },
  });
  console.log(`=== APPROVED TODAY: ${approved.length} ===`);
  for (const s of approved) console.log(`ko=${s.kickoff.toISOString()} ${s.homeTeam} v ${s.awayTeam} | ${s.status} | score=${s.supervisorScore?.toFixed(0)} risk=${s.jointLossRiskPct?.toFixed(1)} | card=${s.telegramCard?1:0} | ${(s.vetoReason ?? "").slice(0, 70)}`);

  const keys = ["news_last_stamp:0", "news_last_stamp:1", "edu_last_stamp:0", "edu_last_stamp:1", "funnel_last_gift_day", "marketing_last_ad_hour"];
  const rows = await db.setting.findMany({ where: { key: { in: keys } } });
  console.log("\n=== PER-SLOT STAMPS ===");
  for (const r of rows) console.log(`${r.key} = ${r.value}`);

  const recent = await db.telegramOutbox.findMany({ orderBy: { createdAt: "desc" }, take: 15, select: { kind: true, ok: true, detail: true, createdAt: true } });
  console.log("\n=== LAST 15 OUTBOX ===");
  for (const o of recent) console.log(`${o.createdAt.toISOString()} | ${o.kind.padEnd(14)} | ok=${o.ok?1:0} | ${o.detail.slice(0, 70)}`);
}
main().finally(() => db.$disconnect());
