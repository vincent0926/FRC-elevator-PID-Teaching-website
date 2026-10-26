// intro.html、short.html 共用：每一幕的時間軸、進場效果、鏡頭、示範畫面；render.cjs 呼叫 seek(t)
// 每一幕的開始時間由 data-dur 累加；render.cjs 呼叫 seek(t) 一格一格截圖
const scenes = [...document.querySelectorAll('.scene')]
let acc = 0
for (const s of scenes) { s._start = acc; s._dur = +s.dataset.dur; acc += s._dur }
const TOTAL = acc
window.TIMELINE = { total: TOTAL, starts: scenes.map((s) => s._start), ch: scenes.map((s) => s.dataset.ch), glitch: scenes.filter((s) => 'glitch' in s.dataset).map((s) => s._start) }

const clamp = (x) => Math.max(0, Math.min(1, x))
const ease = (x) => 1 - Math.pow(1 - x, 3)
// 固定種子的亂數：同一格每次算出來一樣
function rnd(n) { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x) }

// render.cjs 用網址參數傳版本號和示範畫面的資料（capture.cjs 寫的 assets/demo/meta.json）
const params = new URLSearchParams(location.search)
const VER = params.get('v') || '0.0.0'
const DEMO = { frames: +(params.get('frames') || 36), kg: params.get('kg') || '0.51' }
for (const el of document.querySelectorAll('.demo-kg')) el.textContent = DEMO.kg

// 打字效果的原文先存起來
for (const el of document.querySelectorAll('[data-type]')) { el._full = el.dataset.type.replace('{VER}', VER); el.textContent = '' }

// 示範畫面：每一格先放好，播放時只切換顯示哪一張（不用等圖片載入）
for (const box of document.querySelectorAll('.demo-frames')) {
  const set = box.dataset.set
  for (const c of ['bad', 'good']) {
    const n = set === 'knobs' ? 1 : DEMO.frames
    for (let i = 0; i < n; i++) {
      const img = document.createElement('img')
      img.src = set === 'knobs' ? `assets/demo/${c}-knobs.png` : `assets/demo/${c}-${set}-${String(i).padStart(2, '0')}.jpg`
      img.dataset.k = `${c}-${i}`
      box.appendChild(img)
    }
  }
}

function fx(el, lt, frame) {
  const tin = +el.dataset.in, tout = el.dataset.out !== undefined ? +el.dataset.out : Infinity
  const kind = el.dataset.fx || 'fade'
  const pi = clamp((lt - tin) / (kind === 'glitch' ? 0.45 : 0.6)), po = clamp((lt - tout) / 0.35)
  const e = ease(pi)
  let op = e * (1 - po), tf = '', filt = ''
  if (kind === 'up') tf = `translateY(${(1 - e) * 46 - po * 20}px)`
  else if (kind === 'left') tf = `translateX(${(1 - e) * -80}px)`
  else if (kind === 'zoom') tf = `scale(${0.92 + 0.08 * e})`
  else if (kind === 'glitch') {
    if (pi < 1 && pi > 0) {
      const j = rnd(frame + tin * 10)
      // 只抖動、不整個消失，避免閃爍
      op = (0.55 + 0.45 * pi) * (j < 0.25 ? 0.6 : 1)
      tf = `translateX(${(rnd(frame * 3.1) - 0.5) * 60 * (1 - pi)}px) skewX(${(rnd(frame * 7.7) - 0.5) * 20 * (1 - pi)}deg)`
      const a = rnd(frame * 1.3) * 80, b = a + 10 + rnd(frame * 2.9) * 20
      el.style.clipPath = j > 0.6 ? `polygon(0 ${a}%, 100% ${a}%, 100% ${b}%, 0 ${b}%)` : ''
    } else el.style.clipPath = ''
    if (po > 0) tf = `translateX(${(rnd(frame * 5.3) - 0.5) * 40 * po}px)`
  }
  if (po > 0 && kind !== 'glitch') filt = `blur(${po * 6}px)`
  el.style.opacity = op
  el.style.transform = tf
  el.style.filter = filt
}

function typeText(el, lt) {
  const n = Math.max(0, Math.floor((lt - +el.dataset.in) * +(el.dataset.cps || 20)))
  const full = el._full
  const shown = full.slice(0, n)
  el.textContent = shown
  el.classList.toggle('cursor', n < full.length + 12 && n > 0 && Math.floor(lt * 2.5) % 2 === 0)
}

const hooks = {
  demo(s, lt) {
    // data-play="kG=0 開始播,播完,換成理論值,開始播,播完"（這一幕裡的秒數）
    const [b0, b1, sw, g0, g1] = s.dataset.play.split(',').map(Number)
    const good = lt >= sw
    const [p0, p1] = good ? [g0, g1] : [b0, b1]
    const i = Math.round(clamp((lt - p0) / (p1 - p0)) * (DEMO.frames - 1))
    const c = good ? 'good' : 'bad'
    for (const box of s.querySelectorAll('.demo-frames')) {
      const want = box.dataset.set === 'knobs' ? `${c}-0` : `${c}-${i}`
      for (const img of box.children) img.style.display = img.dataset.k === want ? 'block' : 'none'
    }
  },
  building(s, lt) {
    // 車廂從 G 一層一層往上，每層停一下
    const step = 1.35, t0 = 1.8
    const pos = Math.max(0, Math.min(4, (lt - t0) / step))
    const k = Math.floor(pos), f = pos - k
    const move = k + ease(clamp(f / 0.55))
    const car = s.querySelector('.car')
    car.style.top = `${(4 - move) * 128 + 10}px`
    const cur = Math.round(move)
    for (const fl of s.querySelectorAll('.fl')) fl.classList.toggle('on', +fl.dataset.f === cur && lt > t0 - 0.3)
  },
  route(s, lt) {
    const t0 = 0.8, step = 1.3
    for (const n of s.querySelectorAll('.node')) {
      const i = +n.dataset.n, tin = t0 + i * step
      n.classList.toggle('on', lt > tin)
      const p = ease(clamp((lt - tin + 0.3) / 0.5))
      n.style.opacity = 0.25 + 0.75 * p
      n.style.transform = `translateY(${(1 - p) * 30}px)`
    }
    for (const a of s.querySelectorAll('.arrow')) {
      const i = +a.dataset.a
      a.firstElementChild.style.width = `${ease(clamp((lt - (t0 + i * step) - 0.4) / 0.8)) * 100}%`
    }
  },
}

