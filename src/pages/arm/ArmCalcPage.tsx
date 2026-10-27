import { useStore } from '../../app/store'
import { ArmForm } from './ArmForm'
import { ArmParamCard } from './ArmParamCard'
import { KIND_INFO, PARAM_ROWS } from '../calculate/paramSources'
import { useArm } from './armStore'
import { UnsavedNote } from './UnsavedNote'
import { RevCode } from '../../components/RevCode'
import { revArmJava } from '../../core/codegen/rev'
import { downloadBlob } from '../../app/download'
import { armRevSubsystemZip } from './armRevSubsystemExport'
import { HelpLink } from '../../components/HelpLink'
import { GUIDE_ANCHOR } from '../guide/guideContent'
import { t } from '../../core/lang'
import { fixed as f } from '../../core/format'

/** 手臂 1F：機構資料 → 理論參數（教學關卡在另一頁 pages/lessons） */

const R2D = 180 / Math.PI

export function ArmCalcPage() {
  const { go } = useStore()
  const { arm, setArm, voltsPerDeg, setVoltsPerDeg, ff, theory, setCustom, setSource } = useArm()

  const toSim = (asCustom: boolean) => {
    if (asCustom) {
      setCustom({ ...theory, source: 'custom', createdAt: new Date().toISOString() })
      setSource('custom')
    } else setSource('theory')
    go('sim')
  }

  return (
    <section aria-labelledby="t-arm-calc">
      <div className="head">
        <div>
          <h1 id="t-arm-calc">{t('手臂・計算參數', 'Arm · Calculate gains')}</h1>
          <p className="lead">
            {t('填入手臂的機構資料，右邊的參數卡會即時更新。數字怎麼來的，到「教學關卡」一步一步看。', 'Enter the arm’s mechanism data and the parameter card on the right updates immediately. To see where each number comes from, work through the “Lessons” page step by step.')}{' '}
            <HelpLink section={GUIDE_ANCHOR.calc} />
          </p>
        </div>
      </div>

      <UnsavedNote />
      <div className="grid2">
        <div className="stack">
          <ArmForm m={arm} onChange={setArm} voltsPerDeg={voltsPerDeg} onVoltsPerDeg={setVoltsPerDeg} />
        </div>

        <aside className="panel card-param" aria-live="polite">
          <ArmParamCard
            ps={theory}
            tags={Object.fromEntries(
              PARAM_ROWS.map((r) => {
                // 手臂的參數名稱多一個「角」字，來源分類跟電梯一樣
                const name = r.name === t('巡航速度', 'Cruise velocity') ? t('巡航角速度', 'Angular cruise velocity') : r.name === t('加速度', 'Acceleration') ? t('角加速度', 'Angular acceleration') : r.name
                return [
                  name,
                  <span key={name} className={'src-mini src-' + r.kind} title={KIND_INFO[r.kind].label}>
                    {KIND_INFO[r.kind].short}
                  </span>,
                ]
              }),
            )}
            notes={{
              kS: ff.kS > 0 ? t('你量到的值（機構資料「馬達」那一欄）', 'Your measured value (the “Motor” section of the mechanism data)') : t('公式算不出，一定要上機量', 'Can’t be calculated; you must measure it on the robot'),
              kI: t('預設 0，穩態誤差先查 kG、零點、負載', 'Default 0; for steady-state error check kG, zero and load first'),
              kD: t('到位後振盪時再加', 'Add it if it oscillates after arriving'),
              cruise: t(`上限 ${f(ff.maxVelocity * R2D, 0)} °/s 的 75%${ff.frictionIncluded ? '（已扣 kS）' : '（沒扣摩擦）'}`, `75% of the ${f(ff.maxVelocity * R2D, 0)} °/s limit${ff.frictionIncluded ? ' (kS subtracted)' : ' (friction not subtracted)'}`),
              accel: t(`上限的 75%${ff.frictionIncluded ? '（已扣 kS）' : ''}`, `75% of the limit${ff.frictionIncluded ? ' (kS subtracted)' : ''}`),
            }}
          />
          <dl className="small arm-derived">
            <dt>{t('水平重力力矩', 'Gravity torque at horizontal')}</dt>
            <dd>{f(ff.gravityTorque, 2)} N·m</dd>
            <dt>{t('轉動慣量', 'Moment of inertia')}</dt>
            <dd>{f(ff.inertia, 3)} kg·m²</dd>
</dl>
          {ff.warnings.map((w) => (
            <div key={w} className="warn">
              {w}
            </div>
          ))}
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn primary" type="button" onClick={() => toSim(false)}>
              {t('送到模擬', 'Send to sim')}
            </button>
            <button className="btn" type="button" onClick={() => toSim(true)} title={t('複製一份當「自訂」，在模擬裡自由改', 'Copy as “Custom” and change it freely in the sim')}>
              {t('複製成自訂再模擬', 'Copy as custom and simulate')}
            </button>
          </div>
          <p className="small muted" style={{ margin: '8px 0 0' }}>
            {t(
              <>
              參數名稱旁的小字是它怎麼來的：算、算＋量、量、調、限制（游標停在上面看說明）。分類跟電梯一樣，完整對照表在電梯的 1F。
              </>,
              <>
                The small tag next to each gain says where it comes from: calc, calc + measure, measure, tune, limit (hover for details). The categories are the same as the elevator; the full table is on the elevator’s 1F.
              </>,
            )}
          </p>
        </aside>
      </div>

      <details className="panel scen" style={{ marginTop: 20 }}>
        <summary>
          <b>{t('REV SPARK 設定', 'REV SPARK config')}</b>
          <span className="small muted">{t('用 SPARK MAX／Flex 的隊伍：把上面的參數卡轉成 REVLib 設定檔。', 'For teams on SPARK MAX / Flex: turn the parameter card above into a REVLib config file.')}</span>
        </summary>
        <div style={{ marginTop: 12 }}>
          <RevCode
            code={revArmJava(theory)}
            label="ArmRevConfig.java"
            onDownloadZip={() => downloadBlob('arm-rev-subsystem.zip', new Blob([armRevSubsystemZip(theory) as BlobPart], { type: 'application/zip' }))}
          />
        </div>
      </details>
    </section>
  )
}
