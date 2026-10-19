import { useId, useState } from 'react'
import { NumberField } from './NumberField'
import { loadJson, saveJson } from '../storage/local'
import { getGain, rotationView, setGain, sliderRange, snap, type TuneGains, type TuneKey, type TuneUnitMode } from '../pages/simulate/tuneRange'
import { t } from '../core/lang'

/**
 * 3F「親手調參數」：放在播放列正下方，拖了馬上重新模擬。
 * 每條滑桿都標出理論值（刻度＋文字），可以單項或全部回到理論值。
 * 目前看的不是「自訂」時，第一次拖動會用畫面上的參數當起點切到「自訂」（由 onEdit 處理）。
 * 可以切到 Phoenix 6 轉數制（rot、rps）：只換顯示和輸入的數字，模擬照樣用 SI。
 */

type Mech = 'elevator' | 'arm'

interface Def {
  k: TuneKey
  label: string
  hint: Record<Mech, string>
}

const GROUPS: { title: string; keys: Def[] }[] = t(
  [
    {
      title: '① 前饋（先調）',
      keys: [
        { k: 'kG', label: 'kG', hint: { elevator: '抵銷重力。太小停住後往下掉，太大往上飄', arm: '水平時抵銷重力（會乘 cos θ）。太小會垂下去，太大往上飄' } },
        { k: 'kS', label: 'kS', hint: { elevator: '克服摩擦的固定電壓。太大會在目標附近抖', arm: '克服摩擦的固定電壓。太大會在目標附近抖' } },
        { k: 'kV', label: 'kV', hint: { elevator: '每 1 m/s 要多少電壓。太小落後軌跡，太大超前', arm: '每 1 rad/s 要多少電壓。太小落後軌跡，太大超前' } },
        { k: 'kA', label: 'kA', hint: { elevator: '加速、減速時多給的電壓', arm: '角加速、減速時多給的電壓' } },
      ],
    },
    {
      title: '② 回授（再調）',
      keys: [
        { k: 'kP', label: 'kP', hint: { elevator: '誤差越大推越用力。太小停不準，太大會震盪', arm: '誤差越大推越用力。太小停不準，太大會震盪' } },
        { k: 'kD', label: 'kD', hint: { elevator: '壓住衝過頭和震盪。太大會抖', arm: '壓住衝過頭和擺動。太大會抖' } },
        { k: 'kI', label: 'kI', hint: { elevator: '慢慢補累積的誤差。通常 0，太大會來回擺', arm: '慢慢補累積的誤差。通常 0，太大會來回擺' } },
      ],
    },
    {
      title: '③ 軌跡（Motion Magic）',
      keys: [
        { k: 'cruiseVelocity', label: '巡航速度', hint: { elevator: '太快馬達出不了力，會落後軌跡', arm: '太快馬達出不了力，會落後軌跡' } },
        { k: 'acceleration', label: '加速度', hint: { elevator: '太大電流打滿，加速段落後', arm: '太大電流打滿，加速段落後' } },
      ],
    },
  ],
  [
    {
      title: '① Feedforward (tune first)',
      keys: [
        { k: 'kG', label: 'kG', hint: { elevator: 'Cancels gravity. Too small and it sags after stopping; too big and it drifts up', arm: 'Cancels gravity when horizontal (multiplied by cos θ). Too small and it droops; too big and it drifts up' } },
        { k: 'kS', label: 'kS', hint: { elevator: 'Fixed voltage to overcome friction. Too big and it jitters near the target', arm: 'Fixed voltage to overcome friction. Too big and it jitters near the target' } },
        { k: 'kV', label: 'kV', hint: { elevator: 'Volts per 1 m/s. Too small lags the profile; too big runs ahead', arm: 'Volts per 1 rad/s. Too small lags the profile; too big runs ahead' } },
        { k: 'kA', label: 'kA', hint: { elevator: 'Extra voltage while accelerating and decelerating', arm: 'Extra voltage during angular acceleration and deceleration' } },
      ],
    },
    {
      title: '② Feedback (tune next)',
      keys: [
        { k: 'kP', label: 'kP', hint: { elevator: 'Pushes harder the bigger the error. Too small misses the target; too big oscillates', arm: 'Pushes harder the bigger the error. Too small misses the target; too big oscillates' } },
        { k: 'kD', label: 'kD', hint: { elevator: 'Damps overshoot and oscillation. Too big and it jitters', arm: 'Damps overshoot and swinging. Too big and it jitters' } },
        { k: 'kI', label: 'kI', hint: { elevator: 'Slowly makes up accumulated error. Usually 0; too big and it swings back and forth', arm: 'Slowly makes up accumulated error. Usually 0; too big and it swings back and forth' } },
      ],
    },
    {
      title: '③ Profile (Motion Magic)',
      keys: [
        { k: 'cruiseVelocity', label: 'Cruise velocity', hint: { elevator: 'Too fast and the motor can’t keep up, so it lags the profile', arm: 'Too fast and the motor can’t keep up, so it lags the profile' } },
        { k: 'acceleration', label: 'Acceleration', hint: { elevator: 'Too big maxes out the current and it lags while accelerating', arm: 'Too big maxes out the current and it lags while accelerating' } },
      ],
    },
  ],
)

