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

## 소리 넣기 (audio/)

1. `pip install sherpa-onnx soundfile numpy`, 한국어 음성 모델 `vits-mimic3-ko_KO-kss_low`(sherpa-onnx tts-models 릴리스)를 받아 둔다.
2. `python3 audio/narrate.py` : 장면별 내레이션 wav를 `vo/`에 만든다. 숫자·이름은 `READ` 표에서 읽는 소리로 바꿔 합성한다.
3. 목소리 다듬기(ffmpeg): `rubberband=pitch=0.94:formant=preserved:pitchq=quality`, 저음 +2.5dB, 고음 -2dB, 아주 약한 에코로 차분하고 낮은 톤.
4. `python3 audio/mix.py 대본.json vo2 mix.wav` : 배경음악(패드·드론·플럭)과 효과음(전환 휙, 컷 톡, 차임, 마지막 붐)을 코드로 합성하고, 목소리가 나올 때 음악을 낮춰 섞는다.
5. `loudnorm=I=-16` 으로 음량을 맞추고 무음 mp4에 `-c:v copy` 로 입힌다.
