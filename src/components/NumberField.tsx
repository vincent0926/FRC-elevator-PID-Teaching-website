import { useEffect, useId, useState } from 'react'

/**
 * 數字欄位：輸入到一半（空白、「0.」）時不回寫，合法才送出。
 * 顯示倍率 display 讓內部存 SI、畫面顯示常用單位（例如 m → mm）。
 */

export interface NumberFieldProps {
  label: string
  value: number
  onChange: (v: number) => void
  unit?: string
  min?: number
  max?: number
  step?: number
  display?: number
  digits?: number
  hint?: string
}

function fmt(v: number, digits?: number) {
  if (!Number.isFinite(v)) return ''
  return digits === undefined ? String(Number(v.toPrecision(8))) : v.toFixed(digits)
}

export function NumberField({ label, value, onChange, unit, min, max, step, display = 1, digits, hint }: NumberFieldProps) {
  const id = useId()
  const [text, setText] = useState(() => fmt(value * display, digits))
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (!focused) setText(fmt(value * display, digits))
  }, [value, display, digits, focused])

  const parsed = Number(text)
  const valid = text.trim() !== '' && Number.isFinite(parsed) && (min === undefined || parsed >= min) && (max === undefined || parsed <= max)

  return (
    <label className="f" htmlFor={id}>
      {label}
      <span className={'inp' + (valid ? '' : ' bad')}>
        <input
          id={id}
          type="number"
          inputMode="decimal"
          value={text}
          min={min}
          max={max}
          step={step ?? 'any'}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(e) => {
            setText(e.target.value)
            const v = Number(e.target.value)
            if (e.target.value.trim() !== '' && Number.isFinite(v) && (min === undefined || v >= min) && (max === undefined || v <= max)) onChange(v / display)
          }}
          aria-invalid={!valid}
        />
        {unit && <em>{unit}</em>}
      </span>
      {hint && <span className="muted small">{hint}</span>}
    </label>
  )
}
