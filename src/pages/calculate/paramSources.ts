import { t } from '../../core/lang'
/**
 * 1F「每個參數從哪裡來」：哪些可以算、哪些要量、哪些是自己決定的。
 * 內容寫死在這裡（不是計算），ParamSources.tsx 負責顯示，paramSources.test.ts 檢查每個參數都有列到。
 */

export type SourceKind = 'calc' | 'calcThenMeasure' | 'measure' | 'tune' | 'constraint'

export const KIND_INFO: Record<SourceKind, { label: string; tag: string; short: string; what: string }> = {
  calc: {
    label: t('模型算得準', 'The model gets it right'),
    tag: 'MODEL',
    short: t('算', 'calc'),
    what: t('只跟規格有關（馬達型號、齒比、半徑），規格對就對。上機後通常差 10% 以內，SysId 用來確認。', 'Depends only on specs (motor model, gear ratio, radius); right specs, right value. On the robot it’s usually within 10%; SysId confirms it.'),
  },
  calcThenMeasure: {
    label: t('模型給起點，要用 SysId／日誌修正', 'The model gives a start; correct it with SysId / logs'),
    tag: 'MODEL → SYSID',
    short: t('算＋量', 'calc + measure'),
    what: t('公式對，但要用到估計的東西（質量、等效質量）。理論值只是初始值，上機後用 SysId 或 2F 日誌鑑別出真的值。', 'The formula is right but uses estimates (mass, equivalent mass). The theory value is only a starting point; identify the real value with SysId or 2F logs on the robot.'),
  },
  measure: {
    label: t('一定要量', 'Must be measured'),
    tag: 'MEASURED / SYSID',
    short: t('量', 'measure'),
    what: t('公式算不出來（摩擦、實際重量），或是規格表不會告訴你。只能上機、用 SysId 或拿工具量。', 'No formula gives it (friction, real weight), or the spec sheet won’t tell you. Only the robot, SysId or a tool can measure it.'),
  },
  tune: {
    label: t('閉迴路調參', 'Closed-loop tuning'),
    tag: 'TUNED',
    short: t('調', 'tune'),
    what: t('回授增益沒有公式解，要在真的機器上調、用日誌驗證。網站給的是保守的起始值。', 'Feedback gains have no formula; tune them on the real robot and verify with logs. The site gives conservative starting values.'),
  },
  constraint: {
    label: t('自己設的限制', 'Limits you choose'),
    tag: 'CONSTRAINT',
    short: t('限制', 'limit'),
    what: t('不是機構的性質，是你選的速度、加速度、電流上限：表現和安全、電池之間的取捨。', 'Not a property of the mechanism: the speed, acceleration and current limits you pick, trading off performance against safety and battery.'),
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
    how: t('kV = G / (r·Kv)：只要齒比、半徑、馬達型號', 'kV = G / (r·Kv): only needs gear ratio, radius and motor model'),
    measure: t('2F 日誌的等速段、SysId 準靜態。差超過 20% 先懷疑齒比或半徑填錯', 'Constant-velocity sections of 2F logs, SysId quasistatic. If it’s off by more than 20%, suspect a wrong gear ratio or radius first'),
    where: t('1F 算、2F 驗證', '1F calc, 2F verify'),
  },
  {
    name: 'kG',
    kind: 'calcThenMeasure',
    how: t('kG = (m_G·g − F配重)·r/G · R/(n·kT)，m_G = Σmᵢkᵢ', 'kG = (m_G·g − F_counterweight)·r/G · R/(n·kT), m_G = Σmᵢkᵢ'),
    measure: t('2F 日誌的靜止保持段（回授一直偏同一邊就是 kG 不對）、SysId。質量要用磅秤秤，不要估', 'Holding sections of 2F logs (feedback always pushing the same way means kG is wrong), SysId. Weigh the mass on a scale; don’t guess'),
    where: t('1F 算、2F 修正', '1F calc, 2F correct'),
  },
  {
    name: 'kA',
    kind: 'calcThenMeasure',
    how: t('kA = m_A·r·R/(G·n·kT)，m_A = Σmᵢkᵢ²（串級式等效質量）', 'kA = m_A·r·R/(G·n·kT), m_A = Σmᵢkᵢ² (cascade equivalent mass)'),
    measure: t('2F 日誌的加減速段、SysId 動態測試。最難量準，差 30% 內都算正常', 'Accel/decel sections of 2F logs, SysId dynamic test. Hardest to measure; within 30% is normal'),
    where: t('1F 算、2F 修正', '1F calc, 2F correct'),
  },
  {
    name: 'kS',
    kind: 'measure',
    how: t('靜摩擦：滑軌、軸承、鏈條鬆緊決定，公式算不出來', 'Static friction: set by the slides, bearings and chain tension; no formula for it'),
    measure: t('4F 兩點法（剛好往上爬、剛好往下滑的電壓，差的一半就是 kS）、SysId 準靜態、2F 日誌（往上往下回授正負相反）', '4F two-point method (half the difference between just-climbing and just-sliding voltages is kS), SysId quasistatic, 2F logs (feedback flips sign between up and down)'),
    where: t('4F 兩點法、2F 量；量到填回 1F', '4F two-point method, 2F; enter the measured value back in 1F'),
  },
  {
    name: 'kP',
    kind: 'tune',
    how: t('起始值：「誤差 1 公分要給幾伏特」× 100。前饋準的話不用大', 'Starting value: “volts per 1 cm of error” × 100. With good feedforward it doesn’t need to be big'),
    measure: t('沒有量測值。看 2F 日誌到位快不快、會不會抖，3F 模擬先試', 'No measured value. Check in 2F logs whether it arrives quickly and whether it jitters; try it in the 3F sim first'),
    where: t('1F 起始值、2F／3F 調', '1F starting value, 2F / 3F tune'),
  },
  {
    name: 'kI',
    kind: 'tune',
    how: t('預設 0。穩態誤差先修 kG，不要用 kI 補（會積分飽和）', 'Default 0. Fix steady-state error with kG first, not kI (it winds up)'),
    measure: '—',
    where: t('3F 情境「為什麼不用 kI」', '3F scenario “Why not kI”'),
  },
  {
    name: 'kD',
    kind: 'tune',
    how: t('預設 0。到位後衝過頭才加，太大會放大雜訊', 'Default 0. Add it only if it overshoots on arrival; too big amplifies noise'),
    measure: t('看 2F 日誌到位段的超調和電壓抖動', 'Look at overshoot and voltage jitter in the arrival section of 2F logs'),
    where: t('2F 建議、3F 情境', '2F advice, 3F scenarios'),
  },
  {
    name: t('巡航速度', 'Cruise velocity'),
    kind: 'constraint',
    how: t('上限 = (計算電壓 − kG − kS) / kV，預設取 75%（經驗上留的餘裕，不是最佳值）；kS 沒量時是不含摩擦的理論上限', 'Limit = (calculation voltage − kG − kS) / kV, using 75% by default (a rule-of-thumb margin, not an optimum); without a measured kS it’s the friction-free theoretical limit'),
    measure: t('上限是算的；要多快是你決定的。3F 看有沒有電壓飽和、跟隨誤差大不大，上機照 4F 從 25% 慢慢加', 'The limit is calculated; how fast you go is your call. Check for voltage saturation and tracking error in 3F, and on the robot start at 25% per 4F and increase slowly'),
    where: t('1F 算上限、3F 穩健性測試', '1F limit, 3F robustness test'),
  },
  {
    name: t('加速度', 'Acceleration'),
    kind: 'constraint',
    how: t('上限受 Stator 電流限制和電壓決定，預設取 75%（經驗值，不是最佳值）', 'The limit is set by the stator current limit and voltage, using 75% by default (rule of thumb, not an optimum)'),
    measure: t('上限是算的；觸發電流限制就是太快。上機一樣從 25% 慢慢加', 'The limit is calculated; hitting the current limit means too fast. On the robot, also start at 25% and increase slowly'),
    where: t('1F 算上限、3F 模擬', '1F limit, 3F sim'),
  },
]

