import { useRef, useState } from 'react'
import { downloadBlob, downloadText } from '../../app/download'
import { renderArmGains, toArmRobotConfig } from '../../core/codegen/arm'
import { ArmMechanismSchema, ArmParameterSetSchema } from '../../schema/armParameterSet'
import { armSubsystemZip } from './armSubsystemExport'
import { useArm } from './armStore'

/**
 * 手臂的輸出：ArmGains.java（進版本控制，是參數的最終依據）、deploy 用 JSON、完整子系統、參數組。
 * 匯入：手臂參數組或只有機構資料的預設檔。
 */

type Which = 'theory' | 'custom'

export function ArmExportPanel() {
  const { theory, custom, setArm, setCustom, setSource } = useArm()
  const [which, setWhich] = useState<Which>('theory')
  const [msg, setMsg] = useState<{ kind: 'ok' | 'warn'; text: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const ps = which === 'custom' && custom ? custom : theory
  const isRev = ps.mechanism.motor === 'neo'
  const cancoder = ps.mechanism.encoder === 'cancoder'

  const doJava = () => {
    downloadText('ArmGains.java', renderArmGains(ps), 'text/x-java')
    setMsg({ kind: 'ok', text: '已下載 ArmGains.java。放進 src/main/java/frc/robot/subsystems/arm/ 後 commit，這才是參數的最終依據。' })
  }
  const doJson = () => {
    downloadText('arm-gains.json', JSON.stringify(toArmRobotConfig(ps), null, 2) + '\n', 'application/json')
    setMsg({ kind: 'ok', text: '已下載 arm-gains.json。放進 src/main/deploy/；齒比或感測器跟程式碼不同時機器人會忽略整個檔案並警告。' })
  }
  const doZip = () => {
    try {
      downloadBlob('arm-subsystem.zip', new Blob([armSubsystemZip(ps) as BlobPart], { type: 'application/zip' }))
      setMsg({ kind: 'ok', text: '已下載 arm-subsystem.zip：解壓縮後把 src/ 複製到機器人專案，先看 README.md 裡「一定要自己改」的地方。' })
    } catch (e) {
      setMsg({ kind: 'warn', text: `產生失敗：${e instanceof Error ? e.message : String(e)}` })
    }
  }
  const doParams = () => {
    downloadText(`arm-params-${ps.source}.json`, JSON.stringify(ps, null, 2) + '\n', 'application/json')
    setMsg({ kind: 'ok', text: '已下載手臂參數組。可以傳給隊友，或之後用「匯入」讀回來。' })
  }

  const onFile = async (file: File) => {
    let data: unknown
    try {
      data = JSON.parse(await file.text())
    } catch {
      setMsg({ kind: 'warn', text: `${file.name} 不是有效的 JSON。` })
      return
    }
    const asParams = ArmParameterSetSchema.safeParse(data)
    if (asParams.success) {
      setArm(asParams.data.mechanism)
      if (asParams.data.source !== 'theory') {
        setCustom({ ...asParams.data, source: 'custom' })
        setSource('custom')
      }
      setMsg({ kind: 'ok', text: `已載入 ${file.name}：機構資料已更新${asParams.data.source !== 'theory' ? '，參數存成「自訂」' : ''}。` })
      return
    }
    const asMech = ArmMechanismSchema.safeParse(data)
    if (asMech.success) {
      setArm(asMech.data)
      setMsg({ kind: 'ok', text: `已載入手臂預設檔 ${file.name}。` })
      return
    }
    const errs = asParams.error.issues.slice(0, 4).map((i) => `${i.path.join('.') || '(根)'}：${i.message}`)
    setMsg({ kind: 'warn', text: `${file.name} 不是手臂的參數組，沒有載入任何東西：${errs.join('；')}` })
  }

  return (
    <div className="stack">
      <div>
        <h3>輸出到機器人專案</h3>
        {isRev ? (
          <div className="warn">NEO 屬於 REV，目前只支援 Phoenix 6 輸出。</div>
        ) : (
          <>
            <div className="seg" role="group" aria-label="輸出哪一組參數">
              <button type="button" aria-pressed={which === 'theory'} onClick={() => setWhich('theory')}>
                理論值
              </button>
              <button type="button" aria-pressed={which === 'custom'} disabled={!custom} onClick={() => setWhich('custom')} title={custom ? undefined : '還沒有自訂參數：先按「複製成自訂再模擬」'}>
                自訂（3F 調的）
              </button>
            </div>
            <p className="small muted" style={{ margin: '6px 0 0' }}>
              GravityType = Arm_Cosine；角度感測器：{cancoder ? `CANcoder（${ps.mechanism.cancoderToArmRatio} : 1）` : 'TalonFX 內建編碼器'}（在機構資料改）。
            </p>
            <div className="row" style={{ marginTop: 10 }}>
              <button className="btn" type="button" onClick={doJava}>
                下載 ArmGains.java
              </button>
              <button className="btn" type="button" onClick={doJson}>
                下載 JSON 設定檔
              </button>
              <button className="btn primary" type="button" onClick={doZip}>
                下載完整子系統（.zip）
              </button>
            </div>
            <p className="small muted" style={{ margin: '6px 0 0' }}>
              包含 IO 介面、TalonFX 實作（{cancoder ? 'RemoteCANcoder、磁鐵偏移' : '開機角度'}、電流限制、軟體限位、輸出上限）、子系統（安全保護、SysId、錄日誌用的測試動作）、
              AdvantageKit 日誌欄位（網站 2F 會自動認得）、LoggedTunableNumber。
            </p>
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
