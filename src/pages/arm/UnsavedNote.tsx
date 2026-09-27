import { useArm } from './armStore'

/** 瀏覽器存不了資料時提醒：改的值還在畫面上，但重新整理會不見 */
export function UnsavedNote() {
  const { unsaved } = useArm()
  if (!unsaved) return null
  return (
    <div className="warn" role="status" style={{ marginBottom: 12 }}>
      <b>還沒存起來。</b>瀏覽器不讓網站存資料（私密視窗或儲存空間滿了），剛剛改的值只在這個畫面上，重新整理會回到上次存的值。
    </div>
  )
}
