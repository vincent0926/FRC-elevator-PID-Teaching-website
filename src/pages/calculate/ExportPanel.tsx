import { useRef, useState } from 'react'
import { downloadText } from '../../app/download'
import { useStore } from '../../app/store'
import { JAVA_TEMPLATES, toRobotConfig } from '../../core/codegen'
import { addHistory } from '../../storage/db'
import { ElevatorMechanismSchema, parseParameterSet, type ParameterSet } from '../../schema/parameterSet'

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
