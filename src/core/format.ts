/**
 * 參數卡的數字：一般用固定小數位數；離譜的大數字（例如機構資料填錯）改科學記號，
 * 不然一長串數字會把參數卡和整頁撐寬。不是有限數字就顯示「—」。
 */
export function fixed(v: number, digits: number): string {
  if (!Number.isFinite(v)) return '—'
  return Math.abs(v) >= 1e5 ? v.toExponential(2) : v.toFixed(digits)
}
