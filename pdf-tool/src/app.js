'use strict';
/* PDF 정리함 — 브라우저 안에서만 동작하는 PDF 페이지 편집기 (pdf.js 렌더링 + pdf-lib 저장) */
const { PDFDocument, degrees, StandardFonts, rgb } = PDFLib;
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

// ---------- pdf.js 설정 (워커·CMap 모두 파일 안에 내장) ----------
const WORKER_URL = URL.createObjectURL(new Blob([document.getElementById('pdfjs-worker').textContent], { type: 'text/javascript' }));
pdfjsLib.GlobalWorkerOptions.workerSrc = WORKER_URL;
// file:// 에서도 진짜 워커를 쓰도록 직접 만들어 넘김 (안 되면 pdf.js가 알아서 메인 스레드로)
let PDF_WORKER = null;
try { PDF_WORKER = new pdfjsLib.PDFWorker({ port: new Worker(WORKER_URL) }); } catch (e) { console.warn('worker', e); }
const CMAPS = JSON.parse(document.getElementById('cmaps').textContent || '{}');
function b64ToBytes(b64) { const s = atob(b64); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }
class EmbeddedCMapReader {
  constructor() {}
  async fetch({ name }) {
    const b = CMAPS[name];
    if (!b) throw new Error('CMap 없음: ' + name);
    return { cMapData: b64ToBytes(b), compressionType: 1 };
  }
}

