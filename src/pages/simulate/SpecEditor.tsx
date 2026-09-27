import { NumberField } from '../../components/NumberField'
import { DEFAULT_SPEC, SPEC_PRESETS, type Spec } from '../../core/physics/spec'

/** 3F 達標標準：選一個常用標準，或自己調每一項（依賽季機構需求） */
export function SpecEditor({ spec, setSpec }: { spec: Spec; setSpec: (s: Spec) => void }) {
  const same = (a: Spec, b: Spec) => (Object.keys(a) as (keyof Spec)[]).every((k) => Math.abs(a[k] - b[k]) < 1e-9)
  const set = (patch: Partial<Spec>) => setSpec({ ...spec, ...patch })
  return (
    <details style={{ marginTop: 10 }}>
      <summary className="small" style={{ cursor: 'pointer' }}>
        調整達標標準（依這個賽季的機構需求）
      </summary>
      <div className="seg" role="group" aria-label="常用標準" style={{ marginTop: 8 }}>
        {SPEC_PRESETS.map((p) => (
          <button key={p.id} type="button" aria-pressed={same(spec, p.spec)} title={p.what} onClick={() => setSpec(p.spec)}>
            {p.label}
          </button>
        ))}
      </div>
      <p className="small muted" style={{ margin: '6px 0 8px' }}>
        {SPEC_PRESETS.find((p) => same(spec, p.spec))?.what ?? '自訂。'}這些是教學用的預設，不是 FRC 的官方標準，要看這個賽季的機構和得分位置決定。
        改了之後，指標表、穩健性測試、挑戰模式都用這組標準；存在這台電腦。
      </p>
      <div className="fields three">
        <NumberField label="超調 ≤" value={spec.overshoot} display={100} min={0.1} max={50} onChange={(v) => set({ overshoot: v })} unit="cm" />
        <NumberField label="穩態誤差 ≤" value={spec.steadyState} display={100} min={0.1} max={50} onChange={(v) => set({ steadyState: v })} unit="cm" hint="也是「穩定」的範圍" />
        <NumberField label="穩定時間 ≤" value={spec.settling} min={0.05} max={5} onChange={(v) => set({ settling: v })} unit="s" />
        <NumberField label="跟隨誤差 ≤" value={spec.following} display={100} min={0.1} max={100} onChange={(v) => set({ following: v })} unit="cm" />
        <NumberField label="電壓飽和 ≤" value={spec.saturation} display={100} min={0.1} max={100} onChange={(v) => set({ saturation: v })} unit="%" />
        <NumberField label="到位電壓抖動 ≤" value={spec.ripple} min={0.01} max={12} onChange={(v) => set({ ripple: v })} unit="V" />
      </div>
      {!same(spec, DEFAULT_SPEC) && (
        <button className="btn small" type="button" style={{ marginTop: 8 }} onClick={() => setSpec(DEFAULT_SPEC)}>
          回到預設標準
        </button>
      )}
    </details>
  )
}
