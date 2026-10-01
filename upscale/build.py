#!/usr/bin/env python3
"""src/ + vendor/ -> dist/업스케일.html (인터넷 없이 더블클릭으로 열리는 단일 파일)"""
import base64, os
H = os.path.dirname(os.path.abspath(__file__))
rd = lambda *p: open(os.path.join(H, *p), encoding='utf-8').read()
b64 = lambda *p: base64.b64encode(open(os.path.join(H, *p), 'rb').read()).decode()
def safe(js):
    assert '</script' not in js.lower(), 'script 종료 태그가 들어있음'
    return js
html = rd('src', 'index.html')
icons = ('<link rel="icon" type="image/png" sizes="32x32" href="data:image/png;base64,%s">\n'
         '<link rel="icon" type="image/svg+xml" href="data:image/svg+xml;base64,%s">\n'
         '<link rel="apple-touch-icon" href="data:image/png;base64,%s">') % (b64('assets', 'icon32.png'), b64('assets', 'icon.svg'), b64('assets', 'icon180.png'))
html = html.replace('<!--ICON-->', icons)
parts = {
    '/*CSS*/': rd('src', 'style.css'),
    '/*ORT*/': safe(rd('vendor', 'ort.webgpu.bundle.min.mjs')),
    '/*WORKER*/': safe(rd('src', 'worker.js')),
    '/*WASM*/': b64('vendor', 'ort-wasm-simd-threaded.jsep.wasm.gz'),
    '/*MODEL*/': b64('vendor', 'realesr-general-x4v3.onnx.gz'),
    '/*APP*/': safe(rd('src', 'app.js')),
}
for k, v in parts.items():
    assert html.count(k) == 1, k
    html = html.replace(k, v)
os.makedirs(os.path.join(H, 'dist'), exist_ok=True)
out = os.path.join(H, 'dist', '업스케일.html')
open(out, 'w', encoding='utf-8').write(html)
print(out, round(os.path.getsize(out) / 1e6, 2), 'MB')
