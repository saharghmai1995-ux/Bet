// ─────────────────────────────────────────────────────────────────────────────
// v20.0 — یک‌بارگشت سازگاری پرچم‌ها و ادعاهای سطح-بازی (Flag/Claim Reconciliation)
// رفع ناسازگاری تاریخی: slipهایی که قبلاً ارسال موفق داشته‌اند ولی پرچمشان false است.
// هر بازیِ ارسال‌شده → telegramCard/telegramResult=true + ادعای MT-CARD/MT-RESULT
// تا سیاست «هر بازی فقط یک‌بار» روی کل تاریخچه برقرار شود.
// اجرا: bun run scripts/reconcile-broadcast-flags.ts
// ─────────────────────────────────────────────────────────────────────────────
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

const { matchKeyOf } = await import("../src/lib/server/telegram-service").catch(() => ({ matchKeyOf: null }) as never);
async function matchKeyOfSlip(s: { externalId: string | null; homeTeam: string; awayTeam: string; kickoff: Date }): Promise<string> {
  if (s.externalId && s.externalId.trim()) return s.externalId.trim();
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran" }).format(new Date(s.kickoff));
  return `${s.homeTeam.trim().toLowerCase()}|${s.awayTeam.trim().toLowerCase()}|${day}`;
}

let cardsFixed = 0, resultsFixed = 0, mtCard = 0, mtResult = 0, skipped = 0;

// 1) CARD sends → sync flag + MT-CARD claim
const cardSends = await db.telegramOutbox.findMany({
  where: { kind: "CARD", ok: true, dedupeKey: { not: null }, slipId: { not: null } },
  select: { slipId: true, dedupeKey: true },
});
const cardSlipIds = [...new Set(cardSends.map((r) => r.slipId as string))];
for (const id of cardSlipIds) {
  const slip = await db.issuedSlip.findUnique({ where: { id }, select: { id: true, externalId: true, homeTeam: true, awayTeam: true, kickoff: true, telegramCard: true } });
  if (!slip) { skipped += 1; continue; }
  if (!slip.telegramCard) { await db.issuedSlip.update({ where: { id }, data: { telegramCard: true } }); cardsFixed += 1; }
  const mKey = await matchKeyOfSlip(slip);
  const created = await db.telegramOutbox.createMany({ data: [{ dedupeKey: `MT-CARD:${mKey}`, slipId: id, kind: "MT_CARD", ok: true, detail: "RECONCILED" }] }).catch(() => null);
  if (created && created.count > 0) mtCard += 1;
}

// 2) RESULT sends → sync flag + MT-RESULT claim
const resultSends = await db.telegramOutbox.findMany({
  where: { kind: "RESULT", ok: true, slipId: { not: null } },
  select: { slipId: true },
});
const resultSlipIds = [...new Set(resultSends.map((r) => r.slipId as string))];
for (const id of resultSlipIds) {
  const slip = await db.issuedSlip.findUnique({ where: { id }, select: { id: true, externalId: true, homeTeam: true, awayTeam: true, kickoff: true, telegramResult: true } });
  if (!slip) { skipped += 1; continue; }
  if (!slip.telegramResult) { await db.issuedSlip.update({ where: { id }, data: { telegramResult: true } }); resultsFixed += 1; }
  const mKey = await matchKeyOfSlip(slip);
  const created = await db.telegramOutbox.createMany({ data: [{ dedupeKey: `MT-RESULT:${mKey}`, slipId: id, kind: "MT_RESULT", ok: true, detail: "RECONCILED" }] }).catch(() => null);
  if (created && created.count > 0) mtResult += 1;
}

// 3) FUNNEL_GIFT/TEASER sends → MT-CARD claim (card-type posts)
const funnelSends = await db.telegramOutbox.findMany({
  where: { kind: { in: ["FUNNEL_GIFT", "FUNNEL_TEASER"] }, ok: true, slipId: { not: null } },
  select: { slipId: true },
});
for (const id of [...new Set(funnelSends.map((r) => r.slipId as string))]) {
  const slip = await db.issuedSlip.findUnique({ where: { id }, select: { id: true, externalId: true, homeTeam: true, awayTeam: true, kickoff: true, telegramCard: true } });
  if (!slip) { skipped += 1; continue; }
  if (!slip.telegramCard) { await db.issuedSlip.update({ where: { id }, data: { telegramCard: true } }); cardsFixed += 1; }
  const mKey = await matchKeyOfSlip(slip);
  const created = await db.telegramOutbox.createMany({ data: [{ dedupeKey: `MT-CARD:${mKey}`, slipId: id, kind: "MT_CARD", ok: true, detail: "RECONCILED" }] }).catch(() => null);
  if (created && created.count > 0) mtCard += 1;
}

// 4) FUNNEL_UNBLUR sends → MT-RESULT claim
const unblurSends = await db.telegramOutbox.findMany({
  where: { kind: "FUNNEL_UNBLUR", ok: true, slipId: { not: null } },
  select: { slipId: true },
});
for (const id of [...new Set(unblurSends.map((r) => r.slipId as string))]) {
  const slip = await db.issuedSlip.findUnique({ where: { id }, select: { id: true, externalId: true, homeTeam: true, awayTeam: true, kickoff: true, telegramResult: true } });
  if (!slip) { skipped += 1; continue; }
  if (!slip.telegramResult) { await db.issuedSlip.update({ where: { id }, data: { telegramResult: true } }); resultsFixed += 1; }
  const mKey = await matchKeyOfSlip(slip);
  const created = await db.telegramOutbox.createMany({ data: [{ dedupeKey: `MT-RESULT:${mKey}`, slipId: id, kind: "MT_RESULT", ok: true, detail: "RECONCILED" }] }).catch(() => null);
  if (created && created.count > 0) mtResult += 1;
}

console.log(`reconcile done: cardsFlagFixed=${cardsFixed} resultsFlagFixed=${resultsFixed} mtCardClaims=${mtCard} mtResultClaims=${mtResult} skipped=${skipped}`);
await db.$disconnect();
