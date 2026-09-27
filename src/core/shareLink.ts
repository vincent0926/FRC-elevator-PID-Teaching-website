import { ElevatorMechanismSchema, type ElevatorMechanism } from '../schema/parameterSet'

/**
 * 分享機構資料的連結：機構資料 JSON → UTF-8 → base64url，放在網址的 ?m= 後面。
 * 打開連結時驗證格式，不對就不載入（不會把壞資料寫進隊員的瀏覽器）。
 */

export const SHARE_PARAM = 'm'

function toBase64Url(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)
  const bin = atob(b64)
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

export function encodeMechanism(m: ElevatorMechanism): string {
  return toBase64Url(new TextEncoder().encode(JSON.stringify(m)))
}

export function decodeMechanism(s: string): { ok: true; value: ElevatorMechanism } | { ok: false; error: string } {
  let data: unknown
  try {
    data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(fromBase64Url(s)))
  } catch {
    return { ok: false, error: '連結裡的資料壞掉了（可能複製時少了一段）' }
  }
  const r = ElevatorMechanismSchema.safeParse(data)
  return r.success ? { ok: true, value: r.data } : { ok: false, error: '連結裡的機構資料格式不對（可能是舊版網站產生的）' }
}

/** 產生分享網址：保留原本的路徑，換掉查詢字串，頁面固定到 1F */
export function shareUrl(base: string, m: ElevatorMechanism): string {
  const u = new URL(base)
  u.search = `?${SHARE_PARAM}=${encodeMechanism(m)}`
  u.hash = 'calc'
  return u.toString()
}
