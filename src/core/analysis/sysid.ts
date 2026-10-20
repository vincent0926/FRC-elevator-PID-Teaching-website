import type { ParameterSet } from '../../schema/parameterSet'
import { t } from '../lang'

/**
 * 4F 單元二：SysId 量到的前饋參數跟理論值比較，並指出可能填錯的機構資料。
 *
 * 用哪個欄位做分析，SysId 的單位就是哪個：
 *   AdvantageKit 範例記的是公尺（/Elevator/PositionMeters）→ V/(m/s)，跟網站內部一樣
 *   Phoenix 6 SignalLogger 記的是機構轉數 → V/rps，要除以每圈公尺數
 *
 * 判斷依據（理論公式 kG = m_G·g·r/G·R/(n·kT)、kV = G/(r·Kv)、kA = m_A·r·R/(G·n·kT)）：
 *   齒比或半徑錯 f 倍 → kV × f、kG ÷ f（兩個反方向）
 *   質量錯 → kG、kA 同方向，kV 不變
 *   座標用了最上層高度 → kV、kA 差一個速度比
 */

export type SysIdUnits = 'meters' | 'rotations'

export interface FfGains {
  kS: number
  kG: number
  kV: number
  kA: number
}

export type Level = 'ok' | 'warn' | 'bad'

export interface SysIdRow {
  key: keyof FfGains
  theory: number
  measured: number
  /** measured / theory；理論值是 0（kS）時為 null */
  ratio: number | null
  level: Level
  hint: string
}

export interface SysIdComparison {
  rows: SysIdRow[]
  /** 綜合幾個參數一起看的推論，最可能的排前面 */
  findings: string[]
}

export function sysIdToSi(g: FfGains, units: SysIdUnits, metersPerRotation: number): FfGains {
  if (units === 'meters') return { ...g }
  return { kS: g.kS, kG: g.kG, kV: g.kV / metersPerRotation, kA: g.kA / metersPerRotation }
}

/** 誤差門檻：kV 最好量，kA 最難量 */
const TOL: Record<'kG' | 'kV' | 'kA', [number, number]> = {
  kV: [0.1, 0.2],
  kG: [0.15, 0.3],
  kA: [0.3, 0.6],
}

const pct = (r: number) => `${r >= 1 ? '+' : ''}${((r - 1) * 100).toFixed(0)}%`
const near = (a: number, b: number, tol = 0.08) => Math.abs(a / b - 1) < tol

function level(key: 'kG' | 'kV' | 'kA', ratio: number): Level {
  const d = Math.abs(ratio - 1)
  return d <= TOL[key][0] ? 'ok' : d <= TOL[key][1] ? 'warn' : 'bad'
}

/**
 * @param topSpeedRatio 最上層的速度比（串級式兩級 = 2），用來認出「座標用錯」
 */
