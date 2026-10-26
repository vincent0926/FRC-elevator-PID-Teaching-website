// 重新擷取影片用的網站畫面（存到 assets/）。網站改版後跑一次，再跑 render.cjs 就能更新影片。
// 用法：先 npm run build && npx vite preview --port 4173，再 node video/capture.cjs [網址]
// 畫面一律用「科技」配色、深色、中文，1600×900 視窗、1.5 倍縮放
const { chromium } = require('playwright')
const path = require('path')
const fs = require('fs')

const BASE = process.argv[2] || 'http://localhost:4173/'
const OUT = path.join(__dirname, 'assets')
const DEMO = path.join(OUT, 'demo')
// 3F 示範：每種情況從時間軸 0 拖到最後，截這麼多格
const DEMO_FRAMES = 36

;(async () => {
  fs.mkdirSync(DEMO, { recursive: true })
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1.5, locale: 'zh-TW', colorScheme: 'dark', serviceWorkers: 'block' })
  await ctx.addInitScript(() => {
    localStorage.setItem('elevator-tuner:palette', '"tech"')
    localStorage.setItem('elevator-tuner:theme', '"dark"')
  })
  const p = await ctx.newPage()
  const file = (n) => path.join(OUT, `${n}.png`)
  const shot = (n) => p.screenshot({ path: file(n) })
  const el = (sel, n) => p.locator(sel).first().screenshot({ path: file(n) })
  const clip = (n, x, y, width, height, o = {}) => p.screenshot({ path: o.path || file(n), clip: { x, y, width, height }, fullPage: true, ...(o.jpeg ? { type: 'jpeg', quality: 82 } : {}) })
  // 找第一個文字完全等於 text 的元素，回傳它在整頁上的位置
  const box = (text) =>
    p.evaluate((text) => {
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
      let n
      while ((n = w.nextNode())) if (n.textContent.trim() === text) break
      if (!n) throw new Error(`找不到「${text}」`)
      const r = n.parentElement.getBoundingClientRect()
      return { x: r.x, y: r.y + scrollY, w: r.width, h: r.height }
    }, text)
  const floor = async (id) => {
    await p.click(`.floor[data-floor="${id}"]`)
    await p.waitForTimeout(1500)
  }

  await p.goto(BASE)
  await p.waitForTimeout(2500)
  await shot('splash')
  await p.click('.splash-go')
  await p.waitForTimeout(800)
  await shot('chooser')
  await p.getByText('進入電梯').click()
  await p.waitForTimeout(1000)

  // 1F
  await floor('calc')
  await el('.panel.card-param', 'calc-card')
  await el('.fs', 'calc-form')

  // 3F：滑桿
  await floor('sim')
  await p.waitForTimeout(1000)
  await clip('sim-slider', 500, 410, 880, 490)

  // 4F
  await floor('learn')
  await clip('learn-top', 280, 0, 1110, 620)

  // 2F：用範例日誌「kG 少 40%」，讀取後到步驟 1
  await floor('tune')
  await p.locator('select').filter({ hasText: '參數正確' }).selectOption({ index: 1 })
  await p.getByRole('button', { name: '產生並匯入' }).click()
  await p.waitForTimeout(3000)
  await p.getByRole('button', { name: '讀取並檢查' }).click()
  await p.waitForTimeout(3000)
  await p.getByRole('button', { name: '1 找出問題' }).click()
  await p.waitForTimeout(3000)
  const s0 = await box('步驟 0：資料檢查')
  await clip('tune-check', s0.x - 25, s0.y - 25, 460, 525)
  const s1 = await box('步驟 1：找出問題')
  await clip('tune-step1', s1.x - 25, s1.y - 25, 460, 340)

  // 3F 示範：kG = 0、kP 很小 → 停在目標下面；kG 填回理論值 → 剛好停住
  await p.setViewportSize({ width: 1600, height: 1500 })
  await floor('sim')
  await p.waitForTimeout(1000)
  const field = (label) => p.locator(`input[aria-label^="${label}"]`).locator('xpath=following::input[@type="number"][1]')
  const setNum = async (label, v) => {
    const f = field(label)
    await f.fill(String(v))
    await f.press('Enter')
    await f.blur()
    await p.waitForTimeout(1500)
  }
  const theoryKg = await field('kG').inputValue()
  const timeline = p.locator('input[aria-label="時間軸"]')
  const record = async (name) => {
    const max = +(await timeline.getAttribute('max'))
    const kg = await box('kG')
    await clip('', kg.x - 20, kg.y - 18, 880, 100, { path: path.join(DEMO, `${name}-knobs.png`) })
    const view = await p.locator('.elev-view').first().evaluate((e) => {
      const r = e.getBoundingClientRect()
      return { x: r.x, y: r.y + scrollY, w: r.width, h: r.height }
    })
    const chart = await box('位置')
    for (let i = 0; i < DEMO_FRAMES; i++) {
      await timeline.fill(String(Math.floor((max * i) / (DEMO_FRAMES - 1) / 10) * 10)) // 時間軸 step 是 10 ms，不能超過 max
      await p.waitForTimeout(120)
      const n = String(i).padStart(2, '0')
      await clip('', view.x, view.y, view.w, view.h, { path: path.join(DEMO, `${name}-view-${n}.jpg`), jpeg: true })
      await clip('', chart.x - 10, chart.y - 10, 880, 330, { path: path.join(DEMO, `${name}-chart-${n}.jpg`), jpeg: true })
    }
  }
  await setNum('kP', 8)
  await setNum('kG', 0)
  await record('bad')
  await setNum('kG', theoryKg)
  await record('good')

  // 射球飛輪：彈道
  await p.setViewportSize({ width: 1600, height: 900 })
  await p.click('.brand .theme-btn')
  await p.waitForTimeout(800)
  await p.getByText('進入射球飛輪').click()
  await p.waitForTimeout(800)
  await p.getByText('用彈道').click()
  await p.waitForTimeout(2500)
  const s3 = await box('選一條軌跡')
  await clip('fly-traj', s3.x - 60, s3.y - 30, 900, 530)

  await browser.close()
  fs.writeFileSync(path.join(DEMO, 'meta.json'), JSON.stringify({ frames: DEMO_FRAMES, theoryKg: +theoryKg, kP: 8 }))
  console.log('done', OUT)
})()