export interface TuneSlidersProps<T extends TuneGains> {
  mechanism: Mech
  /** 畫面上正在模擬的參數 */
  values: T
  theory: TuneGains
  /** 目前看的是不是「自訂」 */
  editingCustom: boolean
  /** 目前參數來源的名稱（理論值、調參建議值…） */
  sourceLabel: string
  onEdit: (patch: (p: T) => T) => void
  onResetAll: () => void
  units: Record<TuneKey, string>
  /** 顯示倍率（手臂的巡航、加速度內部 rad，畫面顯示度） */
  display?: Partial<Record<TuneKey, number>>
  /** 不能調的欄位與原因（例如電梯開了往下 Slot 1 時的 kS、kG） */
  disabled?: Partial<Record<TuneKey, string>>
  /** 轉數制：機構轉 1 圈的 SI 量（電梯 2πr 公尺、手臂 2π rad）和給人看的說明；copy 是「要填到哪裡」，沒給就是 Slot0Configs、MotionMagicConfigs */
  rotation: { perRot: number; note: string; copy?: string }
}

/** 轉數制下 kV、巡航速度的提示要改講 rps */
const ROT_HINT: Partial<Record<TuneKey, Record<Mech, string>>> = {
  kV: t(
    { elevator: '每 1 rps（鼓輪每秒 1 圈）要多少電壓。太小落後軌跡，太大超前', arm: '每 1 rps（手臂每秒 1 圈）要多少電壓。太小落後軌跡，太大超前' },
    { elevator: 'Volts per 1 rps (one drum turn per second). Too small lags the profile; too big runs ahead', arm: 'Volts per 1 rps (one arm turn per second). Too small lags the profile; too big runs ahead' },
  ),
}

