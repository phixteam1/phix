# 원본 캐릭터 그림(hero.png)을 색으로 나눠 부위별 윤곽선을 따서 parts.json으로 저장한다.
import json
import numpy as np
from PIL import Image
from scipy import ndimage
from skimage import measure

im = np.array(Image.open('../hero.png')).astype(float)
RGB = im[..., :3]
lab = np.load('lab.npy')
H, W = lab.shape
yy, xx = np.mgrid[0:H, 0:W]
fill = ndimage.binary_fill_holes


def comp(k, bbox, open_=1):
    m = lab == k
    if open_: m = ndimage.binary_opening(m, iterations=open_)
    L, n = ndimage.label(m)
    x0, y0, x1, y1 = bbox
    ids = set(np.unique(L[y0:y1, x0:x1])) - {0}
    best = max(ids, key=lambda i: ((L[y0:y1, x0:x1] == i).sum()))
    return L == best


def box(x0, y0, x1, y1): return (xx >= x0) & (xx < x1) & (yy >= y0) & (yy < y1)
def disk(cx, cy, r): return (xx - cx) ** 2 + (yy - cy) ** 2 <= r * r


def contour(mask, tol=1.2, smooth=1.2, minlen=20):
    m = ndimage.gaussian_filter(mask.astype(float), smooth)
    cs = measure.find_contours(np.pad(m, 2), 0.5)
    out = []
    for c in cs:
        if len(c) < minlen: continue
        c = measure.approximate_polygon(c, tol) - 2
        out.append([[round(float(p[1]), 1), round(float(p[0]), 1)] for p in c[:-1]])
    area = lambda c: abs(sum(c[i][0] * c[i - 1][1] - c[i - 1][0] * c[i][1] for i in range(len(c)))) / 2
    out.sort(key=lambda c: -area(c))
    return out


def colors(mask):
    px = RGB[mask]
    lum = px @ [0.3, 0.59, 0.11]
    o = np.argsort(lum)
    pick = lambda q: [int(v) for v in px[o[int(q * (len(o) - 1))]]]
    return [pick(0.92), pick(0.5), pick(0.08)]


P = {}
def part(name, mask, **kw):
    ys, xs = np.nonzero(mask)
    P[name] = {"paths": contour(mask, **kw), "col": colors(mask), "bbox": [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())]}
    return mask

# ---- 머리
purple = comp(1, (51, 126, 592, 570))
dome = fill(ndimage.binary_closing(comp(3, (130, 3, 342, 159)) | comp(3, (368, 30, 585, 237)) | (lab == 4) & box(240, 15, 440, 190) | (lab == 5) & box(285, 15, 385, 180), iterations=4))
dome = ndimage.binary_opening(dome, iterations=3)
band = purple & ndimage.binary_dilation(dome, iterations=55) & (yy < 300) & ~dome
band = ndimage.binary_opening(band, iterations=3)
head_all = fill(purple | dome)
hood = fill(purple) & ~dome
face = fill(purple) & ~purple & (yy > 170)
face = ndimage.binary_opening(face, iterations=2)
part("hood", fill(purple | band))
part("band", band)
part("face", face)
hair = comp(8, (123, 198, 480, 338)) & face
part("hair", ndimage.binary_opening(hair, iterations=2))
part("eyeL", comp(8, (177, 309, 230, 399), 0) | fill(comp(8, (177, 309, 230, 399), 0)))
part("eyeR", fill(comp(8, (341, 343, 395, 433), 0)))
part("glintL", (lab == 6) & box(200, 330, 232, 372), smooth=0.8, minlen=8)
part("glintR", (lab == 6) & box(365, 368, 398, 406), smooth=0.8, minlen=8)
mouth = fill(comp(3, (234, 405, 318, 469), 0) | (lab == 7) & box(234, 405, 320, 470))
part("mouth", ndimage.binary_closing(mouth, iterations=2))
part("tongue", (lab == 7) & box(234, 430, 320, 470) & mouth)
part("helmet", dome)
emb = fill(ndimage.binary_closing(((lab == 4) | (lab == 5)) & box(240, 15, 440, 190) & dome, iterations=3))
part("emblem", ndimage.binary_opening(emb, iterations=2))
part("stripe", (lab == 5) & box(285, 15, 385, 180) & emb)
part("hoodGlint", (lab == 6) & box(80, 185, 112, 230), smooth=0.8, minlen=8)

# ---- 몸통 (팔, 오른다리 부분을 빼고 둥글게)
blue = comp(2, (50, 529, 567, 925))
torso = blue & box(118, 520, 478, 880) & ~(box(380, 790, 600, 1000))
torso = fill(ndimage.binary_closing(torso | box(200, 560, 420, 820), iterations=12))
torso = ndimage.binary_opening(torso, iterations=34)
part("torso", torso, tol=1.6, smooth=3)
P["torso"]["col"] = colors(blue & torso & (lab == 2))
P["suit"] = {"paths": [], "col": colors(blue), "bbox": [0, 0, 1, 1]}

