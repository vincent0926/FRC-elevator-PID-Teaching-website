import { useEffect, useState } from 'react'

/**
 * 兩種更新提示：
 *   1. Service Worker 發現新檔案（registerSW 的 onNeedRefresh）
 *   2. 連網時抓 version.json，比對目前版本 → 最新版本
 * 離線時兩者都安靜失敗，網站照常用快取。
 */

export function UpdateBanner() {
  const [latest, setLatest] = useState<string | null>(null)
  const [offlineReady, setOfflineReady] = useState(false)
  const [update, setUpdate] = useState<((reload?: boolean) => Promise<void>) | null>(null)

  useEffect(() => {
    if (import.meta.env.DEV) return
    let cancelled = false
    import('virtual:pwa-register')
      .then(({ registerSW }) => {
        const updateSW = registerSW({
          onNeedRefresh: () => !cancelled && setUpdate(() => updateSW),
          onOfflineReady: () => !cancelled && setOfflineReady(true),
        })
      })
      .catch(() => {})
    fetch('./version.json', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((v: { version?: string } | null) => {
        if (!cancelled && v?.version && v.version !== __APP_VERSION__) setLatest(v.version)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  if (update || latest) {
    return (
      <div className="banner" role="status">
        <span>
          有新版本{latest ? `：${__APP_VERSION__} → ${latest}` : ''}。
        </span>
        <button className="btn small" type="button" onClick={() => (update ? update(true) : location.reload())}>
          重新整理
        </button>
      </div>
    )
  }
  if (offlineReady) {
    return (
      <div className="banner" role="status">
        <span>已存到這台裝置，之後沒有網路也能用。</span>
        <button className="btn small" type="button" onClick={() => setOfflineReady(false)}>
          知道了
        </button>
      </div>
    )
  }
  return null
}
