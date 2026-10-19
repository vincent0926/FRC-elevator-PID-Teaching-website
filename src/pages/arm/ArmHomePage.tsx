import { useStore } from '../../app/store'
import { t } from '../../core/lang'

/** 手臂線的總覽：跟電梯差在哪、從哪裡開始 */

const DIFFS: [string, string, string][] = [
  [t('重力', 'Gravity'), t('kG 是常數', 'kG is constant'), t('kG·cos θ：水平最大、直立是 0、過了直立變負的', 'kG·cos θ: largest at horizontal, 0 when vertical, negative past vertical')],
  [t('位置', 'Position'), t('鼓輪線位移（m）', 'Drum rope displacement (m)'), t('角度（rad，0 = 水平、往上為正）', 'Angle (rad, 0 = horizontal, up is positive)')],
  [t('慣性', 'Inertia'), t('等效質量 Σmᵢkᵢ²', 'Equivalent mass Σmᵢkᵢ²'), t('轉動慣量 J = m(L²/12 + r²) + m_p·d²', 'Moment of inertia J = m(L²/12 + r²) + m_p·d²')],
  ['Phoenix 6', 'GravityType = Elevator_Static', t('GravityType = Arm_Cosine，而且角度 0 一定要是水平', 'GravityType = Arm_Cosine, and angle 0 must be horizontal')],
  [t('感測器', 'Sensor'), t('馬達內建編碼器', 'Motor’s built-in encoder'), t('內建編碼器（開機要歸零）或 CANcoder 絕對編碼器', 'Built-in encoder (zero at boot) or CANcoder absolute encoder')],
]

export function ArmHomePage() {
  const { go } = useStore()
  return (
    <section aria-labelledby="t-arm-home">
      <div className="head">
        <div>
          <h1 id="t-arm-home">{t('把手臂調好，而不是抄數字', 'Tune your arm, don’t just copy numbers')}</h1>
          <p className="lead">
            {t(
              <>
              單關節旋轉手臂。流程跟電梯一樣：從機構資料推出理論值，在模擬裡先跑一次，上機錄日誌，一次改一個參數。最大的差別是重力會跟著角度變。
              </>,
              <>
                A single-joint rotating arm. The flow is the same as the elevator: derive theory values from mechanism data, try them in the sim, record a log on the robot, change one gain at a time. The big difference is that gravity changes with angle.
              </>,
            )}
          </p>
        </div>
      </div>

      <button className="path-card guide-card" type="button" onClick={() => go('guide')}>
        <h2>{t('第一次來？先看使用說明', 'First time here? Read the guide')}</h2>
        <p>{t('怎麼從機構資料走到看懂調參建議、每一層怎麼操作、卡住了怎麼辦。大約 30 分鐘走一遍。', 'How to go from mechanism data to understanding the tuning advice, how each floor works, and what to do when you’re stuck. About 30 minutes end to end.')}</p>
      </button>

      <div className="grid2">
        <div className="panel">
          <h2>{t('第一次調手臂', 'Tuning an arm for the first time')}</h2>
          <ol className="small">
            {t(
              <>
              <li>1F 填手臂的質量、長度、重心、負載、齒比，看理論 kG、kV、kA 怎麼來。</li>
              <li>3F 模擬：先用理想模型，再打開摩擦、電流限制；看「把手臂當電梯」「零點設錯」這些情境。</li>
              <li>4F 先做完單元零（方向、零點在水平、軟體限位），在水平用兩點法量 kS、kG。</li>
              <li>1F 算出參數、寫進機器人程式，上機錄日誌，到 2F 找問題，一次改一個參數。</li>
              </>,
              <>
                <li>In 1F, enter the arm’s mass, length, center of mass, load and gear ratio, and see where the theory kG, kV and kA come from.</li>
                <li>3F sim: start with the ideal model, then turn on friction and current limits; look at scenarios like “treating the arm as an elevator” and “wrong zero”.</li>
                <li>In 4F, finish unit 0 first (direction, zero at horizontal, soft limits), then measure kS and kG at horizontal with the two-point method.</li>
                <li>Calculate gains in 1F, put them in the robot code, record a log on the robot, find the problem in 2F, and change one gain at a time.</li>
              </>,
            )}
          </ol>
          <div className="row">
            <button className="btn primary" type="button" onClick={() => go('calc')}>
              {t('1F 計算參數', '1F Calculate gains')}
            </button>
            <button className="btn" type="button" onClick={() => go('sim')}>
              {t('3F 模擬', '3F Simulate')}
            </button>
            <button className="btn" type="button" onClick={() => go('learn')}>
              {t('4F 上機前準備', '4F Prep before the robot')}
            </button>
          </div>
        </div>
        <div className="panel">
          <h2>{t('手臂跟電梯差在哪', 'How an arm differs from an elevator')}</h2>
          <div style={{ overflowX: 'auto' }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th></th>
                  <th>{t('電梯', 'Elevator')}</th>
                  <th>{t('手臂', 'Arm')}</th>
                </tr>
              </thead>
              <tbody>
                {DIFFS.map(([k, e, a]) => (
                  <tr key={k}>
                    <th>{k}</th>
                    <td>{e}</td>
                    <td>{a}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="warn" style={{ marginTop: 16 }}>
        {t(
          <>
          <b>網站不能當急停。</b>急停一律用 Driver Station。手臂轉起來比電梯更容易打到人：上機時所有人離開手臂轉得到的範圍。
          </>,
          <>
            <b>The site is not an e-stop.</b> Always use the Driver Station. A swinging arm hits people more easily than an elevator: everyone stays out of the arm’s reach during testing.
          </>,
        )}
      </div>
    </section>
  )
}
