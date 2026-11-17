// ─────────────────────────────────────────────────────────────────────────────
// حلقه فیدبک کالیبراسیون خودکار دسته‌های فلش‌کارت (Closed-Loop Category Calibration)
// سند v20.0 §۴: «برای هر یک از ۵ دسته فلش‌کارت، وین‌ریت و سود خالص واقعی (Category ROI)
// را از روی بازی‌های تسویه‌شده همان دسته محاسبه کن. اگر دسته‌ای Category ROI < 0% شد،
// سیستم کالیبراسیون به صورت خودکار وضعیت آن دسته را به تعلیق خودکار کالیبراسیون
// تغییر دهد و بازی‌های آن دسته را به بهترین دسته سودده بعدی هدایت کند.»
// ─────────────────────────────────────────────────────────────────────────────

import { db } from "@/lib/db";
import { getSetting, setSetting } from "./telegram-service";
import { computeMasterLedgerMetrics, type MasterLedgerMetrics } from "./master-metrics";

/** کلیدهای دسته‌های فلش‌کارت — v22.0: DEEP_VALUE (تک‌گزینه عمیق) + اسنایپر تاریخی */
export type CategoryKey = "DUAL_HEDGE" | "COMBO" | "BANKER" | "CS_CLUSTER" | "ACCUMULATOR" | "SNIPER" | "DEEP_VALUE";

export const CALIBRATION_SETTING_KEY = "category_calibration_state_v20";

/** حداقل نمونه تسویه‌شده برای تعلیق — زیر این تعداد، ROI منفی فقط «هشدار» است (حذف نویز ۱-۲ کارت) */
export const CALIBRATION_MIN_SAMPLE = 3;

export const CATEGORY_LABELS_FA: Record<CategoryKey, string> = {
  DUAL_HEDGE: "زوج‌تیپ دوقلو (منسوخ v22)",
  COMBO: "کمبوی رسمی (منسوخ v22)",
  CS_CLUSTER: "خوشه نتیجه دقیق (منسوخ v22)",
  BANKER: "🏦 تک‌ستون بنکر (خط ۳)",
  ACCUMULATOR: "🔗 میکس ۲ تایی هوشمند (خط ۱)",
  SNIPER: "شکارچی ضرایب بالا",
  DEEP_VALUE: "🎯 تک‌گزینه عمیق کالیبره‌شده (خط ۲)",
};

export interface CategoryCalibrationState {
  category: CategoryKey;
  labelFa: string;
  settled: number;
  wins: number;
  losses: number;
  winRatePct: number | null;
  netProfit: number;
  totalStaked: number;
  roiPct: number | null;
  suspended: boolean;
  suspendedAt: string | null;
  reason: string | null;
}

export interface CategoryCalibrationSnapshot {
  evaluatedAt: string;
  states: CategoryCalibrationState[];
  bestCategory: CategoryKey | null;
  suspendedCount: number;
}

function categoryOf(productLine: string | null): CategoryKey {
  switch (productLine) {
    case "COMBO":
      return "COMBO";
    case "CS_CLUSTER":
    case "CORRECT_SCORE":
      return "CS_CLUSTER";
    case "BANKER":
      return "BANKER";
    case "ACCUMULATOR":
      return "ACCUMULATOR";
    case "SNIPER":
      return "SNIPER";
    case "DEEP_VALUE":
      return "DEEP_VALUE";
    default:
      return "DUAL_HEDGE";
  }
}

function stateOf(key: CategoryKey, rows: { status: string; netProfit: number | null; stakeA: number; stakeB: number }[], prior: Map<CategoryKey, CategoryCalibrationState>): CategoryCalibrationState {
  const m: MasterLedgerMetrics = computeMasterLedgerMetrics(rows);
  const roiPct = m.yieldPct;
  const prev = prior.get(key);
  // تعلیق یک‌طرفه است: دسته تعلیق‌شده فقط با رسیدن ROI به بالای صفر رفع تعلیق می‌شود
  const shouldSuspend = roiPct !== null && roiPct < 0 && m.settled >= CALIBRATION_MIN_SAMPLE;
  const shouldRelease = roiPct !== null && roiPct >= 0;
  let suspended = false;
  let suspendedAt: string | null = null;
  let reason: string | null = null;
  if (shouldSuspend) {
    suspended = true;
    suspendedAt = prev?.suspendedAt ?? new Date().toISOString();
    reason = `تعلیق خودکار کالیبراسیون — Category ROI ${roiPct.toFixed(1)}٪ منفی روی ${m.settled} کارت تسویه‌شده (وین‌ریت ${m.winRatePct ?? 0}٪) — انتقال موقت به دفتر سایه تا رسیدن به آستانه اطمینان بالاتر`;
  } else if (shouldRelease) {
    suspended = false;
    suspendedAt = null;
    reason = null;
  } else {
    // نمونه کم — وضعیت قبلی حفظ می‌شود (بدون تغییر پریشانی نویز)
    suspended = prev?.suspended ?? false;
    suspendedAt = prev?.suspendedAt ?? null;
    reason = prev?.reason ?? null;
  }
  return {
    category: key,
    labelFa: CATEGORY_LABELS_FA[key],
    settled: m.settled,
    wins: m.wins,
    losses: m.losses,
    winRatePct: m.winRatePct,
    netProfit: m.netProfit,
    totalStaked: m.totalStaked,
    roiPct,
    suspended,
    suspendedAt,
    reason,
  };
}

