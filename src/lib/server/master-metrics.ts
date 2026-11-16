// ─────────────────────────────────────────────────────────────────────────────
// منبع واحد حقیقت حسابداری کارنامه (Single Source of Truth) — v20.0
// سند v20.0 §۳: «یک تابع واحد computeMasterLedgerMetrics بنویس که بدون حذف کردن
// هیچ رژیم زیان‌ده، دقیقاً از روی همان ردیف‌های تاییدشده، تعداد کل، برد، باخت،
// وین‌ریت واقعی، سود خالص کل، رشد بانک و Yield/ROI واقعی روی حجم استیک را محاسبه
// کند و در تمام باکس‌های صفحه یک عدد واحد و همخوان نمایش دهد.»
// ─────────────────────────────────────────────────────────────────────────────

/** ورودی استاندارد تابع — هر ردیف کارت کارنامه با حداقل فیلدهای لازم */
export interface MasterCardRow {
  status: string;
  netProfit: number | null;
  stakeA: number;
  stakeB: number;
}

/** وضعیت‌های تسویه‌شده معتبر (بدون VOID/MANUAL_REVIEW — آن‌ها پولی ندارند) */
export const MASTER_SETTLED = ["WON_A", "WON_B", "DOUBLE_WIN", "MIDDLE_TRAP"] as const;
/** وضعیت‌های برد — واحد تعریف برد در کل سیستم فقط همین است (رفع تعریف‌های ناهمخوان قبلی) */
export const MASTER_WIN = ["WON_A", "WON_B", "DOUBLE_WIN"] as const;

/** بانک مرجع ۱۰۰۰ واحدی سند ارتقا — مبنای «رشد بانک» */
export const MASTER_START_BANK = 1000;

export interface MasterLedgerMetrics {
  /** کل کارت‌های ورودی (همه ردیف‌ها — بدون حذف هیچ رژیم زیان‌ده) */
  total: number;
  pending: number;
  live: number;
  wonA: number;
  wonB: number;
  doubleWin: number;
  middleTrap: number;
  manual: number;
  void: number;
  /** تعداد تسویه‌شده (WON_A/WON_B/DOUBLE_WIN/MIDDLE_TRAP) */
  settled: number;
  /** تعداد برد (WON_A + WON_B + DOUBLE_WIN) */
  wins: number;
  /** تعداد باخت کامل (MIDDLE_TRAP) */
  losses: number;
  /** وین‌ریت واقعی = wins ÷ settled × ۱۰۰ (null اگر تسویه‌ای نیست) */
  winRatePct: number | null;
  /** سود خالص کل بر حسب واحد — جمع صادقانه همه تسویه‌ها شامل باخت‌های کامل */
  netProfit: number;
  /** حجم کل استیک تسویه‌شده بر حسب واحد */
  totalStaked: number;
  /** Yield/ROI واقعی روی حجم استیک = netProfit ÷ totalStaked × ۱۰۰ */
  yieldPct: number | null;
  /** رشد بانک ۱۰۰۰ واحدی = netProfit ÷ ۱۰۰۰ × ۱۰۰ */
  bankGrowthPct: number;
  /** بانک پایانی از ۱۰۰۰ واحد */
  finalBank: number;
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const r1 = (v: number) => Math.round(v * 10) / 10;

/**
 * قلب حسابداری v20.0 — تنها تابع مجاز محاسبه آمار کارنامه.
 * هیچ باکسی در UI، هیچ گزارش تلگرامی و هیچ API دیگری اجازه محاسبه مجزا ندارد؛
 * همه از خروجی همین تابع استفاده می‌کنند تا اعداد بین باکس‌ها هرگز تضاد نداشته باشند.
 */
export function computeMasterLedgerMetrics(cards: MasterCardRow[]): MasterLedgerMetrics {
  const m: MasterLedgerMetrics = {
    total: cards.length,
    pending: 0,
    live: 0,
    wonA: 0,
    wonB: 0,
    doubleWin: 0,
    middleTrap: 0,
    manual: 0,
    void: 0,
    settled: 0,
    wins: 0,
    losses: 0,
    winRatePct: null,
    netProfit: 0,
    totalStaked: 0,
    yieldPct: null,
    bankGrowthPct: 0,
    finalBank: MASTER_START_BANK,
  };

  for (const c of cards) {
    switch (c.status) {
      case "PENDING":
        m.pending += 1;
        break;
      case "LIVE":
        m.live += 1;
        break;
      case "MANUAL_REVIEW":
        m.manual += 1;
        break;
      case "VOID":
        m.void += 1;
        break;
      default:
        if ((MASTER_SETTLED as readonly string[]).includes(c.status)) {
          m.settled += 1;
          // v20.0 — بدون حذف هیچ رژیم زیان‌ده: باخت کامل دقیقاً با همان عدد صادقانه منفی جمع می‌شود
          m.netProfit += c.netProfit ?? 0;
          m.totalStaked += (c.stakeA ?? 0) + (c.stakeB ?? 0);
          if (c.status === "WON_A") m.wonA += 1;
          else if (c.status === "WON_B") m.wonB += 1;
          else if (c.status === "DOUBLE_WIN") m.doubleWin += 1;
          else if (c.status === "MIDDLE_TRAP") m.middleTrap += 1;
        }
        break;
    }
  }

  m.wins = m.wonA + m.wonB + m.doubleWin;
  m.losses = m.middleTrap;
  m.winRatePct = m.settled > 0 ? r1((m.wins / m.settled) * 100) : null;
  m.netProfit = r2(m.netProfit);
  m.totalStaked = r2(m.totalStaked);
  m.yieldPct = m.totalStaked > 0 ? r1((m.netProfit / m.totalStaked) * 100) : null;
  m.bankGrowthPct = r1((m.netProfit / MASTER_START_BANK) * 100);
  m.finalBank = r2(MASTER_START_BANK + m.netProfit);
  return m;
}

/** محاسبه سطرهای master از خروجی getLedger-like (کارت‌های DTO) — پل راحت برای APIها */
export function masterMetricsOfRows(
  rows: { status: string; netProfit: number | null; stakeA: number; stakeB: number }[]
): MasterLedgerMetrics {
  return computeMasterLedgerMetrics(rows);
}
