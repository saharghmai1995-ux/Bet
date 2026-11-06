// ─────────────────────────────────────────────────────────────────────────────
// صف محدودکننده نرخ LLM — Token Bucket Limiter (v5.0)
// قاعده: حداکثر ۱ درخواست LLM در هر ۱۵ ثانیه (سراسری، بین همه بازی‌ها).
// درخواست‌های مازاد در صف منتظر می‌مانند؛ اگر انتظار از سقف بگذرد،
// RateLimitedError پرتاب می‌شود تا فراخوان به موتور کمّی محلی fallback کند.
// ─────────────────────────────────────────────────────────────────────────────

const MIN_GAP_MS = 15_000; // حداکثر ۱ درخواست در ۱۵ ثانیه
const MAX_WAIT_MS = 32_000; // سقف انتظار در صف (سپس RateLimitedError)

let lastCallAt = 0;
let chain: Promise<unknown> = Promise.resolve();

export class RateLimitedError extends Error {
  readonly retryAfterMs: number;
  constructor(retryAfterMs: number) {
    super("LLM Rate-Limit: صف شلوغ است — به موتور کمّی محلی منتقل شد");
    this.name = "RateLimitedError";
    this.retryAfterMs = retryAfterMs;
  }
}

/** آمار زنده صف برای نشانگر سپر در هدر */
export const llmLimiterStats = {
  served: 0, // درخواست‌هایی که اسلات گرفتند
  queued: 0, // دفعاتی که در صف صف شدند
  rejected: 0, // دفعاتی که RateLimitedError گرفتند
  lastServedAt: 0,
};

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * اجرای fn در اسلات مجاز. اگر ۱۵ ثانیه از آخرین درخواست نگذشته باشد،
 * در صف سراسری منتظر می‌ماند (FIFO). انتظار طولانی = RateLimitedError.
 */
export function runWithLlmSlot<T>(fn: () => Promise<T>): Promise<T> {
  const exec = async (): Promise<T> => {
    const now = Date.now();
    const waitMs = lastCallAt > 0 ? lastCallAt + MIN_GAP_MS - now : 0;
    if (waitMs > 0) {
      llmLimiterStats.queued += 1;
      if (waitMs > MAX_WAIT_MS) {
        llmLimiterStats.rejected += 1;
        throw new RateLimitedError(waitMs);
      }
      await wait(waitMs);
    }
    lastCallAt = Date.now();
    llmLimiterStats.served += 1;
    llmLimiterStats.lastServedAt = lastCallAt;
    return fn();
  };
  const run = chain.then(exec, exec);
  chain = run.catch(() => undefined);
  return run;
}

/** ثانیه‌های باقی‌مانده تا آزادشدن اسلات بعدی (برای retryAfter پاسخ API) */
export function llmSlotRetryAfterSec(): number {
  const remain = lastCallAt + MIN_GAP_MS - Date.now();
  return remain > 0 ? Math.ceil(remain / 1000) : 0;
}
