// 把 intro.html 一格一格截圖，丟給 ffmpeg 變成影片
// 用法：node render.cjs [輸出.mp4] [fps]；node render.cjs --stills 1,8,20  只截幾張圖檢查
const { chromium } = require('playwright')
const { spawn } = require('child_process')
const path = require('path')
const fs = require('fs')

;(async () => {
  const args = process.argv.slice(2)
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
  await page.goto('file://' + path.join(__dirname, 'intro.html'))
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(1500)
  const tl = await page.evaluate(() => window.TIMELINE)
  fs.writeFileSync(path.join(__dirname, 'timeline.json'), JSON.stringify(tl))
  if (args[0] === '--stills') {
    fs.mkdirSync(path.join(__dirname, 'stills'), { recursive: true })
    for (const t of args[1].split(',').map(Number)) {
      await page.evaluate((t) => window.seek(t), t)
      await page.screenshot({ path: path.join(__dirname, 'stills', `t${String(t).padStart(6, '0')}.jpg`), type: 'jpeg', quality: 80 })
    }
    await browser.close()
    return
  }
  const out = args[0] || path.join(__dirname, 'out', 'silent.mp4')
  const fps = +(args[1] || 30)
  fs.mkdirSync(path.dirname(out), { recursive: true })
  const ff = spawn('ffmpeg', ['-y', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', out], { stdio: ['pipe', 'ignore', 'inherit'] })
  const n = Math.ceil(tl.total * fps)
  for (let i = 0; i < n; i++) {
    await page.evaluate(([t, fps]) => window.seek(t, fps), [i / fps, fps])
    const buf = await page.screenshot({ type: 'jpeg', quality: 92 })
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r))
    if (i % 150 === 0) console.log(`frame ${i}/${n}`)
  }
  ff.stdin.end()
  await new Promise((r) => ff.on('close', r))
  await browser.close()
  console.log('done', out, tl.total, 's')
})()