# ---- 장갑
ring = disk(262, 612, 60) & ~disk(262, 612, 30) & (yy < 660)
redL = comp(3, (88, 575, 330, 696))
gl = redL & ~ring & (xx < 250)
gl = gl | ((lab == 8) & box(150, 600, 240, 700) & ndimage.binary_dilation(gl, iterations=12))
part("gloveL", fill(ndimage.binary_opening(ndimage.binary_closing(gl, iterations=6), iterations=3)))
redR = comp(3, (209, 626, 440, 995))
gr = redR & box(322, 610, 460, 760) & ~box(300, 705, 372, 770)
gr = gr | ((lab == 8) & box(322, 610, 460, 700) & ndimage.binary_dilation(gr, iterations=12))
part("gloveR", fill(ndimage.binary_opening(ndimage.binary_closing(gr, iterations=6), iterations=3)))

# ---- 소화기
body = redR & ~box(322, 610, 460, 760)
part("extBody", fill(ndimage.binary_closing(ndimage.binary_opening(body, iterations=2) | (lab == 6) & box(209, 687, 409, 994), iterations=3)))
part("extRing", redL & ring)
gray = (RGB.max(2) - RGB.min(2) < 50) & (RGB.max(2) < 200) & (im[..., 3] > 128)
bot = comp(8, (254, 954, 419, 1029)) | gray & box(250, 950, 425, 1033)
part("extBottom", fill(ndimage.binary_opening(ndimage.binary_closing(bot, iterations=4), iterations=2)))
part("extValve", fill(comp(5, (260, 659, 318, 706), 0)))
lev = np.zeros_like(lab, bool)
for bb in [(217, 630, 269, 680), (293, 645, 362, 676), (203, 693, 243, 716), (248, 701, 280, 714)]: lev |= comp(8, bb, 0)
part("extLever", ndimage.binary_closing(lev, iterations=3), minlen=10)
part("nozzle", fill(ndimage.binary_closing(comp(8, (3, 634, 137, 751)), iterations=5)))

# ---- 장화, 망토
part("bootL", comp(3, (57, 910, 225, 1030)))
part("bootR", comp(3, (462, 864, 631, 1015)))
cape = fill(ndimage.binary_closing(comp(5, (468, 538, 753, 809)) | comp(4, (457, 548, 571, 763)), iterations=3))
part("cape", cape, tol=1.5, smooth=2)
part("capeFold", comp(4, (457, 548, 571, 763)), tol=1.5, smooth=2)

# 장갑 손가락 주름 (어두운 빨강)
for side in ("L", "R"):
    gm = np.zeros_like(lab, bool)
    for c in P["glove" + side]["paths"][:1]:
        from skimage.draw import polygon as dpoly
        rr, cc = dpoly([q[1] for q in c], [q[0] for q in c], lab.shape); gm[rr, cc] = True
    v = RGB.max(2) / 255
    dark = gm & ndimage.binary_erosion(gm, iterations=6) & (v < 0.72) & (lab == 3)
    dark = ndimage.binary_opening(dark, iterations=1)
    P["crease" + side] = {"paths": contour(dark, tol=0.8, smooth=0.8, minlen=10), "col": [], "bbox": P["glove" + side]["bbox"]}
json.dump(P, open('parts.json', 'w'))
open('../parts.js', 'w').write('// trace/trace.py가 원본 그림에서 딴 부위별 윤곽선\nconst PARTS = ' + json.dumps(P, separators=(',', ':')) + ';\n')
# 미리보기
prev = np.zeros((H, W, 3), np.uint8); prev[:] = 235
from PIL import ImageDraw
pim = Image.fromarray(prev); d = ImageDraw.Draw(pim)
for n, p in P.items():
    for c in p["paths"]:
        d.polygon([tuple(q) for q in c], fill=tuple(p["col"][1]) if p["col"] else (120, 0, 0), outline=(0, 0, 0))
pim.save('parts.png')
print({n: (len(p["paths"]), sum(len(c) for c in p["paths"])) for n, p in P.items()})

# ---- 몸통 v2: 팔다리를 뺀 몸통. 소화기, 장갑 뒤 가려진 곳은 채운다
from skimage.draw import polygon as dpoly
def poly(pts):
    m = np.zeros_like(lab, bool); rr, cc = dpoly([p[1] for p in pts], [p[0] for p in pts], lab.shape); m[rr, cc] = True; return m
region = poly([(190, 548), (420, 548), (452, 578), (462, 640), (455, 700), (450, 770), (420, 812), (215, 815), (165, 790), (150, 700), (148, 640), (160, 578)])
hidden = poly([(190, 590), (440, 590), (440, 800), (200, 800)])
t2 = (blue | hidden) & region
t2 = fill(ndimage.binary_closing(t2, iterations=8))
t2 = ndimage.binary_opening(t2, iterations=20)
part("torso2", t2, tol=1.5, smooth=3)
json.dump(P, open('parts.json', 'w'))
open('../parts.js', 'w').write('// trace/trace.py가 원본 그림에서 딴 부위별 윤곽선\nconst PARTS = ' + json.dumps(P, separators=(',', ':')) + ';\n')
