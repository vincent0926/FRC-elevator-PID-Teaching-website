import { NumberField } from '../../components/NumberField'
import { ROLES, type FieldMapping, type RoleKey } from '../../core/log/fieldMap'
import type { WpilogEntryInfo } from '../../core/log/reader'
import { NUMERIC_TYPES } from '../../core/log/wpilog'
import { metersPerRotation } from '../../core/units'
import type { ElevatorMechanism } from '../../schema/parameterSet'

/**
 * 欄位對應表。長度類欄位可以設倍率：日誌存的是轉數（rot、rps）時，
 * 乘上「鼓輪 1 圈 = 2πr 公尺」換成網站內部用的鼓輪線位移。
 */

interface Props {
  entries: WpilogEntryInfo[]
  mapping: FieldMapping
  onChange: (m: FieldMapping) => void
  /** 電梯：倍率按鈕用鼓輪半徑換算；沒給就是手臂（角度，rad） */
  mechanism?: ElevatorMechanism
}

const armUnit = (u: string) => u.replace(/^m/, 'rad')

/**
 * 選單裡把欄位名稱的最後一段放前面：/Elevator/ClosedLoopReferenceMeters 和
 * /Elevator/ClosedLoopReferenceSlopeMetersPerSec 前面都一樣，選單寬度不夠時被截掉的是後面，兩個會看起來一模一樣。
 */
export function entryLabel(e: { name: string; count: number }): string {
  const i = e.name.lastIndexOf('/')
  if (i <= 0 || i === e.name.length - 1) return `${e.name}（${e.count} 筆）`
  return `${e.name.slice(i + 1)}（${e.name.slice(0, i)}，${e.count} 筆）`
}

export function FieldMappingTable({ entries, mapping, onChange, mechanism }: Props) {
  const numeric = entries.filter((e) => NUMERIC_TYPES.has(e.type) && e.count > 0)
  const arm = !mechanism
  const drum = mechanism ? metersPerRotation(mechanism.drumRadius) : 1
  const kTop = mechanism ? mechanism.stages[mechanism.stages.length - 1].speedRatio : 1
  const set = (k: RoleKey, patch: Partial<FieldMapping[RoleKey]>) => onChange({ ...mapping, [k]: { ...mapping[k], ...patch } })

  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="tbl" style={{ marginTop: 10 }}>
        <thead>
          <tr>
            <th>要用的資料</th>
            <th>日誌欄位</th>
            <th>倍率</th>
          </tr>
        </thead>
        <tbody>
          {ROLES.map((r) => {
            const m = mapping[r.key]
            const options = numeric.filter((e) => (r.key === 'enabled' ? e.type === 'boolean' : e.type !== 'boolean'))
            return (
              <tr key={r.key}>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {r.label}
                  {r.required && <span className="fail"> *</span>}
                  {r.unit && <div className="small muted">{arm && r.lengthUnit ? armUnit(r.unit) : r.unit}</div>}
                </td>
                <td style={{ minWidth: 200 }}>
                  <span className="inp">
                    <select aria-label={`${r.label}對應欄位`} title={m.entry ?? ''} value={m.entry ?? ''} onChange={(e) => set(r.key, { entry: e.target.value || null })}>
                      <option value="">（不使用）</option>
                      {options.map((e) => (
                        <option key={e.name} value={e.name}>
                          {entryLabel(e)}
                        </option>
                      ))}
                    </select>
                  </span>
                </td>
                <td style={{ minWidth: 150 }}>
                  {r.lengthUnit ? (
                    <>
                      <NumberField hideLabel label={`${r.label}倍率`} value={m.scale} onChange={(v) => set(r.key, { scale: v })} />
                      {arm ? (
                        <div className="row" style={{ gap: 6, marginTop: 4 }}>
                          <button type="button" className="linkbtn small" onClick={() => set(r.key, { scale: 1 })}>
                            已是 rad
                          </button>
                          <button type="button" className="linkbtn small" onClick={() => set(r.key, { scale: 2 * Math.PI })} title="日誌存的是手臂圈數（Phoenix 6 的 rot、rps）">
                            轉 → rad
                          </button>
                          <button type="button" className="linkbtn small" onClick={() => set(r.key, { scale: Math.PI / 180 })} title="日誌存的是度">
                            度 → rad
                          </button>
                        </div>
                      ) : (
                      <div className="row" style={{ gap: 6, marginTop: 4 }}>
                        <button type="button" className="linkbtn small" onClick={() => set(r.key, { scale: 1 })}>
                          已是公尺
                        </button>
                        <button type="button" className="linkbtn small" onClick={() => set(r.key, { scale: drum })} title="日誌存的是機構圈數（鼓輪座標）">
                          轉 → m
                        </button>
                        {mechanism?.controlTop && kTop !== 1 && (
                          <button type="button" className="linkbtn small" onClick={() => set(r.key, { scale: 1 / kTop })} title="日誌存的是最上層高度（公尺）">
                            最上層 → 鼓輪
                          </button>
                        )}
                      </div>
                      )}
                    </>
                  ) : (
                    <span className="muted small">—</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="small muted" style={{ margin: '6px 0 0' }}>
        {arm
          ? '* 必填。手臂的角度以弧度計算，0 = 水平、往上為正；範例機器人程式（ArmIO）記錄的就是這個單位，倍率保持 1。'
          : '* 必填。網站內部以鼓輪線位移（公尺）計算；範例機器人程式記錄的就是這個單位，倍率保持 1。'}
      </p>
    </div>
  )
}