/** 1F 要填的機構資料 */
export const INPUT_ROWS: SourceRow[] = [
  { name: t('馬達型號、數量', 'Motor model, count'), kind: 'calc', how: t('看機器人上裝的是什麼', 'Whatever is on the robot'), measure: t('—（FOC 有沒有開也要跟程式一致）', '— (FOC on or off must match the code too)'), where: t('1F 填', '1F input') },
  { name: t('齒比', 'Gear ratio'), kind: 'calc', how: t('齒輪箱規格或數齒數相乘', 'Gearbox spec, or multiply the tooth counts'), measure: t('手轉鼓輪一圈數馬達轉幾圈可以驗證', 'Turn the drum once by hand and count motor turns to verify'), where: t('1F 填', '1F input') },
  {
    name: t('鼓輪／鏈輪半徑', 'Drum / sprocket radius'),
    kind: 'calc',
    how: t('鏈輪用節圓直徑（規格表）除以 2，不是外徑；皮帶輪同理', 'For sprockets use the pitch diameter (spec sheet) ÷ 2, not the outer diameter; same for pulleys'),
    measure: t('單元零第 2 步：程式讀的距離跟捲尺量的比，差很多就是半徑或齒比錯', 'Unit 0 step 2: compare the distance the code reads with a tape measure; a big difference means the radius or gear ratio is wrong'),
    where: t('1F 填、4F 單元零驗證', '1F input, 4F unit 0 verify'),
  },
  { name: t('各級質量、負載', 'Stage masses, load'), kind: 'measure', how: t('一定要秤：CAD 常常少算螺絲、線材、護板', 'Must be weighed: CAD often misses screws, wiring and panels'), measure: t('拆下來用磅秤，或整台用行李秤吊', 'Take it apart and use a scale, or hang the whole thing from a luggage scale'), where: t('1F 填', '1F input') },
  { name: t('配重／定力彈簧的力', 'Counterweight / constant-force spring force'), kind: 'measure', how: t('規格表的力常常不準，而且隨行程變化', 'Spec sheet forces are often off and change over the travel'), measure: t('用彈簧秤拉，在幾個高度各量一次', 'Pull with a spring scale and measure at several heights'), where: t('1F 填', '1F input') },
  { name: t('行程', 'Travel'), kind: 'measure', how: t('鼓輪線位移（第一級），不是最上層高度', 'Drum rope displacement (first stage), not the top height'), measure: t('捲尺量，軟體上下限要設在它內側', 'Measure with a tape; set the soft limits inside it'), where: t('1F 填、4F 單元零', '1F input, 4F unit 0') },
  { name: t('Stator 電流限制、計算電壓', 'Stator current limit, calculation voltage'), kind: 'constraint', how: t('保護馬達、預留電池壓降的取捨（常用 40–80 A、10–11 V）', 'A trade-off between protecting the motor and leaving room for battery sag (commonly 40–80 A, 10–11 V)'), measure: '—', where: t('1F 填、3F 馬達控制器', '1F input, 3F motor controller') },
]

export const PARAM_NAMES = ['kS', 'kG', 'kV', 'kA', 'kP', 'kI', 'kD', t('巡航速度', 'Cruise velocity'), t('加速度', 'Acceleration')] as const
