// ─────────────────────────────────────────────
// ابزارهای فرمت‌بندی فارسی (اعداد فارسی، درصد، پول)
// ─────────────────────────────────────────────

const FA_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];

/** تبدیل ارقام لاتین به فارسی */
export function faNum(value: number | string, decimals = 2): string {
  const num = typeof value === "number" ? value : parseFloat(value);
  if (Number.isNaN(num)) return "—";
  const fixed = Math.abs(num) >= 1000
    ? Math.round(num).toLocaleString("en-US")
    : num.toFixed(decimals);
  return fixed.replace(/[0-9]/g, (d) => FA_DIGITS[parseInt(d)]).replace(/-/g, "−");
}

/** درصد فارسی */
export function faPct(value: number, decimals = 1): string {
  return `${faNum(value * 100, decimals)}٪`;
}

/** درصد با علامت (+/−) */
export function faPctSigned(value: number, decimals = 1): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${faNum(value * 100, decimals)}٪`;
}

/** مبلغ واحد */
export function faMoney(value: number, decimals = 1): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${faNum(value, decimals)}`;
}

/** ضرایب (لاتین خواناتر است اما با ارقام فارسی نمایش داده می‌شود) */
export function faOdds(value: number): string {
  return faNum(value, 2);
}

export function signed(value: number): string {
  return value > 0 ? "+" : value < 0 ? "−" : "";
}
