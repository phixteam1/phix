"""player.html에 장면 코드, 캐릭터, 글꼴, 소리를 넣어 app.html(게시용)과 render.html(렌더링용)을 만든다.
사용: python3 build.py [소리 파일(m4a)]"""
import base64, sys
b64 = lambda p: base64.b64encode(open(p, "rb").read()).decode()
tpl = open("player.html", encoding="utf-8").read()
page = tpl.replace("__FONT__", b64("dohyeon-sub.woff2")).replace("__HERO__", b64("hero.png")).replace("__SCENE__", open("scene.js", encoding="utf-8").read())
audio = "data:audio/mp4;base64," + b64(sys.argv[1]) if len(sys.argv) > 1 else ""
open("app.html", "w", encoding="utf-8").write(page.replace("__AUDIO__", audio))
head = '<!doctype html><html lang="ko"><head><meta charset="utf-8"><script>window.RENDER=1</script></head><body>'
open("render.html", "w", encoding="utf-8").write(head + page.replace("__AUDIO__", "") + "</body></html>")
print("ok")
