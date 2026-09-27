import type { Series, WpilogEntryInfo } from './reader'
import { NUMERIC_TYPES } from './wpilog'

/**
 * 欄位對應：把日誌裡的欄位名稱對到分析需要的「角色」。
 * robot-example/ 的欄位名稱會被精準命中；其他隊伍的命名用關鍵字猜，再讓使用者手動修正。
 * 每個角色有倍率（scale），用來把轉數制（rot、rps）換成公尺。
 */

export type RoleKey =
  | 'position'
  | 'velocity'
  | 'reference'
  | 'referenceSlope'
  | 'appliedVolts'
  | 'statorCurrent'
  | 'supplyVoltage'
  | 'closedLoopOutput'
  | 'feedforwardOutput'
  | 'enabled'

export interface RoleDef {
  key: RoleKey
  label: string
  unit: string
  required: boolean
  /** 倍率是否可能需要「每圈公尺數」 */
  lengthUnit: boolean
  /** 由精準到寬鬆，越前面分數越高 */
  patterns: RegExp[]
}

export const ROLES: RoleDef[] = [
  { key: 'position', label: '位置', unit: 'm', required: true, lengthUnit: true, patterns: [/\/PositionMeters$/i, /elevator.*\/position/i, /\/position$/i, /height/i] },
  { key: 'velocity', label: '速度', unit: 'm/s', required: true, lengthUnit: true, patterns: [/\/VelocityMetersPerSec$/i, /elevator.*\/velocity/i, /\/velocity$/i] },
  { key: 'reference', label: '目標位置（閉迴路參考）', unit: 'm', required: true, lengthUnit: true, patterns: [/\/ClosedLoopReferenceMeters$/i, /ClosedLoopReference$/i, /setpoint(position)?$/i, /\/goal/i] },
  { key: 'referenceSlope', label: '參考速度', unit: 'm/s', required: false, lengthUnit: true, patterns: [/\/ClosedLoopReferenceSlopeMetersPerSec$/i, /ReferenceSlope/i, /setpointvelocity/i] },
  { key: 'appliedVolts', label: '輸出電壓', unit: 'V', required: true, lengthUnit: false, patterns: [/\/AppliedVolts$/i, /MotorVoltage$/i, /appliedvolt/i, /volts?$/i] },
  { key: 'statorCurrent', label: 'Stator 電流', unit: 'A', required: false, lengthUnit: false, patterns: [/\/StatorCurrentAmps$/i, /statorcurrent/i, /current(amps)?$/i] },
  { key: 'supplyVoltage', label: '電池電壓', unit: 'V', required: false, lengthUnit: false, patterns: [/SystemStats\/BatteryVoltage$/i, /batteryvoltage/i, /\/SupplyVoltage$/i] },
  { key: 'closedLoopOutput', label: '回授輸出（P+I+D）', unit: 'V', required: false, lengthUnit: false, patterns: [/\/ClosedLoopOutputVolts$/i, /ClosedLoopOutput$/i] },
  { key: 'feedforwardOutput', label: '前饋輸出', unit: 'V', required: false, lengthUnit: false, patterns: [/\/ClosedLoopFeedForwardVolts$/i, /ClosedLoopFeedForward$/i] },
  { key: 'enabled', label: '機器人 Enable', unit: '', required: false, lengthUnit: false, patterns: [/DriverStation\/Enabled$/i, /\/Enabled$/i] },
]

export interface RoleMapping {
  entry: string | null
  scale: number
}

export type FieldMapping = Record<RoleKey, RoleMapping>

/** 手臂（robot-example 的 ArmIO）欄位名稱，優先於通用的關鍵字 */
const ARM_PATTERNS: Partial<Record<RoleKey, RegExp[]>> = {
  position: [/\/PositionRad$/i, /arm.*\/(position|angle)/i],
  velocity: [/\/VelocityRadPerSec$/i, /arm.*\/velocity/i],
  reference: [/\/ClosedLoopReferenceRad$/i],
  referenceSlope: [/\/ClosedLoopReferenceSlopeRadPerSec$/i],
}

export type LogMechanism = 'elevator' | 'arm'

export function emptyMapping(): FieldMapping {
  return Object.fromEntries(ROLES.map((r) => [r.key, { entry: null, scale: 1 }])) as FieldMapping
}

function score(role: RoleDef, e: WpilogEntryInfo, mech: LogMechanism): number {
  if (!NUMERIC_TYPES.has(e.type) || e.count === 0) return 0
  if (role.key === 'enabled' && e.type !== 'boolean') return 0
  if (role.key !== 'enabled' && e.type === 'boolean') return 0
  const patterns = mech === 'arm' ? [...(ARM_PATTERNS[role.key] ?? []), ...role.patterns] : role.patterns
  for (let i = 0; i < patterns.length; i++) {
    if (patterns[i].test(e.name)) {
      let s = 100 - i * 10
      if ((mech === 'arm' ? /\barm\b|\/Arm\//i : /elevator/i).test(e.name)) s += 5
      if (/RealOutputs|ReplayOutputs/i.test(e.name) && role.key !== 'reference') s -= 3
      return s
    }
  }
  return 0
}

/** 自動猜欄位；同一個欄位不會被兩個角色搶走。 */
export function suggestMapping(entries: WpilogEntryInfo[], previous?: Partial<FieldMapping>, mech: LogMechanism = 'elevator'): FieldMapping {
  const map = emptyMapping()
  const names = new Set(entries.map((e) => e.name))
  const taken = new Set<string>()
  // 先套用之前存的對應（欄位還存在的話）
  if (previous) {
    for (const r of ROLES) {
      const p = previous[r.key]
      if (p?.entry && names.has(p.entry)) {
        map[r.key] = { entry: p.entry, scale: p.scale }
        taken.add(p.entry)
      }
    }
  }
  for (const r of ROLES) {
    if (map[r.key].entry) continue
    let best: WpilogEntryInfo | null = null
    let bestScore = 0
    for (const e of entries) {
      if (taken.has(e.name)) continue
      const s = score(r, e, mech)
      if (s > bestScore) {
        bestScore = s
        best = e
      }
    }
    if (best) {
      map[r.key] = { entry: best.name, scale: 1 }
      taken.add(best.name)
    }
  }
  return map
}

export function missingRequired(map: FieldMapping): RoleDef[] {
  return ROLES.filter((r) => r.required && !map[r.key].entry)
}

export interface AlignedLog {
  /** 時間（s），以位置欄位的時間戳為準 */
  t: Float64Array
  cols: Partial<Record<RoleKey, Float64Array>>
}

/**
 * 以位置欄位的時間為基準，其他欄位用零階保持對齊。
 * AdvantageKit 只在數值改變時寫入，所以不能用內插，要用「上一筆的值」。
 */
export function alignSeries(series: Map<string, Series>, map: FieldMapping): AlignedLog {
  const posName = map.position.entry
  const base = posName ? series.get(posName) : undefined
  if (!base) throw new Error('缺少位置欄位，無法對齊')
  const t = base.t
  const cols: Partial<Record<RoleKey, Float64Array>> = {}
  for (const r of ROLES) {
    const m = map[r.key]
    const s = m.entry ? series.get(m.entry) : undefined
    if (!s || s.t.length === 0) continue
    const out = new Float64Array(t.length)
    let j = 0
    for (let i = 0; i < t.length; i++) {
      while (j + 1 < s.t.length && s.t[j + 1] <= t[i]) j++
      out[i] = s.t[j] <= t[i] ? s.v[j] * m.scale : NaN
    }
    cols[r.key] = out
  }
  return { t, cols }
}
