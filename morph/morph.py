"""사자 -> 바나나 -> 비행기 모핑 영상 생성기.

각 그림은 같은 개수(8개)의 도형 조각으로 이루어져 있고, 조각마다
외곽선을 같은 개수의 점으로 다시 샘플링한 뒤 점끼리 보간해서 모양을 바꾼다.

    python3 morph/morph.py            # morph/out/morph.mp4 생성
"""

import math
import os
import subprocess

import imageio_ffmpeg
import numpy as np
from PIL import Image, ImageDraw, ImageFont

SIZE = 720          # 최종 영상 크기 (정사각형)
SS = 2              # 슈퍼샘플링 배율 (계단 현상 제거)
FPS = 30
M = 260             # 조각 하나당 외곽선 점 개수
CANVAS = 1000.0     # 도형 좌표계 크기


# ---------------------------------------------------------------- 도형 도우미

def ellipse(cx, cy, rx, ry, n=120):
    t = np.linspace(0, 2 * math.pi, n, endpoint=False)
    return np.stack([cx + rx * np.cos(t), cy + ry * np.sin(t)], 1)


def wavy_circle(cx, cy, r, amp, k, n=400):
    t = np.linspace(0, 2 * math.pi, n, endpoint=False)
    rr = r + amp * np.cos(k * t)
    return np.stack([cx + rr * np.cos(t), cy + rr * np.sin(t)], 1)


def poly(*pts):
    return np.array(pts, dtype=float)


def rotate(p, deg, cx=500, cy=500):
    a = math.radians(deg)
    c, s = math.cos(a), math.sin(a)
    q = p - [cx, cy]
    return np.stack([q[:, 0] * c - q[:, 1] * s, q[:, 0] * s + q[:, 1] * c], 1) + [cx, cy]


def hexrgb(h):
    h = h.lstrip("#")
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], dtype=float)


# ---------------------------------------------------------------- 사자

def lion():
    return [
        (wavy_circle(500, 490, 300, 24, 16), "#C4661F"),   # 갈기
        (ellipse(360, 305, 58, 58), "#E4A23A"),            # 왼쪽 귀
        (ellipse(640, 305, 58, 58), "#E4A23A"),            # 오른쪽 귀
        (ellipse(500, 495, 200, 212), "#F2BE55"),          # 얼굴
        (ellipse(500, 600, 108, 78), "#FBE3B0"),           # 주둥이
        (ellipse(428, 460, 20, 27), "#2B1B12"),            # 왼쪽 눈
        (ellipse(572, 460, 20, 27), "#2B1B12"),            # 오른쪽 눈
        (poly((452, 540), (548, 540), (512, 588), (488, 588)), "#5A3420"),  # 코
    ]


# ---------------------------------------------------------------- 바나나

BAN_C = np.array([500.0, 215.0])  # 바나나 곡선의 중심
BAN_R = 360.0
BAN_A0, BAN_A1 = math.radians(28), math.radians(152)
BAN_W = 170.0
BAN_TILT = -18


def _ban_center(s):
    a = BAN_A1 + (BAN_A0 - BAN_A1) * s   # s=0 왼쪽 끝, s=1 오른쪽 끝
    p = BAN_C + BAN_R * np.stack([np.cos(a), np.sin(a)], -1)
    n = np.stack([np.cos(a), np.sin(a)], -1)   # 바깥쪽(볼록한 쪽) 방향
    return p, n


def _ban_half(s):
    return 0.5 * BAN_W * np.sin(np.pi * s) ** 0.6 + 6


def ban_band(o_in, o_out, s0=0.0, s1=1.0, n=160):
    """반폭 대비 오프셋 o_in..o_out 사이의 띠 (-1 = 안쪽 가장자리, 1 = 바깥쪽)."""
    s = np.linspace(s0, s1, n)
    p, nrm = _ban_center(s)
    h = _ban_half(s)[:, None]
    outer = p + nrm * h * o_out
    inner = p + nrm * h * o_in
    return rotate(np.concatenate([outer, inner[::-1]]), BAN_TILT)


def ban_spot(s, o, rx, ry):
    p, nrm = _ban_center(np.array([s]))
    c = p[0] + nrm[0] * _ban_half(np.array([s]))[0] * o
    return rotate(ellipse(c[0], c[1], rx, ry, 60), BAN_TILT)


def ban_end(s, direction, length, width):
    """바나나 끝에서 접선 방향으로 튀어나온 꼭지."""
    p, nrm = _ban_center(np.array([s]))
    p, nrm = p[0], nrm[0]
    tan = np.array([-nrm[1], nrm[0]]) * direction
    w = nrm * width / 2
    pts = poly(p + w, p + w + tan * length, p - w * 0.8 + tan * length, p - w)
    return rotate(pts, BAN_TILT)


