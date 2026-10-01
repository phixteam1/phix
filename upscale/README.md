# 업스케일

인터넷 없이 더블클릭으로 여는 AI 이미지 업스케일러 (단일 HTML).

- 모델: Real-ESRGAN `realesr-general-x4v3` (ONNX, 4배) — 2×/3×는 4배 결과를 축소
- 실행: onnxruntime-web 1.20.1 — WebGPU가 되면 GPU, 아니면 CPU 코어 수만큼 워커 병렬
- 타일 256px(GPU 512px) + 겹침 24px로 이음매 없이 처리, 투명도 유지
- 빌드: `python3 build.py` → `dist/업스케일.html`
