import { useRef, useState } from 'react'
import { downloadBlob, downloadText } from '../../app/download'
import { useStore } from '../../app/store'
import { JAVA_TEMPLATES, toRobotConfig } from '../../core/codegen'
import { addHistory } from '../../storage/db'
import { ElevatorMechanismSchema, parseParameterSet, type ParameterSet } from '../../schema/parameterSet'
import { ROBORIO_SNIPPET } from './robotSnippets'
import { subsystemZip } from './subsystemExport'

/**
 * 輸出：Java 範本（進版本控制，是參數的最終依據）、deploy 用 JSON、參數組。
 * 匯入：參數組或只有機構資料的「機器人預設檔」。
 */

export function ExportPanel({ ps }: { ps: ParameterSet }) {
  const { setMechanism, setCustom } = useStore()
  const [tpl, setTpl] = useState(JAVA_TEMPLATES[JAVA_TEMPLATES.length - 1].id)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'warn'; text: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const isRev = ps.mechanism.motor === 'neo'

  const doJava = () => {
    const t = JAVA_TEMPLATES.find((x) => x.id === tpl) ?? JAVA_TEMPLATES[0]
    downloadText('ElevatorGains.java', t.render(ps), 'text/x-java')
    void addHistory(`輸出 Java（${t.label}）`, ps).catch(() => {})
    setMsg({ kind: 'ok', text: '已下載 ElevatorGains.java。放進 src/main/java/frc/robot/subsystems/elevator/ 後 commit，這才是參數的最終依據。' })
  }
  const doJson = () => {
    downloadText('elevator-gains.json', JSON.stringify(toRobotConfig(ps), null, 2) + '\n', 'application/json')
    void addHistory('輸出 JSON 設定檔', ps).catch(() => {})
    setMsg({ kind: 'ok', text: '已下載 elevator-gains.json。放進 src/main/deploy/，機器人開機時讀取；缺欄位時會在 Dashboard 警告並用程式碼裡的預設值。' })
  }
  const doZip = () => {
    try {
      const bytes = subsystemZip(ps)
      downloadBlob('elevator-subsystem.zip', new Blob([bytes as BlobPart], { type: 'application/zip' }))
      void addHistory('輸出完整子系統', ps).catch(() => {})
      setMsg({ kind: 'ok', text: '已下載 elevator-subsystem.zip：解壓縮後把 src/ 複製到機器人專案，先看 README.md 裡「一定要自己改」的地方（CAN ID、馬達方向）。' })
    } catch (e) {
      setMsg({ kind: 'warn', text: `產生失敗：${e instanceof Error ? e.message : String(e)}` })
    }
  }
  const doParams = () => {
    downloadText(`elevator-params-${ps.source}.json`, JSON.stringify(ps, null, 2) + '\n', 'application/json')
    setMsg({ kind: 'ok', text: '已下載參數組。可以傳給隊友，或之後用「匯入」讀回來。' })
  }

  const onFile = async (file: File) => {
    let data: unknown
    try {
      data = JSON.parse(await file.text())
    } catch {
      setMsg({ kind: 'warn', text: `${file.name} 不是有效的 JSON。` })
      return
    }
    const asParams = parseParameterSet(data)
    if (asParams.ok) {
      setMechanism(asParams.value.mechanism)
      if (asParams.value.source !== 'theory') setCustom({ ...asParams.value, source: 'custom' })
      setMsg({
        kind: 'ok',
        text: `已載入 ${file.name}：機構資料已更新${asParams.value.source !== 'theory' ? '，參數存成「自訂」，可以到模擬選「自訂」比較' : ''}。`,
      })
      return
    }
    const asMech = ElevatorMechanismSchema.safeParse(data)
    if (asMech.success) {
      setMechanism(asMech.data)
      setMsg({ kind: 'ok', text: `已載入機器人預設檔 ${file.name}。` })
      return
    }
    setMsg({ kind: 'warn', text: `${file.name} 格式不符，沒有載入任何東西：${asParams.errors.slice(0, 4).join('；')}` })
  }

  return (
    <div className="stack">
      <div>
        <h3>輸出到機器人專案</h3>
        {isRev ? (
          <div className="warn">NEO 屬於 REV，第一版只支援 Phoenix 6 輸出。</div>
        ) : (
          <>
            <div className="row">
              <label className="f" style={{ flex: '1 1 160px' }}>
                Java 範本
                <span className="inp">
                  <select value={tpl} onChange={(e) => setTpl(e.target.value)}>
                    {JAVA_TEMPLATES.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </span>
              </label>
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <button className="btn" type="button" onClick={doJava}>
                下載 Java
              </button>
              <button className="btn" type="button" onClick={doJson}>
                下載 JSON 設定檔
              </button>
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <button className="btn primary" type="button" onClick={doZip}>
                下載完整子系統（.zip）
              </button>
            </div>
            <p className="small muted" style={{ margin: '6px 0 0' }}>
              包含 IO 介面、TalonFX 實作（Motion Magic、上下 Slot、Stator／Supply 電流限制、軟體限位、輸出上限）、子系統（安全保護、歸零、SysId）、
              AdvantageKit 需要的日誌欄位、LoggedTunableNumber，數字已經換成這台電梯的。
            </p>
            <details style={{ marginTop: 8 }}>
              <summary className="small" style={{ cursor: 'pointer' }}>
                為什麼建議 PID 在馬達控制器上跑，而不是 roboRIO？
              </summary>
              <div className="small" style={{ marginTop: 6 }}>
                <ul className="ul">
                  <li>
                    <b>快 20 倍</b>：TalonFX 每 1 ms 算一次閉迴路；roboRIO 的主迴圈 20 ms 一次，算出來的電壓還要經過 CAN 送到馬達，又多幾 ms 延遲。
                  </li>
                  <li>
                    <b>延遲讓 kP 不能大</b>：控制器看到的是舊的位置，kP 一大就推過頭，開始振盪（3F 情境「控制週期」「感測延遲」）。在 TalonFX 上同樣的 kP 很穩。
                  </li>
                  <li>
                    <b>roboRIO 當機或卡頓不影響</b>：主迴圈 overrun 時，TalonFX 還是照最後的目標繼續控制。
                  </li>
                  <li>
                    <b>什麼時候用 roboRIO</b>：馬達控制器不支援需要的控制方式（例如要自己的前饋模型），或是 SPARK MAX 這類要自己在 roboRIO 算 TrapezoidProfile 加 ElevatorFeedforward 的情況。
                    這時要把 kP 設小、注意 20 ms 的週期。寫法如下：
                  </li>
                </ul>
                <pre className="code">{ROBORIO_SNIPPET}</pre>
              </div>
            </details>
          </>
        )}
      </div>
      <div>
        <h3>參數組</h3>
        <div className="row">
          <button className="btn" type="button" onClick={doParams}>
            匯出參數組
          </button>
          <button className="btn" type="button" onClick={() => fileRef.current?.click()}>
            匯入參數組或預設檔
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) void onFile(file)
            }}
          />
        </div>
      </div>
      {msg && (
        <div className={msg.kind} role="status">
          {msg.text}
        </div>
      )}
    </div>
  )
}
