"""合成影片的背景音樂（synthwave 風格）和換幕音效，輸出 out/music.wav。

時間軸讀 timeline.json（render.cjs 產生），每一幕開頭放一個掃頻音效。
用法：python3 music.py
"""
import json
import os
import wave

import numpy as np
from scipy.signal import butter, lfilter

SR = 44100
HERE = os.path.dirname(os.path.abspath(__file__))
tl = json.load(open(os.path.join(HERE, 'timeline.json')))
TOTAL = tl['total']
starts = tl['starts']
N = int((TOTAL + 1.0) * SR)
BPM = 112
BEAT = 60 / BPM
BAR = 4 * BEAT
rng = np.random.default_rng(9427)


def lp(x, fc, order=2):
    b, a = butter(order, fc / (SR / 2), 'low')
    return lfilter(b, a, x)


def hp(x, fc, order=2):
    b, a = butter(order, fc / (SR / 2), 'high')
    return lfilter(b, a, x)


def saw(freq, n, detune=0.0):
    t = np.arange(n) / SR
    return 2 * ((t * freq * (1 + detune)) % 1) - 1


def add(buf, sig, at):
    i = int(at * SR)
    if i >= len(buf):
        return
    j = min(len(buf), i + len(sig))
    buf[i:j] += sig[: j - i]


def env(n, a=0.005, r=0.2):
    t = np.arange(n) / SR
    e = np.minimum(1, t / max(a, 1e-4)) * np.exp(-t / r)
    return e


def midi(m):
    return 440 * 2 ** ((m - 69) / 12)


# A 小調：Am – F – C – G，每個和弦一小節
CHORDS = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]

# 段落強弱：開機只有鋪底，標題後鼓進來，安全提醒那段收小，結尾淡出
SAFETY = starts[-2]
END = starts[-1]


def section_gain(t):
    if t < starts[1]:
        return 0.0  # 開機：沒有鼓
    if SAFETY <= t < END:
        return 0.35
    return 1.0


pad = np.zeros(N)
bass = np.zeros(N)
arp = np.zeros(N)
drums = np.zeros(N)
fx = np.zeros(N)

nbars = int(TOTAL / BAR) + 2
for b in range(nbars):
    t0 = b * BAR
    ch = CHORDS[b % 4]
    n = int(BAR * SR)
    # 鋪底：三個音、每個兩條微微走音的鋸齒波
    p = sum(saw(midi(m), n, d) for m in ch for d in (-0.004, 0.004))
    e = np.minimum(1, np.arange(n) / (0.3 * SR)) * np.minimum(1, (n - np.arange(n)) / (0.2 * SR))
    add(pad, p * e * 0.05, t0)
    # 貝斯：八分音符，根音高低八度交替
    for k in range(8):
        tt = t0 + k * BEAT / 2
        g = section_gain(tt)
        if g == 0 and tt > 2.5:
            g = 0.5  # 開機後半先讓貝斯進來
        if g == 0:
            continue
        m = ch[0] - 24 + (12 if k % 2 else 0)
        nn = int(BEAT / 2 * SR)
        add(bass, saw(midi(m), nn) * env(nn, 0.003, 0.12) * 0.35 * g, tt)
    # 琶音：十六分音符
    for k in range(16):
        tt = t0 + k * BEAT / 4
        g = section_gain(tt)
        if tt < 1.0:
            continue
        g = max(g, 0.6)
        m = ch[k % 3] + 12 + (12 if (k // 3) % 2 else 0)
        nn = int(BEAT / 4 * SR)
        sq = np.sign(np.sin(2 * np.pi * midi(m) * np.arange(nn) / SR))
        add(arp, sq * env(nn, 0.002, 0.05) * 0.06 * g, tt)
    # 鼓
    for k in range(4):
        tt = t0 + k * BEAT
        g = section_gain(tt)
        if g == 0:
            continue
        nn = int(0.35 * SR)
        tk = np.arange(nn) / SR
        f = 45 + 110 * np.exp(-tk * 30)
        kick = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tk * 9)
        add(drums, kick * 0.9 * g, tt)
        if k in (1, 3):
            ns = int(0.2 * SR)
            snare = hp(rng.standard_normal(ns), 1500) * np.exp(-np.arange(ns) / SR * 22) * 0.35
            add(drums, snare * g, tt)
        nh = int(0.05 * SR)
        hat = hp(rng.standard_normal(nh), 7000) * np.exp(-np.arange(nh) / SR * 80) * 0.18
        add(drums, hat * g, tt + BEAT / 2)

pad = lp(pad, 1800)
bass = lp(bass, 600)
arp = lp(arp, 4000)

# 換幕音效：雜訊掃頻 + 低頻撞擊；第一幕開機用電子嗶聲
for i, st in enumerate(starts):
    if i == 0:
        for k in range(5):
            nn = int(0.06 * SR)
            add(fx, np.sin(2 * np.pi * (1200 + 300 * k) * np.arange(nn) / SR) * env(nn, 0.001, 0.03) * 0.15, 0.2 + k * 0.95)
        continue
    nn = int(0.5 * SR)
    tt = np.arange(nn) / SR
    noise = rng.standard_normal(nn)
    # 越來越亮的雜訊，在換幕那一刻結束
    sweep = hp(noise, 400) * (tt / 0.5) ** 2 * 0.12
    add(fx, sweep, max(0, st - 0.5))
    ni = int(0.6 * SR)
    ti = np.arange(ni) / SR
    impact = np.sin(2 * np.pi * (40 + 60 * np.exp(-ti * 12)) * ti) * np.exp(-ti * 5) * 0.4
    add(fx, impact, st)
    # 數位小故障聲
    ng = int(0.12 * SR)
    glitch = np.sign(np.sin(2 * np.pi * 220 * np.arange(ng) / SR * (1 + 3 * rng.random()))) * env(ng, 0.001, 0.04) * 0.08
    add(fx, glitch, st + 0.02)

# 鼓、貝斯讓出空間給鋪底（簡單的 sidechain）
duck = np.ones(N)
for b in range(int(TOTAL / BEAT) + 2):
    tt = b * BEAT
    if section_gain(tt) == 0:
        continue
    i = int(tt * SR)
    nn = int(0.25 * SR)
    j = min(N, i + nn)
    duck[i:j] = np.minimum(duck[i:j], 1 - 0.5 * np.exp(-np.arange(j - i) / SR * 10))

mix = (pad + arp) * duck + bass * duck + drums + fx
# 開頭淡入、結尾淡出
t = np.arange(N) / SR
mix *= np.minimum(1, t / 0.5)
mix *= np.clip((TOTAL - t) / 4.0, 0, 1)
mix = np.tanh(mix * 0.6)

# 簡單的立體聲：琶音左右交替延遲
left = mix + np.roll(arp * duck, int(0.011 * SR)) * 0.3
right = mix + np.roll(arp * duck, int(0.023 * SR)) * 0.3
st = np.stack([left, right], axis=1)
st /= max(1e-9, np.abs(st).max()) / 0.89
os.makedirs(os.path.join(HERE, 'out'), exist_ok=True)
path = os.path.join(HERE, 'out', 'music.wav')
with wave.open(path, 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((st * 32767).astype('<i2').tobytes())
print('wrote', path, round(TOTAL, 1), 's')
