/**
 * 進站過場：像電梯門一樣左右兩片（決策 147）。預設是打開的動畫（從關著滑開），`closing` 時從開著關上。
 * `sign` 時門上亮出隊號（按「開始」之後關門亮起，選機構那頁開門前淡掉，決策 148）。
 * 只有 CSS 動畫；減少動態效果時動畫全關，門停在打開（畫面外），不擋東西。
 */
export function Doors({ closing = false, sign = false }: { closing?: boolean; sign?: boolean }) {
  return (
    <div className={closing ? 'doors closing' : 'doors'} aria-hidden="true">
      <span className="door-l" />
      <span className="door-r" />
      {sign && (
        <b className="doors-sign">
          <i>▲</i>
          9427
        </b>
      )}
    </div>
  )
}

/** 按「開始」的爆光：光環、彩色碎片從按鈕炸開，速度線往下掃（像電梯往上衝），決策 148 */
const SPARKS = Array.from({ length: 18 }, (_, i) => ({ a: i * 20 + (i % 2) * 8, d: 120 + (i % 3) * 70 }))
const STREAKS = [6, 14, 22, 31, 39, 47, 55, 63, 71, 80, 88, 95]

export function Burst({ x, y }: { x: number; y: number }) {
  return (
    <div className="burst" aria-hidden="true" style={{ '--bx': `${x}px`, '--by': `${y}px` } as React.CSSProperties}>
      <span className="burst-flash" />
      <span className="burst-ring" />
      <span className="burst-ring r2" />
      {SPARKS.map((s, i) => (
        <span key={i} className="burst-spark" style={{ '--a': `${s.a}deg`, '--d': `${s.d}px` } as React.CSSProperties} />
      ))}
      {STREAKS.map((left, i) => (
        <span key={left} className="burst-streak" style={{ left: `${left}%`, animationDelay: `${0.15 + (i % 4) * 0.07}s` }} />
      ))}
    </div>
  )
}
