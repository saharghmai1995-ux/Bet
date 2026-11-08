// ─────────────────────────────────────────────────────────────────────────────
// وضعیت اتوماسیون سرور (Scheduler Heartbeat) — v10.0
// ماژول کوچک بدون وابستگی — هم توسط خود زمان‌بند و هم توسط getLedger خوانده می‌شود
// ─────────────────────────────────────────────────────────────────────────────

export interface SchedulerStatus {
  active: boolean;
  startedAt: number | null;
  lastTickAt: number | null;
  lastDailyReportAt: number | null;
  tickCount: number;
  intervalSec: number;
}

// globalThis — در dev با hot-reload و در چند ماژول یکی بماند
const g = globalThis as unknown as { __fqSchedulerStatus?: SchedulerStatus };

g.__fqSchedulerStatus = g.__fqSchedulerStatus ?? {
  active: false,
  startedAt: null,
  lastTickAt: null,
  lastDailyReportAt: null,
  tickCount: 0,
  intervalSec: 90,
};

export function getSchedulerStatus(): SchedulerStatus {
  return g.__fqSchedulerStatus!;
}

export function patchSchedulerStatus(patch: Partial<SchedulerStatus>): SchedulerStatus {
  Object.assign(g.__fqSchedulerStatus!, patch);
  return g.__fqSchedulerStatus!;
}
