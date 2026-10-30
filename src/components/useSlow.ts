import { useEffect, useState } from 'react'

/**
 * 算得比較久才亮：key 是「正在算的這一份輸入」，算完傳 null。
 * 同一份輸入超過 ms 還沒算完才回 true，滑桿拖動時每次都很快算完就不會閃（3F 的「計算中」）。
 */
export function useSlow(key: unknown, ms = 250): boolean {
  const [seen, setSeen] = useState<unknown>(null)
  useEffect(() => {
    if (key === null) return
    const id = setTimeout(() => setSeen(key), ms)
    return () => clearTimeout(id)
  }, [key, ms])
  return key !== null && seen === key
}
