# 배경음악과 효과음을 코드로 합성해 mix.wav(44.1kHz 스테레오)를 만든다. 사용: python3 audio.py mix.wav
import sys, wave
import numpy as np

SR = 44100
TOT = 30.0
N = int(TOT * SR)
rng = np.random.default_rng(3)
L = np.zeros(N); R = np.zeros(N)
sec = lambda x: int(round(x * SR))
mtof = lambda m: 440 * 2 ** ((m - 69) / 12)


def add(sig, at, gain, pan=0.5):
    i0 = sec(at)
    if i0 >= N: return
    n = min(len(sig), N - i0)
    L[i0:i0 + n] += gain * sig[:n] * (1 - pan) * 1.4
    R[i0:i0 + n] += gain * sig[:n] * pan * 1.4


def lowpass(x, fc):
    F = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR)
    return np.fft.irfft(F / (1 + (f / fc) ** 4), len(x))


def bandnoise(d, fc, bw):
    n = sec(d); F = np.fft.rfft(rng.standard_normal(n)); f = np.fft.rfftfreq(n, 1 / SR)
    w = np.fft.irfft(F * np.exp(-((f - fc) / bw) ** 2), n)
    return w / (np.abs(w).max() + 1e-9)


def env(n, a=0.005, rel=None):
    x = np.arange(n) / SR
    e = np.minimum(1, x / a)
    if rel: e *= np.clip((n / SR - x) / rel, 0, 1)
    return e

# ---------- 악기
def pluck(m, d=0.5):
    x = np.arange(sec(d)) / SR; f = mtof(m)
    return (np.sin(2 * np.pi * f * x) + 0.3 * np.sin(4 * np.pi * f * x) * np.exp(-x * 9)) * np.exp(-x * 7) * env(len(x))


def bass(m, d):
    x = np.arange(sec(d)) / SR; f = mtof(m)
    s = np.sin(2 * np.pi * f * x) + 0.35 * np.sin(4 * np.pi * f * x)
    return s * env(len(x), 0.01, 0.06) * np.exp(-x * 1.5)


def pad(ms, d, bright=0.2):
    x = np.arange(sec(d)) / SR; s = np.zeros(len(x))
    for m in ms:
        for det in (-0.15, 0.15):
            ph = 2 * np.pi * (mtof(m) + det) * x
            s += np.sin(ph) + bright * np.sin(2 * ph)
    return s / len(ms) * env(len(x), 0.25, 0.4)


def kick():
    x = np.arange(sec(0.3)) / SR
    return np.sin(2 * np.pi * (48 * x + 90 * (1 - np.exp(-x * 30)) / 30)) * np.exp(-x * 11)


def hat():
    w = bandnoise(0.06, 8000, 3000)
    return w * np.exp(-np.arange(len(w)) / SR * 60)


def snare():
    w = bandnoise(0.2, 2500, 2000); x = np.arange(len(w)) / SR
    return (0.7 * w + 0.5 * np.sin(2 * np.pi * 190 * x)) * np.exp(-x * 18)


def bell(m, d=1.8):
    x = np.arange(sec(d)) / SR; f = mtof(m)
    return (np.sin(2 * np.pi * f * x) + 0.5 * np.sin(2 * np.pi * f * 2.76 * x) * np.exp(-x * 4)) * np.exp(-x * 2.2) * env(len(x), 0.002)

# ---------- 음악
BEAT = 60 / 112
PROG = {"C": [48, 55, 60, 64, 67], "G": [43, 55, 59, 62, 67], "Am": [45, 57, 60, 64, 69], "F": [41, 53, 57, 60, 65], "Em": [40, 55, 59, 64, 67]}


