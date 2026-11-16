import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
async function main() {
  const dayStart = new Date("2026-11-15T00:00:00Z");
  const kinds: any = await db.$queryRawUnsafe(`SELECT kind, COUNT(*) as n FROM TelegramOutbox WHERE createdAt >= ? GROUP BY kind`, dayStart);
  console.log("TODAY OUTBOX BY KIND:", JSON.stringify(kinds.map((k:any)=>({kind:k.kind, n:Number(k.n)}))));
  const claims = await (db as any).telegramOutbox.findMany({ where: { dedupeKey: { startsWith: "MT-" } }, orderBy: { createdAt: "desc" }, take: 12, select: { dedupeKey: true, ok: true, detail: true, createdAt: true } });
  for (const c of claims) console.log("CLAIM:", c.dedupeKey, "| ok:", c.ok, "|", c.createdAt.toISOString());
  const slips = await (db as any).issuedSlip.findMany({ where: { supervisorApproved: true, retroIssued: false, telegramResult: false, status: { in: ["WON_A","WON_B","DOUBLE_WIN","MIDDLE_TRAP","VOID"] } }, select: { id: true, homeTeam: true, awayTeam: true, status: true, settledAt: true, externalId: true }, take: 5 });
  for (const s of slips) console.log("UNSENT RESULT:", s.homeTeam, s.awayTeam, "| st:", s.status, "| settled:", s.settledAt?.toISOString?.() ?? "-", "| ext:", s.externalId);
  const cards = await (db as any).issuedSlip.findMany({ where: { supervisorApproved: true, retroIssued: false, telegramCard: false, status: { in: ["PENDING","LIVE"] } }, select: { id: true, homeTeam: true, awayTeam: true, crownTier: true, productLine: true, kickoff: true, createdAt: true }, take: 10 });
  for (const c of cards) console.log("UNSENT CARD:", c.homeTeam, c.awayTeam, "| tier:", c.crownTier, "| line:", c.productLine, "| kickoff:", c.kickoff?.toISOString?.() ?? "-", "| created:", c.createdAt?.toISOString?.());
  const keys = await (db as any).setting.findMany({ where: { key: { contains: "funnel" } }, select: { key: true, value: true, updatedAt: true } });
  for (const k of keys) console.log("FUNNEL KEY:", k.key, "=", k.value, "|", k.updatedAt.toISOString());
  await db.$disconnect();
}
main();
