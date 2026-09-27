import { ParameterSetSchema, type ParameterSet } from '../schema/parameterSet'

/**
 * IndexedDB：參數歷程。只存參數組（很小），設筆數上限，超過時刪最舊的。
 * 日誌原始檔不存，只存解析後的結果（Phase 2 再加指標）。
 */

const DB_NAME = 'elevator-tuner'
const DB_VERSION = 1
const HISTORY = 'paramHistory'
export const HISTORY_LIMIT = 50

/** 參數庫的標籤：自己存的才有標籤；輸出程式時自動記的沒有（超過上限會被刪） */
export type ParamTag = 'theory' | 'simBest' | 'final' | 'other'
export const PARAM_TAGS: { id: ParamTag; label: string }[] = [
  { id: 'theory', label: '理論值' },
  { id: 'simBest', label: '模擬最佳' },
  { id: 'final', label: '實機最終' },
  { id: 'other', label: '其他' },
]

export interface HistoryEntry {
  id?: number
  savedAt: string
  label: string
  params: ParameterSet
  tag?: ParamTag
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('瀏覽器不支援 IndexedDB'))
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(HISTORY)) db.createObjectStore(HISTORY, { keyPath: 'id', autoIncrement: true })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

export async function listHistory(): Promise<HistoryEntry[]> {
  const db = await open()
  const tx = db.transaction(HISTORY, 'readonly')
  const req = tx.objectStore(HISTORY).getAll()
  await done(tx)
  db.close()
  // 讀回來時再驗一次格式，舊版或損壞的資料直接略過
  return (req.result as HistoryEntry[]).filter((e) => ParameterSetSchema.safeParse(e.params).success).reverse()
}

export async function addHistory(label: string, params: ParameterSet, tag?: ParamTag): Promise<void> {
  const db = await open()
  const tx = db.transaction(HISTORY, 'readwrite')
  const store = tx.objectStore(HISTORY)
  store.add({ savedAt: new Date().toISOString(), label, params, ...(tag ? { tag } : {}) } satisfies HistoryEntry)
  // 只刪自動紀錄（沒有標籤）的舊資料；使用者自己存的參數組不會被刪
  const allReq = store.getAll()
  allReq.onsuccess = () => {
    const auto = (allReq.result as HistoryEntry[]).filter((e) => !e.tag)
    for (let i = 0; i < auto.length - HISTORY_LIMIT; i++) store.delete(auto[i].id!)
  }
  await done(tx)
  db.close()
}

export async function deleteHistory(id: number): Promise<void> {
  const db = await open()
  const tx = db.transaction(HISTORY, 'readwrite')
  tx.objectStore(HISTORY).delete(id)
  await done(tx)
  db.close()
}
