'use strict';
const $ = (s) => document.querySelector(s);
const ICONS = {
  open: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  play: '<path d="M8 5v14l11-7z" fill="currentColor" stroke="none"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor" stroke="none"/>',
  save: '<path d="M12 4v11m0 0-4-4m4 4 4-4M5 19h14"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  prev: '<path d="M15 5l-7 7 7 7"/>',
  next: '<path d="M9 5l7 7-7 7"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
};
function paintIcons(root = document) {
  root.querySelectorAll('i[data-i]').forEach((el) => {
    if (!el.firstChild) el.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[el.dataset.i] || ''}</svg>`;
  });
}

const MAX_AREA = 1.6e8;
const S = { items: [], scale: 2, fmt: 'keep', running: false, cancel: false, eng: null, engP: null, seq: 0, vi: -1 };

let toastT;
function toast(msg, err) { const t = $('#toast'); t.textContent = msg; t.className = 'show' + (err ? ' err' : ''); clearTimeout(toastT); toastT = setTimeout(() => (t.className = ''), err ? 4500 : 1800); }
const baseName = (n) => n.replace(/\.[^.]+$/, '');
const fmtBytes = (b) => (b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');

// ---------- 엔진 ----------
async function unz(id) {
  const b64 = document.getElementById(id).textContent.trim();
  const blob = await (await fetch('data:application/octet-stream;base64,' + b64)).blob();
  return await new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
}
function startEngine() {
  if (S.engP) return S.engP;
  const chip = $('#eng'); chip.textContent = '준비 중'; chip.classList.add('load');
  S.engP = (async () => {
    const [wasm, model] = await Promise.all([unz('z-wasm'), unz('z-model')]);
    const ortSrc = $('#ort-src').textContent;
    const wUrl = URL.createObjectURL(new Blob([$('#worker-src').textContent], { type: 'text/javascript' }));
    const mk = (ep) => new Promise((res) => {
      let w;
      try { w = new Worker(wUrl); } catch { return res(null); }
      w.onmessage = (e) => {
        if (e.data.t === 'ready') { w.onmessage = null; res(w); }
        else if (e.data.t === 'fail') { console.warn(ep, e.data.e); w.terminate(); res(null); }
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
      if (!ws.length) throw new Error('엔진을 시작할 수 없음');
      eng = { kind: 'cpu', workers: ws, tile: 256 };
    }
    eng.workers.forEach(wire);
    chip.classList.remove('load');
    chip.textContent = eng.kind === 'gpu' ? 'GPU' : `CPU ×${eng.workers.length}`;
    S.eng = eng;
    return eng;
  })().catch((e) => { chip.classList.remove('load'); chip.textContent = '엔진 오류'; S.engP = null; throw e; });
  return S.engP;
}
function wire(w) {
  w.pend = new Map();
  w.onmessage = (e) => {
    const m = e.data; const p = w.pend.get(m.id); if (!p) return; w.pend.delete(m.id);
    m.t === 'done' ? p.res(m) : p.rej(new Error(m.e));
  };
  w.run = (w_, h_, px) => new Promise((res, rej) => { const id = ++S.seq; w.pend.set(id, { res, rej }); w.postMessage({ t: 'run', id, w: w_, h: h_, px }, [px.buffer]); });
}

// ---------- 파일 ----------
async function addFiles(files) {
  const list = [...files].filter((f) => f.type.startsWith('image/') || /\.(jpe?g|png|webp|bmp|gif|avif)$/i.test(f.name));
  for (const f of list) {
    try {
      const bmp = await createImageBitmap(f, { imageOrientation: 'from-image' });
      S.items.push({ id: ++S.seq, file: f, name: f.name, w: bmp.width, h: bmp.height, bmp, url: URL.createObjectURL(f), st: 'wait', prog: 0, res: null, scale: 0 });
    } catch { toast(`열 수 없음: ${f.name}`, true); }
  }
  render();
  if (S.items.length) startEngine().catch((e) => toast(e.message, true));
}
function outDims(it, s = S.scale) { return [it.w * s, it.h * s]; }
function needsRun(it) { return it.st !== 'done' || it.scale !== S.scale; }

// ---------- 화면 ----------
function render() {
  const L = $('#list'); L.replaceChildren();
  $('#empty').hidden = S.items.length > 0;
  S.items.forEach((it, i) => {
    const c = document.createElement('div'); c.className = 'card' + (it.st === 'done' ? ' done' : '') + (it.st === 'err' ? ' err' : ''); it.el = c;
    const th = document.createElement('div'); th.className = 'th';
    const img = new Image(); img.src = it.url; th.append(img);
    if (it.st === 'done') th.onclick = () => openViewer(i);
    const meta = document.createElement('div'); meta.className = 'meta';
    const [ow, oh] = it.st === 'done' ? outDims(it, it.scale) : outDims(it);
    const big = ow * oh > MAX_AREA;
    meta.innerHTML = `<div class="nm"></div><div class="dim"><span>${it.w}×${it.h} → ${ow}×${oh}</span><span class="pct"></span></div><div class="pg"><b></b></div>`;
    meta.querySelector('.nm').textContent = it.name; meta.querySelector('.nm').title = it.name;
    if (it.st === 'err' || big) meta.querySelector('.pct').textContent = big && it.st !== 'done' ? '너무 큼' : '실패';
    if (it.st === 'done') {
      meta.querySelector('.pct').textContent = it.size ? fmtBytes(it.size) : '';
      const acts = document.createElement('div'); acts.className = 'acts';
      const bv = document.createElement('button'); bv.className = 'tb'; bv.textContent = '비교'; bv.onclick = () => openViewer(i);
      const bs = document.createElement('button'); bs.className = 'tb'; bs.innerHTML = '<i data-i="save"></i>저장'; bs.onclick = () => saveOne(it);
      acts.append(bv, bs); meta.append(acts);
    }
    const x = document.createElement('button'); x.className = 'x'; x.title = '빼기'; x.innerHTML = '<i data-i="close"></i>';
    x.onclick = (e) => { e.stopPropagation(); if (S.running && it.st === 'run') return; URL.revokeObjectURL(it.url); S.items.splice(S.items.indexOf(it), 1); render(); };
    c.append(th, meta, x); L.append(c);
    setProg(it);
  });
  paintIcons(L);
  syncBar();
}
function setProg(it) {
  if (!it.el) return;
  const p = it.st === 'done' ? 1 : it.prog;
  it.el.querySelector('.pg b').style.width = (p * 100).toFixed(1) + '%';
  if (it.st === 'run') it.el.querySelector('.pct').textContent = Math.floor(p * 100) + '%';
}
function syncBar() {
  const any = S.items.length > 0;
  $('#bRun').disabled = S.running || !S.items.some((it) => needsRun(it) && it.w * it.h * S.scale * S.scale <= MAX_AREA);
  $('#bRun').hidden = S.running; $('#bStop').hidden = !S.running;
  $('#bSaveAll').disabled = S.running || !S.items.some((it) => it.st === 'done');
  $('#bClear').disabled = S.running || !any;
  $('#bOpen').disabled = false;
  document.querySelectorAll('#scale button').forEach((b) => { b.classList.toggle('on', +b.dataset.s === S.scale); b.disabled = S.running; });
}

// ---------- 업스케일 ----------
async function runAll() {
  let eng;
  try { eng = await startEngine(); } catch (e) { toast(e.message, true); return; }
  S.running = true; S.cancel = false; syncBar();
  const todo = S.items.filter((it) => needsRun(it) && it.w * it.h * S.scale * S.scale <= MAX_AREA);
  let ok = 0;
  for (const it of todo) {
    if (S.cancel) break;
    it.st = 'run'; it.prog = 0; it.res = null; it.size = 0; render();
    try {
      const out = await upscale(it, S.scale, eng);
      if (!out) { it.st = 'wait'; it.prog = 0; render(); break; }
      it.res = out; it.scale = S.scale; it.st = 'done'; ok++;
    } catch (e) { console.error(e); it.st = 'err'; toast(`${it.name}: ${e.message}`, true); }
    render();
  }
  S.running = false; syncBar();
  if (ok && !S.cancel) toast(`${ok}개 완료`);
}
async function upscale(it, s, eng) {
  const W = it.w, H = it.h, T = eng.tile, P = 24;
  const src = new OffscreenCanvas(W, H); const sc = src.getContext('2d', { willReadFrequently: true }); sc.drawImage(it.bmp, 0, 0);
  const out = document.createElement('canvas'); out.width = W * s; out.height = H * s;
  const oc = out.getContext('2d'); oc.imageSmoothingEnabled = true; oc.imageSmoothingQuality = 'high';
  const tiles = [];
  for (let y = 0; y < H; y += T) for (let x = 0; x < W; x += T) tiles.push({ x, y, w: Math.min(T, W - x), h: Math.min(T, H - y) });
  const total = tiles.length; let done = 0;
  const doTile = async (wk, t) => {
    const ex = Math.max(0, t.x - P), ey = Math.max(0, t.y - P);
    const ew = Math.min(W, t.x + t.w + P) - ex, eh = Math.min(H, t.y + t.h + P) - ey;
    const id = sc.getImageData(ex, ey, ew, eh);
    const r = await wk.run(ew, eh, id.data);
    const tc = new OffscreenCanvas(r.w, r.h); tc.getContext('2d').putImageData(new ImageData(r.px, r.w, r.h), 0, 0);
    let srcC = tc, k = 4;
    if (s !== 4) {
      const dc = new OffscreenCanvas(ew * s, eh * s); const dx = dc.getContext('2d');
      dx.imageSmoothingEnabled = true; dx.imageSmoothingQuality = 'high'; dx.drawImage(tc, 0, 0, ew * s, eh * s);
      srcC = dc; k = s;
    }
    oc.drawImage(srcC, (t.x - ex) * k, (t.y - ey) * k, t.w * k, t.h * k, t.x * s, t.y * s, t.w * s, t.h * s);
    done++; it.prog = done / total; setProg(it);
  };
  await Promise.all(eng.workers.map(async (wk) => {
    while (tiles.length && !S.cancel) await doTile(wk, tiles.shift());
  }));
  if (S.cancel) return null;
  // 투명 영역 보존
  const a = sc.getImageData(0, 0, W, H).data; let alpha = false;
  for (let i = 3; i < a.length; i += 4) if (a[i] < 255) { alpha = true; break; }
  if (alpha) {
    const m = new OffscreenCanvas(W * s, H * s); const mc = m.getContext('2d'); mc.imageSmoothingQuality = 'high'; mc.drawImage(it.bmp, 0, 0, W * s, H * s);
    const ma = mc.getImageData(0, 0, W * s, H * s).data; const od = oc.getImageData(0, 0, W * s, H * s);
    for (let i = 3; i < ma.length; i += 4) od.data[i] = ma[i];
    oc.putImageData(od, 0, 0);
  }
  return out;
}

// ---------- 저장 ----------
function outType(it) {
  const f = S.fmt !== 'keep' ? S.fmt : /png/.test(it.file.type) ? 'png' : /webp/.test(it.file.type) ? 'webp' : /jpe?g/.test(it.file.type) ? 'jpg' : 'png';
  return { ext: f, mime: f === 'jpg' ? 'image/jpeg' : 'image/' + f };
}
function encode(it) {
  const { mime } = outType(it);
  return new Promise((res, rej) => it.res.toBlob((b) => (b ? res(b) : rej(new Error('저장 실패'))), mime, mime === 'image/png' ? undefined : 1));
}
const outName = (it) => `${baseName(it.name)}_x${it.scale}.${outType(it).ext}`;
function download(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
}
async function saveFile(name, mime, make) {
  let h = null;
  if (window.showSaveFilePicker) {
    try {
      const ext = name.slice(name.lastIndexOf('.'));
      h = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: ext === '.zip' ? 'ZIP 파일' : '이미지 파일', accept: { [mime]: [ext] } }] });
    } catch (e) { if (e.name === 'AbortError') return null; }
  }
  const blob = await make();
  if (h) { const w = await h.createWritable(); await w.write(blob); await w.close(); window.__lastSaved = h.name; return; }
  window.__lastSaved = name; download(blob, name);
}
async function saveOne(it) {
  const { mime } = outType(it);
  try { await saveFile(outName(it), mime, async () => { const b = await encode(it); it.size = b.size; return b; }); render(); }
  catch (e) { toast(e.message, true); }
}
async function saveAll() {
  const done = S.items.filter((it) => it.st === 'done');
  if (done.length === 1) return saveOne(done[0]);
  try {
    await saveFile('업스케일.zip', 'application/zip', async () => {
      const files = []; const used = new Set();
      for (const it of done) {
        const b = await encode(it); it.size = b.size;
        let n = outName(it), k = 2; while (used.has(n)) n = outName(it).replace(/(\.[^.]+)$/, `_${k++}$1`); used.add(n);
        files.push({ name: n, data: new Uint8Array(await b.arrayBuffer()) });
      }
      return makeZip(files);
    });
    render();
  } catch (e) { toast(e.message, true); }
}
const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(u) { let c = 0xffffffff; for (let i = 0; i < u.length; i++) c = CRC_T[(c ^ u[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function makeZip(files) {
  const enc = new TextEncoder(); const parts = []; const central = []; let off = 0;
  const d = new Date(); const dt = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xffff; const dd = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff;
  for (const f of files) {
    const nm = enc.encode(f.name); const crc = crc32(f.data); const sz = f.data.length;
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true);
    lh.setUint16(10, dt, true); lh.setUint16(12, dd, true); lh.setUint32(14, crc, true); lh.setUint32(18, sz, true); lh.setUint32(22, sz, true); lh.setUint16(26, nm.length, true);
    parts.push(new Uint8Array(lh.buffer), nm, f.data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
    ch.setUint16(12, dt, true); ch.setUint16(14, dd, true); ch.setUint32(16, crc, true); ch.setUint32(20, sz, true); ch.setUint32(24, sz, true);
    ch.setUint16(28, nm.length, true); ch.setUint32(42, off, true);
    central.push(new Uint8Array(ch.buffer), nm);
    off += 30 + nm.length + sz;
  }
  const cs = central.reduce((a, u) => a + u.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cs, true); end.setUint32(16, off, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
}

// ---------- 비교 보기 ----------
const V = { z: 1, tx: 0, ty: 0, cut: 0.5, ow: 0, oh: 0 };
function doneList() { return S.items.filter((it) => it.st === 'done'); }
function openViewer(i) {
  const it = S.items[i]; if (!it || it.st !== 'done') return;
  S.vi = i; $('#viewer').hidden = false;
  V.ow = it.res.width; V.oh = it.res.height;
  const o = $('#vOrig'); o.src = it.url; o.style.width = V.ow + 'px'; o.style.height = V.oh + 'px';
  const ai = $('#vAi'); ai.replaceChildren(it.res); ai.style.width = V.ow + 'px'; ai.style.height = V.oh + 'px';
  $('#vName').textContent = `${it.name}  ·  ${it.w}×${it.h} → ${V.ow}×${V.oh}`;
  const dl = doneList(); const k = dl.indexOf(it);
  $('#vPrev').disabled = k <= 0; $('#vNext').disabled = k >= dl.length - 1;
  fit(); V.cut = 0.5; applyV();
}
function closeViewer() { $('#viewer').hidden = true; $('#vAi').replaceChildren(); S.vi = -1; }
function stepViewer(d) {
  const dl = doneList(); const k = dl.indexOf(S.items[S.vi]) + d;
  if (k >= 0 && k < dl.length) { const keep = { z: V.z, tx: V.tx, ty: V.ty, cut: V.cut }; openViewer(S.items.indexOf(dl[k])); if (dl[k].res.width === V.ow) Object.assign(V, keep), applyV(); }
}
function fit() {
  const r = $('#stageWrap').getBoundingClientRect();
  V.z = Math.min(r.width / V.ow, r.height / V.oh);
  V.tx = (r.width - V.ow * V.z) / 2; V.ty = (r.height - V.oh * V.z) / 2; applyV();
}
function zoomTo(z, cx, cy) {
  const r = $('#stageWrap').getBoundingClientRect();
  if (cx == null) { cx = r.width / 2; cy = r.height / 2; }
  z = Math.max(0.02, Math.min(16, z));
  V.tx = cx - (cx - V.tx) * (z / V.z); V.ty = cy - (cy - V.ty) * (z / V.z); V.z = z; applyV();
}
function applyV() {
  const r = $('#stageWrap').getBoundingClientRect();
  $('#stage').style.transform = `translate(${V.tx}px,${V.ty}px) scale(${V.z})`;
  const sx = V.cut * r.width; $('#split').style.left = sx + 'px';
  const c = Math.max(0, Math.min(V.ow, (sx - V.tx) / V.z));
  $('#vAi').style.clipPath = `inset(0 ${V.ow - c}px 0 0)`;
  $('#vZoom').textContent = Math.round(V.z * 100) + '%';
}
(function viewerEvents() {
  const wrap = $('#stageWrap'); let drag = null;
  wrap.addEventListener('wheel', (e) => { e.preventDefault(); const r = wrap.getBoundingClientRect(); zoomTo(V.z * Math.pow(1.0015, -e.deltaY), e.clientX - r.left, e.clientY - r.top); }, { passive: false });
  wrap.addEventListener('pointerdown', (e) => {
    if (e.target.closest('#split')) drag = { split: true };
    else { drag = { x: e.clientX, y: e.clientY, tx: V.tx, ty: V.ty }; wrap.classList.add('pan'); }
    wrap.setPointerCapture(e.pointerId);
  });
  wrap.addEventListener('pointermove', (e) => {
    if (!drag) return; const r = wrap.getBoundingClientRect();
    if (drag.split) V.cut = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    else { V.tx = drag.tx + e.clientX - drag.x; V.ty = drag.ty + e.clientY - drag.y; }
    applyV();
  });
  const end = () => { drag = null; wrap.classList.remove('pan'); };
  wrap.addEventListener('pointerup', end); wrap.addEventListener('pointercancel', end);
  wrap.addEventListener('dblclick', (e) => { if (e.target.closest('#split')) return; const r = wrap.getBoundingClientRect(); V.z < 0.99 ? zoomTo(1, e.clientX - r.left, e.clientY - r.top) : fit(); });
  $('#vFit').onclick = fit; $('#v100').onclick = () => zoomTo(1); $('#v200').onclick = () => zoomTo(2);
  $('#vClose').onclick = closeViewer; $('#vPrev').onclick = () => stepViewer(-1); $('#vNext').onclick = () => stepViewer(1);
  $('#vSave').onclick = () => saveOne(S.items[S.vi]);
  window.addEventListener('resize', () => { if (!$('#viewer').hidden) applyV(); });
})();

// ---------- 이벤트 ----------
$('#bOpen').onclick = () => $('#file').click();
$('#empty').onclick = () => $('#file').click();
$('#file').onchange = (e) => { addFiles(e.target.files); e.target.value = ''; };
$('#bRun').onclick = runAll;
$('#bStop').onclick = () => { S.cancel = true; };
$('#bSaveAll').onclick = saveAll;
$('#bClear').onclick = () => { S.items.forEach((it) => URL.revokeObjectURL(it.url)); S.items = []; render(); };
$('#fmt').onchange = (e) => { S.fmt = e.target.value; };
document.querySelectorAll('#scale button').forEach((b) => (b.onclick = () => { S.scale = +b.dataset.s; render(); }));
let dragN = 0;
window.addEventListener('dragenter', (e) => { if ([...e.dataTransfer.types].includes('Files')) { dragN++; $('#drop').hidden = false; } });
window.addEventListener('dragleave', () => { if (--dragN <= 0) { dragN = 0; $('#drop').hidden = true; } });
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => { e.preventDefault(); dragN = 0; $('#drop').hidden = true; if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files); });
window.addEventListener('paste', (e) => { const f = [...(e.clipboardData?.files || [])]; if (f.length) addFiles(f); });
window.addEventListener('keydown', (e) => {
  if (!$('#viewer').hidden) {
    if (e.key === 'Escape') closeViewer();
    else if (e.key === 'ArrowLeft') stepViewer(-1);
    else if (e.key === 'ArrowRight') stepViewer(1);
    else if (e.key === '0') fit();
    else if (e.key === '1') zoomTo(1);
    else if (e.key === '2') zoomTo(2);
    else return;
    e.preventDefault(); return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') { e.preventDefault(); $('#file').click(); }
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); if (!$('#bSaveAll').disabled) saveAll(); }
  else if (e.key === 'Enter' && !$('#bRun').disabled) runAll();
});
window.addEventListener('beforeunload', (e) => { if (S.running) { e.preventDefault(); e.returnValue = ''; } });
paintIcons(); render();
window.__S = S;