def groove(t0, t1, chords, drums=True, arp=True, gain=1.0):
    b = t0; i = 0
    while b < t1 - 0.01:
        ch = PROG[chords[(i // 4) % len(chords)]]
        if i % 4 == 0:
            add(bass(ch[0], BEAT * 3.8), b, 0.22 * gain)
            add(pad(ch[1:], min(BEAT * 4.2, t1 - b + 0.3)), b, 0.05 * gain)
        if arp:
            for k in range(2):
                add(pluck(ch[1 + (2 * i + k) % 4] + 12, 0.4), b + k * BEAT / 2, 0.07 * gain, 0.3 + 0.4 * ((i + k) % 2))
        if drums:
            if i % 2 == 0: add(kick(), b, 0.35 * gain)
            else: add(snare(), b, 0.12 * gain, 0.55)
            add(hat(), b + BEAT / 2, 0.05 * gain, 0.65)
        b += BEAT; i += 1


groove(0.3, 7.0, ["C", "G", "Am", "F"], drums=True)
add(pad([57, 60, 64], 2.8, 0.5) * (1 + 0.5 * np.sin(2 * np.pi * 7 * np.arange(sec(2.8)) / SR)), 7.0, 0.09)  # 긴장 트레몰로
for k in range(4): add(bass(45 - (k % 2) * 2, 0.3), 7.0 + k * BEAT, 0.3)
groove(10.4, 14.6, ["F", "G", "Em", "Am"], gain=1.1)
add(pad([60, 64, 67, 72], 4.6, 0.4), 14.7, 0.09)
b = 14.7
while b < 19.2:  # 충전하는 동안 반박자 킥 + 점점 올라가는 플럭
    add(kick(), b, 0.25); b += BEAT * 2
for k, t in enumerate(np.arange(14.9, 19.2, BEAT / 2)):
    add(pluck(72 + int(k * 0.7), 0.3), t, 0.05, 0.3 + 0.4 * (k % 2))
add(pad([48, 55, 60, 64, 67, 72], 6.8, 0.3), 23.4, 0.1)
groove(23.4, 29.6, ["C", "F", "G", "C"], drums=False, gain=0.9)
for i, (m, d) in enumerate([(72, 1), (76, 1), (79, 1), (84, 3)]):  # 완료 팡파르
    add(bell(m, 2.0), 27.2 + i * BEAT * 0.5 + (0.4 if i == 3 else 0), 0.13, 0.5)
for t in (27.9, 28.3): add(snare(), t, 0.1)

# ---------- 효과음
n = sec(TOT)
tt = np.arange(n) / SR
crackle = np.zeros(n)
for i in range(1800):
    at = rng.uniform(0, 23.5); i0 = sec(at); k = sec(0.004 + rng.random() * 0.01)
    crackle[i0:i0 + k] += rng.standard_normal(min(k, n - i0)) * np.exp(-np.arange(min(k, n - i0)) / (k / 4)) * rng.uniform(0.3, 1)
roar = lowpass(rng.standard_normal(n), 300)
roar /= np.abs(roar).max()
lvl = np.clip(tt / 1.0, 0, 1) * (1 + 0.5 * np.clip((tt - 7) / 0.5, 0, 1)) * np.clip((21.4 + 1.0 - tt) / 1.0, 0, 1)
lvl *= 1 - 0.8 * np.clip((tt - 10.6) / 2, 0, 1) * (tt < 19.6)
lvl = np.maximum(lvl, 0)
add(crackle * lvl * 0.5 + roar * lvl * 0.35, 0, 0.35)

spray = bandnoise(6.0, 4500, 3000) * env(sec(6.0), 0.1, 0.2)
add(spray, 3.2, 0.09, 0.35)
add(bandnoise(4.2, 2500, 2500) * env(sec(4.2), 0.05, 0.8), 10.4, 0.08)  # 분사 추진


def whoosh(d, fc=900):
    w = bandnoise(d, fc, 1200); x = np.arange(len(w)) / len(w)
    return w * np.sin(np.pi * x ** 0.6) ** 2


add(whoosh(1.1), 0.9, 0.18, 0.8)
add(kick() * 1.2, 2.0, 0.3)                     # 착지 쿵
add(whoosh(0.6, 1500), 7.0, 0.16)               # 불길 확
add(whoosh(1.2, 700), 10.3, 0.25)               # 발사
add(whoosh(1.2, 700), 25.6, 0.16, 0.6)          # 내려옴
x = np.arange(sec(4.3)) / SR                    # 물폭탄 충전: 올라가는 톤 + 보글보글
add(np.sin(2 * np.pi * np.cumsum(200 + 500 * (x / 4.3) ** 2) / SR) * (x / 4.3) * 0.5, 14.9, 0.06)
for i in range(60):
    at = rng.uniform(14.9, 19.2); xx = np.arange(sec(0.05)) / SR; f = rng.uniform(500, 1400)
    add(np.sin(2 * np.pi * (f + 6000 * xx) * xx) * np.exp(-xx * 60), at, 0.05, rng.uniform(0.2, 0.8))
add(whoosh(0.7, 1100), 19.2, 0.22)              # 던짐
x = np.arange(sec(1.8)) / SR                    # 떨어지는 휘파람
add(np.sin(2 * np.pi * np.cumsum(1400 - 700 * x / 1.8) / SR) * np.minimum(1, x / 0.3) * 0.6, 19.6, 0.07)
x = np.arange(sec(3.0)) / SR                    # 쾅 + 물 튀는 소리
boom = np.sin(2 * np.pi * np.cumsum(70 - 35 * x / 3) / SR) * np.exp(-x * 1.4)
add(boom, 21.4, 0.55)
add(lowpass(rng.standard_normal(sec(2.5)), 2500) * np.exp(-np.arange(sec(2.5)) / SR * 1.8) * 3, 21.4, 0.25)
steam = bandnoise(3.5, 6000, 3500) * env(sec(3.5), 0.3, 2.0)
add(steam, 21.7, 0.1, 0.4)
rain = bandnoise(4.0, 3500, 3000) * env(sec(4.0), 0.5, 1.5)
add(rain, 21.9, 0.06, 0.6)
x = np.arange(sec(0.35)) / SR
add(np.sin(2 * np.pi * np.cumsum(180 + 300 * np.sin(np.pi * x / 0.35)) / SR) * np.exp(-x * 6), 27.0, 0.2)  # 착지 뾰잉
add(np.sin(2 * np.pi * np.cumsum(400 + 500 * x / 0.35) / SR) * np.exp(-x * 8), 27.8, 0.08)                # 폴짝

# ---------- 마무리
def reverb(x, secs=2.0, wet=0.22):
    n = sec(secs); ir = rng.standard_normal(n) * np.exp(-np.arange(n) / SR * 3.2); ir /= np.sqrt((ir ** 2).sum())
    m = 1 << int(np.ceil(np.log2(len(x) + n)))
    return (1 - wet) * x + wet * np.fft.irfft(np.fft.rfft(x, m) * np.fft.rfft(ir, m), m)[:len(x)]


fade = np.clip(tt / 0.3, 0, 1) * np.clip((TOT - tt) / 1.2, 0, 1)
out = np.stack([reverb(L) * fade, reverb(R) * fade], 1)
out *= 0.89 / np.abs(out).max()
with wave.open(sys.argv[1], "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((out * 32767).astype("<i2").tobytes())
print("ok")