def banana():
    return [
        (ban_band(-1, 1), "#F7D23E"),                         # 몸통
        (ban_end(0.015, -1, 75, 34), "#6E6A2C"),              # 꼭지 (왼쪽 끝)
        (ban_end(0.985, 1, 26, 20), "#3E2B18"),               # 끝 (오른쪽)
        (ban_band(-1, -0.25, 0.03, 0.97), "#E2B224"),         # 안쪽 그림자
        (ban_band(0.3, 0.62, 0.18, 0.8), "#FFF1A6"),          # 하이라이트
        (ban_spot(0.38, 0.05, 9, 7), "#7A5522"),              # 반점들
        (ban_spot(0.58, -0.2, 7, 6), "#7A5522"),
        (ban_spot(0.72, 0.15, 10, 8), "#7A5522"),
    ]


# ---------------------------------------------------------------- 비행기 (옆모습, 오른쪽을 향함)

def _smooth(x):
    x = np.clip(x, 0, 1)
    return x * x * (3 - 2 * x)


def _fus_center(x):
    return 490 - 45 * (1 - _smooth((x - 150) / 190))


def _fus_half(x):
    h = np.full_like(x, 64.0)
    nose = x > 770
    h[nose] = 64 * np.sqrt(np.clip(1 - ((x[nose] - 770) / 95) ** 2, 0, 1))
    tail = x < 340
    h[tail] = 16 + 48 * _smooth((x[tail] - 150) / 190)
    return h


def fuselage():
    x = np.linspace(150, 865, 200)
    yc, h = _fus_center(x), _fus_half(x)
    top = np.stack([x, yc - h], 1)
    bot = np.stack([x, yc + h], 1)
    return np.concatenate([top, bot[::-1]])


def fus_band(x0, x1, o0, o1):
    x = np.linspace(x0, x1, 120)
    yc, h = _fus_center(x), _fus_half(x)
    a = np.stack([x, yc + h * o0], 1)
    b = np.stack([x, yc + h * o1], 1)
    return np.concatenate([a, b[::-1]])


def windows(x0, x1, count, y, r):
    """창문 여러 개를 폭 0짜리 선으로 이어 하나의 다각형으로 만든다."""
    pts = []
    base = y + r
    for xi in np.linspace(x0, x1, count):
        t = np.linspace(math.pi / 2, math.pi / 2 + 2 * math.pi, 28)
        pts.append(np.stack([xi + r * np.cos(t), y + r * np.sin(t)], 1))
    fwd = np.concatenate(pts)
    back = np.stack([np.linspace(x1, x0, 20), np.full(20, base)], 1)
    return np.concatenate([fwd, back])


def airplane():
    return [
        (fuselage(), "#EEF2F7"),                                              # 동체
        (poly((330, 450), (190, 452), (150, 250), (212, 250)), "#E24B3B"),    # 꼬리 날개
        (ellipse(535, 585, 72, 27), "#9AA6B6"),                               # 엔진
        (poly((640, 515), (520, 515), (370, 655), (445, 655)), "#2F6FD1"),    # 주 날개
        (fus_band(230, 830, 0.18, 0.4), "#2F6FD1"),                           # 줄무늬
        (poly((786, 452), (812, 452), (842, 474), (786, 474)), "#1F2F4A"),    # 조종석 창
        (windows(380, 740, 10, 470, 9), "#1F2F4A"),                           # 창문들
        (poly((300, 482), (220, 482), (170, 525), (228, 525)), "#2F6FD1"),    # 수평 꼬리날개
    ]


# ---------------------------------------------------------------- 점 대응(correspondence)

def resample(p, n=M):
    """닫힌 다각형을 둘레 길이 기준으로 n개의 점으로 균등 재샘플링 (반시계 방향)."""
    p = np.asarray(p, float)
    x, y = p[:, 0], p[:, 1]
    area = 0.5 * np.sum(x * np.roll(y, -1) - np.roll(x, -1) * y)
    if area < 0:
        p = p[::-1]
    closed = np.vstack([p, p[:1]])
    seg = np.linalg.norm(np.diff(closed, axis=0), axis=1)
    cum = np.concatenate([[0], np.cumsum(seg)])
    t = np.linspace(0, cum[-1], n, endpoint=False)
    return np.stack([np.interp(t, cum, closed[:, 0]), np.interp(t, cum, closed[:, 1])], 1)


def align(a, b):
    """b의 시작점을 돌려서 a와의 (중심 기준) 거리 합이 가장 작게 맞춘다."""
    ac, bc = a - a.mean(0), b - b.mean(0)
    best = min(range(len(b)), key=lambda k: np.sum((ac - np.roll(bc, -k, 0)) ** 2))
    return np.roll(b, -best, 0)


