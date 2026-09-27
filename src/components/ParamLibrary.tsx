import { useCallback, useEffect, useState } from 'react'
import { downloadText } from '../app/download'
import { useStore } from '../app/store'
import { diffParams } from '../core/paramDiff'
import { addHistory, deleteHistory, listHistory, PARAM_TAGS, type HistoryEntry, type ParamTag } from '../storage/db'
import type { ParameterSet } from '../schema/parameterSet'

/**
 * 參數庫：把幾組參數存起來（理論值、模擬最佳、實機最終），之後可以逐項比較、載入、在 3F 疊圖。
 * 存在這台電腦的瀏覽器（IndexedDB）；要給隊友或換電腦就下載 JSON。
 * 輸出程式時也會自動記一筆（沒有標籤，只留最近 50 筆）。
 */

type Filter = ParamTag | 'auto' | 'all'

const tagLabel = (t?: ParamTag) => PARAM_TAGS.find((x) => x.id === t)?.label ?? '自動紀錄'
const fmt = (v: number | undefined) => (v === undefined ? '—' : Math.abs(v) >= 100 ? v.toFixed(1) : Number(v.toPrecision(4)).toString())
const fileSafe = (s: string) => s.replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 40) || 'params'

export function ParamLibrary({ current, currentLabel, defaultTag }: { current: ParameterSet; currentLabel: string; defaultTag: ParamTag }) {
  const { setCustom, setSimSource, setCompareSet, compareSet, page, go } = useStore()
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [label, setLabel] = useState('')
  const [tag, setTag] = useState<ParamTag>(defaultTag)
  const [filter, setFilter] = useState<Filter>('all')
  const [open, setOpen] = useState<number | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const refresh = useCallback(() => {
    listHistory()
      .then((e) => {
        setEntries(e)
        setError(null)
      })
      .catch((e: Error) => setError(e.message))
  }, [])
  useEffect(refresh, [refresh])

  const save = () => {
    const name = label.trim() || `${tagLabel(tag)}（${currentLabel}）`
    addHistory(name, { ...current, note: name }, tag)
      .then(() => {
        setLabel('')
        setMsg(`已存：${name}`)
        refresh()
      })
      .catch((e: Error) => setError(e.message))
  }
  const remove = (e: HistoryEntry) => {
    if (e.id === undefined || !confirm(`刪除「${e.label}」？`)) return
    deleteHistory(e.id)
      .then(refresh)
      .catch((err: Error) => setError(err.message))
  }
  const load = (e: HistoryEntry) => {
    setCustom({ ...e.params, source: 'custom', createdAt: new Date().toISOString(), note: e.label })
    setSimSource('custom')
    const same = diffParams(current, e.params).sameMechanism
    setMsg(`已把「${e.label}」載入成「自訂」。${same ? '' : '注意：這組是用不同的機構資料存的，機構資料沒有跟著改；要整組換掉就下載後到 1F 匯入。'}`)
  }
  const overlay = (e: HistoryEntry) => {
    setCompareSet({ label: e.label, params: e.params })
    if (page !== 'sim') go('sim')
  }

  const shown = (entries ?? []).filter((e) => filter === 'all' || (filter === 'auto' ? !e.tag : e.tag === filter))

  return (
    <div className="stack param-lib">
      <p className="small muted" style={{ margin: 0 }}>
        存在這台電腦的瀏覽器裡。調好一組就存一組，標上是「理論值」「模擬最佳」還是「實機最終」，之後才比得出來改了什麼、哪一組比較好。換電腦或給隊友：按「下載」存成 JSON，再到 1F「匯入」。
      </p>
      <div className="row">
        <label className="f" style={{ flex: '2 1 200px' }}>
          名稱
          <span className="inp">
            <input value={label} placeholder={`例如：比賽前 ${new Date().getMonth() + 1}/${new Date().getDate()}`} onChange={(e) => setLabel(e.target.value)} />
          </span>
        </label>
        <label className="f" style={{ flex: '1 1 120px' }}>
          標籤
          <span className="inp">
            <select value={tag} onChange={(e) => setTag(e.target.value as ParamTag)}>
              {PARAM_TAGS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </span>
        </label>
        <button className="btn primary" type="button" onClick={save} style={{ alignSelf: 'flex-end' }}>
          存目前的（{currentLabel}）
        </button>
      </div>
      {msg && <div className="ok">{msg}</div>}
      {error && <div className="warn">參數庫無法使用：{error}（無痕模式或瀏覽器擋掉儲存空間時會這樣，改用下載 JSON。）</div>}

      <div className="seg" role="group" aria-label="篩選">
        {([['all', '全部'], ...PARAM_TAGS.map((t) => [t.id, t.label]), ['auto', '自動紀錄']] as [Filter, string][]).map(([id, l]) => (
          <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)}>
            {l}
          </button>
        ))}
      </div>

      {entries && shown.length === 0 && <p className="small muted">{entries.length === 0 ? '還沒有存任何參數組。' : '這個標籤下沒有參數組。'}</p>}
      <ul className="lib-list">
        {shown.map((e) => {
          const d = open === e.id ? diffParams(current, e.params) : null
          const isCompared = compareSet?.label === e.label
          return (
            <li key={e.id}>
              <div className="lib-head">
                <span className={'tag' + (e.tag === 'final' ? ' done' : e.tag ? ' must' : '')}>{tagLabel(e.tag)}</span>
                <b>{e.label}</b>
                <span className="small muted">{new Date(e.savedAt).toLocaleString('zh-TW', { dateStyle: 'short', timeStyle: 'short' })}</span>
                <span className="small muted">
                  kG {fmt(e.params.feedforward.kG)}・kV {fmt(e.params.feedforward.kV)}・kP {fmt(e.params.feedback.kP)}・kD {fmt(e.params.feedback.kD)}
                </span>
              </div>
              <div className="row small">
                <button className="linkbtn" type="button" onClick={() => setOpen(open === e.id ? null : (e.id ?? null))}>
                  {open === e.id ? '收起比較' : `跟${currentLabel}比`}
                </button>
                <button className="linkbtn" type="button" onClick={() => load(e)}>
                  載入成「自訂」
                </button>
                <button className="linkbtn" type="button" onClick={() => overlay(e)} disabled={isCompared}>
                  {isCompared ? '3F 正在疊這組' : '在 3F 疊圖比較'}
                </button>
                <button className="linkbtn" type="button" onClick={() => downloadText(`elevator-params-${fileSafe(e.label)}.json`, JSON.stringify(e.params, null, 2) + '\n', 'application/json')}>
                  下載
                </button>
                <button className="linkbtn" type="button" onClick={() => remove(e)}>
                  刪除
                </button>
              </div>
              {d && (
                <div style={{ overflowX: 'auto' }}>
                  {!d.sameMechanism && <div className="note small">這組的機構資料（質量、齒比……）跟目前的不一樣，前饋值本來就會不同。</div>}
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>參數</th>
                        <th className="num">{currentLabel}</th>
                        <th className="num">這組</th>
                        <th className="num">差</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.rows.map((r) => (
                        <tr key={r.key} className={r.changed ? 'lib-changed' : undefined}>
                          <td>
                            {r.label} <span className="muted small">{r.unit}</span>
                          </td>
                          <td className="num">{fmt(r.a)}</td>
                          <td className="num">{fmt(r.b)}</td>
                          <td className="num">{!r.changed ? '一樣' : r.rel === null ? '有改' : `${r.rel > 0 ? '+' : ''}${(r.rel * 100).toFixed(0)}%`}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
