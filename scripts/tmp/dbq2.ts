import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
async function main() {
  const s = await (db as any).setting.findUnique({ where: { key: "telegram_bot_token" } });
  console.log("TOKEN LEN:", (s?.value||"").length, "| tail:", (s?.value||"").slice(-6).replace(/[A-Za-z0-9_-]/g,"*"));
  const outboxSchema = await db.$queryRawUnsafe<any[]>("SELECT sql FROM sqlite_master WHERE name='TelegramOutbox'");
  console.log("OUTBOX SCHEMA:", outboxSchema[0]?.sql);
  const recent = await (db as any).telegramOutbox.findMany({ orderBy: { createdAt: "desc" }, take: 5 });
  for (const o of recent) console.log("RAW:", JSON.stringify(o).slice(0,220));
  await db.$disconnect();
}
main();
