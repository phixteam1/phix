from PIL import Image, ImageFilter
import numpy as np
from collections import deque
im=Image.open('/root/.claude/uploads/566f67de-15fe-5835-83e9-b135121b26d7/f4677988-character.png').convert('RGB')
a=np.array(im).astype(int); H,W,_=a.shape
mn=a.min(2); mx=a.max(2)
bgish=(mn>=222)&((mx-mn)<20)
bg=np.zeros((H,W),bool)
q=deque()
for x in range(W):
  for y in (0,H-1):
    if bgish[y,x]: bg[y,x]=1; q.append((y,x))
for y in range(H):
  for x in (0,W-1):
    if bgish[y,x] and not bg[y,x]: bg[y,x]=1; q.append((y,x))
while q:
  y,x=q.popleft()
  for dy,dx in ((1,0),(-1,0),(0,1),(0,-1)):
    ny,nx=y+dy,x+dx
    if 0<=ny<H and 0<=nx<W and not bg[ny,nx] and bgish[ny,nx]:
      bg[ny,nx]=1; q.append((ny,nx))
fg=~bg
# remove the extinguisher spray cloud (left of the nozzle tip)
fg[:, :338]=False
# keep the largest connected components only (drop specks)
from scipy import ndimage
lab,n=ndimage.label(fg); sizes=ndimage.sum(fg,lab,range(1,n+1))
keep=np.isin(lab, [i+1 for i,s in enumerate(sizes) if s>2000])
m=Image.fromarray((keep*255).astype('uint8')).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(1.0))
out=im.convert('RGBA'); out.putalpha(m)
bb=out.getbbox(); print(bb, n, sorted(sizes)[-5:])
out=out.crop(bb); out.save('hero.png'); print(out.size)
# preview on dark bg
pv=Image.new('RGBA',out.size,(30,40,60,255)); pv.alpha_composite(out); pv.convert('RGB').save('preview.jpg')
