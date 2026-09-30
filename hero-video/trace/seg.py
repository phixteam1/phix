import numpy as np
from PIL import Image
im = np.array(Image.open('../hero.png')).astype(float)
rgb, A = im[..., :3] / 255, im[..., 3]
mx, mn = rgb.max(2), rgb.min(2); d = mx - mn + 1e-9
r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
h = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60
s = d / (mx + 1e-9); v = mx
fg = A > 128
lab = np.zeros(A.shape, int)
C = {0: (40, 40, 40), 1: (130, 60, 200), 2: (40, 90, 220), 3: (230, 40, 30), 4: (255, 130, 30), 5: (255, 200, 40), 6: (255, 240, 225), 7: (250, 150, 150), 8: (10, 10, 10), 9: (255, 255, 255)}
lab[fg] = 0
lab[fg & (s > .3) & (h >= 245) & (h < 300)] = 1           # purple
lab[fg & (s > .3) & (h >= 195) & (h < 245)] = 2           # blue
lab[fg & (s > .45) & ((h < 13) | (h >= 330)) & (v > .3)] = 3  # red
lab[fg & (s > .45) & (h >= 13) & (h < 34)] = 4            # orange
lab[fg & (s > .45) & (h >= 34) & (h < 60)] = 5            # yellow
lab[fg & (s <= .3) & (v > .8)] = 6                        # cream/white
lab[fg & (s > .12) & (s <= .5) & ((h < 20) | (h >= 330)) & (v > .8)] = 7  # pink
lab[fg & (v < .22)] = 8                                   # black
np.save('lab.npy', lab)
out = np.zeros(A.shape + (3,), np.uint8); out[:] = (200, 210, 220)
for k, c in C.items(): out[fg & (lab == k)] = c
Image.fromarray(out).save('lab.png')
