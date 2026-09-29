"""대본 JSON을 플레이어 템플릿에 넣어 app.html(게시용)과 index.html(단독 실행용)을 만든다.
사용: python3 build.py 대본.json [글꼴 css 경로]
글꼴 css 경로를 주면 구글 글꼴 링크 대신 그 css를 넣은 render.html도 만든다 (오프라인 렌더링용)."""
import json, re, sys

src = sys.argv[1] if len(sys.argv) > 1 else "simulation-hypothesis.json"
tpl = open("player.html", encoding="utf-8").read()
data = json.dumps(json.load(open(src, encoding="utf-8")), ensure_ascii=False).replace("</", "<\\/")
app = tpl.replace("__SCRIPT_JSON__", data)
open("app.html", "w", encoding="utf-8").write(app)

head = '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}[hidden]{display:none!important}</style>'
top, rest = app.split("</style>", 1)
page = f"{head}{top}</style></head><body>{rest}</body></html>"
open("index.html", "w", encoding="utf-8").write(page)

if len(sys.argv) > 2:
    css = open(sys.argv[2], encoding="utf-8").read()
    local = re.sub(r'<link rel="(preconnect|stylesheet)" href="https://fonts\.(googleapis|gstatic)\.com[^>]*>', "", page)
    local = local.replace("<style>", f"<style>{css}</style><style>", 1)
    open("render.html", "w", encoding="utf-8").write(local)
