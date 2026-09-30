"""src/morph.html을 두 가지로 묶는다.

- dist/모핑공방.html : 인터넷 없이도 도는 단일 파일 (라이브러리·예시 이미지 내장)
- dist/artifact.html : claude.ai 아티팩트용 (라이브러리는 CDN)
"""
import base64
import json
from pathlib import Path

ROOT = Path(__file__).parent
src = (ROOT / "src/morph.html").read_text(encoding="utf-8")

samples = [
    {"name": f"{n}.jpg (예시)", "url": "data:image/jpeg;base64," + base64.b64encode((ROOT / f"samples/{n}.jpg").read_bytes()).decode()}
    for n in ("lion", "banana", "airplane")
]
src = src.replace("<!--SAMPLES-->", "window.SAMPLES = " + json.dumps(samples, ensure_ascii=False) + ";")

muxer = (ROOT / "vendor/mp4-muxer-5.2.2.js").read_text(encoding="utf-8")
local = src.replace("<!--MUXER-->", "<script>/* mp4-muxer 5.2.2, MIT License, https://github.com/Vanilagy/mp4-muxer */\n" + muxer + "\n</script>")
local = '<!doctype html>\n<html lang="ko">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n' + local.replace("<div class=\"wrap\">", "</head>\n<body>\n<div class=\"wrap\">", 1) + "\n</body>\n</html>\n"

art = src.replace("<!--MUXER-->", '<script src="https://cdn.jsdelivr.net/npm/mp4-muxer@5.2.2/build/mp4-muxer.js"></script>')

(ROOT / "dist").mkdir(exist_ok=True)
(ROOT / "dist/모핑공방.html").write_text(local, encoding="utf-8")
(ROOT / "dist/artifact.html").write_text(art, encoding="utf-8")
print("ok", len(local), len(art))
