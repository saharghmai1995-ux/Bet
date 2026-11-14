import { PrismaClient } from '@prisma/client'

// v20.0 — ریشه مصرف حافظه و CPU در dev حذف شد:
// `log: ['query']` هر کوئری را با SQL کامل قالب‌بندی و به لاگ می‌فرستاد
// (۳۸MB لاگ در روز + هزاران رشته موقت در دقیقه = فشار حافظه و OOM).
// برای فعال‌سازی موقت لاگ کوئری: NEOBET_PRISMA_LOG=1
const enableQueryLog = process.env.NEOBET_PRISMA_LOG === '1'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: enableQueryLog ? ['query'] : ['error', 'warn'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
