// ─────────────────────────────────────────────────────────────────────────────
// Next.js Instrumentation — v19.0
// بوت اتوماسیون سرور هنگام بالا آمدن پروسه (مستقل از مرورگر — همیشه گرم):
//   · حلقه اتوماسیون ۹۰ ثانیه‌ای: اسکن ESPN → صدور کارت → تسویه → انتشار تلگرام
//   · نگهبان همیشه‌گرم حلقه (watchdog) + جبران اسلات‌های از‌دست‌رفته (catch-up)
//   · نگهبان پروسه‌ای سرویس اشتراک @aineobet_bot روی پورت ۳۰۱۰
//   · v19.0 — نگهبان دیمن پخش مستقل (broadcast-daemon) روی پورت ۳۰۱۱:
//     پخش کانال‌ها حتی وقتی سرور Next در حال کامپایل/ری‌استارت است ادامه دارد
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
  try {
    const { startBroadcastDaemonGuardian } = await import("@/lib/server/broadcast-guardian");
    startBroadcastDaemonGuardian();
  } catch (err) {
    console.error("[instrumentation] broadcast guardian bootstrap failed:", err);
  }
}
