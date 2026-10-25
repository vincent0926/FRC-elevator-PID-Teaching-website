import { useState } from 'react'
import { t } from '../core/lang'

/** REV SPARK 的設定檔：程式碼、複製按鈕，跟要上機確認的兩件事 */

export function RevNote() {
  return (
    <ul className="small muted" style={{ margin: '0 0 8px', paddingLeft: 18 }}>
      <li>{t('REV 的 P、I、D 輸出是工作週期（-1～1），所以程式把網站的 V 增益除以 12；kS、kV、kA、kG 本來就是伏特。', 'REV’s P, I, D output is duty cycle (-1 to 1), so the code divides the site’s V gains by 12; kS, kV, kA, kG are already volts.')}</li>
      <li>{t('encoder 的換算係數讓位置、速度變成「機構圈數」和 rps，所以巡航速度、加速度也是 rps、rps/s。', 'The encoder conversion factors turn position and velocity into mechanism rotations and rps, so cruise velocity and acceleration are rps and rps/s as well.')}</li>
      <li>{t('這份沒有在真機上測過：上機前先用低速、小行程確認方向和單位，再放大。REVLib 版本不同方法名稱可能不同，以你們專案的版本為準。', 'This was not tested on a real robot: before running, check direction and units at low speed and short travel, then scale up. Method names can differ between REVLib versions; follow the version in your project.')}</li>
    </ul>
  )
}

export function RevCode({ code, label }: { code: string; label: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard
      ?.writeText(code)
      .then(() => setCopied(true))
      .catch(() => {})
  }
  return (
    <div>
      <RevNote />
      <div className="row">
        <button className="btn small" type="button" onClick={copy}>
          {t(`複製 ${label}`, `Copy ${label}`)}
        </button>
        {copied && <span className="small">{t('已複製到剪貼簿。', 'Copied to the clipboard.')}</span>}
      </div>
      <pre className="code">{code}</pre>
    </div>
  )
}
