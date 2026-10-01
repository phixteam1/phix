// ================= AI 업스케일 (Real-ESRGAN x4, 오프라인) =================
const UP = { engP: null, eng: null, seq: 0, MAX_AREA: 1.6e8 };
async function upUnz(id) {
  const b64 = document.getElementById(id).textContent.trim();
  const blob = await (await fetch('data:application/octet-stream;base64,' + b64)).blob();
  return await new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
}
function upStart() {
  if (UP.engP) return UP.engP;
  UP.engP = (async () => {
    const [wasm, model] = await Promise.all([upUnz('z-wasm'), upUnz('z-model')]);
    const ortSrc = $('#ort-src').textContent;
    const wUrl = URL.createObjectURL(new Blob([$('#up-worker').textContent], { type: 'text/javascript' }));
    const mk = (ep) => new Promise((res) => {
      let w;
      try { w = new Worker(wUrl); } catch { return res(null); }
      w.onmessage = (e) => {
        if (e.data.t === 'ready') { w.onmessage = null; res(w); }
        else if (e.data.t === 'fail') { w.terminate(); res(null); }
      };
      w.onerror = () => { w.terminate(); res(null); };
      w.postMessage({ t: 'init', ortSrc, wasm, model, ep });
    });
    let eng = null;
    if (navigator.gpu) {
      try {
        const ad = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
        if (ad) { const g = await mk('webgpu'); if (g) eng = { kind: 'gpu', workers: [g], tile: 512 }; }
      } catch {}
    }
    if (!eng) {
      const n = Math.max(1, Math.min((navigator.hardwareConcurrency || 4) - 1, 6));
      const ws = (await Promise.all(Array.from({ length: n }, () => mk('wasm')))).filter(Boolean);
      if (!ws.length) throw new Error('AI 엔진을 시작할 수 없어');
      eng = { kind: 'cpu', workers: ws, tile: 256 };
    }
    for (const w of eng.workers) {
      w.pend = new Map();
      w.onmessage = (e) => { const m = e.data; const p = w.pend.get(m.id); if (!p) return; w.pend.delete(m.id); m.t === 'done' ? p.res(m) : p.rej(new Error(m.e)); };
      w.run = (tw, th, px) => new Promise((res, rej) => { const id = ++UP.seq; w.pend.set(id, { res, rej }); w.postMessage({ t: 'run', id, w: tw, h: th, px }, [px.buffer]); });
    }
    UP.eng = eng; return eng;
  })().catch((e) => { UP.engP = null; throw e; });
  return UP.engP;
}
// bmp를 s배로 키운 캔버스. 중지되면 null
async function upscaleImage(bmp, s, onProg, stopped) {
  const W = bmp.width, H = bmp.height;
  if (W * H * s * s > UP.MAX_AREA) throw new Error(`너무 커서 ${s}배는 못 해`);
  const eng = await upStart();
  const T = eng.tile, P = 24;
  const src = new OffscreenCanvas(W, H); const sc = src.getContext('2d', { willReadFrequently: true }); sc.drawImage(bmp, 0, 0);
  const out = newCanvas(W * s, H * s);
  const oc = out.getContext('2d'); oc.imageSmoothingEnabled = true; oc.imageSmoothingQuality = 'high';
  const tiles = [];
  for (let y = 0; y < H; y += T) for (let x = 0; x < W; x += T) tiles.push({ x, y, w: Math.min(T, W - x), h: Math.min(T, H - y) });
  const total = tiles.length; let done = 0;
  const doTile = async (wk, t) => {
    const ex = Math.max(0, t.x - P), ey = Math.max(0, t.y - P);
    const ew = Math.min(W, t.x + t.w + P) - ex, eh = Math.min(H, t.y + t.h + P) - ey;
    const r = await wk.run(ew, eh, sc.getImageData(ex, ey, ew, eh).data);
    const tc = new OffscreenCanvas(r.w, r.h); tc.getContext('2d').putImageData(new ImageData(r.px, r.w, r.h), 0, 0);
    let from = tc, k = 4;
    if (s !== 4) {
      const dc = new OffscreenCanvas(ew * s, eh * s); const dx = dc.getContext('2d');
      dx.imageSmoothingEnabled = true; dx.imageSmoothingQuality = 'high'; dx.drawImage(tc, 0, 0, ew * s, eh * s);
      from = dc; k = s;
    }
    oc.drawImage(from, (t.x - ex) * k, (t.y - ey) * k, t.w * k, t.h * k, t.x * s, t.y * s, t.w * s, t.h * s);
    onProg && onProg(++done / total);
  };
  await Promise.all(eng.workers.map(async (wk) => { while (tiles.length && !stopped()) await doTile(wk, tiles.shift()); }));
  if (stopped()) { out.width = out.height = 0; return null; }
  // 투명 영역 보존
  const a = sc.getImageData(0, 0, W, H).data; let alpha = false;
  for (let i = 3; i < a.length; i += 4) if (a[i] < 255) { alpha = true; break; }
  if (alpha) {
    const m = new OffscreenCanvas(W * s, H * s); const mc = m.getContext('2d'); mc.imageSmoothingQuality = 'high'; mc.drawImage(bmp, 0, 0, W * s, H * s);
    const ma = mc.getImageData(0, 0, W * s, H * s).data; const od = oc.getImageData(0, 0, W * s, H * s);
    for (let i = 3; i < ma.length; i += 4) od.data[i] = ma[i];
    oc.putImageData(od, 0, 0);
  }
  return out;
}
