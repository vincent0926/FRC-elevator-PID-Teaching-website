import type { CSSProperties, ReactNode } from 'react'

/** 收合面板：標題旁一行摘要，不展開也知道裡面有什麼、現在是什麼狀態（3F 進階面板共用） */
export function Fold({ title, summary, open, style, children }: { title: ReactNode; summary: ReactNode; open?: boolean; style?: CSSProperties; children: ReactNode }) {
  return (
    <details className="panel scen" open={open || undefined} style={style}>
      <summary>
        <b>{title}</b>
        <span className="small muted">{summary}</span>
      </summary>
      <div style={{ marginTop: 12 }}>{children}</div>
    </details>
  )
}
