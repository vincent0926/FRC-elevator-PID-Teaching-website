import { useStore } from '../app/store'
import { t } from '../core/lang'

/**
 * 總覽頁最上面的「快速開始」：第一次來的人只走三步，先看到自己機構的第一組數字。
 * 電梯、手臂共用；完整的調參循環與其他入口收在下面。
 */
export function QuickStart() {
  const { go } = useStore()
  return (
    <div className="panel quick-start">
      <h2>{t('快速開始：三步看到第一組參數', 'Quick start: your first gains in three steps')}</h2>
      <ol className="qs-steps">
        <li>
          <b>{t('1F 填資料', '1F Enter data')}</b>
        </li>
        <li>
          <b>{t('看參數卡', 'Read the gain card')}</b>
        </li>
        <li>
          <b>{t('3F 拖滑桿', '3F Drag the sliders')}</b>
        </li>
      </ol>
      <div className="row">
        <button className="btn primary" type="button" onClick={() => go('calc')}>
          {t('開始：1F 計算參數', 'Start: 1F Calculate gains')}
        </button>
        <button className="btn" type="button" onClick={() => go('lessons')}>
          {t('想先學原理：教學關卡', 'Learn the theory first: Lessons')}
        </button>
      </div>
    </div>
  )
}
