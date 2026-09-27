/**
 * 參數從哪裡來的流程：理論只給初始值，真的參數要鑑別、調、驗證。
 * 1F 參數來源對照表、4F 單元二開頭都用這一條，讓隊員不會以為理論值就是答案。
 */

const STEPS: { title: string; what: string; where: string }[] = [
  { title: '理論模型', what: '機構資料 → kG、kV、kA', where: '1F' },
  { title: '初始參數', what: '保守的 kP、Motion Magic 25% 起跳', where: '1F、3F 模擬先試' },
  { title: '系統鑑別', what: 'SysId／日誌量出真的 kS、kG、kV、kA', where: '4F 單元二、2F' },
  { title: '閉迴路調參', what: '一次改一個，調 kP、kD', where: '2F、3F' },
  { title: '實機驗證', what: '錄日誌確認達標、安全保護都在', where: '2F、4F 單元零' },
]

export function Workflow({ active }: { active?: number }) {
  return (
    <ol className="workflow" aria-label="參數從理論到實機的流程">
      {STEPS.map((s, i) => (
        <li key={s.title} className={active === i ? 'on' : undefined}>
          <b>
            {i + 1}. {s.title}
          </b>
          <span className="small">{s.what}</span>
          <span className="small muted">{s.where}</span>
        </li>
      ))}
    </ol>
  )
}
