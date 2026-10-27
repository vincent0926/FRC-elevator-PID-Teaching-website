import { useCallback, useState } from 'react'
import { loadJson, saveJson } from './local'

/**
 * 存在 localStorage 的狀態，全站只用這一個 hook（電梯、手臂、射球飛輪共用）。
 * 一定要給 parse：把存檔（unknown）變成合法的值，不合法回傳 undefined 就用 fallback，
 * 不會把舊版或被改壞的存檔直接當成 T 用（CLAUDE.md：參數缺值時要警告並用安全預設）。
 */

/** 把存檔變成合法的值；不合法回傳 undefined */
export type Parse<T> = (raw: unknown) => T | undefined

export interface PersistOptions<T> {
  parse: Parse<T>
  /** 每次存檔後回報有沒有存成功（私密視窗、空間滿了會失敗） */
  onSaved?: (key: string, ok: boolean) => void
}

const MISSING = Symbol('missing')

export function readPersisted<T>(key: string, fallback: T, parse: Parse<T>): T {
  const raw = loadJson<unknown>(key, MISSING)
  if (raw === MISSING) return fallback
  const v = parse(raw)
  if (v !== undefined) return v
  console.warn(`elevator-tuner：瀏覽器裡存的「${key}」格式不對，改用預設值`)
  return fallback
}

export function usePersisted<T>(key: string, fallback: T, { parse, onSaved }: PersistOptions<T>): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => readPersisted(key, fallback, parse))
  const set = useCallback(
    (v: T) => {
      // 先更新畫面（不等存檔），再回報有沒有存成功；改完立刻換頁也已經存好了
      setValue(v)
      const ok = saveJson(key, v)
      onSaved?.(key, ok)
    },
    [key, onSaved],
  )
  return [value, set]
}

/** 用型別守衛檢查整個值 */
export const guard =
  <T>(is: (v: unknown) => v is T): Parse<T> =>
  (v) =>
    is(v) ? v : undefined

/**
 * 物件逐欄檢查：只留型別對、數字有限的欄位，其他用 fallback 的（舊版缺欄位、資料壞掉都不會讓頁面掛掉），
 * 補好之後再用 check 檢查欄位之間的關係。
 */
export function sanitize<T extends object>(fallback: T, saved: unknown): T {
  if (!saved || typeof saved !== 'object') return fallback
  const out = { ...fallback }
  for (const k of Object.keys(fallback) as (keyof T)[]) {
    const v = (saved as Partial<T>)[k]
    const ok = typeof v === typeof fallback[k] && (typeof v !== 'number' || Number.isFinite(v))
    if (ok) out[k] = v as T[keyof T]
  }
  return out
}

export const sanitized =
  <T extends object>(fallback: T, check: (v: T) => boolean = () => true): Parse<T> =>
  (raw) => {
    const v = sanitize(fallback, raw)
    return check(v) ? v : undefined
  }

// 常用的守衛
export const isNonNegative = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0
export const isBoolArray = (v: unknown): v is boolean[] => Array.isArray(v) && v.every((x) => typeof x === 'boolean')
export const isBoolRecord = (v: unknown): v is Record<string, boolean> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && Object.values(v).every((x) => typeof x === 'boolean')
export const oneOf =
  <T extends string>(...values: T[]) =>
  (v: unknown): v is T =>
    values.includes(v as T)
