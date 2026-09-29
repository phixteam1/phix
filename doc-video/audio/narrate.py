import json, re, subprocess, sherpa_onnx, soundfile as sf
d = "vits-mimic3-ko_KO-kss_low"
tts = sherpa_onnx.OfflineTts(sherpa_onnx.OfflineTtsConfig(model=sherpa_onnx.OfflineTtsModelConfig(vits=sherpa_onnx.OfflineTtsVitsModelConfig(
    model=f"{d}/ko_KO-kss_low.onnx", lexicon="", tokens=f"{d}/tokens.txt", data_dir=f"{d}/espeak-ng-data",
    noise_scale=0.45, noise_scale_w=0.5, length_scale=1.15), num_threads=4)))
# 숫자는 읽는 소리로 바꿔서 합성
READ = {"닉 보스트롬의 논문": "닉 보스트롬이 쓴 논문", "2003년": "이천삼 년", "2023년": "이천이십삼 년", "25명": "스물다섯 명", "2012년": "이천십이 년", "1981년": "천구백팔십일 년"}
doc = json.load(open("/mnt/project-files/docu/simulation-hypothesis.json", encoding="utf-8"))
out = {}
for sc in doc["scenes"]:
    t = sc["narration"]
    for k, v in READ.items(): t = t.replace(k, v)
    t = t.replace("?", ".")
    a = tts.generate(t, sid=0, speed=1.0)
    fn = f"vo/{sc['id']:02d}.wav"; sf.write(fn, a.samples, a.sample_rate)
    out[sc["id"]] = round(len(a.samples)/a.sample_rate, 2)
json.dump(out, open("vo/durations.json", "w"))
print(out)
