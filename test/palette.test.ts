import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * 配色風格（決策 138）：每種風格的淺色、深色都要完整，小字對比到 WCAG AA（4.5:1）。
 * 直接讀 theme.css 的變數區塊算，不開瀏覽器。
 */

const css = readFileSync(new URL('../src/app/theme.css', import.meta.url), 'utf8')

/** 找出「選擇器 {」後面那一段的 --變數 */
function block(selector: string): Record<string, string> {
  const i = css.indexOf(selector + ' {')
  if (i < 0) throw new Error(`theme.css 找不到 ${selector}`)
  const body = css.slice(i + selector.length + 2, css.indexOf('}', i))
  const vars: Record<string, string> = {}
  for (const m of body.matchAll(/(--[\w-]+):\s*([^;]+);/g)) vars[m[1]] = m[2].trim()
  return vars
}

const ROOT = block(':root')
const DEFAULT_DARK = block(':root[data-theme="dark"]')
const PALETTES = ['team', 'nordic', 'tech', 'cute'] as const
/** 不是顏色的變數：深色段不用重寫 */
const NOT_COLOR = new Set(['--radius', '--radius-sm', '--font', '--mono'])

function themes(): [string, Record<string, string>][] {
  const out: [string, Record<string, string>][] = [
    ['default light', ROOT],
    ['default dark', { ...ROOT, ...DEFAULT_DARK }],
  ]
  for (const p of PALETTES) {
    const light = block(`:root[data-palette="${p}"]`)
    out.push([`${p} light`, { ...ROOT, ...light }])
    out.push([`${p} dark`, { ...ROOT, ...light, ...block(`:root[data-palette="${p}"][data-theme="dark"]`) }])
  }
  return out
}

function lum(hex: string): number {
  const m = hex.match(/^#([0-9a-f]{6})$/i)
  if (!m) throw new Error(`不是 #RRGGBB：${hex}`)
  const c = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4))
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}

function contrast(a: string, b: string): number {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

/** [字, 底]：畫面上真的會把這個字放在這個底上的組合 */
const PAIRS: [string, string][] = [
  ['--ink', '--bg'], ['--ink-2', '--panel'], ['--ink-2', '--panel-2'],
  ['--ink-3', '--bg'], ['--ink-3', '--panel'], ['--ink-3', '--panel-2'], ['--ink-3', '--blue-soft'],
  ['--yellow-ink', '--yellow'], ['--blue', '--bg'], ['--blue', '--panel'], ['--blue', '--blue-soft'],
  ['--red', '--red-soft'], ['--green', '--green-soft'], ['--amber', '--amber-soft'], ['--ink', '--amber-soft'],
  ['--shaft-ink-2', '--shaft'], ['--shaft-ink-2', '--shaft-2'], ['--shaft-ink-strong', '--shaft'],
  ['--ink-3', '--amber-soft'], ['--mark-ink', '--mark'],
]

/** 不是字的組合：面板要跟背景分得開、輸入框邊線要看得到（不要求 4.5:1，要求不糊在一起） */
const SURFACES: [string, string, number][] = [
  ['--panel', '--bg', 1.08], ['--line', '--panel', 1.35], ['--line', '--panel-2', 1.25],
]

describe('配色風格', () => {
  it('系統深色和手動深色兩段一樣', () => {
    for (const p of PALETTES) {
      const media = css.match(new RegExp(`:root\\[data-palette="${p}"\\]:not\\(\\[data-theme="light"\\]\\) \\{([^}]*)\\}`))
      expect(media, p).not.toBeNull()
      const manual = block(`:root[data-palette="${p}"][data-theme="dark"]`)
      const vars: Record<string, string> = {}
      for (const m of media![1].matchAll(/(--[\w-]+):\s*([^;]+);/g)) vars[m[1]] = m[2].trim()
      expect(vars, p).toEqual(manual)
    }
  })

  it('深色段把淺色段的顏色變數全部重寫（淺色的值不會漏到深色）', () => {
    for (const p of PALETTES) {
      const light = Object.keys(block(`:root[data-palette="${p}"]`)).filter((k) => !NOT_COLOR.has(k))
      const dark = block(`:root[data-palette="${p}"][data-theme="dark"]`)
      expect(light.filter((k) => !(k in dark)), p).toEqual([])
    }
  })

  it('每種風格都有預設風格的所有顏色變數', () => {
    for (const p of PALETTES) {
      const light = block(`:root[data-palette="${p}"]`)
      const missing = Object.keys(ROOT).filter((k) => !NOT_COLOR.has(k) && !(k in light))
      expect(missing, p).toEqual([])
    }
  })

  it.each(themes())('%s：小字對比至少 4.5:1', (_name, v) => {
    const bad = PAIRS.map(([fg, bg]) => [fg, bg, contrast(v[fg], v[bg])] as const)
      .filter(([, , c]) => c < 4.5)
      .map(([fg, bg, c]) => `${fg} 在 ${bg} 上 ${c.toFixed(2)}`)
    expect(bad).toEqual([])
  })

  it.each(themes())('%s：面板、邊線分得出來', (_name, v) => {
    const bad = SURFACES.map(([a, b, min]) => [a, b, contrast(v[a], v[b]), min] as const)
      .filter(([, , c, min]) => c < min)
      .map(([a, b, c, min]) => `${a} 對 ${b} ${c.toFixed(2)}（至少 ${min}）`)
    expect(bad).toEqual([])
  })
})
