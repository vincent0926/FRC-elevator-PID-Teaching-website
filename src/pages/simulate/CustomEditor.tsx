import { NumberField } from '../../components/NumberField'
import type { ParameterSet } from '../../schema/parameterSet'
import { t } from '../../core/lang'

/**
 * 3F「自訂」參數：往下 Slot 1、基準參數（步驟 8）。
 * kS–kD、Motion Magic 平常用播放列下面的滑桿改；挑戰模式沒有滑桿，才在這裡顯示數字欄。
 */

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
      {locked && (
      <div className="gains">
        {(['kS', 'kG', 'kV', 'kA'] as const).map((k) => (
          <NumberField
            key={k}
            label={slots && (k === 'kS' || k === 'kG') ? t(`${k}（沒用到）`, `${k} (unused)`) : k}
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
          label={t('巡航速度', 'Cruise velocity')}
          value={custom.motionMagic.cruiseVelocity}
          min={0.01}
          onChange={(v) => edit((p) => ({ ...p, motionMagic: { ...p.motionMagic, cruiseVelocity: v } }))}
          unit="m/s"
        />
        <NumberField
          label={t('加速度', 'Acceleration')}
          value={custom.motionMagic.acceleration}
          min={0.01}
          onChange={(v) => edit((p) => ({ ...p, motionMagic: { ...p.motionMagic, acceleration: v } }))}
          unit="m/s²"
        />
      </div>
      )}

      <label className="check" style={{ marginTop: locked ? 14 : 0 }}>
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
        {t(
          <>
          往下用 Slot 1（摩擦不對稱時，往上、往下各自設 kS、kG）
          </>,
          <>
            Use Slot 1 going down (set kS and kG separately for up and down when friction is asymmetric)
          </>,
        )}
      </label>
      {slots && (
        <div className="gains" style={{ marginTop: 10 }}>
          <NumberField label={t('往上 kS（Slot 0）', 'Up kS (Slot 0)')} value={slots.up.kS} onChange={(v) => setSlot('up', 'kS', v)} unit="V" />
          <NumberField label={t('往上 kG（Slot 0）', 'Up kG (Slot 0)')} value={slots.up.kG} onChange={(v) => setSlot('up', 'kG', v)} unit="V" />
          <NumberField label={t('往下 kS（Slot 1）', 'Down kS (Slot 1)')} value={slots.down.kS} onChange={(v) => setSlot('down', 'kS', v)} unit="V" />
          <NumberField label={t('往下 kG（Slot 1）', 'Down kG (Slot 1)')} value={slots.down.kG} onChange={(v) => setSlot('down', 'kG', v)} unit="V" />
        </div>
      )}

      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn small" type="button" onClick={() => setBaseline(custom)}>
          {t('設為基準', 'Set as baseline')}
        </button>
        <button className="btn small" type="button" disabled={!baseline} onClick={resetBaseline} title={baseline ? undefined : t('還沒設基準', 'No baseline set yet')}>
          {t('重置為基準', 'Reset to baseline')}
        </button>
        {locked && (
          <button className="btn small" type="button" onClick={resetTheory}>
            {t('重置為理論值', 'Reset to theory')}
          </button>
        )}
      </div>
      <p className="small muted" style={{ margin: '6px 0 0' }}>
        {baseline && !locked
          ? t(
              `基準：${baseline.note ?? '自訂'}（${new Date(baseline.createdAt).toLocaleString('zh-TW', { hour12: false })}）。亂調之後按「重置為基準」就回來了。`,
              `Baseline: ${baseline.note ?? 'Custom'} (${new Date(baseline.createdAt).toLocaleString('en-US', { hour12: false })}). After experimenting, press “Reset to baseline” to get back.`,
            )
          : t('找到一組還不錯的參數時先「設為基準」，之後亂調也能一鍵回來。', 'When you find a decent set of gains, “Set as baseline” first; then you can experiment and get back with one click.')}
      </p>
      {custom.note && <p className="small muted">{t('來源：', 'Source: ')}{custom.note}</p>}
    </>
  )
}

