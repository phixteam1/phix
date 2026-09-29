# 다큐 대본 → 애니메이션

다큐 조립대가 만든 장면별 대본(JSON)을 캔버스 애니메이션으로 그리는 플레이어와 mp4 렌더러입니다.

- `simulation-hypothesis.json`: 예시 대본 (시뮬레이션 가설, 27장면, 약 4분)
- `player.html`: 플레이어 템플릿. 장면마다 그리는 함수가 들어 있고, 내레이션은 자막으로 나옵니다.
- `build.py`: 대본을 템플릿에 넣어 `app.html`(게시용)과 `index.html`(단독 실행용)을 만듭니다.
- `render.js`: 헤드리스 크로미움으로 프레임을 그려 ffmpeg로 mp4를 만듭니다.

```
python3 build.py simulation-hypothesis.json fonts/local.css   # render.html 생성 (글꼴을 로컬 css로)
node render.js render.html out.mp4 30 <ffmpeg 경로> <크로미움 경로>
```

장면 그림은 대본의 visual/animation 설명을 보고 장면 id별로 직접 코딩한 것이라, 새 대본에는 장면 함수를 새로 써야 합니다.
