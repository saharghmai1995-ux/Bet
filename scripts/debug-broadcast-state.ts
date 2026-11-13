// Debug: inspect broadcast pipeline state (outbox, slips, settings)
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const now = new Date();
  console.log("=== NOW (UTC):", now.toISOString(), "===");

  // Tehran day range (UTC+3:30 fixed)
  const OFF = 3.5 * 3600_000;
  const shifted = now.getTime() + OFF;
  const startShifted = Math.floor(shifted / 86_400_000) * 86_400_000;
  const dayStart = new Date(startShifted - OFF);
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);
  console.log("Tehran day range:", dayStart.toISOString(), "→", dayEnd.toISOString());

  // 1) Outbox last 40 entries
  const outbox = await db.telegramOutbox.findMany({
    orderBy: { createdAt: "desc" },
    take: 40,
    select: { slipId: true, kind: true, ok: true, detail: true, createdAt: true },
  });
  console.log("\n=== LAST 40 OUTBOX ===");
  for (const o of outbox) {
    console.log(
      `${o.createdAt.toISOString()} | ${o.kind.padEnd(12)} | ok=${o.ok ? 1 : 0} | slip=${(o.slipId ?? "-").slice(0, 8)} | ${o.detail.slice(0, 60)}`
    );
  }

  // 2) Duplicate outbox (same slipId + kind CARD with ok=true more than once)
  const cardSends = await db.telegramOutbox.findMany({
    where: { kind: "CARD", ok: true, slipId: { not: null } },
    orderBy: { createdAt: "asc" },
    select: { slipId: true, createdAt: true },
  });
  const counts = new Map<string, number>();
  for (const c of cardSends) counts.set(c.slipId!, (counts.get(c.slipId!) ?? 0) + 1);
  const dups = [...counts.entries()].filter(([, n]) => n > 1);
  console.log(`\n=== CARD DUPLICATES: ${dups.length} slips sent more than once ===`);
  for (const [id, n] of dups.slice(0, 15)) console.log(`  slip ${id.slice(0, 8)}… sent ${n}x`);

  // 3) Today's slips: state of dispatch flags
  const slipsToday = await db.issuedSlip.findMany({
    where: { kickoff: { gte: dayStart, lt: dayEnd } },
    select: {
      id: true, homeTeam: true, awayTeam: true, kickoff: true, status: true,
      supervisorApproved: true, retroIssued: true, telegramCard: true, telegramResult: true,
      telegramTeaser: true, homeGoals: true, awayGoals: true, settledAt: true, createdAt: true,
    },
    orderBy: { kickoff: "asc" },
    take: 60,
  });
  console.log(`\n=== SLIPS KICKING OFF TODAY (${slipsToday.length}) ===`);
  for (const s of slipsToday) {
    console.log(
      `${s.kickoff.toISOString()} | ${s.homeTeam.slice(0, 14)} v ${s.awayTeam.slice(0, 14)} | ${s.status} | appr=${s.supervisorApproved ? 1 : 0} retro=${s.retroIssued ? 1 : 0} card=${s.telegramCard ? 1 : 0} res=${s.telegramResult ? 1 : 0} goals=${s.homeGoals ?? "-"}${s.awayGoals ?? ""}`
    );
  }

  // 4) Settled slips without result sent (any date)
  const unsentResults = await db.issuedSlip.findMany({
    where: { status: { in: ["WON_A", "WON_B", "DOUBLE_WIN", "MIDDLE_TRAP"] }, telegramResult: false },
    select: { id: true, homeTeam: true, awayTeam: true, status: true, supervisorApproved: true, retroIssued: true, settledAt: true, kickoff: true },
    orderBy: { settledAt: "desc" },
    take: 25,
  });
  console.log(`\n=== SETTLED SLIPS WITH telegramResult=false (${unsentResults.length}, latest 25) ===`);
  for (const s of unsentResults) {
    console.log(
      `settled=${s.settledAt?.toISOString() ?? "-"} | ko=${s.kickoff.toISOString()} | ${s.homeTeam.slice(0, 14)} v ${s.awayTeam.slice(0, 14)} | ${s.status} | appr=${s.supervisorApproved ? 1 : 0} retro=${s.retroIssued ? 1 : 0}`
    );
  }

  // 5) Pending/Live slips not yet sent as cards (any kickoff date)
  const unsentCards = await db.issuedSlip.findMany({
    where: { status: { in: ["PENDING", "LIVE"] }, telegramCard: false, supervisorApproved: true, retroIssued: false },
    select: { id: true, homeTeam: true, awayTeam: true, kickoff: true, supervisorApproved: true, createdAt: true },
    orderBy: { kickoff: "asc" },
    take: 25,
  });
  console.log(`\n=== APPROVED PENDING/LIVE SLIPS WITH telegramCard=false (${unsentCards.length}) ===`);
  for (const s of unsentCards) {
    console.log(`ko=${s.kickoff.toISOString()} | ${s.homeTeam.slice(0, 14)} v ${s.awayTeam.slice(0, 14)} | created=${s.createdAt.toISOString()}`);
  }

  // 6) Relevant settings
  const keys = [
    "telegram_autodispatch", "telegram_bot_token", "telegram_channel_id", "telegram_public_channel_id",
    "funnel_last_gift_day", "marketing_last_ad_hour", "last_daily_digest_day",
    "vip_last_brief_day", "funnel_last_pnl_day", "news_last_stamp", "edu_last_stamp",
    "scheduler_last_daily_report",
  ];
  const rows = await db.setting.findMany({ where: { key: { in: keys } } });
  console.log("\n=== SETTINGS ===");
  for (const r of rows) {
    const v = r.key === "telegram_bot_token" ? `${r.value.slice(0, 8)}…` : r.value;
    console.log(`${r.key} = ${v}`);
  }

  // 7) Outbox failures last 30
  const fails = await db.telegramOutbox.findMany({
    where: { ok: false },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: { slipId: true, kind: true, detail: true, createdAt: true },
  });
  console.log("\n=== LAST 30 FAILED OUTBOX ===");
  for (const f of fails) {
    console.log(`${f.createdAt.toISOString()} | ${f.kind.padEnd(12)} | slip=${(f.slipId ?? "-").slice(0, 8)} | ${f.detail.slice(0, 80)}`);
  }
}

main()
  .catch((e) => {
    console.error("DEBUG FAILED:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