/** کل وضعیت کالیبراسیون را از روی کارنامه واقعی بازمحاسبه و ذخیره می‌کند */
export async function evaluateCategoryCalibration(): Promise<CategoryCalibrationSnapshot> {
  const rows = await db.issuedSlip.findMany({
    where: { supervisorApproved: true, retroIssued: false },
    select: { status: true, netProfit: true, stakeA: true, stakeB: true, productLine: true, crownTier: true },
  });
  // کارت‌های تاج نقره‌ای کتاب مجزای خودشان هستند — در کالیبراسیون دسته‌های اصلی شمرده نمی‌شوند
  const gold = rows.filter((r) => r.crownTier !== "SILVER_SHADOW");
  const byCat = new Map<CategoryKey, { status: string; netProfit: number | null; stakeA: number; stakeB: number }[]>();
  for (const r of gold) {
    const k = categoryOf(r.productLine ?? null);
    const arr = byCat.get(k) ?? [];
    arr.push({ status: r.status, netProfit: r.netProfit, stakeA: r.stakeA, stakeB: r.stakeB });
    byCat.set(k, arr);
  }

  // وضعیت قبلی (برای حفظ suspendedAt)
  const prior = new Map<CategoryKey, CategoryCalibrationState>();
  try {
    const raw = await getSetting(CALIBRATION_SETTING_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as CategoryCalibrationSnapshot;
      for (const st of parsed.states ?? []) prior.set(st.category, st);
    }
  } catch {
    // snapshot خراب — از صفر می‌سازیم
  }

  const keys: CategoryKey[] = ["DEEP_VALUE", "BANKER", "ACCUMULATOR", "DUAL_HEDGE", "COMBO", "CS_CLUSTER", "SNIPER"];
  const states = keys.map((k) => stateOf(k, byCat.get(k) ?? [], prior));
  const active = states.filter((s) => !s.suspended && s.roiPct !== null && s.roiPct > 0);
  const bestCategory = active.length > 0
    ? active.reduce((a, b) => (b.roiPct! > a.roiPct! ? b : a)).category
    : null;

  const snapshot: CategoryCalibrationSnapshot = {
    evaluatedAt: new Date().toISOString(),
    states,
    bestCategory,
    suspendedCount: states.filter((s) => s.suspended).length,
  };
  await setSetting(CALIBRATION_SETTING_KEY, JSON.stringify(snapshot)).catch(() => undefined);
  return snapshot;
}

/** خواندن سریع وضعیت از کش Setting (بدون بازمحاسبه) — برای مسیر صدور کارت */
export async function getCachedCalibration(): Promise<CategoryCalibrationSnapshot | null> {
  try {
    const raw = await getSetting(CALIBRATION_SETTING_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CategoryCalibrationSnapshot;
  } catch {
    return null;
  }
}

/** مجموعه دسته‌های تعلیق‌شده؛ اگر کش قدیمی‌تر از ۱۰ دقیقه بود بازمحاسبه می‌کند */
export async function getSuspendedCategories(): Promise<Set<CategoryKey>> {
  let snap = await getCachedCalibration();
  const stale = !snap || Date.now() - new Date(snap.evaluatedAt).getTime() > 10 * 60_000;
  if (stale) {
    try {
      snap = await evaluateCategoryCalibration();
    } catch {
      snap = snap ?? null;
    }
  }
  return new Set((snap?.states ?? []).filter((s) => s.suspended).map((s) => s.category));
}

/** بهترین دسته سودده فعال (برای هدایت کارت‌های دسته تعلیق‌شده) */
export async function getBestActiveCategory(): Promise<CategoryKey | null> {
  let snap = await getCachedCalibration();
  const stale = !snap || Date.now() - new Date(snap.evaluatedAt).getTime() > 10 * 60_000;
  if (stale) {
    try {
      snap = await evaluateCategoryCalibration();
    } catch {
      snap = snap ?? null;
    }
  }
  return snap?.bestCategory ?? null;
}
