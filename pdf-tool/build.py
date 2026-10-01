#!/usr/bin/env python3
"""src/ + vendor/ -> dist/PDF정리함.html (인터넷 없이 더블클릭으로 열리는 단일 파일)"""
import base64, json, os, re
H = os.path.dirname(os.path.abspath(__file__))
rd = lambda *p: open(os.path.join(H, *p), encoding='utf-8').read()
def safe(js):
    assert '</script' not in js.lower(), 'script 종료 태그가 들어있음'
    return js
cmaps = {}
cdir = os.path.join(H, 'vendor', 'cmaps')
for f in sorted(os.listdir(cdir)):
    if f.endswith('.bcmap'):
        cmaps[f[:-6]] = base64.b64encode(open(os.path.join(cdir, f), 'rb').read()).decode()
html = rd('src', 'index.html')
b64 = lambda n: base64.b64encode(open(os.path.join(H, 'assets', n), 'rb').read()).decode()
icons = ('<link rel="icon" type="image/png" sizes="32x32" href="data:image/png;base64,%s">\n'
         '<link rel="icon" type="image/svg+xml" href="data:image/svg+xml;base64,%s">\n'
         '<link rel="apple-touch-icon" href="data:image/png;base64,%s">') % (b64('icon32.png'), b64('icon.svg'), b64('icon180.png'))
html = html.replace('<!--ICON-->', icons)
parts = {
    '/*CSS*/': rd('src', 'style.css'),
    '/*PDFJS_WORKER*/': safe(rd('vendor', 'pdf.worker.min.js')),
    '/*CMAPS*/': json.dumps(cmaps),
    '/*PDFJS*/': safe(rd('vendor', 'pdf.min.js')),
    '/*PDFLIB*/': safe(rd('vendor', 'pdf-lib.min.js')),
    '/*APP*/': safe(rd('src', 'app.js')),
}
for k, v in parts.items():
    assert html.count(k) == 1, k
    html = html.replace(k, v)
os.makedirs(os.path.join(H, 'dist'), exist_ok=True)
out = os.path.join(H, 'dist', 'PDF정리함.html')
open(out, 'w', encoding='utf-8').write(html)
print(out, round(os.path.getsize(out) / 1e6, 2), 'MB')