// ---------- 아이콘 ----------
const ICONS = {
  open: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  insert: '<rect x="4" y="3" width="12" height="16" rx="1.5"/><path d="M19 9v8M15 13h8"/>',
  caret: '<path d="M6 9l6 6 6-6"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
  redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h3"/>',
  rotl: '<path d="M4 4v6h6"/><path d="M4.5 10A8 8 0 1 1 6 16.5"/>',
  rotr: '<path d="M20 4v6h-6"/><path d="M19.5 10A8 8 0 1 0 18 16.5"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  extract: '<rect x="3" y="4" width="11" height="15" rx="1.5"/><path d="M12 12h9M18 9l3 3-3 3"/>',
  split: '<rect x="3" y="4" width="7" height="16" rx="1"/><rect x="14" y="4" width="7" height="16" rx="1"/>',
  num: '<rect x="5" y="3" width="14" height="18" rx="1.5"/><path d="M10 17h4M12 17v-4"/>',
  wm: '<rect x="5" y="3" width="14" height="18" rx="1.5"/><path d="M8 16l8-8"/>',
  size: '<path d="M4 9V4h5M20 15v5h-5M4 4l6 6M20 20l-6-6"/>',
  save: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
  print: '<path d="M7 9V3h10v6M7 17H4v-7h16v7h-3"/><rect x="7" y="14" width="10" height="7"/>',
  zoomin: '<circle cx="11" cy="11" r="7"/><path d="M8 11h6M11 8v6M20 20l-4-4"/>',
  zoomout: '<circle cx="11" cy="11" r="7"/><path d="M8 11h6M20 20l-4-4"/>',
  left: '<path d="M15 5l-7 7 7 7"/>', right: '<path d="M9 5l7 7-7 7"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  preview: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
};
function icon(name) { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`; }
function paintIcons(root = document) { root.querySelectorAll('i[data-i]').forEach((el) => { if (!el.firstChild) el.innerHTML = icon(el.dataset.i); }); }
paintIcons();

// ---------- 상태 ----------
const COLORS = ['#2f6fed', '#e0663a', '#2aa876', '#a64fd6', '#d6a21f', '#1aa3b8', '#d64f8a', '#6b7a8f'];
const DEFAULT_SETTINGS = () => ({
  num: { on: false, pos: 'bc', fmt: 'n', start: 1, size: 10, skipFirst: false, margin: 24 },
  wm: { on: false, text: '대외비', opacity: 0.15, size: 70, angle: 'diag', color: '#808080' },
  fit: { on: false, paper: 'A4' },
});
const S = {
  sources: new Map(), // id -> {id,name,bytes,js,lib,color,count}
  pages: [],          // {uid, src, idx, rot, w, h}  w/h: 원본 기준 보이는 크기(pt). src=null이면 빈 페이지
  sel: new Set(), anchor: null,
  settings: DEFAULT_SETTINGS(),
  undo: [], redo: [], dirty: false,
  askWhere: true, // 저장 위치 묻기
};
let uidSeq = 1, srcSeq = 1;
const newUid = () => 'p' + (uidSeq++);
const PAPER = { A4: [595.28, 841.89], Letter: [612, 792], B5: [498.9, 708.66], A3: [841.89, 1190.55] };

function snapshot() { return JSON.stringify({ pages: S.pages, sel: [...S.sel], settings: S.settings }); }
function restore(snap) { const o = JSON.parse(snap); S.pages = o.pages; S.sel = new Set(o.sel); S.settings = o.settings; }
function pushUndo() { S.undo.push(snapshot()); if (S.undo.length > 200) S.undo.shift(); S.redo = []; S.dirty = true; }
function undo() { if (!S.undo.length) return; S.redo.push(snapshot()); restore(S.undo.pop()); S.dirty = true; render(); toast('되돌림'); }
function redo() { if (!S.redo.length) return; S.undo.push(snapshot()); restore(S.redo.pop()); S.dirty = true; render(); toast('다시 실행'); }

// ---------- 유틸 ----------
let toastT;
function toast(msg, err) { const t = $('#toast'); t.textContent = msg; t.className = 'show' + (err ? ' err' : ''); clearTimeout(toastT); toastT = setTimeout(() => (t.className = ''), err ? 4500 : 1800); }
function busy(msg) { $('#busyMsg').textContent = msg; $('#busy').hidden = false; }
function unbusy() { $('#busy').hidden = true; }
const tick = () => new Promise((r) => setTimeout(r, 0));
function baseName(n) { return n.replace(/\.[^.]+$/, ''); }
function safeName(n) { return (n || '').replace(/[\\/:*?"<>|]/g, '_').trim() || '문서'; }
function download(bytes, name, type = 'application/pdf') {
  window.__lastSaved = name;
  const url = URL.createObjectURL(bytes instanceof Blob ? bytes : new Blob([bytes], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
// 크롬에선 '다른 이름으로 저장' 창으로 위치·이름을 먼저 고르고(클릭 직후여야 열림), 그다음 파일을 만듦. 안 되면 다운로드 폴더로
async function saveFile(name, type, make) {
  let h = null;
  if (window.showSaveFilePicker && S.askWhere) {
    try {
      const ext = name.slice(name.lastIndexOf('.'));
      h = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: ext === '.zip' ? 'ZIP 파일' : 'PDF 파일', accept: { [type]: [ext] } }] });
    } catch (e) { if (e.name === 'AbortError') return null; console.warn('picker', e); }
  }
  const bytes = await make();
  if (!bytes) return null;
  if (h) { const w = await h.createWritable(); await w.write(bytes); await w.close(); window.__lastSaved = h.name; return 'picked'; }
  download(bytes, name, type); return 'download';
}
function selectedIdx() { const r = []; S.pages.forEach((p, i) => { if (S.sel.has(p.uid)) r.push(i); }); return r; }
function selectedPages() { return S.pages.filter((p) => S.sel.has(p.uid)); }
function parseRanges(str, max) {
  const out = [];
  for (const part of str.split(/[,\s]+/).filter(Boolean)) {
    const m = part.match(/^(\d+)?\s*[-~]\s*(\d+)?$/);
    if (m) { let a = m[1] ? +m[1] : 1, b = m[2] ? +m[2] : max; if (a > b) [a, b] = [b, a]; for (let i = Math.max(1, a); i <= Math.min(max, b); i++) out.push(i); }
    else if (/^\d+$/.test(part)) { const n = +part; if (n >= 1 && n <= max) out.push(n); }
    else return null;
  }
  return out;
}
function rangeGroups(str, max) { // "1-3, 5, 6-9" -> [[1,2,3],[5],[6..9]]
  const groups = [];
  for (const part of str.split(/[,;]+/).map((s) => s.trim()).filter(Boolean)) {
    const g = parseRanges(part, max); if (!g || !g.length) return null; groups.push(g);
  }
  return groups;
}

// ---------- 파일 불러오기 ----------
async function imageToPdfBytes(file) {
  const doc = await PDFDocument.create();
  let img;
  const buf = new Uint8Array(await file.arrayBuffer());
  if (/jpe?g$/i.test(file.type)) img = await doc.embedJpg(buf);
  else if (/png$/i.test(file.type)) img = await doc.embedPng(buf);
  else { // webp, gif, bmp 등은 캔버스로 JPEG 변환
    const bmp = await createImageBitmap(new Blob([buf], { type: file.type }));
    const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(bmp, 0, 0);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.92));
    img = await doc.embedJpg(new Uint8Array(await blob.arrayBuffer()));
  }
  const land = img.width > img.height;
  const [pw, ph] = land ? [PAPER.A4[1], PAPER.A4[0]] : PAPER.A4;
  const m = 20, s = Math.min((pw - 2 * m) / img.width, (ph - 2 * m) / img.height);
  const page = doc.addPage([pw, ph]);
  page.drawImage(img, { x: (pw - img.width * s) / 2, y: (ph - img.height * s) / 2, width: img.width * s, height: img.height * s });
  return await doc.save();
}

async function addSource(name, bytes) {
  let lib;
  try { lib = await PDFDocument.load(bytes, { updateMetadata: false }); }
  catch (e) {
    if (/encrypt/i.test(e.message)) throw new Error('보안(암호)이 걸린 PDF라 편집할 수 없어');
    throw new Error('PDF를 읽을 수 없어 (' + e.message.slice(0, 80) + ')');
  }
  const js = await pdfjsLib.getDocument({ data: bytes.slice(), CMapReaderFactory: EmbeddedCMapReader, isEvalSupported: false, ...(PDF_WORKER ? { worker: PDF_WORKER } : {}) }).promise;
  const id = 's' + (srcSeq++);
  const src = { id, name, bytes, js, lib, color: COLORS[(srcSeq - 2) % COLORS.length], count: lib.getPageCount() };
  S.sources.set(id, src);
  const pages = lib.getPages().map((pg, idx) => {
    const { width, height } = pg.getCropBox ? pg.getCropBox() : pg.getSize();
    const r = ((pg.getRotation().angle % 360) + 360) % 360;
    const [w, h] = r % 180 ? [height, width] : [width, height];
    return { uid: newUid(), src: id, idx, rot: 0, w, h };
  });
  return pages;
}

const collator = new Intl.Collator('ko', { numeric: true, sensitivity: 'base' });
async function importFiles(fileList, at) {
  const files = [...fileList].filter((f) => /pdf$/i.test(f.type) || /\.pdf$/i.test(f.name) || /^image\//.test(f.type));
  if (!files.length) { toast('PDF나 이미지 파일만 넣을 수 있어', true); return; }
  files.sort((a, b) => collator.compare(a.name, b.name));
  const all = [], errs = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    busy(`불러오는 중… (${i + 1}/${files.length}) ${f.name}`); await tick();
    try {
      const isPdf = /pdf$/i.test(f.type) || /\.pdf$/i.test(f.name);
      const bytes = isPdf ? new Uint8Array(await f.arrayBuffer()) : await imageToPdfBytes(f);
      all.push(...(await addSource(f.name, bytes)));
    } catch (e) { console.error(e); errs.push(`${f.name}: ${e.message}`); }
  }
  unbusy();
  if (all.length) {
    const firstLoad = S.pages.length === 0;
    pushUndo();
    if (at == null || at > S.pages.length) at = S.pages.length;
    S.pages.splice(at, 0, ...all);
    S.sel = new Set(firstLoad ? [] : all.map((p) => p.uid));
    if (!$('#fname').value) $('#fname').value = safeName(baseName(files[0].name)) + (files.length > 1 ? '_병합' : '_편집');
    render();
    if (!firstLoad) scrollToUid(all[0].uid);
    toast(`${all.length}쪽 추가됨`);
  }
  if (errs.length) toast('못 연 파일이 있어\n' + errs.join('\n'), true);
}
function insertionIndex() { const idx = selectedIdx(); return idx.length ? idx[idx.length - 1] + 1 : S.pages.length; }

// ---------- 썸네일 (보이는 것만 지연 렌더링) ----------
const THUMB_W = 340;
const thumbCache = new Map(); // key -> objectURL
const thumbQueue = []; const queued = new Set(); let thumbActive = 0;
const io = new IntersectionObserver((ents) => {
  for (const e of ents) if (e.isIntersecting) { const k = e.target.dataset.key; if (k && !thumbCache.has(k)) enqueueThumb(k, true); }
}, { root: $('#gridWrap'), rootMargin: '600px 0px' });
function enqueueThumb(key, front) {
  if (queued.has(key)) return; queued.add(key);
  front ? thumbQueue.unshift(key) : thumbQueue.push(key);
  pumpThumbs();
}
function pumpThumbs() {
  while (thumbActive < 2 && thumbQueue.length) {
    const key = thumbQueue.shift(); thumbActive++;
    renderThumb(key).catch((e) => console.warn('thumb', key, e)).finally(() => { thumbActive--; queued.delete(key); pumpThumbs(); });
  }
}
async function renderThumb(key) {
  if (thumbCache.has(key)) return;
  const [sid, idx] = key.split(':'); const src = S.sources.get(sid); if (!src) return;
  const page = await src.js.getPage(+idx + 1);
  const vp0 = page.getViewport({ scale: 1 });
  const vp = page.getViewport({ scale: THUMB_W / Math.max(vp0.width, vp0.height) * 1.0 });
  const c = document.createElement('canvas'); c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: g, viewport: vp }).promise;
  page.cleanup();
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.85));
  const url = URL.createObjectURL(blob); thumbCache.set(key, url);
  document.querySelectorAll(`.paper[data-key="${key}"]`).forEach((el) => setPaperImg(el, url));
}
function setPaperImg(el, url) { el.classList.remove('loading'); let img = el.querySelector('img'); if (!img) { img = document.createElement('img'); img.draggable = false; el.prepend(img); } img.src = url; }

// ---------- 그리드 그리기 ----------
function numText(n, total) {
  const f = S.settings.num.fmt;
  return f === 'dash' ? `- ${n} -` : f === 'of' ? `${n} / ${total}` : f === 'p' ? `p. ${n}` : `${n}`;
}
function wmBox(VW, VH, ratio) { // 워터마크 이미지 크기: 글자 길이 = (대각선 or 가로) × 크기%, 페이지 밖으로 안 나가게
  const set = S.settings.wm; const ang = set.angle === 'diag' ? Math.atan2(VH, VW) : 0;
  let iw = (ang ? Math.hypot(VW, VH) : VW) * set.size / 100, ih = iw * ratio;
  const c = Math.cos(ang), sn = Math.sin(ang);
  const k = Math.min(1, VW * 0.94 / (iw * c + ih * sn), VH * 0.94 / (iw * sn + ih * c));
  return { iw: iw * k, ih: ih * k, ang };
}
let measureCanvas;
function measureWm(text) { // 100px 굵은 글꼴 기준 폭(여백 20px 포함, 저장 이미지와 같은 비율)
  measureCanvas = measureCanvas || document.createElement('canvas'); const g = measureCanvas.getContext('2d');
  g.font = 'bold 100px "Malgun Gothic","맑은 고딕","Apple SD Gothic Neo","Noto Sans KR",sans-serif';
  return g.measureText(text).width + 10;
}
function render() {
  const grid = $('#grid'); const ts = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--ts')) || 180;
  io.disconnect();
  const frag = document.createDocumentFragment();
  const set = S.settings; const total = S.pages.length;
  S.pages.forEach((p, i) => {
    const card = document.createElement('div');
    card.className = 'card' + (S.sel.has(p.uid) ? ' sel' : '');
    card.dataset.uid = p.uid; card.draggable = true;
    const rot = p.rot % 360; const swap = rot % 180 !== 0;
    const vw = swap ? p.h : p.w, vh = swap ? p.w : p.h; // 화면에 보이는 크기
    const s = Math.min(ts / vw, ts / vh);
    const key = p.src ? `${p.src}:${p.idx}` : '';
    const thumb = document.createElement('div'); thumb.className = 'thumb';
    const paper = document.createElement('div');
    paper.className = 'paper' + (p.src && !thumbCache.has(key) ? ' loading' : '');
    paper.style.width = p.w * s + 'px'; paper.style.height = p.h * s + 'px';
    paper.style.transform = `rotate(${rot}deg)`;
    if (key) { paper.dataset.key = key; if (thumbCache.has(key)) setPaperImg(paper, thumbCache.get(key)); }
    thumb.appendChild(paper);
    // 쪽번호/워터마크 미리보기 (회전 반영된 모습 위에)
    if (set.num.on || set.wm.on) {
      const ov = document.createElement('div'); ov.className = 'ov';
      ov.style.width = vw * s + 'px'; ov.style.height = vh * s + 'px';
      if (set.wm.on && set.wm.text) {
        const wm = document.createElement('div'); wm.className = 'wm'; wm.textContent = set.wm.text;
        wm.style.color = set.wm.color; wm.style.opacity = Math.min(1, set.wm.opacity * 1.6);
        const bx = wmBox(vw, vh, 130 / measureWm(set.wm.text)); const ang = -bx.ang * 180 / Math.PI;
        wm.style.fontSize = Math.max(3, bx.iw * s * 100 / measureWm(set.wm.text)) + 'px';
        wm.style.transform = `translate(-50%,-50%) rotate(${ang}deg)`;
        ov.appendChild(wm);
      }
      const n = i + (set.num.start - 1) + 1 - (set.num.skipFirst ? 1 : 0);
      if (set.num.on && !(set.num.skipFirst && i === 0)) {
        const pn = document.createElement('div'); pn.className = 'pn'; pn.textContent = numText(n, total - (set.num.skipFirst ? 1 : 0) + set.num.start - 1);
        pn.style.fontSize = Math.max(5, set.num.size * s) + 'px';
        const m = set.num.margin * s; const pos = set.num.pos;
        if (pos[0] === 't') pn.style.top = m + 'px'; else pn.style.bottom = m + 'px';
        if (pos[1] === 'l') pn.style.left = m + 'px'; else if (pos[1] === 'r') pn.style.right = m + 'px'; else { pn.style.left = '50%'; pn.style.transform = 'translateX(-50%)'; }
        ov.appendChild(pn);
      }
      thumb.appendChild(ov);
    }
    const tools = document.createElement('div'); tools.className = 'htools';
    tools.innerHTML = `<button data-act="rotl" title="왼쪽 회전">${icon('rotl')}</button><button data-act="rotr" title="오른쪽 회전">${icon('rotr')}</button><button data-act="view" title="크게 보기">${icon('preview')}</button><button data-act="del" title="삭제">${icon('trash')}</button>`;
    thumb.appendChild(tools);
    const label = document.createElement('div'); label.className = 'label';
    const src = p.src ? S.sources.get(p.src) : null;
    label.innerHTML = `<span class="dot" style="background:${src ? src.color : '#c3c8d2'}"></span>${i + 1}${rot ? `<span class="rot">↻${rot}°</span>` : ''}`;
    label.title = src ? `${src.name} · ${p.idx + 1}쪽` : '빈 페이지';
    card.append(thumb, label);
    card.dataset.key = key;
    frag.appendChild(card);
  });
  grid.replaceChildren(frag);
  grid.querySelectorAll('.card').forEach((c) => { if (c.dataset.key && !thumbCache.has(c.dataset.key)) io.observe(c); });
  $('#empty').style.display = S.pages.length ? 'none' : '';
  renderSources(); updateUI();
}
function renderSources() {
  const used = new Map(); S.pages.forEach((p) => p.src && used.set(p.src, (used.get(p.src) || 0) + 1));
  const box = $('#srcList'); box.replaceChildren();
  for (const [id, src] of S.sources) {
    if (!used.has(id)) continue;
    const d = document.createElement('div'); d.className = 'src'; d.dataset.src = id; d.title = `${src.name}\n클릭: 이 파일의 페이지 모두 선택`;
    d.innerHTML = `<span class="sw" style="background:${src.color}"></span><span class="nm"></span><span class="ct">${used.get(id)}쪽</span><button class="rm" title="이 파일의 페이지 모두 빼기">×</button>`;
    d.querySelector('.nm').textContent = src.name;
    box.appendChild(d);
  }
  if (!box.children.length) box.innerHTML = '<div style="color:var(--sub);padding:4px 6px">아직 없음</div>';
}
function updateUI() {
  const n = S.pages.length, k = S.sel.size;
  $('#stTotal').textContent = `총 ${n}쪽`;
  $('#stSel').textContent = k ? `${k}쪽 선택됨` : '';
  $$('.card').forEach((c) => c.classList.toggle('sel', S.sel.has(c.dataset.uid)));
  const none = !n, nosel = !k;
  ['#bRotL', '#bRotR', '#bDel', '#bExtract', '#mInsDup'].forEach((s) => ($(s).disabled = nosel));
  ['#bSave', '#bTab', '#bSplit'].forEach((s) => ($(s).disabled = none));
  $('#bUndo').disabled = !S.undo.length; $('#bRedo').disabled = !S.redo.length;
  $('#bNum').classList.toggle('on', S.settings.num.on);
  $('#bWm').classList.toggle('on', S.settings.wm.on);
  $('#bFit').classList.toggle('on', S.settings.fit.on);
  const b = []; if (S.settings.num.on) b.push(['num', '쪽번호 켜짐']); if (S.settings.wm.on) b.push(['wm', '워터마크: ' + S.settings.wm.text]); if (S.settings.fit.on) b.push(['fit', S.settings.fit.paper + '로 맞춤']);
  $('#badges').innerHTML = b.map(([k, t]) => `<span class="badge" data-b="${k}" title="클릭해서 설정">${t.replace(/</g, '&lt;')}</span>`).join('');
}
function scrollToUid(uid) { const el = document.querySelector(`.card[data-uid="${uid}"]`); if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }

// ---------- 선택 ----------
function clickSelect(uid, e) {
  const idx = S.pages.findIndex((p) => p.uid === uid);
  if (e.shiftKey && S.anchor) {
    const a = S.pages.findIndex((p) => p.uid === S.anchor);
    if (a >= 0) { if (!(e.ctrlKey || e.metaKey)) S.sel.clear(); const [x, y] = a < idx ? [a, idx] : [idx, a]; for (let i = x; i <= y; i++) S.sel.add(S.pages[i].uid); updateUI(); return; }
  }
  if (e.ctrlKey || e.metaKey) { S.sel.has(uid) ? S.sel.delete(uid) : S.sel.add(uid); }
  else { S.sel = new Set([uid]); }
  S.anchor = uid; updateUI();
}
function selectBy(fn) { S.sel = new Set(S.pages.filter(fn).map((p) => p.uid)); updateUI(); }

// ---------- 편집 동작 ----------
function rotate(delta, uids) {
  const target = uids || [...S.sel]; if (!target.length) return;
  pushUndo(); const set = new Set(target);
  S.pages.forEach((p) => { if (set.has(p.uid)) p.rot = (((p.rot + delta) % 360) + 360) % 360; });
  render();
}
function removePages(uids) {
  const set = new Set(uids || [...S.sel]); if (!set.size) return;
  pushUndo();
  const first = S.pages.findIndex((p) => set.has(p.uid));
  S.pages = S.pages.filter((p) => !set.has(p.uid));
  S.sel = new Set(S.pages[Math.min(first, S.pages.length - 1)] ? [S.pages[Math.min(first, S.pages.length - 1)].uid] : []);
  render(); toast(`${set.size}쪽 삭제 (Ctrl+Z로 되돌리기)`);
}
function duplicate() {
  const idx = selectedIdx(); if (!idx.length) return;
  pushUndo();
  const copies = idx.map((i) => ({ ...S.pages[i], uid: newUid() }));
  S.pages.splice(idx[idx.length - 1] + 1, 0, ...copies);
  S.sel = new Set(copies.map((p) => p.uid)); render(); toast(`${copies.length}쪽 복제`);
}
function insertBlank() {
  const idx = selectedIdx(); const ref = idx.length ? S.pages[idx[idx.length - 1]] : S.pages[S.pages.length - 1];
  let [w, h] = PAPER.A4;
  if (ref) { const sw = ref.rot % 180 ? [ref.h, ref.w] : [ref.w, ref.h]; [w, h] = sw; }
  pushUndo();
  const p = { uid: newUid(), src: null, idx: 0, rot: 0, w, h };
  S.pages.splice(insertionIndex(), 0, p); S.sel = new Set([p.uid]); render(); scrollToUid(p.uid); toast('빈 페이지 추가');
}
function moveTo(uids, targetIndex) { // targetIndex: 현재 배열 기준 삽입 위치
  const set = new Set(uids);
  const moving = S.pages.filter((p) => set.has(p.uid));
  const before = S.pages.slice(0, targetIndex).filter((p) => !set.has(p.uid));
  const after = S.pages.slice(targetIndex).filter((p) => !set.has(p.uid));
  const next = [...before, ...moving, ...after];
  if (next.every((p, i) => p === S.pages[i])) return;
  pushUndo(); S.pages = next; render();
}
function reverseOrder() {
  const idx = selectedIdx(); const use = idx.length > 1 ? idx : S.pages.map((_, i) => i);
  if (use.length < 2) return;
  pushUndo(); const vals = use.map((i) => S.pages[i]).reverse(); use.forEach((i, k) => (S.pages[i] = vals[k])); render(); toast('순서 뒤집음');
}
function removeSource(sid) {
  const uids = S.pages.filter((p) => p.src === sid).map((p) => p.uid); removePages(uids);
}

// ---------- 저장 (pdf-lib) ----------
function normRot(a) { return (((a % 360) + 360) % 360); }
function toContent(pg, X, Y) { // 보이는 좌표(왼쪽 아래 원점) -> 페이지 내용 좌표
  const R = normRot(pg.getRotation().angle); const b = pg.getCropBox(); const w = b.width, h = b.height;
  let x, y;
  if (R === 90) { x = w - Y; y = X; } else if (R === 180) { x = w - X; y = h - Y; } else if (R === 270) { x = Y; y = h - X; } else { x = X; y = Y; }
  return { x: x + b.x, y: y + b.y, R };
}
function visualSize(pg) { const b = pg.getCropBox(); const R = normRot(pg.getRotation().angle); return R % 180 ? [b.height, b.width] : [b.width, b.height]; }

async function watermarkPng(wm) {
  const fs = 200; const c = document.createElement('canvas'); const g = c.getContext('2d');
  const font = `bold ${fs}px "Malgun Gothic","맑은 고딕","Apple SD Gothic Neo","Noto Sans KR",sans-serif`;
  g.font = font; const tw = Math.ceil(g.measureText(wm.text).width) + 20; const th = Math.ceil(fs * 1.3);
  c.width = tw; c.height = th; g.font = font; g.textBaseline = 'middle'; g.textAlign = 'center';
  g.fillStyle = wm.color; g.globalAlpha = 1; g.fillText(wm.text, tw / 2, th / 2);
  const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
  return { bytes: new Uint8Array(await blob.arrayBuffer()), w: tw, h: th };
}

async function buildPdf(pages, progress) {
  const out = await PDFDocument.create();
  // 같은 원본의 페이지는 한 번에 복사해야 글꼴 등 공용 리소스가 중복되지 않음
  const need = new Map();
  pages.forEach((p) => { if (p.src) { if (!need.has(p.src)) need.set(p.src, []); need.get(p.src).push(p.idx); } });
  const copied = new Map();
  for (const [sid, idxs] of need) {
    progress && progress('페이지 복사 중…');
    await tick();
    copied.set(sid, await out.copyPages(S.sources.get(sid).lib, idxs));
  }
  const ptr = new Map();
  for (const p of pages) {
    let pg;
    if (p.src) { const k = ptr.get(p.src) || 0; ptr.set(p.src, k + 1); pg = out.addPage(copied.get(p.src)[k]); }
    else pg = out.addPage([p.w, p.h]);
    if (p.rot) pg.setRotation(degrees(normRot(pg.getRotation().angle + p.rot)));
  }
  const set = S.settings; const all = out.getPages();
  if (set.fit.on) {
    progress && progress('크기 맞추는 중…'); await tick();
    const [A, B] = PAPER[set.fit.paper] || PAPER.A4;
    for (const pg of all) {
      const R = normRot(pg.getRotation().angle); const b = pg.getCropBox();
      const w = b.width, h = b.height;
      const [VW, VH] = R % 180 ? [h, w] : [w, h];
      const [TW, TH] = VW > VH ? [B, A] : [A, B];
      const s = Math.min(TW / VW, TH / VH);
      const [CW, CH] = R % 180 ? [TH, TW] : [TW, TH];
      if (Math.abs(CW - w) < 0.5 && Math.abs(CH - h) < 0.5 && !b.x && !b.y) continue;
      pg.translateContent(-b.x, -b.y);
      pg.scaleContent(s, s); pg.scaleAnnotations(s, s);
      pg.translateContent((CW - w * s) / 2, (CH - h * s) / 2);
      pg.setMediaBox(0, 0, CW, CH); pg.setCropBox(0, 0, CW, CH); pg.setBleedBox(0, 0, CW, CH); pg.setTrimBox(0, 0, CW, CH); pg.setArtBox(0, 0, CW, CH);
    }
  }
  if (set.wm.on && set.wm.text) {
    progress && progress('워터마크 넣는 중…'); await tick();
    const png = await watermarkPng(set.wm); const img = await out.embedPng(png.bytes);
    for (const pg of all) {
      const [VW, VH] = visualSize(pg);
      const { iw, ih, ang } = wmBox(VW, VH, png.h / png.w);
      // 이미지 중심이 페이지 중심에 오도록: 회전 기준점(왼쪽 아래) 계산
      const cx = VW / 2, cy = VH / 2;
      const ox = cx - (iw / 2) * Math.cos(ang) + (ih / 2) * Math.sin(ang);
      const oy = cy - (iw / 2) * Math.sin(ang) - (ih / 2) * Math.cos(ang);
      const o = toContent(pg, ox, oy);
      pg.drawImage(img, { x: o.x, y: o.y, width: iw, height: ih, rotate: degrees(o.R + ang * 180 / Math.PI), opacity: set.wm.opacity });
    }
  }
  if (set.num.on) {
    progress && progress('쪽번호 넣는 중…'); await tick();
    const font = await out.embedFont(StandardFonts.Helvetica);
    const cnt = all.length - (set.num.skipFirst ? 1 : 0); const total = cnt + set.num.start - 1;
    all.forEach((pg, i) => {
      if (set.num.skipFirst && i === 0) return;
      const n = i - (set.num.skipFirst ? 1 : 0) + set.num.start;
      const txt = numText(n, total); const size = set.num.size; const tw = font.widthOfTextAtSize(txt, size);
      const [VW, VH] = visualSize(pg); const m = set.num.margin; const pos = set.num.pos;
      const X = pos[1] === 'l' ? m : pos[1] === 'r' ? VW - m - tw : (VW - tw) / 2;
      const Y = pos[0] === 't' ? VH - m - size * 0.72 : m;
      const o = toContent(pg, X, Y);
      pg.drawText(txt, { x: o.x, y: o.y, size, font, color: rgb(0, 0, 0), rotate: degrees(o.R) });
    });
  }
  progress && progress('파일 만드는 중…'); await tick();
  return await out.save();
}

async function exportPages(pages, name) {
  if (!pages.length) return;
  try {
    return await saveFile(name, 'application/pdf', async () => {
      busy('저장 준비 중…'); await tick();
      try { return await buildPdf(pages, (m) => ($('#busyMsg').textContent = m)); } finally { unbusy(); }
    });
  } catch (e) { console.error(e); unbusy(); toast('저장 실패: ' + e.message, true); }
}
function outName(suffix = '') { return safeName($('#fname').value || '문서') + suffix + '.pdf'; }
async function saveAll() { if (!S.pages.length) return; const r = await exportPages(S.pages, outName()); if (r) { S.dirty = false; toast(r === 'picked' ? '저장했어' : '저장했어 (다운로드 폴더 확인)'); } }
async function openInTab() {
  if (!S.pages.length) return;
  busy('만드는 중…'); await tick();
  try { const bytes = await buildPdf(S.pages); window.open(URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })), '_blank'); }
  catch (e) { toast('실패: ' + e.message, true); } finally { unbusy(); }
}
async function extractSel() {
  const pages = selectedPages(); if (!pages.length) return toast('추출할 페이지를 먼저 선택해', true);
  const nums = selectedIdx().map((i) => i + 1);
  const r = await exportPages(pages, outName('_' + compactRange(nums) + '쪽')); if (r) toast(`${pages.length}쪽 추출해서 저장했어`);
}
function compactRange(nums) {
  const r = []; let a = nums[0], b = nums[0];
  for (let i = 1; i <= nums.length; i++) { if (nums[i] === b + 1) b = nums[i]; else { r.push(a === b ? `${a}` : `${a}-${b}`); a = b = nums[i]; } }
  const s = r.join(','); return s.length > 40 ? s.slice(0, 40) + '…' : s;
}

// ---------- ZIP (압축 없이 저장, 한글 파일명 UTF-8) ----------
const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(u) { let c = 0xffffffff; for (let i = 0; i < u.length; i++) c = CRC_T[(c ^ u[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function makeZip(files) {
  const enc = new TextEncoder(); const parts = []; const central = []; let off = 0;
  const d = new Date(); const dt = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xffff; const dd = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff;
  for (const f of files) {
    const nm = enc.encode(f.name); const crc = crc32(f.data); const sz = f.data.length;
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
    lh.setUint16(10, dt, true); lh.setUint16(12, dd, true); lh.setUint32(14, crc, true); lh.setUint32(18, sz, true); lh.setUint32(22, sz, true);
    lh.setUint16(26, nm.length, true); lh.setUint16(28, 0, true);
    parts.push(new Uint8Array(lh.buffer), nm, f.data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
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

// ---------- 대화상자 ----------
function dialog(title, bodyHtml, buttons) {
  $('#dlgTitle').textContent = title; $('#dlgBody').innerHTML = bodyHtml; const foot = $('#dlgFoot'); foot.replaceChildren();
  for (const b of buttons) { const el = document.createElement('button'); el.className = 'tb' + (b.primary ? ' primary' : ''); el.textContent = b.label; el.onclick = async () => { if ((await b.run?.()) !== false) closeDialog(); }; foot.appendChild(el); }
  $('#modal').hidden = false; paintIcons($('#modal'));
  const f = $('#dlgBody').querySelector('input,select'); f && f.focus();
}
function closeDialog() { $('#modal').hidden = true; }
const dv = (id) => $('#dlgBody').querySelector('#' + id);

function openSplit() {
  const n = S.pages.length; if (!n) return;
  dialog('분할 — 여러 파일로 나누기', `
    <div class="radio">
      <label><input type="radio" name="sm" value="each" checked> 한 쪽씩 전부 따로 (${n}개 파일)</label>
      <label><input type="radio" name="sm" value="every"> <input type="number" id="spN" value="2" min="1" max="${n}" style="width:60px"> 쪽씩 나누기</label>
      <label><input type="radio" name="sm" value="ranges"> 범위 직접 입력 <input type="text" id="spR" placeholder="예: 1-3, 4-10, 11-" style="flex:1"></label>
      <label><input type="radio" name="sm" value="src"> 원래 파일별로 나누기 (병합 전 상태로)</label>
    </div>
    <div class="row"><label>받는 방식</label><select id="spOut"><option value="zip">ZIP 하나로 묶어서</option><option value="multi">파일 여러 개로 각각</option></select></div>
    <div class="desc">회전·쪽번호·워터마크 설정도 그대로 적용돼. "파일 여러 개"는 크롬이 여러 파일 다운로드 허용할지 물어볼 수 있어.</div>`,
  [{ label: '취소' }, { label: '분할 저장', primary: true, run: async () => {
    const mode = $('#dlgBody').querySelector('input[name=sm]:checked').value; let groups;
    if (mode === 'each') groups = S.pages.map((_, i) => [i + 1]);
    else if (mode === 'every') { const k = Math.max(1, parseInt(dv('spN').value) || 1); groups = []; for (let i = 1; i <= n; i += k) groups.push(Array.from({ length: Math.min(k, n - i + 1) }, (_, j) => i + j)); }
    else if (mode === 'ranges') { groups = rangeGroups(dv('spR').value, n); if (!groups) { toast('범위를 이해 못 했어. 예: 1-3, 4-10', true); return false; } }
    else { const m = new Map(); S.pages.forEach((p, i) => { const k = p.src || 'blank'; if (!m.has(k)) m.set(k, []); m.get(k).push(i + 1); }); groups = [...m.values()]; groups._src = [...m.keys()]; }
    closeDialog(); await doSplit(groups, dv('spOut')?.value || $('#spOut')?.value || 'zip', mode);
  } }]);
}
async function doSplit(groups, outMode, mode) {
  const base = safeName($('#fname').value || '문서');
  const build = async () => {
    const files = [];
    busy('분할 중…'); await tick();
    try {
      for (let gi = 0; gi < groups.length; gi++) {
        const g = groups[gi]; $('#busyMsg').textContent = `분할 중… (${gi + 1}/${groups.length})`; await tick();
        const bytes = await buildPdf(g.map((i) => S.pages[i - 1]));
        let name;
        if (mode === 'src') { const sid = groups._src[gi]; name = sid === 'blank' ? `${base}_빈페이지.pdf` : safeName(baseName(S.sources.get(sid).name)) + '.pdf'; }
        else name = `${base}_${g.length === 1 ? g[0] : g[0] + '-' + g[g.length - 1]}.pdf`;
        let nm = name, k = 2; while (files.some((f) => f.name === nm)) nm = name.replace(/\.pdf$/, `(${k++}).pdf`);
        files.push({ name: nm, data: bytes });
      }
    } finally { unbusy(); }
    return files;
  };
  try {
    if (outMode === 'zip') {
      let n = 0;
      const r = await saveFile(base + '_분할.zip', 'application/zip', async () => { const f = await build(); n = f.length; return makeZip(f); });
      if (r) toast(`${n}개 파일로 나눠서 ZIP으로 저장`);
    } else {
      const files = await build();
      for (const f of files) { download(f.data, f.name); await new Promise((r) => setTimeout(r, 250)); }
      toast(`${files.length}개 파일로 나눔 (다운로드 폴더 확인)`);
    }
  } catch (e) { console.error(e); unbusy(); toast('분할 실패: ' + e.message, true); }
}
function posPicker(cur) {
  const P = [['tl', '왼쪽 위'], ['tc', '가운데 위'], ['tr', '오른쪽 위'], ['bl', '왼쪽 아래'], ['bc', '가운데 아래'], ['br', '오른쪽 아래']];
  return `<div class="poss" id="numPos">${P.map(([k, t]) => `<button type="button" data-pos="${k}" class="${k === cur ? 'on' : ''}">${t}</button>`).join('')}</div>`;
}
function openNum() {
  const c = S.settings.num;
  dialog('쪽번호 넣기', `
    <div class="row"><label>위치</label>${posPicker(c.pos)}</div>
    <div class="row"><label>모양</label><select id="nFmt">
      <option value="n">1</option><option value="dash">- 1 -</option><option value="of">1 / 전체</option><option value="p">p. 1</option></select></div>
    <div class="row"><label>시작 번호</label><input type="number" id="nStart" min="0" value="${c.start}"></div>
    <div class="row"><label>글자 크기</label><input type="range" id="nSize" min="6" max="24" value="${c.size}"><span class="val" id="nSizeV">${c.size}pt</span></div>
    <div class="row"><label>여백</label><input type="range" id="nMargin" min="8" max="72" value="${c.margin}"><span class="val" id="nMarginV">${c.margin}pt</span></div>
    <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="nSkip" ${c.skipFirst ? 'checked' : ''}> 첫 페이지(표지)에는 안 넣기</label>
    <div class="desc">저장할 때 모든 페이지에 들어가. 썸네일에서 미리 볼 수 있어.</div>`,
  [...(c.on ? [{ label: '쪽번호 끄기', run: () => { pushUndo(); S.settings.num.on = false; render(); } }] : []), { label: '취소' },
    { label: '적용', primary: true, run: () => {
      pushUndo();
      S.settings.num = { on: true, pos: $('#numPos .on').dataset.pos, fmt: dv('nFmt').value, start: parseInt(dv('nStart').value) || 1, size: +dv('nSize').value, margin: +dv('nMargin').value, skipFirst: dv('nSkip').checked };
      render(); toast('쪽번호 적용 (저장할 때 들어가)');
    } }]);
  dv('nFmt').value = c.fmt;
  $('#numPos').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; $$('#numPos button').forEach((x) => x.classList.toggle('on', x === b)); };
  dv('nSize').oninput = (e) => (dv('nSizeV').textContent = e.target.value + 'pt');
  dv('nMargin').oninput = (e) => (dv('nMarginV').textContent = e.target.value + 'pt');
}
function openWm() {
  const c = S.settings.wm;
  dialog('워터마크 넣기', `
    <div class="row"><label>글자</label><input type="text" id="wText" value="${c.text.replace(/"/g, '&quot;')}" placeholder="예: 대외비, 사본, 회사명"></div>
    <div class="row"><label>방향</label><select id="wAng"><option value="diag">대각선</option><option value="flat">가로</option></select></div>
    <div class="row"><label>색</label><select id="wColor"><option value="#808080">회색</option><option value="#d02020">빨강</option><option value="#2050c0">파랑</option><option value="#000000">검정</option></select></div>
    <div class="row"><label>크기</label><input type="range" id="wSize" min="15" max="100" value="${c.size}"><span class="val" id="wSizeV">${c.size}%</span></div>
    <div class="row"><label>진하기</label><input type="range" id="wOp" min="5" max="60" value="${Math.round(c.opacity * 100)}"><span class="val" id="wOpV">${Math.round(c.opacity * 100)}%</span></div>
    <div class="desc">저장할 때 모든 페이지 가운데에 들어가.</div>`,
  [...(c.on ? [{ label: '워터마크 끄기', run: () => { pushUndo(); S.settings.wm.on = false; render(); } }] : []), { label: '취소' },
    { label: '적용', primary: true, run: () => {
      const text = dv('wText').value.trim(); if (!text) { toast('글자를 입력해', true); return false; }
      pushUndo(); S.settings.wm = { on: true, text, angle: dv('wAng').value, color: dv('wColor').value, size: +dv('wSize').value, opacity: +dv('wOp').value / 100 };
      render(); toast('워터마크 적용 (저장할 때 들어가)');
    } }]);
  dv('wAng').value = c.angle; dv('wColor').value = c.color;
  dv('wSize').oninput = (e) => (dv('wSizeV').textContent = e.target.value + '%');
  dv('wOp').oninput = (e) => (dv('wOpV').textContent = e.target.value + '%');
}
function openFit() {
  const c = S.settings.fit;
  dialog('페이지 크기 맞추기', `
    <div class="row"><label>용지</label><select id="fPaper"><option value="A4">A4 (210×297mm)</option><option value="A3">A3 (297×420mm)</option><option value="B5">B5 (176×250mm)</option><option value="Letter">Letter</option></select></div>
    <div class="desc">크기가 제각각인 페이지를 전부 같은 용지 크기로 맞춰 (비율 유지, 가운데 정렬). 가로 페이지는 가로 용지로. 인쇄하기 전에 쓰면 좋아.</div>`,
  [...(c.on ? [{ label: '원래 크기로', run: () => { pushUndo(); S.settings.fit.on = false; render(); } }] : []), { label: '취소' },
    { label: '적용', primary: true, run: () => { pushUndo(); S.settings.fit = { on: true, paper: dv('fPaper').value }; render(); toast(`저장할 때 ${S.settings.fit.paper}로 맞춰`); } }]);
  dv('fPaper').value = c.paper;
}

// ---------- 크게 보기 ----------
const V = { i: 0, zoom: 1, fit: true, task: null };
function openViewer(uid) { V.i = Math.max(0, S.pages.findIndex((p) => p.uid === uid)); V.fit = true; $('#viewer').hidden = false; drawViewer(); }
function closeViewer() { $('#viewer').hidden = true; render(); }
async function drawViewer() {
  const p = S.pages[V.i]; if (!p) return closeViewer();
  $('#vInfo').textContent = `${V.i + 1} / ${S.pages.length}`;
  $('#vPrev').disabled = V.i === 0; $('#vNext').disabled = V.i === S.pages.length - 1;
  const body = $('#vBody'); const cv = $('#vCanvas'); const dpr = window.devicePixelRatio || 1;
  const bw = body.clientWidth - 48, bh = body.clientHeight - 48;
  const swap = p.rot % 180 !== 0; const vw = swap ? p.h : p.w, vh = swap ? p.w : p.h;
  if (V.fit) V.zoom = Math.min(bw / vw, bh / vh);
  $('#vZoom').textContent = Math.round(V.zoom * 100) + '%';
  const W = Math.round(vw * V.zoom), H = Math.round(vh * V.zoom);
  if (V.task) { try { V.task.cancel(); } catch (e) {} }
  cv.style.width = W + 'px'; cv.style.height = H + 'px';
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height);
  if (!p.src) return;
  const src = S.sources.get(p.src); const page = await src.js.getPage(p.idx + 1);
  const vp = page.getViewport({ scale: V.zoom * dpr, rotation: normRot(page.rotate + p.rot) });
  V.task = page.render({ canvasContext: g, viewport: vp });
  try { await V.task.promise; } catch (e) { /* 취소됨 */ }
}
function viewerZoom(f) { V.fit = false; V.zoom = Math.min(8, Math.max(0.1, V.zoom * f)); drawViewer(); }

// ---------- 드래그 앤 드롭 ----------
let dragUids = null, dropIndex = null;
const grid = $('#grid'), wrap = $('#gridWrap'), marker = $('#marker');
grid.addEventListener('dragstart', (e) => {
  const card = e.target.closest('.card'); if (!card) return;
  const uid = card.dataset.uid;
  if (!S.sel.has(uid)) { S.sel = new Set([uid]); S.anchor = uid; updateUI(); }
  dragUids = S.pages.filter((p) => S.sel.has(p.uid)).map((p) => p.uid);
  e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'pages');
  if (dragUids.length > 1) { const ghost = card.querySelector('.thumb'); e.dataTransfer.setDragImage(ghost, 30, 30); }
  requestAnimationFrame(() => $$('.card.sel').forEach((c) => c.classList.add('dragging')));
});
grid.addEventListener('dragend', () => { dragUids = null; hideMarker(); $$('.card.dragging').forEach((c) => c.classList.remove('dragging')); });
function computeDrop(e) {
  const cards = $$('.card'); if (!cards.length) return { index: 0 };
  let best = null, bestD = Infinity;
  for (const c of cards) {
    const r = c.getBoundingClientRect();
    const dy = e.clientY < r.top ? r.top - e.clientY : e.clientY > r.bottom ? e.clientY - r.bottom : 0;
    const dx = e.clientX < r.left ? r.left - e.clientX : e.clientX > r.right ? e.clientX - r.right : 0;
    const d = dy * 4 + dx; if (d < bestD) { bestD = d; best = { c, r }; }
  }
  const i = cards.indexOf(best.c); const after = e.clientX > best.r.left + best.r.width / 2;
  return { index: i + (after ? 1 : 0), rect: best.r, after };
}
function showMarker(d) {
  if (!d.rect) return hideMarker();
  const wr = wrap.getBoundingClientRect();
  marker.style.display = 'block';
  marker.style.left = (d.after ? d.rect.right + 4 : d.rect.left - 6) - wr.left + wrap.scrollLeft + 'px';
  marker.style.top = d.rect.top - wr.top + wrap.scrollTop + 'px'; marker.style.height = d.rect.height + 'px';
}
function hideMarker() { marker.style.display = 'none'; }
const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
wrap.addEventListener('dragover', (e) => {
  if (!dragUids && !hasFiles(e)) return;
  e.preventDefault(); e.dataTransfer.dropEffect = dragUids ? 'move' : 'copy';
  const d = computeDrop(e); dropIndex = d.index; S.pages.length ? showMarker(d) : hideMarker();
  const wr = wrap.getBoundingClientRect(); // 가장자리 자동 스크롤
  if (e.clientY < wr.top + 50) wrap.scrollTop -= 18; else if (e.clientY > wr.bottom - 50) wrap.scrollTop += 18;
});
wrap.addEventListener('dragleave', (e) => { if (!wrap.contains(e.relatedTarget)) hideMarker(); });
wrap.addEventListener('drop', (e) => {
  e.preventDefault(); hideMarker(); document.body.classList.remove('dragfile');
  if (dragUids) { moveTo(dragUids, dropIndex ?? S.pages.length); dragUids = null; return; }
  if (e.dataTransfer.files.length) importFiles(e.dataTransfer.files, S.pages.length ? dropIndex : null);
});
let dragDepth = 0;
window.addEventListener('dragenter', (e) => { if (hasFiles(e)) { dragDepth++; document.body.classList.add('dragfile'); } });
window.addEventListener('dragleave', (e) => { if (hasFiles(e) && --dragDepth <= 0) { dragDepth = 0; document.body.classList.remove('dragfile'); } });
window.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
window.addEventListener('drop', (e) => { e.preventDefault(); dragDepth = 0; document.body.classList.remove('dragfile'); if (!wrap.contains(e.target) && e.dataTransfer.files.length) importFiles(e.dataTransfer.files, null); });

// ---------- 이벤트 연결 ----------
grid.addEventListener('click', (e) => {
  const card = e.target.closest('.card'); const act = e.target.closest('[data-act]');
  if (!card) return;
  const uid = card.dataset.uid;
  if (act) {
    e.stopPropagation();
    const a = act.dataset.act;
    if (a === 'rotl') rotate(-90, [uid]); else if (a === 'rotr') rotate(90, [uid]);
    else if (a === 'del') removePages([uid]); else if (a === 'view') openViewer(uid);
    return;
  }
  clickSelect(uid, e);
});
grid.addEventListener('dblclick', (e) => { const card = e.target.closest('.card'); if (card && !e.target.closest('[data-act]')) openViewer(card.dataset.uid); });
wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target === grid) { S.sel.clear(); updateUI(); } });

$('#bOpen').onclick = $('#bOpen2').onclick = () => $('#fileIn').click();
$('#fileIn').onchange = (e) => { importFiles(e.target.files, S.pages.length ? S.pages.length : null); e.target.value = ''; };
$('#fileIns').onchange = (e) => { importFiles(e.target.files, insertionIndex()); e.target.value = ''; };
$('#mInsFile').onclick = () => { closeMenus(); $('#fileIns').click(); };
$('#mInsBlank').onclick = () => { closeMenus(); insertBlank(); };
$('#mInsDup').onclick = () => { closeMenus(); duplicate(); };
$('#bUndo').onclick = undo; $('#bRedo').onclick = redo;
$('#bRotL').onclick = () => rotate(-90); $('#bRotR').onclick = () => rotate(90);
$('#bDel').onclick = () => removePages();
$('#bExtract').onclick = extractSel; $('#bSplit').onclick = openSplit;
$('#bNum').onclick = openNum; $('#bWm').onclick = openWm; $('#bFit').onclick = openFit;
$('#bSave').onclick = saveAll; $('#bTab').onclick = openInTab;
$('#badges').onclick = (e) => { const b = e.target.closest('[data-b]'); if (!b) return; ({ num: openNum, wm: openWm, fit: openFit })[b.dataset.b](); };
$('#sAll').onclick = () => selectBy(() => true);
$('#sNone').onclick = () => selectBy(() => false);
$('#sInv').onclick = () => selectBy((p) => !S.sel.has(p.uid));
$('#sOdd').onclick = () => { const s = new Set(S.pages.filter((_, i) => i % 2 === 0).map((p) => p.uid)); S.sel = s; updateUI(); };
$('#sEven').onclick = () => { const s = new Set(S.pages.filter((_, i) => i % 2 === 1).map((p) => p.uid)); S.sel = s; updateUI(); };
$('#sRev').onclick = reverseOrder;
$('#selInput').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  const nums = parseRanges(e.target.value, S.pages.length);
  if (!nums) return toast('예: 1-3, 7, 10-', true);
  S.sel = new Set(nums.map((n) => S.pages[n - 1].uid)); updateUI();
  if (nums.length) scrollToUid(S.pages[nums[0] - 1].uid);
  toast(`${nums.length}쪽 선택`); e.target.value = ''; e.target.blur();
});
$('#srcList').onclick = (e) => {
  const row = e.target.closest('.src'); if (!row) return;
  if (e.target.closest('.rm')) return removeSource(row.dataset.src);
  selectBy((p) => p.src === row.dataset.src);
  const first = S.pages.find((p) => p.src === row.dataset.src); first && scrollToUid(first.uid);
};
$('#zoom').oninput = (e) => { document.documentElement.style.setProperty('--ts', e.target.value + 'px'); try { localStorage.setItem('pdfj-ts', e.target.value); } catch (x) {} render(); };
try { const z = localStorage.getItem('pdfj-ts'); if (z) { $('#zoom').value = z; document.documentElement.style.setProperty('--ts', z + 'px'); } } catch (x) {}

// 메뉴
function closeMenus() { $$('.menu.open').forEach((m) => m.classList.remove('open')); }
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-dd]');
  if (t) { const m = document.getElementById(t.dataset.dd); const was = m.classList.contains('open'); closeMenus(); if (!was) m.classList.add('open'); e.stopPropagation(); return; }
  if (!e.target.closest('.menu')) closeMenus();
});
$('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal' || e.target.closest('[data-close]')) closeDialog(); });
$('#modal').addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'checkbox') $('#dlgFoot .primary')?.click(); });

// 뷰어
$('#vPrev').onclick = () => { if (V.i > 0) { V.i--; V.fit = true; drawViewer(); } };
$('#vNext').onclick = () => { if (V.i < S.pages.length - 1) { V.i++; V.fit = true; drawViewer(); } };
$('#vIn').onclick = () => viewerZoom(1.25); $('#vOut').onclick = () => viewerZoom(0.8);
$('#vFit').onclick = () => { V.fit = true; drawViewer(); };
$('#vClose').onclick = closeViewer;
$('#vRotL').onclick = () => { rotate(-90, [S.pages[V.i].uid]); drawViewer(); };
$('#vRotR').onclick = () => { rotate(90, [S.pages[V.i].uid]); drawViewer(); };
$('#vDel').onclick = () => { removePages([S.pages[V.i].uid]); if (!S.pages.length) return closeViewer(); V.i = Math.min(V.i, S.pages.length - 1); drawViewer(); };
$('#vBody').addEventListener('wheel', (e) => { if (e.ctrlKey) { e.preventDefault(); viewerZoom(e.deltaY < 0 ? 1.1 : 0.9); } }, { passive: false });
window.addEventListener('resize', () => { if (!$('#viewer').hidden && V.fit) drawViewer(); });

// 단축키
document.addEventListener('keydown', (e) => {
  const tag = e.target.tagName; const typing = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';
  const ctrl = e.ctrlKey || e.metaKey; const k = e.key.toLowerCase();
  if (!$('#modal').hidden) { if (e.key === 'Escape') closeDialog(); return; }
  if (!$('#viewer').hidden) {
    if (e.key === 'Escape') closeViewer();
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') $('#vPrev').click();
    else if (e.key === 'ArrowRight' || e.key === 'PageDown') $('#vNext').click();
    else if (e.key === '+' || e.key === '=') viewerZoom(1.25);
    else if (e.key === '-') viewerZoom(0.8);
    else if (e.key === '0') $('#vFit').click();
    return;
  }
  if (ctrl && k === 's') { e.preventDefault(); saveAll(); return; }
  if (ctrl && k === 'o') { e.preventDefault(); $('#fileIn').click(); return; }
  if (typing) return;
  if (ctrl && k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
  else if (ctrl && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
  else if (ctrl && k === 'a') { e.preventDefault(); selectBy(() => true); }
  else if (ctrl && k === 'd') { e.preventDefault(); duplicate(); }
  else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removePages(); }
  else if (k === 'l' && !ctrl) rotate(-90);
  else if (k === 'r' && !ctrl) rotate(90);
  else if (e.key === 'Escape') { S.sel.clear(); updateUI(); closeMenus(); }
  else if ((e.key === 'Enter' || e.key === ' ') && S.sel.size) { e.preventDefault(); openViewer(selectedPages()[0].uid); }
  else if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key) && S.pages.length) {
    e.preventDefault();
    const cur = S.anchor ? S.pages.findIndex((p) => p.uid === S.anchor) : -1;
    let ni = e.key === 'Home' ? 0 : e.key === 'End' ? S.pages.length - 1 : cur + (e.key === 'ArrowLeft' ? -1 : 1);
    ni = Math.max(0, Math.min(S.pages.length - 1, ni));
    clickSelect(S.pages[ni].uid, { shiftKey: e.shiftKey, ctrlKey: false }); if (!e.shiftKey) S.anchor = S.pages[ni].uid; scrollToUid(S.pages[ni].uid);
  }
});
window.addEventListener('beforeunload', (e) => { if (S.dirty && S.pages.length) { e.preventDefault(); e.returnValue = ''; } });

render();
window.__pdfj = { S, importFiles, buildPdf, render }; // 테스트용
