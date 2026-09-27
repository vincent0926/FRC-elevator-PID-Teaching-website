import { useStore } from '../../app/store'

/** 手臂線還沒做完的樓層（2F、4F 下一版） */
export function ArmComingSoon({ floor }: { floor: string }) {
  const { go, setTrack } = useStore()
  return (
    <section>
      <div className="head">
        <div>
          <h1>手臂・{floor}</h1>
          <p className="lead">手臂版的這一層還在製作中，下一版推出。</p>
        </div>
      </div>
      <div className="panel stack">
        <p style={{ margin: 0 }}>
          調參流程跟電梯一樣，差在重力是 kG·cos θ。現在可以先用手臂的 1F 算理論值、3F 模擬；日誌診斷和實機教學可以先看電梯版，觀念大多相同。
        </p>
        <div className="row">
          <button className="btn primary" type="button" onClick={() => go('calc')}>
            到手臂 1F 計算參數
          </button>
          <button className="btn" type="button" onClick={() => go('sim')}>
            到手臂 3F 模擬
          </button>
          <button className="btn" type="button" onClick={() => setTrack('elevator')}>
            先看電梯版
          </button>
        </div>
      </div>
    </section>
  )
}
