# 내레이션 배치 + 배경음악/효과음 합성 + 믹스 -> mix.wav (44.1kHz 스테레오)
import json, numpy as np, soundfile as sf, sys
SR = 44100
doc = json.load(open(sys.argv[1], encoding="utf-8"))
vdir = sys.argv[2]
scenes = doc["scenes"]
starts, t = [], 0.0
for s in scenes: starts.append(t); t += s["duration_sec"]
T = t + 1.5
N = int(T * SR)
rng = np.random.default_rng(7)
def sec(x): return int(round(x * SR))
def mtof(m): return 440 * 2 ** ((m - 69) / 12)

# ---- 내레이션 배치
voice = np.zeros(N); prev_end = 0.0; placed = []
for i, s in enumerate(scenes):
    a, sr = sf.read(f"{vdir}/{s['id']:02d}.wav", dtype="float64")
    if a.ndim > 1: a = a.mean(1)
    st = max(starts[i] + (0.6 if i == 0 else 0.35), prev_end + 0.3)
    voice[sec(st):sec(st) + len(a)] += a
    prev_end = st + len(a) / SR; placed.append((s["id"], round(st, 2), round(prev_end, 2), round(starts[i] + s["duration_sec"], 2)))
voice *= 0.5 / np.abs(voice).max()

# ---- 배경음악: 느린 패드 + 드문 플럭 + 낮은 드론
tt = np.arange(N) / SR
L = np.zeros(N); R = np.zeros(N)
CH = [[57, 64, 67, 71, 72], [53, 60, 64, 67, 69], [48, 55, 59, 64, 67], [55, 59, 62, 66, 69]]  # Am9 Fmaj7 Cmaj7 G
BAR = 8.0
nb = int(np.ceil(T / BAR))
for b in range(nb):
    chord = CH[b % 4]
    if T - b * BAR < 12: chord = [48, 55, 60, 64, 67]  # 마지막은 C로 풀어줌
    s0, dur = b * BAR, BAR + 2.5
    i0, i1 = sec(s0), min(N, sec(s0 + dur)); n = i1 - i0
    if n <= 0: continue
    x = np.arange(n) / SR
    env = np.minimum(1, x / 2.0) * np.clip((dur - x) / 2.5, 0, 1)
    for k, m in enumerate(chord):
        f = mtof(m)
        g = 0.05 if k else 0.07
        for det, arr in ((-0.12, L), (0.12, R)):
            ph = 2 * np.pi * (f + det) * x + rng.uniform(0, 6)
            arr[i0:i1] += g * env * (np.sin(ph) + 0.18 * np.sin(2 * ph))
# 드론
drone = 0.06 * np.sin(2 * np.pi * mtof(33) * tt) * (0.8 + 0.2 * np.sin(2 * np.pi * tt / 11))
L += drone; R += drone
# 플럭 (장면 4부터, 끝 무렵엔 드물게)
beat = 60 / 68
b = starts[3]
while b < T - 6:
    density = 0.45 if b < starts[23] else 0.25
    if rng.random() < density:
        chord = CH[int(b // BAR) % 4]
        m = int(rng.choice(chord)) + 12
        f = mtof(m); n = sec(1.6); i0 = sec(b)
        x = np.arange(min(n, N - i0)) / SR
        note = np.exp(-x * 3.2) * (np.sin(2 * np.pi * f * x) + 0.25 * np.exp(-x * 8) * np.sin(6 * np.pi * f * x)) * np.minimum(1, x / 0.004)
        pan = rng.uniform(0.25, 0.75)
        L[i0:i0 + len(x)] += 0.045 * note * (1 - pan); R[i0:i0 + len(x)] += 0.045 * note * pan
    b += beat
# 앞뒤 페이드
fade = np.minimum(1, tt / 4.0) * np.clip((T - tt) / 6.0, 0, 1)
L *= fade; R *= fade

# ---- 효과음
SL = np.zeros(N); SR_ = np.zeros(N)
def add(sig, at, gain, pan=0.5):
    i0 = sec(at); n = min(len(sig), N - i0)
    SL[i0:i0 + n] += gain * sig[:n] * (1 - pan) * 2 ** 0.5; SR_[i0:i0 + n] += gain * sig[:n] * pan * 2 ** 0.5
def whoosh(d=1.1):
    n = sec(d); w = rng.standard_normal(n)
    F = np.fft.rfft(w); fr = np.fft.rfftfreq(n, 1 / SR)
    F *= np.exp(-((fr - 900) / 1200) ** 2); w = np.fft.irfft(F, n)
    x = np.arange(n) / n; w *= np.sin(np.pi * x ** 0.7) ** 2
    return w / np.abs(w).max()
def pop():
    x = np.arange(sec(0.12)) / SR
    return np.sin(2 * np.pi * (520 - 1800 * x) * x) * np.exp(-x * 45)
def chime(m=84):
    x = np.arange(sec(2.5)) / SR; f = mtof(m)
    return (np.sin(2 * np.pi * f * x) + 0.4 * np.sin(2 * np.pi * f * 2.76 * x) * np.exp(-x * 3)) * np.exp(-x * 1.8) * np.minimum(1, x / 0.003)
def boom():
    x = np.arange(sec(2.5)) / SR
    return np.sin(2 * np.pi * (55 - 10 * x) * x) * np.exp(-x * 1.6) * np.minimum(1, x / 0.02)
for i, s in enumerate(scenes[1:], 1):
    tr = scenes[i - 1].get("transition") or "컷"
    if "줌" in tr or "밀어" in tr: add(whoosh(1.2), starts[i] - 0.7, 0.10, 0.35 if "밀어" not in tr else 0.7)
    elif "페이드" in tr: add(whoosh(1.6), starts[i] - 0.9, 0.06)
    else: add(pop(), starts[i] + 0.05, 0.06, rng.uniform(0.35, 0.65))
add(chime(88), 0.3, 0.07, 0.6)
add(chime(84), starts[6] + 0.2, 0.06, 0.4)   # "우리는 시뮬레이션 속에 있다"
add(chime(79), starts[26] + 0.5, 0.06, 0.5)
add(boom(), starts[26] + scenes[26]["duration_sec"] - 1.0, 0.18)  # 암전

# ---- 덕킹: 목소리 나올 때 음악을 낮춤
k = sec(0.25)
env = np.convolve(np.abs(voice), np.ones(k) / k, "same")
duck = np.convolve((env > 0.01).astype(float), np.ones(sec(0.4)) / sec(0.4), "same")
mg = 1 - 0.45 * duck
# ---- 리버브(음악/효과음만)
def reverb(x, secs=2.8, wet=0.35):
    n = sec(secs); ir = rng.standard_normal(n) * np.exp(-np.arange(n) / SR * 2.6); ir /= np.sqrt((ir ** 2).sum())
    m = 1 << int(np.ceil(np.log2(len(x) + n)))
    y = np.fft.irfft(np.fft.rfft(x, m) * np.fft.rfft(ir, m), m)[:len(x)]
    return (1 - wet) * x + wet * y
mL = reverb(L * mg + SL * 0.8); mR = reverb(R * mg + SR_ * 0.8)
music_gain = 0.45
out = np.stack([voice + music_gain * mL, voice + music_gain * mR], 1)
out *= 0.9 / np.abs(out).max()
sf.write(sys.argv[3], out.astype(np.float32), SR)
for p in placed:
    if p[2] > p[3]: print("넘침", p)
print("ok", T)
