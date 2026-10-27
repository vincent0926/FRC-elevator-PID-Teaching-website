import { useState } from 'react'
import { useElevator } from '../../app/elevatorStore'
import { twoPointKsKg } from '../../core/twoPoint'
import { ElevatorMechanismSchema } from '../../schema/parameterSet'
import { t } from '../../core/lang'

/** 4F「量 kS、kG（兩點法）」：不用 SysId，用 Phoenix Tuner 或程式慢慢加電壓就能量 */

const f = (v: number, d = 3) => (Number.isFinite(v) ? v.toFixed(d) : '—')

export function MeasureKsKg() {
  const { mechanism, setMechanism, ff } = useElevator()
  const [up, setUp] = useState('')
  const [down, setDown] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const r = up !== '' && down !== '' ? twoPointKsKg(Number(up), Number(down)) : null
  const ok = r && !('error' in r) ? r : null
  const diff = ok ? (ok.kG - ff.kG) / Math.abs(ff.kG || 1) : 0

  return (
    <div className="body">
      <div className="goal lgoal">{t('學習目標：用兩個電壓量出 kS 和 kG，知道理論的 kG 差多少、kS 為什麼一定要量。', 'Goal: measure kS and kG with two voltages, and know how far theory’s kG is off and why kS must be measured.')}</div>
      {t(
        <>
        <p>
          kS（靜摩擦）公式算不出來，一定要量。最簡單的量法不用 SysId：摩擦會擋住兩個方向，所以往上爬和往下滑需要的電壓不一樣，
          兩個電壓的平均是 kG，差的一半是 kS。
        </p>
        </>,
        <>
          <p>
          kS (static friction) can’t be calculated; it must be measured. The simplest way needs no SysId: friction resists both directions, so climbing up and sliding down need different voltages.{' '}
          The average of the two voltages is kG, and half the difference is kS.
          </p>
        </>,
      )}
      <div className="formula">
        {t(
          `剛好開始往上爬：V_up   = kG + kS
剛好開始往下滑：V_down = kG − kS
→ kG = (V_up + V_down) / 2　　kS = (V_up − V_down) / 2`,
          `just starts climbing: V_up   = kG + kS
just starts sliding:  V_down = kG − kS
→ kG = (V_up + V_down) / 2    kS = (V_up − V_down) / 2`,
        )}
      </div>
      <h3>{t('步驟（先完成單元零）', 'Steps (finish unit 0 first)')}</h3>
      <ol className="small">
        {t(
          <>
          <li>電梯停在行程中間（離上下限都遠），軟體限位打開，旁邊的人手放在 Driver Station 的 Disable 上。</li>
          <li>用 Phoenix Tuner X 的 VoltageOut（或程式的 setVoltage）從 0 V 開始，每次加 0.02–0.05 V，等 1 秒。</li>
          <li>電梯<b>剛好開始往上爬</b>時記下電壓，這是 V_up。</li>
          <li>把電壓調高一點撐住，再每次減 0.02–0.05 V，電梯<b>剛好開始往下滑</b>時記下電壓，這是 V_down。</li>
          <li>在 2–3 個高度各量一次（拖鏈、定力彈簧會隨高度變），取平均。夾遊戲物件時要另外量。</li>
          </>,
          <>
            <li>Park the elevator mid-travel (far from both limits), soft limits on, with someone’s hand on Disable at the Driver Station.</li>
            <li>With Phoenix Tuner X VoltageOut (or setVoltage in code), start at 0 V and add 0.02–0.05 V at a time, waiting 1 s each.</li>
            <li>When the elevator <b>just starts climbing</b>, write down the voltage: that’s V_up.</li>
            <li>Raise the voltage a little to hold it, then lower 0.02–0.05 V at a time; when it <b>just starts sliding down</b>, write down the voltage: that’s V_down.</li>
            <li>Measure at 2–3 heights (drag chains and constant-force springs change with height) and average. Measure separately when holding a game piece.</li>
          </>,
        )}
      </ol>
      <div className="fields" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
        <label className="f">
          {t('剛好往上爬的電壓 V_up', 'Voltage to just climb V_up')}
          <span className="inp">
            <input type="number" inputMode="decimal" step={0.01} value={up} onChange={(e) => setUp(e.target.value)} />
            <em>V</em>
          </span>
        </label>
        <label className="f">
          {t('剛好往下滑的電壓 V_down', 'Voltage to just slide V_down')}
          <span className="inp">
            <input type="number" inputMode="decimal" step={0.01} value={down} onChange={(e) => setDown(e.target.value)} />
            <em>V</em>
          </span>
        </label>
      </div>
      {r && 'error' in r && <div className="warn">{r.error}</div>}
      {ok && (
        <>
          <div className="formula" style={{ marginTop: 10 }}>{`kG = (${f(Number(up), 2)} + ${f(Number(down), 2)}) / 2 = ${f(ok.kG)} V
kS = (${f(Number(up), 2)} − ${f(Number(down), 2)}) / 2 = ${f(ok.kS)} V
${t(`1F 理論 kG = ${f(ff.kG)} V（差 ${diff >= 0 ? '+' : ''}${f(diff * 100, 0)}%）`, `1F theory kG = ${f(ff.kG)} V (off by ${diff >= 0 ? '+' : ''}${f(diff * 100, 0)}%)`)}`}</div>
          {Math.abs(diff) > 0.2 && (
            <div className="note">{t('量到的 kG 跟理論差超過 20%：先檢查 1F 的質量（有沒有秤）、齒比、鼓輪半徑、配重。機構資料對了，理論值才有參考價值。', 'The measured kG is more than 20% off theory: first check the 1F masses (were they weighed?), gear ratio, drum radius and counterweight. Theory is only useful once the mechanism data is right.')}</div>
          )}
          {ok.warnings.map((w) => (
            <div key={w} className="note">
              {w}
            </div>
          ))}
          <div className="row" style={{ marginTop: 8 }}>
            <button
              className="btn small"
              type="button"
              onClick={() => {
                const next = { ...mechanism, measuredKs: Math.round(ok.kS * 1000) / 1000 }
                // 先驗證：超出範圍的值存進去，重新整理時整份機構資料會被丟掉
                const v = ElevatorMechanismSchema.safeParse(next)
                if (!v.success) {
                  setMsg(null)
                  setErr(t(`kS = ${f(ok.kS)} V 超出可以存的範圍（0–6 V），沒有填進 1F。這麼大的摩擦先檢查機構，或重新量一次。`, `kS = ${f(ok.kS)} V is outside the range that can be saved (0–6 V), so it wasn’t entered in 1F. With friction that large, check the mechanism first, or measure again.`))
                  return
                }
                setErr(null)
                setMechanism(v.data)
                setMsg(t(`已把 kS = ${f(ok.kS)} V 填進 1F。理論值的 kS、最高速度、Motion Magic 建議值都會跟著更新。kG 請照 2F 或 3F 自訂參數修正。`, `Entered kS = ${f(ok.kS)} V in 1F. The theory kS, top speed and Motion Magic suggestions all update. Correct kG using 2F or 3F custom gains.`))
              }}
            >
              {t(`把 kS 填進 1F（目前 ${f(mechanism.measuredKs ?? 0)} V）`, `Enter kS in 1F (now ${f(mechanism.measuredKs ?? 0)} V)`)}
            </button>
          </div>
          {msg && <div className="ok">{msg}</div>}
          {err && <div className="warn">{err}</div>}
        </>
      )}
      <p className="small muted">
        {t(
          <>
          這個方法假設摩擦往上往下一樣大。往上往下差很多時（例如鏈條只在一個方向拖），用 SysId 準靜態測試或 2F 日誌會更準，必要時往下用 Slot 1。
          </>,
          <>
            This assumes friction is the same up and down. When they differ a lot (say the chain only drags one way), the SysId quasistatic test or 2F logs are more accurate; use Slot 1 for going down if needed.
          </>,
        )}
      </p>
    </div>
  )
}
