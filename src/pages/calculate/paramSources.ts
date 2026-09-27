/**
 * 1F「每個參數從哪裡來」：哪些可以算、哪些要量、哪些是自己決定的。
 * 內容寫死在這裡（不是計算），ParamSources.tsx 負責顯示，paramSources.test.ts 檢查每個參數都有列到。
 */

export type SourceKind = 'calc' | 'calcThenMeasure' | 'measure' | 'tune' | 'constraint'

export const KIND_INFO: Record<SourceKind, { label: string; tag: string; short: string; what: string }> = {
  calc: {
    label: '模型算得準',
    tag: 'MODEL',
    short: '算',
    what: '只跟規格有關（馬達型號、齒比、半徑），規格對就對。上機後通常差 10% 以內，SysId 用來確認。',
  },
  calcThenMeasure: {
    label: '模型給起點，要用 SysId／日誌修正',
    tag: 'MODEL → SYSID',
    short: '算＋量',
    what: '公式對，但要用到估計的東西（質量、等效質量）。理論值只是初始值，上機後用 SysId 或 2F 日誌鑑別出真的值。',
  },
  measure: {
    label: '一定要量',
    tag: 'MEASURED / SYSID',
    short: '量',
    what: '公式算不出來（摩擦、實際重量），或是規格表不會告訴你。只能上機、用 SysId 或拿工具量。',
  },
  tune: {
    label: '閉迴路調參',
    tag: 'TUNED',
    short: '調',
    what: '回授增益沒有公式解，要在真的機器上調、用日誌驗證。網站給的是保守的起始值。',
  },
  constraint: {
    label: '自己設的限制',
    tag: 'CONSTRAINT',
    short: '限制',
    what: '不是機構的性質，是你選的速度、加速度、電流上限：表現和安全、電池之間的取捨。',
  },
}

export interface SourceRow {
  name: string
  kind: SourceKind
  /** 怎麼來（公式或依據） */
  how: string
  /** 要量的話用什麼量、怎麼驗證 */
  measure: string
  /** 網站哪一樓處理 */
  where: string
}

/** 1F 參數卡上的每一個參數 */
export const PARAM_ROWS: SourceRow[] = [
  {
    name: 'kV',
    kind: 'calc',
    how: 'kV = G / (r·Kv)：只要齒比、半徑、馬達型號',
    measure: '2F 日誌的等速段、SysId 準靜態。差超過 20% 先懷疑齒比或半徑填錯',
    where: '1F 算、2F 驗證',
  },
  {
    name: 'kG',
    kind: 'calcThenMeasure',
    how: 'kG = (m_G·g − F配重)·r/G · R/(n·kT)，m_G = Σmᵢkᵢ',
    measure: '2F 日誌的靜止保持段（回授一直偏同一邊就是 kG 不對）、SysId。質量要用磅秤秤，不要估',
    where: '1F 算、2F 修正',
  },
  {
    name: 'kA',
    kind: 'calcThenMeasure',
    how: 'kA = m_A·r·R/(G·n·kT)，m_A = Σmᵢkᵢ²（串級式等效質量）',
    measure: '2F 日誌的加減速段、SysId 動態測試。最難量準，差 30% 內都算正常',
    where: '1F 算、2F 修正',
  },
  {
    name: 'kS',
    kind: 'measure',
    how: '靜摩擦：滑軌、軸承、鏈條鬆緊決定，公式算不出來',
    measure: '4F 兩點法（剛好往上爬、剛好往下滑的電壓，差的一半就是 kS）、SysId 準靜態、2F 日誌（往上往下回授正負相反）',
    where: '4F 兩點法、2F 量；量到填回 1F',
  },
  {
    name: 'kP',
    kind: 'tune',
    how: '起始值：「誤差 1 公分要給幾伏特」× 100。前饋準的話不用大',
    measure: '沒有量測值。看 2F 日誌到位快不快、會不會抖，3F 模擬先試',
    where: '1F 起始值、2F／3F 調',
  },
  {
    name: 'kI',
    kind: 'tune',
    how: '預設 0。穩態誤差先修 kG，不要用 kI 補（會積分飽和）',
    measure: '—',
    where: '3F 情境「為什麼不用 kI」',
  },
  {
    name: 'kD',
    kind: 'tune',
    how: '預設 0。到位後衝過頭才加，太大會放大雜訊',
    measure: '看 2F 日誌到位段的超調和電壓抖動',
    where: '2F 建議、3F 情境',
  },
  {
    name: '巡航速度',
    kind: 'constraint',
    how: '上限 = (計算電壓 − kG − kS) / kV，預設取 75%；kS 沒量時是不含摩擦的理論上限',
    measure: '上限是算的；要多快是你決定的。電壓飽和就是太快',
    where: '1F 算上限、3F 穩健性測試',
  },
  {
    name: '加速度',
    kind: 'constraint',
    how: '上限受 Stator 電流限制和電壓決定，預設取 75%',
    measure: '上限是算的；觸發電流限制就是太快',
    where: '1F 算上限、3F 模擬',
  },
]

/** 1F 要填的機構資料 */
export const INPUT_ROWS: SourceRow[] = [
  { name: '馬達型號、數量', kind: 'calc', how: '看機器人上裝的是什麼', measure: '—（FOC 有沒有開也要跟程式一致）', where: '1F 填' },
  { name: '齒比', kind: 'calc', how: '齒輪箱規格或數齒數相乘', measure: '手轉鼓輪一圈數馬達轉幾圈可以驗證', where: '1F 填' },
  {
    name: '鼓輪／鏈輪半徑',
    kind: 'calc',
    how: '鏈輪用節圓直徑（規格表）除以 2，不是外徑；皮帶輪同理',
    measure: '單元零第 2 步：程式讀的距離跟捲尺量的比，差很多就是半徑或齒比錯',
    where: '1F 填、4F 單元零驗證',
  },
  { name: '各級質量、負載', kind: 'measure', how: '一定要秤：CAD 常常少算螺絲、線材、護板', measure: '拆下來用磅秤，或整台用行李秤吊', where: '1F 填' },
  { name: '配重／定力彈簧的力', kind: 'measure', how: '規格表的力常常不準，而且隨行程變化', measure: '用彈簧秤拉，在幾個高度各量一次', where: '1F 填' },
  { name: '行程', kind: 'measure', how: '鼓輪線位移（第一級），不是最上層高度', measure: '捲尺量，軟體上下限要設在它內側', where: '1F 填、4F 單元零' },
  { name: 'Stator 電流限制、計算電壓', kind: 'constraint', how: '保護馬達、預留電池壓降的取捨（常用 40–80 A、10–11 V）', measure: '—', where: '1F 填、3F 馬達控制器' },
]

export const PARAM_NAMES = ['kS', 'kG', 'kV', 'kA', 'kP', 'kI', 'kD', '巡航速度', '加速度'] as const
