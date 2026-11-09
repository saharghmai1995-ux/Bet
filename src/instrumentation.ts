// ─────────────────────────────────────────────────────────────────────────────
// Next.js Instrumentation — v10.0
// بوت اتوماسیون سرور هنگام بالا آمدن پروسه (مستقل از مرورگر):
// تسویه خودکار ESPN + صف انتشار تلگرام + گزارش روزانه کانال
// ─────────────────────────────────────────────────────────────────────────────

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { startScheduler } = await import("@/lib/server/scheduler");
    startScheduler();
  } catch (err) {
    console.error("[instrumentation] scheduler bootstrap failed:", err);
  }
}
