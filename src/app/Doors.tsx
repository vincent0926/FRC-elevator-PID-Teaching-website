/**
 * 進站過場：像電梯門一樣左右兩片（決策 147）。預設是打開的動畫（從關著滑開），`closing` 時從開著關上。
 * 只有 CSS 動畫；減少動態效果時動畫全關，門停在打開（畫面外），不擋東西。
 */
export function Doors({ closing = false }: { closing?: boolean }) {
  return (
    <div className={closing ? 'doors closing' : 'doors'} aria-hidden="true">
      <span />
      <span />
    </div>
  )
}