def prepare(shape):
    return [(resample(p), hexrgb(c)) for p, c in shape]


# ---------------------------------------------------------------- 보간 & 렌더링

def ease(t):
    t = min(max(t, 0.0), 1.0)
    return 0.5 - 0.5 * math.cos(math.pi * t)


BACKGROUNDS = [
    (hexrgb("#3B2A4A"), hexrgb("#17102A")),   # 사자: 해질녘 보라
    (hexrgb("#24483E"), hexrgb("#0E1F1A")),   # 바나나: 깊은 초록
    (hexrgb("#2B63A8"), hexrgb("#0D2447")),   # 비행기: 하늘
]
LABELS = ["LION", "BANANA", "AIRPLANE"]


def morph_parts(src, dst, p):
    """조각마다 살짝 시차를 두고 보간해서 더 유기적으로 보이게 한다."""
    out = []
    n = len(src)
    for i, ((a, ca), (b, cb)) in enumerate(zip(src, dst)):
        delay = 0.25 * i / (n - 1)
        q = ease((p - delay) / 0.75)
        ac, bc = a.mean(0), b.mean(0)
        center = ac + (bc - ac) * q
        # 이동 경로를 살짝 휘게 해서 직선 이동보다 자연스럽게
        lift = 40 * math.sin(math.pi * q)
        center = center + [0, -lift]
        rel = (a - ac) * (1 - q) + (b - bc) * q
        out.append((rel + center, ca + (cb - ca) * q))
    return out


def gradient(top, bot):
    h = SIZE * SS
    t = np.linspace(0, 1, h)[:, None]
    col = top * (1 - t) + bot * t
    img = np.repeat(col[:, None, :], h, axis=1)
    return Image.fromarray(img.astype(np.uint8), "RGB")


def render(parts, bg, label, label_alpha, squash):
    s = SIZE * SS / CANVAS
    img = gradient(*bg)
    d = ImageDraw.Draw(img)
    # 바닥 그림자
    sw = 260 * squash
    d.ellipse([(500 - sw) * s, 880 * s, (500 + sw) * s, 915 * s], fill=tuple((bg[1] * 0.55).astype(int)))
    for pts, col in parts:
        # 모핑 중에는 살짝 눌렸다 펴지는 느낌
        q = (pts - [500, 500]) * [1 / squash, squash] + [500, 500]
        d.polygon([tuple(v) for v in (q * s)], fill=tuple(np.round(col).astype(int)))
    img = img.resize((SIZE, SIZE), Image.LANCZOS)
    if label_alpha > 0:
        font = ImageFont.load_default(size=34)
        d2 = ImageDraw.Draw(img, "RGBA")
        w = d2.textlength(label, font=font)
        d2.text(((SIZE - w) / 2, SIZE - 58), label, font=font,
                fill=(255, 255, 255, int(200 * label_alpha)))
    return img


def main():
    shapes = [prepare(lion()), prepare(banana()), prepare(airplane())]
    hold, morph = int(1.3 * FPS), int(1.9 * FPS)

    # 사자 -> 바나나 -> 비행기 -> (다시 사자로, 반복 재생용)
    frames = []
    for k in range(3):
        a = shapes[k]
        b = [(align(pa, pb), cb) for (pa, _), (pb, cb) in zip(a, shapes[(k + 1) % 3])]
        for f in range(hold):
            frames.append((a, a, 0.0, k, k))
        for f in range(morph):
            frames.append((a, b, f / (morph - 1), k, (k + 1) % 3))

    out_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")
    os.makedirs(out_dir, exist_ok=True)
    out = os.path.join(out_dir, "morph.mp4")
    cmd = [imageio_ffmpeg.get_ffmpeg_exe(), "-y", "-loglevel", "error",
           "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{SIZE}x{SIZE}", "-r", str(FPS), "-i", "-",
           "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-movflags", "+faststart", out]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)

    for a, b, p, ka, kb in frames:
        parts = morph_parts(a, b, p)
        e = ease(p)
        bg = tuple(BACKGROUNDS[ka][i] * (1 - e) + BACKGROUNDS[kb][i] * e for i in range(2))
        squash = 1 + 0.06 * math.sin(math.pi * e)
        # 라벨은 모핑 중간에 사라졌다가 다시 나타남
        label = LABELS[ka] if e < 0.5 else LABELS[kb]
        label_alpha = abs(1 - 2 * e) ** 2
        proc.stdin.write(render(parts, bg, label, label_alpha, squash).tobytes())

    proc.stdin.close()
    proc.wait()
    print("saved", out, f"({len(frames) / FPS:.1f}s)")


if __name__ == "__main__":
    main()