export function compareSysId(theory: FfGains, measured: FfGains, topSpeedRatio = 1): SysIdComparison {
  const rows: SysIdRow[] = []
  const findings: string[] = []

  // kS：理論沒算，只看合不合理
  const s = measured.kS
  rows.push({
    key: 'kS',
    theory: theory.kS,
    measured: s,
    ratio: null,
    level: s < 0 || s > 1 ? 'bad' : s > 0.5 ? 'warn' : 'ok',
    hint:
      s < 0
        ? t('負的摩擦不合理：資料有問題，檢查準靜態測試的 ramp 是不是太快、有沒有撞到限位的資料。', 'Negative friction makes no sense: the data has a problem. Check whether the quasistatic ramp was too fast or the data hit a limit.')
        : s > 1
          ? t('摩擦超過 1 V 太大了：檢查滑軌有沒有卡、鏈條或皮帶是不是太緊、軸承有沒有歪。', 'Friction over 1 V is too much: check whether the slides bind, the chain or belt is too tight, or a bearing is crooked.')
          : s > 0.5
            ? t('摩擦偏大（電梯通常 0.1–0.4 V），順便檢查機構有沒有卡。', 'Friction is on the high side (elevators are usually 0.1–0.4 V); check the mechanism for binding while you’re at it.')
            : t('理論沒辦法算摩擦，直接用量到的值。', 'Theory can’t calculate friction; use the measured value directly.'),
  })

  const r = {
    kG: measured.kG / theory.kG,
    kV: measured.kV / theory.kV,
    kA: measured.kA / theory.kA,
  }
  const hints: Record<'kG' | 'kV' | 'kA', [string, string, string]> = {
    kG: [
      t('跟理論差不多。', 'About the same as theory.'),
      t('比理論大：實際比量的重（線材、螺絲、遊戲物件），或配重、彈簧的力比填的小，或齒輪箱效率低。', 'Higher than theory: it’s really heavier than measured (wiring, screws, game piece), or the counterweight/spring force is less than entered, or gearbox efficiency is low.'),
      t('比理論小：質量填太大，或配重、定力彈簧的力沒填。', 'Lower than theory: the mass entered is too big, or the counterweight / constant-force spring force wasn’t entered.'),
    ],
    kV: [
      t('跟理論差不多，齒比、半徑、馬達都填對了。', 'About the same as theory; gear ratio, radius and motor are all entered correctly.'),
      t('比理論大：齒比填太小、鼓輪半徑填太大，或馬達型號選錯（FOC 與否也會差）。也可能是摩擦隨速度變大（黏滯摩擦）。', 'Higher than theory: gear ratio entered too small, drum radius too big, or the wrong motor model (FOC or not matters too). Friction growing with speed (viscous friction) is also possible.'),
      t('比理論小：齒比填太大或鼓輪半徑填太小。', 'Lower than theory: gear ratio entered too big or drum radius too small.'),
    ],
    kA: [
      t('在 SysId 能量得準的範圍內。', 'Within the range SysId can measure accurately.'),
      t('比理論大：動態測試時間太短、撞到限位，或串級式等效質量少算了（慣性要用 Σmᵢkᵢ²）。kA 本來就難量，差 30% 內都算正常。', 'Higher than theory: dynamic test too short, hit a limit, or the cascade equivalent mass was undercounted (inertia uses Σmᵢkᵢ²). kA is hard to measure anyway; within 30% is normal.'),
      t('比理論小：動態測試的電壓不夠大、加速度不明顯，這個值通常不準，先用理論值。', 'Lower than theory: the dynamic test voltage wasn’t high enough and acceleration wasn’t clear; this value is usually unreliable, so use theory for now.'),
    ],
  }
  for (const key of ['kG', 'kV', 'kA'] as const) {
    const ratio = r[key]
    const lv = Number.isFinite(ratio) && measured[key] > 0 ? level(key, ratio) : 'bad'
    const hint = !(measured[key] > 0) ? t('量到 0 或負值：資料有問題，這個參數先用理論值。', 'Measured 0 or negative: the data has a problem; use theory for this gain for now.') : lv === 'ok' ? hints[key][0] : ratio > 1 ? hints[key][1] : hints[key][2]
    rows.push({ key, theory: theory[key], measured: measured[key], ratio: Number.isFinite(ratio) ? ratio : null, level: lv, hint })
  }

  const valid = measured.kG > 0 && measured.kV > 0 && measured.kA > 0
  if (valid) {
    const kvOff = Math.abs(r.kV - 1) > TOL.kV[0]
    const kgOff = Math.abs(r.kG - 1) > TOL.kG[0]
    if (topSpeedRatio > 1 && (near(r.kV, topSpeedRatio) || near(r.kV, 1 / topSpeedRatio)) && (near(r.kA, r.kV, 0.35) || !kgOff)) {
      findings.push(
        t(`kV 差了剛好一個速度比（×${topSpeedRatio}）：SysId 用的位置欄位和網站的座標不一樣（一個是鼓輪線位移、一個是最上層高度）。先統一座標再比。`, `kV is off by exactly one speed ratio (×${topSpeedRatio}): the position field SysId used and the site’s coordinates differ (one is drum rope displacement, the other top stage height). Use the same coordinates before comparing.`),
      )
    }
    if (kvOff && kgOff && Math.sign(r.kV - 1) !== Math.sign(r.kG - 1) && near(r.kV * r.kG, 1, 0.15)) {
      findings.push(t(`kV ${pct(r.kV)}、kG ${pct(r.kG)}，一個變大一個變小而且剛好抵消：最可能是齒比或鼓輪半徑填錯了。回 1F 檢查。`, `kV ${pct(r.kV)}, kG ${pct(r.kG)}: one up and one down, cancelling out: most likely the gear ratio or drum radius is entered wrong. Check 1F.`))
    }
    if (!kvOff && kgOff && Math.sign(r.kG - 1) === Math.sign(r.kA - 1) && Math.abs(r.kA - 1) > 0.15) {
      findings.push(t(`kV 對、kG 和 kA 往同一邊偏（kG ${pct(r.kG)}、kA ${pct(r.kA)}）：最可能是質量填錯。回 1F 量一次實際重量。`, `kV is right, kG and kA are off the same way (kG ${pct(r.kG)}, kA ${pct(r.kA)}): most likely the mass is entered wrong. Weigh it in 1F.`))
    }
    if (!kvOff && kgOff && findings.length === 0) {
      findings.push(t(`只有 kG 不一樣（${pct(r.kG)}）：檢查配重、定力彈簧的力，或拖鏈、線材在不同高度的重量。`, `Only kG differs (${pct(r.kG)}): check the counterweight and constant-force spring forces, or how the drag chain and wiring weigh at different heights.`))
    }
    if (findings.length === 0 && rows.every((x) => x.level === 'ok')) {
      findings.push(t('量測和理論值都對得上，機構資料填得很準。前饋可以直接用 SysId 的值（摩擦 kS 只能靠量）。', 'Measurement and theory agree; the mechanism data is accurate. Feedforward can use the SysId values directly (friction kS can only be measured).'))
    }
  } else {
    findings.push(t('有參數是 0 或負值，這次 SysId 的資料不能用。檢查測試有沒有撞到限位、電壓設定是不是太小。', 'Some gains are 0 or negative, so this SysId data can’t be used. Check whether the test hit a limit or the voltage setting was too small.'))
  }
  return { rows, findings }
}

/** 用 SysId 量到的前饋建立參數組；回授與 Motion Magic 沿用 base */
export function measuredParameterSet(base: ParameterSet, measured: FfGains, note: string): ParameterSet {
  return {
    ...base,
    source: 'measured',
    createdAt: new Date().toISOString(),
    note,
    feedforward: { ...measured },
    slotByDirection: undefined,
  }
}
