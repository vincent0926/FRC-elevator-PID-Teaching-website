// 把 intro.html（或 short.html）一格一格截圖，丟給 ffmpeg 變成無聲影片，並寫出 timeline-<頁名>.json 給 music.py
// 用法：
//   node render.cjs                                   intro.html → out/intro-silent.mp4
//   node render.cjs --page short.html                 直式精華版 → out/short-silent.mp4
//   node render.cjs --stills 10,60,120 [--page ...]   只截幾張圖檢查（存到 stills/）
const { chromium } = require('playwright')
const { spawn } = require('child_process')
const path = require('path')
const fs = require('fs')

const args = process.argv.slice(2)
const opt = (name, def) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : def
}
const pageFile = opt('--page', 'intro.html')
const name = path.basename(pageFile, '.html')
const fps = +opt('--fps', 30)

;(async () => {
  // 版本號讀 package.json；示範畫面的格數、理論 kG 讀 capture.cjs 寫的 meta.json
  const { version } = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'))
  const meta = JSON.parse(fs.readFileSync(path.join(__dirname, 'assets', 'demo', 'meta.json'), 'utf8'))
  const q = new URLSearchParams({ v: version, frames: meta.frames, kg: meta.theoryKg })

  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
  await page.goto('file://' + path.join(__dirname, pageFile) + '?' + q)
  // 頁面自己用 --W、--H 決定大小（直式是 1080×1920）
  const size = await page.evaluate(() => ({ width: document.body.offsetWidth, height: document.body.offsetHeight }))
  await page.setViewportSize(size)
  await page.evaluate(() => document.fonts.ready)
  await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0))
  await page.waitForTimeout(1000)
  const tl = await page.evaluate(() => window.TIMELINE)
  fs.writeFileSync(path.join(__dirname, `timeline-${name}.json`), JSON.stringify(tl))

  const stills = opt('--stills')
  if (stills) {
    fs.mkdirSync(path.join(__dirname, 'stills'), { recursive: true })
    for (const t of stills.split(',').map(Number)) {
      await page.evaluate((t) => window.seek(t), t)
      await page.screenshot({ path: path.join(__dirname, 'stills', `${name}-t${String(t).padStart(6, '0')}.jpg`), type: 'jpeg', quality: 80 })
    }
    await browser.close()
    return
  }

  const out = path.join(__dirname, 'out', `${name}-silent.mp4`)
  fs.mkdirSync(path.dirname(out), { recursive: true })
  const ff = spawn('ffmpeg', ['-y', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', out], { stdio: ['pipe', 'ignore', 'inherit'] })
  const n = Math.ceil(tl.total * fps)
  for (let i = 0; i < n; i++) {
    await page.evaluate(([t, fps]) => window.seek(t, fps), [i / fps, fps])
    const buf = await page.screenshot({ type: 'jpeg', quality: 92 })
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r))
    if (i % 300 === 0) console.log(`frame ${i}/${n}`)
  }
  ff.stdin.end()
  await new Promise((r) => ff.on('close', r))
  await browser.close()
  console.log('done', out, tl.total, 's')
})()
