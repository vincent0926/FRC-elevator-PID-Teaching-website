import { useEffect, useRef } from 'react'

/**
 * 數值改變時底色閃一下（第一次出現不閃）。1F 改一個機構資料，看得出參數卡上動到的是哪幾個。
 * 動畫在 theme.css 的 .flash；系統設了「減少動態效果」就不會動。
 */
export function FlashValue({ value }: { value: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const prev = useRef(value)
  useEffect(() => {
    if (prev.current === value) return
    prev.current = value
    const el = ref.current
    if (!el) return
    // 先拿掉再加回去，連續改同一個數字時動畫才會重播
    el.classList.remove('flash')
    void el.offsetWidth
    el.classList.add('flash')
  }, [value])
  return <span ref={ref}>{value}</span>
}
