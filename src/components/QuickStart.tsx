import { useStore } from '../app/store'
import { t } from '../core/lang'

/**
 * 總覽頁最上面的「快速開始」：第一次來的人只走三步，先看到自己機構的第一組數字。
 * 電梯、手臂共用；完整的調參循環與其他入口收在下面。
 */
export function QuickStart({ what }: { what: string }) {
  const { go } = useStore()
  return (
    <div className="panel quick-start">
      <h2>{t('快速開始：三步看到第一組參數', 'Quick start: your first gains in three steps')}</h2>
      <ol className="qs-steps">
        <li>
          <b>{t('1F 填資料', '1F Enter data')}</b>
          <span className="small">{t(`填${what}的質量、齒比、馬達，不確定的先用預設。`, `Enter the ${what}’s mass, gear ratio and motor; keep the defaults for anything you’re unsure of.`)}</span>
        </li>
        <li>
          <b>{t('看參數卡', 'Read the gain card')}</b>
          <span className="small">{t('每個數字旁邊標了是算出來的，還是一定要上機量。', 'Each number is marked as calculated or something you must measure on the robot.')}</span>
        </li>
        <li>
          <b>{t('3F 拖滑桿', '3F Drag the sliders')}</b>
          <span className="small">{t('在模擬裡改一個參數，馬上看動畫和圖表怎麼變。', 'Change one gain in the sim and watch the animation and charts react right away.')}</span>
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
