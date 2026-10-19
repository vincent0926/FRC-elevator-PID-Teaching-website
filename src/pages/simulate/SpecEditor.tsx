import { NumberField } from '../../components/NumberField'
import { DEFAULT_SPEC, SPEC_PRESETS, type Spec, type SpecUnit } from '../../core/physics/spec'
import { t } from '../../core/lang'

/** 3F 達標標準：選一個常用標準，或自己調每一項（依賽季機構需求） */
export function SpecEditor({
  spec,
  setSpec,
  presets = SPEC_PRESETS,
  defaultSpec = DEFAULT_SPEC,
  unit = 'm',
}: {
  spec: Spec
  setSpec: (s: Spec) => void
  presets?: typeof SPEC_PRESETS
  defaultSpec?: Spec
  /** 位置單位：電梯 m（顯示 cm）、手臂 rad（顯示度） */
  unit?: SpecUnit
}) {
  const disp = unit === 'rad' ? 180 / Math.PI : 100
  const u = unit === 'rad' ? '°' : 'cm'
  const same = (a: Spec, b: Spec) => (Object.keys(a) as (keyof Spec)[]).every((k) => Math.abs(a[k] - b[k]) < 1e-9)
  const set = (patch: Partial<Spec>) => setSpec({ ...spec, ...patch })
  return (
    <details style={{ marginTop: 10 }}>
      <summary className="small" style={{ cursor: 'pointer' }}>
        {t(
          <>
          調整達標標準（依這個賽季的機構需求）
          </>,
          <>
            Adjust pass criteria (to fit this season’s mechanism needs)
          </>,
        )}
      </summary>
      <div className="seg" role="group" aria-label={t('常用標準', 'Common presets')} style={{ marginTop: 8 }}>
        {presets.map((p) => (
          <button key={p.id} type="button" aria-pressed={same(spec, p.spec)} title={p.what} onClick={() => setSpec(p.spec)}>
            {p.label}
          </button>
        ))}
      </div>
      <p className="small muted" style={{ margin: '6px 0 8px' }}>
        {presets.find((p) => same(spec, p.spec))?.what ?? t('自訂。', 'Custom. ')}
        {t('這些是教學用的預設，不是 FRC 的官方標準，要看這個賽季的機構和得分位置決定。改了之後，指標表、穩健性測試、挑戰模式都用這組標準；存在這台電腦。', ' These are teaching presets, not official FRC standards; decide based on this season’s mechanism and scoring positions. Once changed, the metrics table, robustness test and challenge mode all use these criteria; saved on this computer.')}
      </p>
      <div className="fields three">
        <NumberField label={t('超調 ≤', 'Overshoot ≤')} value={spec.overshoot} display={disp} min={0.1} max={50} onChange={(v) => set({ overshoot: v })} unit={u} />
        <NumberField label={t('穩態誤差 ≤', 'Steady-state error ≤')} value={spec.steadyState} display={disp} min={0.1} max={50} onChange={(v) => set({ steadyState: v })} unit={u} hint={t('也是「穩定」的範圍', 'Also the “settled” band')} />
        <NumberField label={t('穩定時間 ≤', 'Settling time ≤')} value={spec.settling} min={0.05} max={5} onChange={(v) => set({ settling: v })} unit="s" />
        <NumberField label={t('跟隨誤差 ≤', 'Following error ≤')} value={spec.following} display={disp} min={0.1} max={100} onChange={(v) => set({ following: v })} unit={u} />
        <NumberField label={t('電壓飽和 ≤', 'Voltage saturation ≤')} value={spec.saturation} display={100} min={0.1} max={100} onChange={(v) => set({ saturation: v })} unit="%" />
        <NumberField label={t('到位電壓抖動 ≤', 'Voltage jitter at arrival ≤')} value={spec.ripple} min={0.01} max={12} onChange={(v) => set({ ripple: v })} unit="V" />
      </div>
      {!same(spec, defaultSpec) && (
        <button className="btn small" type="button" style={{ marginTop: 8 }} onClick={() => setSpec(defaultSpec)}>
          {t('回到預設標準', 'Back to default criteria')}
        </button>
      )}
    </details>
  )
}
