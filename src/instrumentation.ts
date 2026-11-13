// ─────────────────────────────────────────────────────────────────────────────
// Next.js Instrumentation — v18.2
// بوت اتوماسیون سرور هنگام بالا آمدن پروسه (مستقل از مرورگر — همیشه گرم):
//   · حلقه اتوماسیون ۹۰ ثانیه‌ای: اسکن ESPN → صدور کارت → تسویه → انتشار تلگرام
//   · نگهبان همیشه‌گرم حلقه (watchdog) + جبران اسلات‌های از‌دست‌رفته (catch-up)
//   · نگهبان پروسه‌ای سرویس اشتراک @aineobet_bot روی پورت ۳۰۱۰
// ─────────────────────────────────────────────────────────────────────────────

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { startScheduler } = await import("@/lib/server/scheduler");
    startScheduler();
  } catch (err) {
    console.error("[instrumentation] scheduler bootstrap failed:", err);
  }
  try {
    const { startVipBotGuardian } = await import("@/lib/server/vipbot-guardian");
    startVipBotGuardian();
  } catch (err) {
    console.error("[instrumentation] vipbot guardian bootstrap failed:", err);
  }
}
