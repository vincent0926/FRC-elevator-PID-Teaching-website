import { Component, type ReactNode } from 'react'

/**
 * 頁面出錯時顯示說明，不要讓整個網站變成一片黑。
 * 換頁或換機構（resetKey 改變）時自動重來。
 */
export class ErrorBoundary extends Component<{ resetKey: string; children: ReactNode }, { error: Error | null; key: string }> {
  state: { error: Error | null; key: string } = { error: null, key: this.props.resetKey }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  static getDerivedStateFromProps(props: { resetKey: string }, state: { error: Error | null; key: string }) {
    return props.resetKey !== state.key ? { error: null, key: props.resetKey } : null
  }

  componentDidCatch(error: Error) {
    console.error(error)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="panel" role="alert">
        <h2>這一頁出錯了</h2>
        <p>網站程式碰到沒預料到的狀況。你的機構資料還在，可以先試試下面的按鈕；如果一直發生，把下面這行訊息截圖給負責網站的人。</p>
        <p className="small muted">
          <code>{error.message}</code>
        </p>
        <button className="btn small" type="button" onClick={() => this.setState({ error: null })}>
          重新顯示這一頁
        </button>
      </div>
    )
  }
}
