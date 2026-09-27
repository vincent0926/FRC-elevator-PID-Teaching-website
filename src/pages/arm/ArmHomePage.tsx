import { useStore } from '../../app/store'

/** 手臂線的總覽：跟電梯差在哪、從哪裡開始 */

const DIFFS: [string, string, string][] = [
  ['重力', 'kG 是常數', 'kG·cos θ：水平最大、直立是 0、過了直立變負的'],
  ['位置', '鼓輪線位移（m）', '角度（rad，0 = 水平、往上為正）'],
  ['慣性', '等效質量 Σmᵢkᵢ²', '轉動慣量 J = m(L²/12 + r²) + m_p·d²'],
  ['Phoenix 6', 'GravityType = Elevator_Static', 'GravityType = Arm_Cosine，而且角度 0 一定要是水平'],
  ['感測器', '馬達內建編碼器', '內建編碼器（開機要歸零）或 CANcoder 絕對編碼器'],
]

export function ArmHomePage() {
  const { go } = useStore()
  return (
    <section aria-labelledby="t-arm-home">
      <div className="head">
        <div>
          <h1 id="t-arm-home">把手臂調好，而不是抄數字</h1>
          <p className="lead">
            單關節旋轉手臂。流程跟電梯一樣：從機構資料推出理論值，在模擬裡先跑一次，上機錄日誌，一次改一個參數。最大的差別是重力會跟著角度變。
          </p>
        </div>
      </div>

      <div className="grid2">
        <div className="panel">
          <h2>第一次調手臂</h2>
          <ol className="small">
            <li>1F 填手臂的質量、長度、重心、負載、齒比，看理論 kG、kV、kA 怎麼來。</li>
            <li>3F 模擬：先用理想模型，再打開摩擦、電流限制；看「把手臂當電梯」「零點設錯」這些情境。</li>
            <li>4F 先做完單元零（方向、零點在水平、軟體限位），在水平用兩點法量 kS、kG。</li>
            <li>1F 下載 Java（ArmGains 或完整子系統），上機錄日誌，到 2F 找問題，一次改一個參數。</li>
          </ol>
          <div className="row">
            <button className="btn primary" type="button" onClick={() => go('calc')}>
              1F 計算參數
            </button>
            <button className="btn" type="button" onClick={() => go('sim')}>
              3F 模擬
            </button>
            <button className="btn" type="button" onClick={() => go('learn')}>
              4F 上機前準備
            </button>
          </div>
        </div>
        <div className="panel">
          <h2>手臂跟電梯差在哪</h2>
          <div style={{ overflowX: 'auto' }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th></th>
                  <th>電梯</th>
                  <th>手臂</th>
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
        <b>網站不能當急停。</b>急停一律用 Driver Station。手臂轉起來比電梯更容易打到人：上機時所有人離開手臂轉得到的範圍。
      </div>
    </section>
  )
}
