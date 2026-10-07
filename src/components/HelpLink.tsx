import { useStore } from '../app/store'

/** 樓層頁標題下的「怎麼用這一頁？」：跳到使用說明對應的那一段 */
export function HelpLink({ section, label = '怎麼用這一頁？' }: { section: string; label?: string }) {
  const { openGuide } = useStore()
  return (
    <button className="linkbtn help-link" type="button" onClick={() => openGuide(section)}>
      {label}
    </button>
  )
}