export function TuneSliders<T extends TuneGains>({ mechanism, values, theory, editingCustom, sourceLabel, onEdit, onResetAll, units: siUnits, display: siDisplay = {}, disabled = {}, rotation }: TuneSlidersProps<T>) {
  const id = useId()
  const [mode, setModeState] = useState<TuneUnitMode>(() => (loadJson<string>('tuneUnits', 'si') === 'rot' ? 'rot' : 'si'))
  const setMode = (m: TuneUnitMode) => {
    setModeState(m)
    saveJson('tuneUnits', m)
  }
  const rot = mode === 'rot' ? rotationView(rotation.perRot) : null
  const units = rot ? rot.units : siUnits
  const display: Partial<Record<TuneKey, number>> = rot ? rot.display : siDisplay
  const changed = GROUPS.some((g) => g.keys.some(({ k }) => Math.abs(getGain(values, k) - getGain(theory, k)) > 1e-9))
  return (
    <section className="tune" aria-label={t('親手調參數', 'Tune it yourself')}>
      <div className="tune-head">
        <h3>{t('親手調參數', 'Tune it yourself')}</h3>
        <span className="small muted">
          {editingCustom
            ? t('一次只改一個，才看得出是誰造成的變化。', 'Change one at a time so you can tell what caused the change.')
            : t(`現在看的是「${sourceLabel}」。一拖就切到「自訂」，取代原本的自訂參數。`, `You’re viewing “${sourceLabel}”. Dragging switches to “Custom” and replaces your previous custom gains.`)}
        </span>
        <button className="btn small" type="button" onClick={onResetAll} disabled={editingCustom && !changed}>
          {t('全部回到理論值', 'Reset all to theory')}
        </button>
      </div>
      <div className="tune-units">
        <span className="small muted">{t('單位', 'Units')}</span>
        <div className="seg" role="group" aria-label={t('滑桿單位', 'Slider units')}>
          <button type="button" aria-pressed={mode === 'si'} onClick={() => setMode('si')}>
            {mechanism === 'arm' ? t('SI（rad、°）', 'SI (rad, °)') : t('SI（m）', 'SI (m)')}
          </button>
          <button type="button" aria-pressed={mode === 'rot'} onClick={() => setMode('rot')}>
            {t('Phoenix 6（rps）', 'Phoenix 6 (rps)')}
          </button>
        </div>
        {rot && (
          <span className="small muted">
            {t('SensorToMechanismRatio 設成齒比後，1 rot = ', 'With SensorToMechanismRatio set to the gear ratio, 1 rot = ')}
            {rotation.note}
            {t('。', '. ')}
            {rotation.copy ?? t('這裡的數字就是 Slot0Configs、MotionMagicConfigs 要填的值。', 'These numbers are exactly what goes into Slot0Configs and MotionMagicConfigs.')}
          </span>
        )}
      </div>
      <div className="tune-groups">
        {GROUPS.map((g) => (
          <div className="tune-group" key={g.title}>
            <h4>{g.title}</h4>
            {g.keys.map(({ k, label, hint }) => {
              const v = getGain(values, k)
              const th = getGain(theory, k)
              const r = sliderRange(k, theory, v)
              const s = display[k] ?? 1
              const off = disabled[k]
              const diff = Math.abs(v - th) > 1e-9
              const pct = th !== 0 ? Math.round((v / th) * 100) : null
              const listId = `${id}-${k}`
              // 數字欄的小數位跟著滑桿步距（畫面單位），不會出現 1.5826531 這種長串
              const digits = Math.max(0, Math.ceil(-Math.log10(r.step * s) - 1e-9))
              const set = (x: number) => onEdit((p) => setGain(p, k, x))
              return (
                <div className={'tune-row' + (diff ? ' changed' : '')} key={k}>
                  <div className="tune-label">
                    <b>{label}</b>
                    <span className="small muted">{off ?? (rot && ROT_HINT[k] ? ROT_HINT[k][mechanism] : hint[mechanism])}</span>
                  </div>
                  <input
                    type="range"
                    aria-label={t(`${label}（${units[k]}）`, `${label} (${units[k]})`)}
                    aria-valuetext={`${(v * s).toFixed(digits)} ${units[k]}`}
                    min={r.min}
                    max={r.max}
                    step={r.step}
                    value={Math.min(r.max, Math.max(r.min, v))}
                    list={listId}
                    disabled={!!off}
                    onChange={(e) => set(snap(Number(e.target.value), r.step))}
                  />
                  <datalist id={listId}>
                    <option value={th} label={t('理論值', 'Theory')} />
                  </datalist>
                  <div className="tune-num">
                    <NumberField label={label} hideLabel value={v} display={s} digits={digits} min={k === 'cruiseVelocity' || k === 'acceleration' ? r.step * s : k === 'kS' || k === 'kG' ? undefined : 0} onChange={set} unit={units[k]} />
                  </div>
                  <div className="tune-ref small muted">
                    {t('理論', 'Theory')} {Number.isFinite(th) ? (th * s).toFixed(digits) : '—'}
                    {diff && pct !== null && <em>{t(`（現在 ${pct}%）`, ` (now ${pct}%)`)}</em>}
                    {diff && (
                      <button className="linkbtn small" type="button" onClick={() => set(th)} disabled={!!off} aria-label={t(`${label} 回到理論值`, `Reset ${label} to theory`)}>
                        {t('↺ 回理論', '↺ Theory')}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </section>
  )
}
