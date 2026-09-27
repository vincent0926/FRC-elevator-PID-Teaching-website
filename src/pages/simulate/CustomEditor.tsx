import { NumberField } from '../../components/NumberField'
import type { ParameterSet } from '../../schema/parameterSet'

/** 3F「自訂」參數編輯：kS–kD、Motion Magic、往下 Slot 1，以及基準參數（步驟 8） */

export function CustomEditor({
  custom,
  edit,
  resetTheory,
  baseline,
  setBaseline,
  resetBaseline,
  locked,
}: {
  custom: ParameterSet
  edit: (patch: (p: ParameterSet) => ParameterSet) => void
  resetTheory: () => void
  baseline: ParameterSet | null
  setBaseline: (p: ParameterSet) => void
  resetBaseline: () => void
  /** 挑戰模式：不能直接換成理論值以外的來源 */
  locked?: boolean
}) {
  const slots = custom.slotByDirection
  const setSlot = (dir: 'up' | 'down', k: 'kS' | 'kG', v: number) =>
    edit((p) => (p.slotByDirection ? { ...p, slotByDirection: { ...p.slotByDirection, [dir]: { ...p.slotByDirection[dir], [k]: v } } } : p))
  return (
    <>
      <div className="gains">
        {(['kS', 'kG', 'kV', 'kA'] as const).map((k) => (
          <NumberField
            key={k}
            label={slots && (k === 'kS' || k === 'kG') ? `${k}（沒用到）` : k}
            value={custom.feedforward[k]}
            onChange={(v) => edit((p) => ({ ...p, feedforward: { ...p.feedforward, [k]: v } }))}
            unit={k === 'kS' || k === 'kG' ? 'V' : k === 'kV' ? 'V/(m/s)' : 'V/(m/s²)'}
          />
        ))}
        {(['kP', 'kI', 'kD'] as const).map((k) => (
          <NumberField
            key={k}
            label={k}
            value={custom.feedback[k]}
            min={0}
            onChange={(v) => edit((p) => ({ ...p, feedback: { ...p.feedback, [k]: v } }))}
            unit={k === 'kP' ? 'V/m' : k === 'kI' ? 'V/(m·s)' : 'V/(m/s)'}
          />
        ))}
        <span />
        <NumberField
          label="巡航速度"
          value={custom.motionMagic.cruiseVelocity}
          min={0.01}
          onChange={(v) => edit((p) => ({ ...p, motionMagic: { ...p.motionMagic, cruiseVelocity: v } }))}
          unit="m/s"
        />
        <NumberField
          label="加速度"
          value={custom.motionMagic.acceleration}
          min={0.01}
          onChange={(v) => edit((p) => ({ ...p, motionMagic: { ...p.motionMagic, acceleration: v } }))}
          unit="m/s²"
        />
      </div>

      <label className="check" style={{ marginTop: 14 }}>
        <input
          type="checkbox"
          checked={!!slots}
          onChange={(e) =>
            edit((p) => {
              if (!e.target.checked) return { ...p, slotByDirection: undefined }
              const base = { kS: p.feedforward.kS, kG: p.feedforward.kG }
              return { ...p, slotByDirection: { up: base, down: { ...base } } }
            })
          }
        />
        往下用 Slot 1（摩擦不對稱時，往上、往下各自設 kS、kG）
      </label>
      {slots && (
        <div className="gains" style={{ marginTop: 10 }}>
          <NumberField label="往上 kS（Slot 0）" value={slots.up.kS} onChange={(v) => setSlot('up', 'kS', v)} unit="V" />
          <NumberField label="往上 kG（Slot 0）" value={slots.up.kG} onChange={(v) => setSlot('up', 'kG', v)} unit="V" />
          <NumberField label="往下 kS（Slot 1）" value={slots.down.kS} onChange={(v) => setSlot('down', 'kS', v)} unit="V" />
          <NumberField label="往下 kG（Slot 1）" value={slots.down.kG} onChange={(v) => setSlot('down', 'kG', v)} unit="V" />
        </div>
      )}

      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn small" type="button" onClick={() => setBaseline(custom)}>
          設為基準
        </button>
        <button className="btn small" type="button" disabled={!baseline} onClick={resetBaseline} title={baseline ? undefined : '還沒設基準'}>
          重置為基準
        </button>
        <button className="btn small" type="button" onClick={resetTheory}>
          重置為理論值
        </button>
      </div>
      <p className="small muted" style={{ margin: '6px 0 0' }}>
        {baseline && !locked
          ? `基準：${baseline.note ?? '自訂'}（${new Date(baseline.createdAt).toLocaleString('zh-TW', { hour12: false })}）。亂調之後按「重置為基準」就回來了。`
          :'找到一組還不錯的參數時先「設為基準」，之後亂調也能一鍵回來。'}
        一次只改一個參數，才看得出是誰造成的變化。
      </p>
      {custom.note && <p className="small muted">來源：{custom.note}</p>}
    </>
  )
}