function glitchBars(t, frame) {
  // 換幕前後 0.18 秒：彩色橫條、整個畫面抖一下
  const g = document.getElementById('glitch'), stage = document.getElementById('stage')
  let d = Infinity
  for (const st of window.TIMELINE.glitch) d = Math.min(d, Math.abs(t - st))
  if (d < 0.18) {
    let html = ''
    for (let i = 0; i < 7; i++) {
      const y = rnd(frame * 13 + i) * 100, h = 1 + rnd(frame * 17 + i) * 6
      const c = i % 2 ? 'rgba(255,43,214,.55)' : 'rgba(0,229,255,.55)'
      html += `<i style="top:${y}%;height:${h}%;background:${c};transform:translateX(${(rnd(frame + i * 9) - 0.5) * 200}px)"></i>`
    }
    g.innerHTML = html
    stage.style.transform = `translate(${(rnd(frame * 2.2) - 0.5) * 24}px, ${(rnd(frame * 4.4) - 0.5) * 8}px)`
  } else { g.innerHTML = ''; stage.style.transform = '' }
}

const fmt = (t) => { const m = Math.floor(t / 60), s = t - m * 60; return `T+${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}` }

window.seek = function (t, fps = 30) {
  const frame = Math.round(t * fps)
  let active = scenes[scenes.length - 1]
  for (const s of scenes) if (t >= s._start && t < s._start + s._dur) active = s
  for (const s of scenes) {
    const on = s === active
    s.style.visibility = on ? 'visible' : 'hidden'
    if (!on) continue
    const lt = t - s._start
    // 整幕淡入淡出
    const fin = clamp(lt / 0.25), fout = clamp((s._dur - lt) / 0.3)
    s.style.opacity = s === scenes[scenes.length - 1] ? fin : Math.min(fin, fout)
    for (const el of s.querySelectorAll('[data-in]')) fx(el, lt, frame)
    for (const el of s.querySelectorAll('[data-type]')) typeText(el, lt)
    for (const img of s.querySelectorAll('img[data-kb]')) {
      // 畫面慢慢放大一點點（Ken Burns），從整張看得到開始
      const [a, b] = img.dataset.kb.split(' ').map(Number)
      img.style.transform = `scale(${a + (b - a) * (lt / s._dur)})`
    }
    for (const cam of s.querySelectorAll('.cam[data-cam]')) {
      // 關鍵格：時間, 焦點 x, 焦點 y（占畫面比例）, 放大倍率；中間用 ease 補
      const keys = cam.dataset.cam.split(';').map((k) => k.split(',').map(Number))
      let a = keys[0], b = keys[0]
      for (let k = 0; k < keys.length; k++) if (lt >= keys[k][0]) { a = keys[k]; b = keys[k + 1] || keys[k] }
      const p = b === a ? 0 : ease(clamp((lt - a[0]) / Math.min(0.9, b[0] - a[0])))
      const fx = a[1] + (b[1] - a[1]) * p, fy = a[2] + (b[2] - a[2]) * p, sc = a[3] + (b[3] - a[3]) * p
      const W = cam.parentElement.clientWidth, H = cam.parentElement.clientHeight
      const x = Math.min(0, Math.max(W - W * sc, W / 2 - fx * W * sc)), y = Math.min(0, Math.max(H - H * sc, H / 2 - fy * H * sc))
      cam.style.transform = `translate(${x}px, ${y}px) scale(${sc})`
    }
    for (const hl of s.querySelectorAll('.hl')) {
      const pulse = 0.75 + 0.25 * Math.sin(lt * 6)
      hl.style.boxShadow = `0 0 ${24 * pulse}px rgba(255,212,0,${0.8 * pulse}), inset 0 0 ${24 * pulse}px rgba(255,212,0,.3)`
    }
    if (s.dataset.hook) hooks[s.dataset.hook](s, lt)
    document.getElementById('ch').textContent = `// ${s.dataset.ch}`
  }
  document.getElementById('floor').style.backgroundPosition = `0 ${(t * 60) % 90}px`
  document.getElementById('noise').style.backgroundPosition = `${rnd(frame) * 300}px ${rnd(frame + 1) * 300}px`
  document.getElementById('tc').textContent = fmt(t)
  document.getElementById('rec').style.opacity = Math.floor(t * 1.5) % 2 ? 0.2 : 1
  document.getElementById('prog').style.width = `${(t / TOTAL) * 100}%`
  glitchBars(t, frame)
}
seek(0)
