# 소화기 히어로 산불 진화 영상

캐릭터를 코드로 그려(`character.js`, 윤곽선은 `parts.js`) 포즈를 바꿔 가며 움직이는 30초 세로(1080x1920) 영상입니다. 숲, 불, 연기, 물폭탄, 물보라, 김, 무지개도 모두 캔버스로 그립니다. `hero.png`는 윤곽선을 딸 때 쓴 원본입니다.

- `cut.py`: 원본 그림의 체크무늬 배경과 소화기 분사 구름을 지워 `hero.png`를 만든다 (scipy, pillow 필요)
- `scene.js`: 장면 코드. `drawAt(t)`가 t초의 프레임을 그린다
- `player.html`: 재생 화면 틀. `build.py`가 장면 코드, 캐릭터, 글꼴(도현 부분 글꼴), 소리를 넣어 `app.html`(게시용)과 `render.html`(렌더링용)을 만든다
- `audio.py`: 배경음악과 효과음을 합성해 wav로 쓴다
- `render.js`: 헤드리스 크로미움으로 프레임을 그려 mp4로 만든다

```
python3 audio.py mix.wav
ffmpeg -i mix.wav -af loudnorm=I=-15:TP=-1.5 -c:a aac -b:a 128k mix.m4a
python3 build.py mix.m4a
node render.js render.html silent.mp4 30 <ffmpeg 경로> [크로미움 경로]
ffmpeg -i silent.mp4 -i mix.m4a -c copy -shortest -movflags +faststart fire-hero.mp4
```

장면 순서: 산불 발견(0초) → 소화기 분사(3초) → 불길이 더 커짐(7초) → 소화기 분사로 하늘로 날아오름(10초) → 구름 위에서 물폭탄 충전(15초) → 던짐(19초) → 착탄, 진화(21초) → 무지개, 착지(25~30초)
