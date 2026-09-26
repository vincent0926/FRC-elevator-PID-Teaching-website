import { ParameterSetSchema, type ParameterSet } from '../schema/parameterSet'

/**
 * IndexedDB：參數歷程。只存參數組（很小），設筆數上限，超過時刪最舊的。
 * 日誌原始檔不存，只存解析後的結果（Phase 2 再加指標）。
 */

const DB_NAME = 'elevator-tuner'
const DB_VERSION = 1
const HISTORY = 'paramHistory'
export const HISTORY_LIMIT = 50

export interface HistoryEntry {
  id?: number
  savedAt: string
  label: string
  params: ParameterSet
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

export async function addHistory(label: string, params: ParameterSet): Promise<void> {
  const db = await open()
  const tx = db.transaction(HISTORY, 'readwrite')
  const store = tx.objectStore(HISTORY)
  store.add({ savedAt: new Date().toISOString(), label, params } satisfies HistoryEntry)
  const keysReq = store.getAllKeys()
  keysReq.onsuccess = () => {
    const keys = keysReq.result
    for (let i = 0; i < keys.length - HISTORY_LIMIT; i++) store.delete(keys[i])
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
