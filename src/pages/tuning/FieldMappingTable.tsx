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
  mechanism: ElevatorMechanism
}

export function FieldMappingTable({ entries, mapping, onChange, mechanism }: Props) {
  const numeric = entries.filter((e) => NUMERIC_TYPES.has(e.type) && e.count > 0)
  const drum = metersPerRotation(mechanism.drumRadius)
  const kTop = mechanism.stages[mechanism.stages.length - 1].speedRatio
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
                  {r.unit && <div className="small muted">{r.unit}</div>}
                </td>
                <td style={{ minWidth: 200 }}>
                  <span className="inp">
                    <select aria-label={`${r.label}對應欄位`} value={m.entry ?? ''} onChange={(e) => set(r.key, { entry: e.target.value || null })}>
                      <option value="">（不使用）</option>
                      {options.map((e) => (
                        <option key={e.name} value={e.name}>
                          {e.name}（{e.count} 筆）
                        </option>
                      ))}
                    </select>
                  </span>
                </td>
                <td style={{ minWidth: 150 }}>
                  {r.lengthUnit ? (
                    <>
                      <NumberField hideLabel label={`${r.label}倍率`} value={m.scale} onChange={(v) => set(r.key, { scale: v })} />
                      <div className="row" style={{ gap: 6, marginTop: 4 }}>
                        <button type="button" className="linkbtn small" onClick={() => set(r.key, { scale: 1 })}>
                          已是公尺
                        </button>
                        <button type="button" className="linkbtn small" onClick={() => set(r.key, { scale: drum })} title="日誌存的是機構圈數（鼓輪座標）">
                          轉 → m
                        </button>
                        {mechanism.controlTop && kTop !== 1 && (
                          <button type="button" className="linkbtn small" onClick={() => set(r.key, { scale: 1 / kTop })} title="日誌存的是最上層高度（公尺）">
                            最上層 → 鼓輪
                          </button>
                        )}
                      </div>
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
        * 必填。網站內部以鼓輪線位移（公尺）計算；範例機器人程式記錄的就是這個單位，倍率保持 1。
      </p>
    </div>
  )
}
