/**
 * 畫面上的數字（參數卡、1F 計算結果、表格）：一般用固定小數位數，兩種情況改科學記號：
 *   太長：超過 maxLength 個字（例如機構資料填錯算出 1e15），不然一長串數字會把卡片和整頁撐寬
 *   太小：不是 0 卻四捨五入成 0（例如 kA = 3e-6 顯示成 0.0000，學生會以為是 0）；整數位數（digits = 0）不算
 * 不是有限數字就顯示「—」。
 */
export const MAX_LENGTH = 9

export function fixed(v: number, digits: number, maxLength = MAX_LENGTH): string {
  if (!Number.isFinite(v)) return '—'
  const s = v.toFixed(digits)
  const tiny = digits > 0 && v !== 0 && Number(s) === 0
  return tiny || s.length > maxLength ? v.toExponential(2) : s
}
