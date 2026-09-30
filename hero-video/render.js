// render.html을 헤드리스 크로미움으로 한 프레임씩 그려 ffmpeg로 mp4를 만든다.
// 사용: node render.js render.html out.mp4 [fps] [ffmpeg 경로] [크로미움 경로] [시작초] [끝초]
const { chromium } = require("playwright");
const { spawn } = require("child_process");
const path = require("path");
const [page_, out, fps = "30", ffmpeg = "ffmpeg", exe, from = "0", to] = process.argv.slice(2);

(async () => {
  const browser = await chromium.launch(exe ? { executablePath: exe } : {});
  const page = await browser.newPage({ viewport: { width: 1200, height: 2000 } });
  await page.goto("file://" + path.resolve(page_));
  await page.evaluate(async () => {
    await document.fonts.load('96px "Do Hyeon"', "가나다");
    if (!hero.complete) await new Promise(r => hero.onload = r);
  });
  const total = to ? +to : await page.evaluate(() => TOTAL);
  const f0 = Math.round(+from * +fps), f1 = Math.round(total * +fps);
  const ff = spawn(ffmpeg, ["-loglevel", "error", "-y", "-f", "image2pipe", "-c:v", "mjpeg", "-framerate", fps, "-i", "-",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-preset", "medium", "-movflags", "+faststart", out], { stdio: ["pipe", "inherit", "inherit"] });
  for (let f = f0; f < f1; f++) {
    const url = await page.evaluate(t => { drawAt(t); return document.getElementById("c").toDataURL("image/jpeg", 0.92); }, f / +fps);
    if (!ff.stdin.write(Buffer.from(url.slice(url.indexOf(",") + 1), "base64"))) await new Promise(r => ff.stdin.once("drain", r));
    if (f % 150 === 0) console.log(`${f}/${f1}`);
  }
  ff.stdin.end();
  await new Promise(r => ff.on("close", r));
  await browser.close();
  console.log("done", out);
})();
