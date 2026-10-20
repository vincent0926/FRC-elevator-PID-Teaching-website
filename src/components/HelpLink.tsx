import { useStore } from '../app/store'
import { t } from '../core/lang'

/** 樓層頁標題下的「怎麼用這一頁？」：跳到使用說明對應的那一段 */
export function HelpLink({ section, label = t('怎麼用這一頁？', 'How do I use this page?') }: { section: string; label?: string }) {
  const { openGuide } = useStore()
  return (
    <button className="linkbtn help-link" type="button" onClick={() => openGuide(section)}>
      {label}
    </button>
  )
}
