// ================= 이미지 탭 =================
// 이미지 목록 → 회전·크기·이어붙이기·글자·이름 → 그림판 편집 → 저장(용량 줄이기·형식 변환)
Object.assign(ICONS, {
  pen: '<path d="M4 20l4-1 11-11-3-3L5 16z"/><path d="M14 6l3 3"/>',
  hl: '<path d="M9 15l-4 4h5l2-2"/><path d="M8 13l7-9 5 5-9 7z"/>',
  line: '<path d="M5 19L19 5"/>',
  arrow: '<path d="M5 19L19 5M10 5h9v9"/>',
  rect: '<rect x="4" y="6" width="16" height="12" rx="1"/>',
  ellipse: '<ellipse cx="12" cy="12" rx="8" ry="6"/>',
  text: '<path d="M5 6V4h14v2M12 4v16M9 20h6"/>',
  mosaic: '<rect x="4" y="4" width="5" height="5"/><rect x="9" y="9" width="5" height="5"/><rect x="14" y="4" width="5" height="5"/><rect x="4" y="14" width="5" height="5"/><rect x="14" y="14" width="5" height="5"/>',
  cover: '<rect x="3" y="8" width="18" height="8" rx="1" fill="currentColor"/>',
  eraser: '<path d="M8 20h12M4 15l9-9 6 6-7 7H8z"/>',
  crop: '<path d="M6 2v16h16M2 6h16v16"/>',
  fliph: '<path d="M12 3v18M8 7L3 12l5 5zM16 7l5 5-5 5z"/>',
  flipv: '<path d="M3 12h18M7 8l5-5 5 5zM7 16l5 5 5-5z"/>',
  join: '<rect x="3" y="5" width="8" height="14" rx="1"/><rect x="13" y="5" width="8" height="14" rx="1"/>',
  rename: '<path d="M4 7h10M4 12h7M4 17h6M15 19l1-4 5-5 3 3-5 5z"/>',
  clock: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
});
$$('i[data-i]').forEach((el) => { if (!el.querySelector('svg *')) el.innerHTML = icon(el.dataset.i); });

S.mode = 'pdf';
S.imgOpts = { scale: 1, q: 1, fmt: 'keep', up: 1 };
const IC = { items: [], sel: new Set(), anchor: null, seq: 0, timer: null, run: 0, undo: [], redo: [] };
window.IC = IC;
const optKey = (o) => `${o.scale}|${o.q}|${o.fmt}|${o.up}`;
const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const EXT = { 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/png': 'png' };

function setMode(m) {
  S.mode = m; document.body.classList.toggle('mode-img', m === 'img');
  $$('.modes button').forEach((b) => b.classList.toggle('on', b.dataset.mode === m));
  $('#main').hidden = m === 'img'; $('#imgMain').hidden = m !== 'img';
  if (m === 'img') { renderIc(); scheduleEstimate(); } else IC.run++;
  document.title = m === 'img' ? '이미지 · PDF 정리함' : 'PDF 정리함';
}

// ---------- 공용: 캔버스 ↔ Blob ----------
function newCanvas(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }
function blobOf(c, type, q) { return new Promise((r) => c.toBlob(r, type, q)); }
// 편집 중간 결과 저장 형식: 원본이 JPEG면 고화질 JPEG(빠름), 아니면 PNG(무손실·투명 유지)
function workType(it) { return /jpe?g/i.test(it.file.type) ? 'image/jpeg' : 'image/png'; }
async function bitmapOf(it) { return await createImageBitmap(it.blob); }

// ---------- 목록 관리 ----------
function pushIUndo() { IC.undo.push({ items: IC.items.slice(), sel: [...IC.sel] }); if (IC.undo.length > 40) IC.undo.shift(); IC.redo = []; }
function iUndo() { if (!IC.undo.length) return; IC.redo.push({ items: IC.items.slice(), sel: [...IC.sel] }); const s = IC.undo.pop(); IC.items = s.items; IC.sel = new Set(s.sel); scheduleEstimate(); toast('되돌림'); }
function iRedo() { if (!IC.redo.length) return; IC.undo.push({ items: IC.items.slice(), sel: [...IC.sel] }); const s = IC.redo.pop(); IC.items = s.items; IC.sel = new Set(s.sel); scheduleEstimate(); toast('다시 실행'); }
function makeItem(file, blob, w, h, name) {
  return { id: ++IC.seq, file, name: name ?? baseName(file.name), blob: blob || file, w, h, url: URL.createObjectURL(blob || file), edited: !!blob, res: null, resKey: '' };
}
function withBlob(it, blob, w, h) { return { ...it, blob, w, h, url: URL.createObjectURL(blob), edited: true, res: null, resKey: '' }; }

async function imgAddFiles(files, at) {
  const all = [...files]; const imgs = all.filter((f) => /^image\//.test(f.type));
  if (!imgs.length) return toast(all.some((f) => /pdf/i.test(f.type + f.name)) ? 'PDF는 "PDF 편집" 탭에서 열어줘' : '이미지 파일만 넣을 수 있어', true);
  imgs.sort((a, b) => collator.compare(a.name, b.name));
  busy('이미지 불러오는 중…'); await tick();
  const added = []; let fails = 0;
  for (const f of imgs) {
    try { const b = await createImageBitmap(f); added.push(makeItem(f, null, b.width, b.height)); b.close(); }
    catch (e) { fails++; }
  }
  unbusy();
  if (added.length) {
    pushIUndo();
    if (at == null || at > IC.items.length) at = IC.items.length;
    IC.items.splice(at, 0, ...added);
    IC.sel = new Set(added.map((x) => x.id)); scheduleEstimate();
  }
  if (fails) toast(`${fails}장은 못 읽었어 (아이폰 HEIC 같은 형식은 크롬이 못 열어)`, true);
}
function targets() { const s = IC.items.filter((it) => IC.sel.has(it.id)); return s.length ? s : IC.items.slice(); }
function needItems() { if (!IC.items.length) { toast('먼저 이미지를 추가해줘', true); return false; } return true; }

// 선택된(없으면 전체) 이미지에 같은 처리 적용. fn(bitmap, it) → canvas
async function applyEach(label, fn) {
  if (!needItems()) return;
  const list = targets(); const ids = new Set(list.map((x) => x.id));
  busy(label + '…'); await tick();
  try {
    const next = [];
    let k = 0;
    for (const it of IC.items) {
      if (!ids.has(it.id)) { next.push(it); continue; }
      $('#busyMsg').textContent = `${label}… (${++k}/${list.length})`; await tick();
      const bmp = await bitmapOf(it); const c = await fn(bmp, it); bmp.close();
      const blob = await blobOf(c, workType(it), 0.95);
      next.push(withBlob(it, blob, c.width, c.height)); c.width = c.height = 0;
    }
    pushIUndo(); IC.items = next; scheduleEstimate();
    toast(`${list.length}장 ${label}`);
  } catch (e) { console.error(e); toast(label + ' 실패: ' + e.message, true); }
  finally { unbusy(); }
}
function rotateCanvas(src, deg) {
  const w = src.width, h = src.height, sw = deg % 180 !== 0;
  const c = newCanvas(sw ? h : w, sw ? w : h), g = c.getContext('2d');
  g.translate(c.width / 2, c.height / 2); g.rotate(deg * Math.PI / 180); g.drawImage(src, -w / 2, -h / 2);
  return c;
}
function flipCanvas(src, horiz) {
  const c = newCanvas(src.width, src.height), g = c.getContext('2d');
  if (horiz) { g.translate(c.width, 0); g.scale(-1, 1); } else { g.translate(0, c.height); g.scale(1, -1); }
  g.drawImage(src, 0, 0); return c;
}

// ---------- 그리기 ----------
function renderIc() {
  if (S.mode !== 'img') return;
  const list = $('#icList');
  $('#icEmpty').style.display = IC.items.length ? 'none' : '';
  $('#isub').style.display = IC.items.length ? '' : 'none';
  const key = optKey(S.imgOpts);
  list.innerHTML = IC.items.map((it, i) => {
    const r = it.resKey === key ? it.res : null;
    const after = r ? (r.err ? '<span class="bad">못 읽음</span>' : r.up ? '<span class="muted">—</span>' : r.same ? '<span class="muted">그대로</span>' : `<b>${fmtSize(r.data.length)}</b> <span class="${r.data.length < it.file.size ? 'good' : 'muted'}">${r.data.length < it.file.size ? '-' + Math.round((1 - r.data.length / it.file.size) * 100) + '%' : '+' + Math.round((r.data.length / it.file.size - 1) * 100) + '%'}</span>`) : '<span class="muted">계산 중…</span>';
    const outExt = r && !r.err ? (r.same ? (it.file.name.match(/\.[^.]+$/) || [''])[0] : '.' + EXT[r.type]) : '';
    return `<div class="iccard${IC.sel.has(it.id) ? ' sel' : ''}" data-id="${it.id}" draggable="true"><div class="ict"><img src="${it.url}" alt="" draggable="false"></div>
      <div class="htools"><button data-act="rotl" title="왼쪽 회전">${icon('rotl')}</button><button data-act="rotr" title="오른쪽 회전">${icon('rotr')}</button><button data-act="edit" title="편집">${icon('pen')}</button><button data-act="del" title="빼기">${icon('trash')}</button></div>
      <div class="nm" title="${esc(it.file.name)}"><span class="no">${i + 1}</span>${esc(it.name)}<span class="muted">${outExt}</span>${it.edited ? '<span class="tag">편집됨</span>' : ''}</div>
      <div class="sz">${fmtSize(it.file.size)} → ${after}</div><div class="muted dm">${r && !r.err ? `${r.w}×${r.h}` : `${it.w}×${it.h}`}</div></div>`;
  }).join('');
  const done = IC.items.filter((it) => it.resKey === key && it.res && !it.res.err && !it.res.up);
  const pending = IC.items.filter((it) => !(it.resKey === key && it.res));
  const before = IC.items.reduce((a, it) => a + it.file.size, 0);
  const after = done.reduce((a, it) => a + (it.res.same ? it.file.size : it.res.data.length), 0);
  const pct = Math.round((1 - after / Math.max(1, before)) * 100);
  $('#icSum').innerHTML = !IC.items.length ? '이미지를 올려줘' : S.imgOpts.up > 1 ? `${IC.items.length}장 · <b>${fmtSize(before)}</b>` : pending.length
    ? `${IC.items.length}장 · 원본 ${fmtSize(before)}<br><span class="muted">예상 용량 계산 중… (${IC.items.length - pending.length}/${IC.items.length})</span>`
    : after === before ? `${IC.items.length}장 · <b>${fmtSize(before)}</b>`
    : `${IC.items.length}장 · ${fmtSize(before)} → <b>${fmtSize(after)}</b><br>${pct >= 0 ? `<span class="good">${pct}% 줄어듦</span>` : `<span class="muted">${-pct}% 늘어남</span>`}`;
  $('#icSave').disabled = !IC.items.length;
  $('#iInfo').textContent = IC.sel.size ? `${IC.sel.size}장 선택됨` : `${IC.items.length}장`;
  ['#iRotL', '#iRotR', '#iFlipH', '#iFlipV', '#iDel', '#iEdit', '#iResize', '#iJoin', '#iText', '#iRename', '#iPdf'].forEach((s) => ($(s).disabled = !IC.items.length));
  $('#iUndo').disabled = !IC.undo.length; $('#iRedo').disabled = !IC.redo.length;
}
function renderSel() { // 선택만 바뀔 때는 카드를 다시 만들지 않음 (더블클릭 유지)
  $$('#icList .iccard').forEach((c) => c.classList.toggle('sel', IC.sel.has(+c.dataset.id)));
  $('#iInfo').textContent = IC.sel.size ? `${IC.sel.size}장 선택됨` : `${IC.items.length}장`;
}
function scheduleEstimate() { clearTimeout(IC.timer); renderIc(); IC.timer = setTimeout(estimate, 250); }

// ---------- 저장(용량·형식) ----------
function outTypeOf(it, o) {
  const ft = it.file.type;
  return o.fmt === 'webp' ? 'image/webp' : o.fmt === 'png' ? 'image/png' : o.fmt === 'keep' && /(png|webp|jpeg)$/i.test(ft) ? ft : 'image/jpeg';
}
async function compressOne(it, o, up) { // up: { prog(p), stopped() } — 업스케일할 때만
  let bmp = await createImageBitmap(it.blob);
  if (o.up > 1) {
    const big = await upscaleImage(bmp, o.up, up && up.prog, up ? up.stopped : () => false); bmp.close();
    if (!big) return null;
    bmp = big;
  }
  const s = Math.min(1, o.scale || 1);
  const w = Math.max(1, Math.round(bmp.width * s)), h = Math.max(1, Math.round(bmp.height * s));
  const ft = it.file.type; const type = outTypeOf(it, o);
  const c = newCanvas(w, h); const g = c.getContext('2d');
  if (type === 'image/jpeg') { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); }
  g.imageSmoothingQuality = 'high'; g.drawImage(bmp, 0, 0, w, h);
  if (bmp.close) bmp.close(); else bmp.width = bmp.height = 0;
  const data = new Uint8Array(await (await blobOf(c, type, o.q)).arrayBuffer()); c.width = c.height = 0;
  // 손대지 않았고 형식도 같은데 더 커지면 원본 그대로
  if (o.up === 1 && !it.edited && type === ft && data.length >= it.file.size) return { same: true, type: ft, w: it.w, h: it.h };
  return { data, type, w, h };
}
const upPlan = (it, o) => { const s = Math.min(1, o.scale || 1); return { up: true, type: outTypeOf(it, o), w: Math.max(1, Math.round(it.w * o.up * s)), h: Math.max(1, Math.round(it.h * o.up * s)) }; };
async function estimate() {
  const run = ++IC.run; const o = { ...S.imgOpts }; const key = optKey(o);
  for (const it of IC.items) {
    if (run !== IC.run || S.mode !== 'img') return;
    if (it.resKey === key) continue;
    if (o.up > 1) { it.res = upPlan(it, o); it.resKey = key; renderIc(); continue; }
    try { it.res = await compressOne(it, o); } catch (e) { it.res = { err: true }; }
    if (run !== IC.run) return;
    it.resKey = key; renderIc();
  }
}
async function saveCompImgs() {
  if (!IC.items.length) return;
  const o = { ...S.imgOpts }; const key = optKey(o); IC.run++;
  busy('저장 준비 중…'); await tick();
  const out = []; const n = IC.items.length; let stop = false, upErr = '';
  if (o.up > 1) { $('#busyStop').hidden = false; $('#busyStop').onclick = () => { stop = true; $('#busyMsg').textContent = '중지하는 중…'; }; }
  try {
    if (o.up > 1 && !UP.eng) { $('#busyMsg').textContent = 'AI 준비 중…'; try { await upStart(); } catch (e) { toast(e.message, true); return; } }
    for (let i = 0; i < n; i++) {
      if (stop) break;
      const it = IC.items[i]; const cnt = n > 1 ? ` (${i + 1}/${n})` : '';
      $('#busyMsg').textContent = o.up > 1 ? `업스케일 중…${cnt} 0%` : `저장 준비 중…${cnt}`; await tick();
      if (o.up > 1) {
        let r = null;
        try { r = await compressOne(it, o, { prog: (p) => { if (!stop) $('#busyMsg').textContent = `업스케일 중…${cnt} ${Math.floor(p * 100)}%`; }, stopped: () => stop }); }
        catch (e) { upErr = e.message; r = { err: true }; }
        if (!r) break;
        it.res = r.err ? r : upPlan(it, o); it.resKey = key;
        if (r.err) continue;
        const name = safeName(it.name) + '.' + EXT[r.type];
        let nm = name, k = 2; while (out.some((x) => x.name === nm)) nm = name.replace(/(\.[^.]+)$/, `(${k++})$1`);
        out.push({ name: nm, data: r.data, type: r.type });
        continue;
      }
      if (it.resKey !== key) { try { it.res = await compressOne(it, o); } catch (e) { it.res = { err: true }; } it.resKey = key; }
      if (it.res.err) continue;
      const data = it.res.same ? new Uint8Array(await it.file.arrayBuffer()) : it.res.data;
      const ext = it.res.same ? (it.file.name.match(/\.[^.]+$/) || ['.jpg'])[0] : '.' + EXT[it.res.type];
      const name = safeName(it.name) + ext;
      let nm = name, k = 2; while (out.some((x) => x.name === nm)) nm = name.replace(/(\.[^.]+)$/, `(${k++})$1`);
      out.push({ name: nm, data, type: it.res.same ? it.file.type : it.res.type });
    }
  } finally { unbusy(); $('#busyStop').hidden = true; }
  renderIc();
  if (stop) return toast('중지했어');
  if (!out.length) return toast(upErr || '이미지를 읽지 못했어', true);
  if (out.length === 1) download(out[0].data, out[0].name, out[0].type);
  else download(makeZip(out), safeName(IC.items[0].name) + `_외${out.length - 1}장.zip`, 'application/zip');
  toast(out.length === 1 ? '저장했어 (다운로드 폴더 확인)' : `${out.length}장을 ZIP으로 저장했어 (다운로드 폴더 확인)`);
}

// ---------- 크기 바꾸기 ----------
function openResize() {
  if (!needItems()) return; const n = targets().length;
  dialog(`크기 바꾸기 (${n}장)`, `
    <div class="radio">
      <label><input type="radio" name="rz" value="pct" checked> 비율로 <input type="number" id="rzPct" value="50" min="1" max="400" style="width:70px"> %</label>
      <label><input type="radio" name="rz" value="long"> 긴 변을 <input type="number" id="rzLong" value="1280" min="16" style="width:80px"> px로</label>
      <label><input type="radio" name="rz" value="box"> 정확히 <input type="number" id="rzW" value="1080" min="1" style="width:70px"> × <input type="number" id="rzH" value="1080" min="1" style="width:70px"> px</label>
    </div>
    <div class="row"><label>정확히 맞출 때</label><select id="rzFit"><option value="cover">꽉 채우고 넘치는 부분 자르기</option><option value="contain">다 보이게 넣고 여백 채우기</option><option value="stretch">비율 무시하고 늘리기</option></select></div>
    <div class="row"><label>여백 색</label><select id="rzBg"><option value="#ffffff">흰색</option><option value="#000000">검정</option><option value="transparent">투명 (PNG로 저장할 때)</option></select></div>`,
  [{ label: '취소' }, { label: '적용', primary: true, run: async () => {
    const mode = $('#dlgBody').querySelector('input[name=rz]:checked').value;
    const pct = +dv('rzPct').value / 100, L = +dv('rzLong').value, W = +dv('rzW').value, H = +dv('rzH').value, fit = dv('rzFit').value, bg = dv('rzBg').value;
    if ((mode === 'pct' && !(pct > 0)) || (mode === 'long' && !(L > 0)) || (mode === 'box' && !(W > 0 && H > 0))) { toast('숫자를 확인해줘', true); return false; }
    closeDialog();
    await applyEach('크기 바꿈', (b) => {
      if (mode !== 'box') {
        const s = mode === 'pct' ? pct : L / Math.max(b.width, b.height);
        const c = newCanvas(b.width * s, b.height * s), g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(b, 0, 0, c.width, c.height); return c;
      }
      const c = newCanvas(W, H), g = c.getContext('2d'); g.imageSmoothingQuality = 'high';
      if (fit === 'stretch') { g.drawImage(b, 0, 0, W, H); return c; }
      const s = fit === 'cover' ? Math.max(W / b.width, H / b.height) : Math.min(W / b.width, H / b.height);
      if (fit === 'contain' && bg !== 'transparent') { g.fillStyle = bg; g.fillRect(0, 0, W, H); }
      const dw = b.width * s, dh = b.height * s; g.drawImage(b, (W - dw) / 2, (H - dh) / 2, dw, dh); return c;
    });
  } }]);
}

// ---------- 이어 붙이기 ----------
function openJoin() {
  const list = IC.sel.size ? IC.items.filter((it) => IC.sel.has(it.id)) : IC.items.slice();
  if (list.length < 2) return toast('이어 붙일 이미지를 2장 이상 골라줘 (선택 안 하면 전체)', true);
  dialog(`이어 붙이기 (${list.length}장 → 1장)`, `
    <div class="row"><label>배치</label><select id="jDir"><option value="h">가로로 나란히</option><option value="v">세로로 쌓기</option><option value="grid">격자</option></select></div>
    <div class="row" id="jColsRow"><label>한 줄에</label><input type="number" id="jCols" value="2" min="1" max="20"> <span class="muted">장</span></div>
    <div class="row"><label>크기 맞추기</label><select id="jFit"><option value="1">높이(세로 배치면 너비)를 맞춤</option><option value="0">원래 크기 그대로</option></select></div>
    <div class="row"><label>간격</label><input type="range" id="jGap" min="0" max="80" value="10"><span class="val" id="jGapV">10px</span></div>
    <div class="row"><label>바탕색</label><select id="jBg"><option value="#ffffff">흰색</option><option value="#000000">검정</option><option value="#f0f0f0">연회색</option><option value="transparent">투명</option></select></div>`,
  [{ label: '취소' }, { label: '붙이기', primary: true, run: async () => {
    const o = { dir: dv('jDir').value, cols: Math.max(1, +dv('jCols').value || 2), fit: dv('jFit').value === '1', gap: +dv('jGap').value, bg: dv('jBg').value };
    closeDialog(); await doJoin(list, o);
  } }]);
  const upd = () => (dv('jColsRow').style.display = dv('jDir').value === 'grid' ? '' : 'none'); dv('jDir').onchange = upd; upd();
  dv('jGap').oninput = (e) => (dv('jGapV').textContent = e.target.value + 'px');
}
async function doJoin(list, o) {
  busy('이어 붙이는 중…'); await tick();
  try {
    const bms = []; for (const it of list) bms.push(await bitmapOf(it));
    let W, H, place = [];
    if (o.dir === 'grid') {
      const cols = Math.min(o.cols, bms.length), rows = Math.ceil(bms.length / cols);
      const cw = Math.max(...bms.map((b) => b.width)), ch = Math.max(...bms.map((b) => b.height));
      // 칸 크기는 가장 흔한 비율 기준으로 통일 (각 이미지는 칸 안에 맞춰 넣음)
      W = cols * cw + (cols + 1) * o.gap; H = rows * ch + (rows + 1) * o.gap;
      bms.forEach((b, i) => { const s = o.fit ? Math.min(cw / b.width, ch / b.height) : Math.min(1, cw / b.width, ch / b.height); const dw = b.width * s, dh = b.height * s; const cx = o.gap + (i % cols) * (cw + o.gap), cy = o.gap + Math.floor(i / cols) * (ch + o.gap); place.push([b, cx + (cw - dw) / 2, cy + (ch - dh) / 2, dw, dh]); });
    } else if (o.dir === 'h') {
      const th = o.fit ? Math.min(...bms.map((b) => b.height)) : Math.max(...bms.map((b) => b.height));
      let x = o.gap; bms.forEach((b) => { const s = o.fit ? th / b.height : 1; const dw = b.width * s, dh = b.height * s; place.push([b, x, o.gap + (th - dh) / 2, dw, dh]); x += dw + o.gap; });
      W = x; H = th + 2 * o.gap;
    } else {
      const tw = o.fit ? Math.min(...bms.map((b) => b.width)) : Math.max(...bms.map((b) => b.width));
      let y = o.gap; bms.forEach((b) => { const s = o.fit ? tw / b.width : 1; const dw = b.width * s, dh = b.height * s; place.push([b, o.gap + (tw - dw) / 2, y, dw, dh]); y += dh + o.gap; });
      W = tw + 2 * o.gap; H = y;
    }
    const MAX = 16000, k = Math.min(1, MAX / Math.max(W, H));
    const c = newCanvas(W * k, H * k), g = c.getContext('2d');
    if (o.bg !== 'transparent') { g.fillStyle = o.bg; g.fillRect(0, 0, c.width, c.height); }
    g.imageSmoothingQuality = 'high';
    for (const [b, x, y, w, h] of place) g.drawImage(b, x * k, y * k, w * k, h * k);
    bms.forEach((b) => b.close());
    const allJpg = list.every((it) => /jpe?g/i.test(it.file.type)) && o.bg !== 'transparent';
    const type = allJpg ? 'image/jpeg' : 'image/png';
    const blob = await blobOf(c, type, 0.95);
    const name = safeName(list[0].name) + '_합침';
    const file = new File([blob], name + '.' + EXT[type], { type });
    const it = makeItem(file, null, c.width, c.height, name); c.width = c.height = 0;
    pushIUndo(); IC.items.push(it); IC.sel = new Set([it.id]); scheduleEstimate();
    toast(`${list.length}장을 한 장으로 붙였어 (${it.w}×${it.h})`);
    requestAnimationFrame(() => document.querySelector(`.iccard[data-id="${it.id}"]`)?.scrollIntoView({ block: 'nearest' }));
  } catch (e) { console.error(e); toast('이어 붙이기 실패: ' + e.message, true); }
  finally { unbusy(); }
}

// ---------- 글자·워터마크 ----------
const FONT_STACK = '"Malgun Gothic","맑은 고딕","Apple SD Gothic Neo","Noto Sans KR",sans-serif';
function openText() {
  if (!needItems()) return; const n = targets().length;
  dialog(`글자·워터마크 넣기 (${n}장)`, `
    <div class="row"><label>글자</label><input type="text" id="tText" placeholder="예: 대외비, 2026.10.01 현장, 회사명"></div>
    <div class="row"><label>위치</label><div class="poss" id="tPos">${[['tl', '왼쪽 위'], ['tc', '가운데 위'], ['tr', '오른쪽 위'], ['cc', '한가운데'], ['dg', '대각선'], ['cl', ''], ['bl', '왼쪽 아래'], ['bc', '가운데 아래'], ['br', '오른쪽 아래']].filter((x) => x[1]).map(([k, t]) => `<button type="button" data-pos="${k}" class="${k === 'br' ? 'on' : ''}">${t}</button>`).join('')}</div></div>
    <div class="row"><label>크기</label><input type="range" id="tSize" min="2" max="30" value="5"><span class="val" id="tSizeV">5%</span></div>
    <div class="row"><label>색</label><select id="tColor"><option value="#ffffff">흰색 (그림자)</option><option value="#000000">검정</option><option value="#e53935">빨강</option><option value="#808080">회색</option></select></div>
    <div class="row"><label>진하기</label><input type="range" id="tOp" min="10" max="100" value="90"><span class="val" id="tOpV">90%</span></div>`,
  [{ label: '취소' }, { label: '넣기', primary: true, run: async () => {
    const text = dv('tText').value.trim(); if (!text) { toast('글자를 입력해줘', true); return false; }
    const o = { text, pos: $('#tPos .on').dataset.pos, size: +dv('tSize').value / 100, color: dv('tColor').value, op: +dv('tOp').value / 100 };
    closeDialog();
    await applyEach('글자 넣음', (b) => {
      const c = newCanvas(b.width, b.height), g = c.getContext('2d'); g.drawImage(b, 0, 0);
      const W = c.width, H = c.height; let fs = Math.max(10, W * o.size);
      g.globalAlpha = o.op; g.fillStyle = o.color;
      if (o.pos === 'dg') {
        g.font = `bold ${100}px ${FONT_STACK}`; const tw = g.measureText(o.text).width;
        fs = Math.min(fs * 3, 100 * Math.hypot(W, H) * 0.7 / tw);
        g.font = `bold ${fs}px ${FONT_STACK}`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.translate(W / 2, H / 2); g.rotate(-Math.atan2(H, W)); g.fillText(o.text, 0, 0); return c;
      }
      g.font = `bold ${fs}px ${FONT_STACK}`; const m = fs * 0.6;
      g.textAlign = o.pos[1] === 'l' ? 'left' : o.pos[1] === 'r' ? 'right' : 'center';
      g.textBaseline = o.pos[0] === 't' ? 'top' : o.pos[0] === 'b' ? 'bottom' : 'middle';
      const x = o.pos[1] === 'l' ? m : o.pos[1] === 'r' ? W - m : W / 2, y = o.pos[0] === 't' ? m : o.pos[0] === 'b' ? H - m : H / 2;
      if (o.color === '#ffffff') { g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = fs * 0.15; g.shadowOffsetY = fs * 0.04; }
      g.fillText(o.text, x, y); return c;
    });
  } }]);
  $('#tPos').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; $$('#tPos button').forEach((x) => x.classList.toggle('on', x === b)); };
  dv('tSize').oninput = (e) => (dv('tSizeV').textContent = e.target.value + '%');
  dv('tOp').oninput = (e) => (dv('tOpV').textContent = e.target.value + '%');
}

// ---------- 이름 한꺼번에 바꾸기 ----------
function openRename() {
  if (!needItems()) return; const list = targets();
  dialog(`이름 바꾸기 (${list.length}장)`, `
    <div class="row"><label>앞 이름</label><input type="text" id="nmPre" value="사진_"></div>
    <div class="row"><label>시작 번호</label><input type="number" id="nmStart" value="1" min="0"></div>
    <div class="row"><label>자릿수</label><select id="nmDig"><option value="1">1, 2, 3</option><option value="2" selected>01, 02, 03</option><option value="3">001, 002, 003</option></select></div>
    <div class="row"><label>뒤 이름</label><input type="text" id="nmSuf" value="" placeholder="(선택)"></div>
    <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="nmKeep"> 원래 이름 뒤에 번호 대신 붙이기 (앞 이름 + 원래 이름)</label>
    <div class="desc" id="nmPrev"></div>`,
  [{ label: '원래 이름으로', run: () => { pushIUndo(); const ids = new Set(list.map((x) => x.id)); IC.items = IC.items.map((it) => ids.has(it.id) ? { ...it, name: baseName(it.file.name) } : it); scheduleEstimate(); } },
    { label: '취소' }, { label: '바꾸기', primary: true, run: () => {
      const names = makeNames(list); pushIUndo(); const m = new Map(list.map((x, i) => [x.id, names[i]]));
      IC.items = IC.items.map((it) => m.has(it.id) ? { ...it, name: m.get(it.id) } : it); scheduleEstimate(); toast(`${list.length}장 이름 바꿈`);
    } }]);
  const makeNames = (l) => l.map((it, i) => {
    const pre = dv('nmPre').value, suf = dv('nmSuf').value;
    if (dv('nmKeep').checked) return safeName(pre + baseName(it.file.name) + suf);
    return safeName(pre + String((+dv('nmStart').value || 0) + i).padStart(+dv('nmDig').value, '0') + suf);
  });
  const prev = () => { const n = makeNames(list); dv('nmPrev').textContent = '예: ' + n.slice(0, 3).join(', ') + (n.length > 3 ? ' …' : ''); };
  $('#dlgBody').oninput = prev; $('#dlgBody').onchange = prev; prev();
}

// ---------- PDF로 ----------
async function toPdf() {
  if (!needItems()) return; const list = targets();
  const files = list.map((it) => new File([it.blob], safeName(it.name) + '.' + (EXT[it.blob.type] || 'png'), { type: it.blob.type || 'image/png' }));
  setMode('pdf');
  await importFiles(files, S.pages.length ? S.pages.length : null, true);
  if (!$('#fname').value || $('#fname').value.endsWith('_편집')) $('#fname').value = safeName(list[0].name) + (list.length > 1 ? `_외${list.length - 1}장` : '');
  toast(`${list.length}장을 PDF 편집 탭에 넣음`);
}

// ---------- 선택·끌기 ----------
function iSelectClick(id, e) {
  const idx = IC.items.findIndex((x) => x.id === id);
  if (e.shiftKey && IC.anchor != null) {
    const a = IC.items.findIndex((x) => x.id === IC.anchor);
    if (a >= 0) { if (!(e.ctrlKey || e.metaKey)) IC.sel.clear(); const [x, y] = a < idx ? [a, idx] : [idx, a]; for (let i = x; i <= y; i++) IC.sel.add(IC.items[i].id); renderSel(); return; }
  }
  if (e.ctrlKey || e.metaKey) IC.sel.has(id) ? IC.sel.delete(id) : IC.sel.add(id); else IC.sel = new Set([id]);
  IC.anchor = id; renderSel();
}
function iRemove(ids) {
  const set = new Set(ids || [...IC.sel]); if (!set.size) return;
  pushIUndo(); IC.items = IC.items.filter((x) => !set.has(x.id)); IC.sel.clear(); scheduleEstimate(); toast(`${set.size}장 뺌`);
}
async function iRotateOne(id, deg) {
  const it = IC.items.find((x) => x.id === id); if (!it) return;
  const b = await bitmapOf(it); const c = rotateCanvas(b, deg); b.close();
  const blob = await blobOf(c, workType(it), 0.95); pushIUndo();
  IC.items = IC.items.map((x) => x.id === id ? withBlob(x, blob, c.width, c.height) : x); scheduleEstimate();
}
let iDrag = null;
const icList = $('#icList');
icList.addEventListener('click', (e) => {
  const card = e.target.closest('.iccard'); if (!card) return; const id = +card.dataset.id;
  const act = e.target.closest('[data-act]');
  if (act) { e.stopPropagation(); const a = act.dataset.act; if (a === 'rotl') iRotateOne(id, -90); else if (a === 'rotr') iRotateOne(id, 90); else if (a === 'del') iRemove([id]); else if (a === 'edit') openEditor(id); return; }
  iSelectClick(id, e);
});
icList.addEventListener('dblclick', (e) => { const card = e.target.closest('.iccard'); if (card && !e.target.closest('[data-act]')) openEditor(+card.dataset.id); });
$('#icWrap').addEventListener('click', (e) => { if (e.target.id === 'icWrap' || e.target === icList) { IC.sel.clear(); renderSel(); } });
icList.addEventListener('dragstart', (e) => {
  const card = e.target.closest('.iccard'); if (!card) return; const id = +card.dataset.id;
  if (!IC.sel.has(id)) { IC.sel = new Set([id]); IC.anchor = id; }
  iDrag = IC.items.filter((x) => IC.sel.has(x.id)).map((x) => x.id);
  e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'imgs');
});
icList.addEventListener('dragend', () => { iDrag = null; hideMarker(); $('#gridWrap').appendChild(marker); });
function iDropIndex(e) {
  const cards = [...icList.querySelectorAll('.iccard')]; if (!cards.length) return { index: 0 };
  let best = null, bd = Infinity;
  for (const c of cards) { const r = c.getBoundingClientRect(); const dy = e.clientY < r.top ? r.top - e.clientY : e.clientY > r.bottom ? e.clientY - r.bottom : 0; const dx = e.clientX < r.left ? r.left - e.clientX : e.clientX > r.right ? e.clientX - r.right : 0; const d = dy * 4 + dx; if (d < bd) { bd = d; best = { c, r }; } }
  const after = e.clientX > best.r.left + best.r.width / 2; return { index: cards.indexOf(best.c) + (after ? 1 : 0), rect: best.r, after };
}
const iWrap = $('#icWrap');
iWrap.addEventListener('dragover', (e) => {
  if (!iDrag) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move';
  const d = iDropIndex(e); IC.dropIndex = d.index;
  if (d.rect) { const wr = iWrap.getBoundingClientRect(); marker.style.display = 'block'; iWrap.appendChild(marker);
    marker.style.left = (d.after ? d.rect.right + 5 : d.rect.left - 8) - wr.left + iWrap.scrollLeft + 'px'; marker.style.top = d.rect.top - wr.top + iWrap.scrollTop + 'px'; marker.style.height = d.rect.height + 'px'; }
  const wr = iWrap.getBoundingClientRect(); if (e.clientY < wr.top + 50) iWrap.scrollTop -= 18; else if (e.clientY > wr.bottom - 50) iWrap.scrollTop += 18;
});
iWrap.addEventListener('drop', (e) => {
  if (!iDrag) return; e.preventDefault(); e.stopPropagation(); hideMarker(); $('#gridWrap').appendChild(marker);
  const set = new Set(iDrag); const at = IC.dropIndex ?? IC.items.length;
  const moving = IC.items.filter((x) => set.has(x.id));
  const next = [...IC.items.slice(0, at).filter((x) => !set.has(x.id)), ...moving, ...IC.items.slice(at).filter((x) => !set.has(x.id))];
  iDrag = null; if (next.every((x, i) => x === IC.items[i])) return; pushIUndo(); IC.items = next; renderIc();
});

// ---------- 단추 연결 ----------
$('.modes').onclick = (e) => { const b = e.target.closest('[data-mode]'); if (b) setMode(b.dataset.mode); };
const imgOptChanged = () => { S.imgOpts = { scale: +$('#mPx').value / 100, q: +$('#mQ').value / 100, fmt: $('#mFmt').value, up: S.imgOpts.up }; $('#mQV').textContent = $('#mQ').value + '%'; $('#mPxV').textContent = $('#mPx').value + '%'; scheduleEstimate(); };
$('#mUp').onclick = (e) => {
  const b = e.target.closest('[data-u]'); if (!b) return;
  S.imgOpts.up = +b.dataset.u; $$('#mUp button').forEach((x) => x.classList.toggle('on', x === b)); $('#mUpT').hidden = S.imgOpts.up === 1;
  if (S.imgOpts.up > 1) upStart().catch(() => {});
  scheduleEstimate();
};
$('#mQ').oninput = imgOptChanged; $('#mPx').oninput = imgOptChanged; $('#mFmt').onchange = imgOptChanged;
$('#iAdd').onclick = $('#icAdd2').onclick = () => $('#fileImgC').click();
$('#fileImgC').onchange = (e) => { const f = [...e.target.files]; e.target.value = ''; imgAddFiles(f); };
$('#icSave').onclick = saveCompImgs;
$('#iUndo').onclick = iUndo; $('#iRedo').onclick = iRedo;
$('#iRotL').onclick = () => applyEach('왼쪽으로 돌림', (b) => rotateCanvas(b, -90));
$('#iRotR').onclick = () => applyEach('오른쪽으로 돌림', (b) => rotateCanvas(b, 90));
$('#iFlipH').onclick = () => applyEach('좌우 뒤집음', (b) => flipCanvas(b, true));
$('#iFlipV').onclick = () => applyEach('상하 뒤집음', (b) => flipCanvas(b, false));
$('#iDel').onclick = () => { if (!IC.sel.size) return toast('뺄 이미지를 먼저 골라줘', true); iRemove(); };
$('#iEdit').onclick = () => { const t = targets(); if (!t.length) return; openEditor(t[0].id); };
$('#iResize').onclick = openResize; $('#iJoin').onclick = openJoin; $('#iText').onclick = openText; $('#iRename').onclick = openRename; $('#iPdf').onclick = toPdf;
$('#iAll').onclick = () => { IC.sel = new Set(IC.items.map((x) => x.id)); renderSel(); };
$('#iNone').onclick = () => { IC.sel.clear(); renderSel(); };
function imgKey(e, ctrl, k, typing) {
  if (ctrl && k === 's') { e.preventDefault(); saveCompImgs(); return; }
  if (ctrl && k === 'o') { e.preventDefault(); $('#fileImgC').click(); return; }
  if (typing) return;
  if (ctrl && k === 'z' && !e.shiftKey) { e.preventDefault(); iUndo(); }
  else if (ctrl && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); iRedo(); }
  else if (ctrl && k === 'a') { e.preventDefault(); IC.sel = new Set(IC.items.map((x) => x.id)); renderSel(); }
  else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); iRemove(); }
  else if (k === 'l' && !ctrl && IC.sel.size) $('#iRotL').click();
  else if (k === 'r' && !ctrl && IC.sel.size) $('#iRotR').click();
  else if (e.key === 'Enter' && IC.sel.size) { e.preventDefault(); $('#iEdit').click(); }
  else if (e.key === 'Escape') { IC.sel.clear(); renderSel(); }
}

// ================= 그림판 편집 =================
const ED = { it: null, tool: 'pen', color: '#e53935', zoom: 1, fit: true, undo: [], redo: [], base: null, drawing: null, crop: null, textBox: null };
const eCanvas = $('#eCanvas'), eOver = $('#eOver'), eStage = $('#eStage'), eBody = $('#eBody');
const eg = eCanvas.getContext('2d'), og = eOver.getContext('2d');
const SWATCH = ['#e53935', '#fb8c00', '#fdd835', '#43a047', '#1e88e5', '#8e24aa', '#000000', '#ffffff'];
$('#eSw').innerHTML = SWATCH.map((c) => `<button type="button" data-c="${c}" style="background:${c}" title="${c}"></button>`).join('');

async function openEditor(id) {
  const it = IC.items.find((x) => x.id === id); if (!it) return;
  busy('여는 중…'); await tick();
  try {
    const bmp = await bitmapOf(it);
    ED.it = it; ED.undo = []; ED.redo = []; ED.crop = null;
    eCanvas.width = eOver.width = bmp.width; eCanvas.height = eOver.height = bmp.height;
    eg.clearRect(0, 0, bmp.width, bmp.height); eg.drawImage(bmp, 0, 0);
    ED.base = bmp; // 지우개가 되살릴 원본
    $('#editor').hidden = false; ED.fit = true; layoutEditor(); setTool(ED.tool === 'crop' ? 'pen' : ED.tool); updEdBtns();
  } catch (e) { toast('열 수 없어: ' + e.message, true); }
  finally { unbusy(); }
}
function closeEditor() { endText(false); $('#editor').hidden = true; ED.it = null; ED.undo = []; ED.redo = []; renderIc(); }
function layoutEditor() {
  const bw = eBody.clientWidth - 48, bh = eBody.clientHeight - 48;
  if (ED.fit) ED.zoom = Math.min(1, bw / eCanvas.width, bh / eCanvas.height);
  const w = eCanvas.width * ED.zoom, h = eCanvas.height * ED.zoom;
  for (const c of [eCanvas, eOver]) { c.style.width = w + 'px'; c.style.height = h + 'px'; }
  eStage.style.width = w + 'px'; eStage.style.height = h + 'px';
  $('#eZoom').textContent = Math.round(ED.zoom * 100) + '%';
  drawCropOverlay();
}
function setTool(t) {
  endText(true); ED.tool = t; ED.crop = null; og.clearRect(0, 0, eOver.width, eOver.height);
  $$('#eTools [data-tool]').forEach((b) => b.classList.toggle('on', b.dataset.tool === t));
  $('#oWidth').style.display = ['pen', 'hl', 'line', 'arrow', 'rect', 'ellipse', 'eraser'].includes(t) ? '' : 'none';
  $('#oFont').style.display = t === 'text' ? '' : 'none';
  $('#oFill').style.display = ['rect', 'ellipse'].includes(t) ? '' : 'none';
  $('#oRatio').style.display = t === 'crop' ? '' : 'none';
  $('#eCropApply').hidden = true;
  $('#eSw').style.display = $('#eColor').style.display = ['mosaic', 'eraser', 'crop'].includes(t) ? 'none' : '';
  eOver.style.cursor = t === 'text' ? 'text' : 'crosshair';
}
function setColor(c) { ED.color = c; $('#eColor').value = c; $$('#eSw button').forEach((b) => b.classList.toggle('on', b.dataset.c === c)); }
async function snap() { ED.undo.push({ img: await createImageBitmap(eCanvas), base: ED.base }); if (ED.undo.length > 30) ED.undo.shift(); ED.redo = []; updEdBtns(); }
function restoreSnap(s) {
  if (eCanvas.width !== s.img.width || eCanvas.height !== s.img.height) { eCanvas.width = eOver.width = s.img.width; eCanvas.height = eOver.height = s.img.height; }
  eg.clearRect(0, 0, eCanvas.width, eCanvas.height); eg.drawImage(s.img, 0, 0); ED.base = s.base; layoutEditor();
}
async function edUndo() { endText(true); if (!ED.undo.length) return; ED.redo.push({ img: await createImageBitmap(eCanvas), base: ED.base }); restoreSnap(ED.undo.pop()); updEdBtns(); }
async function edRedo() { if (!ED.redo.length) return; ED.undo.push({ img: await createImageBitmap(eCanvas), base: ED.base }); restoreSnap(ED.redo.pop()); updEdBtns(); }
function updEdBtns() { $('#eUndo').disabled = !ED.undo.length; $('#eRedo').disabled = !ED.redo.length; }
const lineW = () => Math.max(1, +$('#eWidth').value / ED.zoom); // 화면에서 보이는 굵기 기준
function toImg(e) { const r = eOver.getBoundingClientRect(); return { x: (e.clientX - r.left) * eOver.width / r.width, y: (e.clientY - r.top) * eOver.height / r.height }; }

function drawShape(g, tool, a, b, opt = {}) {
  const w = lineW(); g.save(); g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = g.fillStyle = ED.color; g.lineWidth = w;
  if (tool === 'pen' || tool === 'hl' || tool === 'eraser') {
    const pts = a; g.lineWidth = tool === 'hl' ? w * 4 : tool === 'eraser' ? w * 3 : w;
    if (tool === 'hl') g.lineCap = 'butt';
    g.beginPath(); g.moveTo(pts[0].x, pts[0].y); for (const p of pts.slice(1)) g.lineTo(p.x, p.y); if (pts.length === 1) g.lineTo(pts[0].x + 0.1, pts[0].y); g.stroke();
  } else if (tool === 'line' || tool === 'arrow') {
    g.beginPath(); g.moveTo(a.x, a.y);
    const ang = Math.atan2(b.y - a.y, b.x - a.x), head = Math.max(10 / ED.zoom, w * 3.2);
    const ex = tool === 'arrow' ? b.x - Math.cos(ang) * head * 0.6 : b.x, ey = tool === 'arrow' ? b.y - Math.sin(ang) * head * 0.6 : b.y;
    g.lineTo(ex, ey); g.stroke();
    if (tool === 'arrow') { g.beginPath(); g.moveTo(b.x, b.y); g.lineTo(b.x - head * Math.cos(ang - 0.42), b.y - head * Math.sin(ang - 0.42)); g.lineTo(b.x - head * Math.cos(ang + 0.42), b.y - head * Math.sin(ang + 0.42)); g.closePath(); g.fill(); }
  } else if (tool === 'rect' || tool === 'cover') {
    const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y), rw = Math.abs(b.x - a.x), rh = Math.abs(b.y - a.y);
    if (tool === 'cover' || opt.fill) g.fillRect(x, y, rw, rh); else g.strokeRect(x, y, rw, rh);
  } else if (tool === 'ellipse') {
    g.beginPath(); g.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2, Math.abs(b.x - a.x) / 2, Math.abs(b.y - a.y) / 2, 0, 0, Math.PI * 2);
    opt.fill ? g.fill() : g.stroke();
  }
  g.restore();
}
function rectOf(a, b) { return { x: Math.max(0, Math.round(Math.min(a.x, b.x))), y: Math.max(0, Math.round(Math.min(a.y, b.y))), w: Math.round(Math.abs(b.x - a.x)), h: Math.round(Math.abs(b.y - a.y)) }; }
function mosaic(r) {
  r.w = Math.min(r.w, eCanvas.width - r.x); r.h = Math.min(r.h, eCanvas.height - r.y); if (r.w < 2 || r.h < 2) return;
  const block = Math.max(6, Math.round(Math.max(eCanvas.width, eCanvas.height) / 90));
  const sw = Math.max(1, Math.round(r.w / block)), sh = Math.max(1, Math.round(r.h / block));
  const t = newCanvas(sw, sh), tg = t.getContext('2d'); tg.imageSmoothingEnabled = true; tg.drawImage(eCanvas, r.x, r.y, r.w, r.h, 0, 0, sw, sh);
  eg.save(); eg.imageSmoothingEnabled = false; eg.drawImage(t, 0, 0, sw, sh, r.x, r.y, r.w, r.h); eg.restore();
}
function eraseStroke(pts) { // 지운 자리에 원본(편집 시작 때) 픽셀을 되살림
  const m = newCanvas(eCanvas.width, eCanvas.height), mg = m.getContext('2d');
  const save = ED.color; ED.color = '#000'; drawShape(mg, 'eraser', pts); ED.color = save;
  mg.globalCompositeOperation = 'source-in'; mg.drawImage(ED.base, 0, 0, eCanvas.width, eCanvas.height);
  eg.drawImage(m, 0, 0);
}
function constrain(a, b, e) { if (!e.shiftKey) return b; const dx = b.x - a.x, dy = b.y - a.y; if (ED.tool === 'line' || ED.tool === 'arrow') return Math.abs(dx) > Math.abs(dy) ? { x: b.x, y: a.y } : { x: a.x, y: b.y }; const d = Math.max(Math.abs(dx), Math.abs(dy)); return { x: a.x + Math.sign(dx || 1) * d, y: a.y + Math.sign(dy || 1) * d }; }
function cropFix(a, b) { const r = +$('#eRatio').value; if (!r) return b; const dx = b.x - a.x, dy = b.y - a.y; const w = Math.abs(dx), h = Math.abs(dy); let nw = w, nh = w / r; if (nh > h) { nh = h; nw = h * r; } return { x: a.x + Math.sign(dx || 1) * nw, y: a.y + Math.sign(dy || 1) * nh }; }
function drawCropOverlay() {
  if (ED.tool !== 'crop') return; og.clearRect(0, 0, eOver.width, eOver.height); const c = ED.crop; if (!c) return;
  og.save(); og.fillStyle = 'rgba(0,0,0,.5)'; og.fillRect(0, 0, eOver.width, eOver.height); og.clearRect(c.x, c.y, c.w, c.h);
  og.strokeStyle = '#fff'; og.lineWidth = 2 / ED.zoom; og.setLineDash([8 / ED.zoom, 6 / ED.zoom]); og.strokeRect(c.x, c.y, c.w, c.h); og.restore();
}
eOver.addEventListener('pointerdown', async (e) => {
  if (e.button !== 0) return; const p = toImg(e);
  if (ED.tool === 'text') { if (ED.textBox) endText(true); else startText(p, e); e.preventDefault(); return; }
  eOver.setPointerCapture(e.pointerId);
  ED.drawing = { start: p, pts: [p], last: p };
});
eOver.addEventListener('pointermove', (e) => {
  const d = ED.drawing; if (!d) return; let p = toImg(e); const t = ED.tool;
  if (t === 'pen' || t === 'hl' || t === 'eraser') { d.pts.push(p); og.clearRect(0, 0, eOver.width, eOver.height); og.save(); if (t === 'hl') og.globalAlpha = 0.4; if (t === 'eraser') { og.globalAlpha = 0.5; } const sc = ED.color; if (t === 'eraser') ED.color = '#ffffff'; drawShape(og, t, d.pts); ED.color = sc; og.restore(); return; }
  if (t === 'crop') { p = cropFix(d.start, p); ED.crop = rectOf(d.start, p); drawCropOverlay(); return; }
  p = constrain(d.start, p, e); d.last = p;
  og.clearRect(0, 0, eOver.width, eOver.height);
  if (t === 'mosaic') { const r = rectOf(d.start, p); og.save(); og.fillStyle = 'rgba(30,136,229,.18)'; og.strokeStyle = '#1e88e5'; og.lineWidth = 2 / ED.zoom; og.setLineDash([6 / ED.zoom, 4 / ED.zoom]); og.fillRect(r.x, r.y, r.w, r.h); og.strokeRect(r.x, r.y, r.w, r.h); og.restore(); }
  else drawShape(og, t, d.start, p, { fill: $('#eFill').checked });
});
eOver.addEventListener('pointerup', async (e) => {
  const d = ED.drawing; if (!d) return; ED.drawing = null; const t = ED.tool;
  if (t === 'crop') { $('#eCropApply').hidden = !(ED.crop && ED.crop.w > 4 && ED.crop.h > 4); return; }
  og.clearRect(0, 0, eOver.width, eOver.height);
  const moved = d.pts.length > 1 || Math.hypot(d.last.x - d.start.x, d.last.y - d.start.y) > 2;
  if (!moved && t !== 'pen' && t !== 'hl') return;
  await snap();
  if (t === 'pen') drawShape(eg, 'pen', d.pts);
  else if (t === 'hl') { eg.save(); eg.globalAlpha = 0.4; eg.globalCompositeOperation = 'multiply'; drawShape(eg, 'hl', d.pts); eg.restore(); }
  else if (t === 'eraser') eraseStroke(d.pts);
  else if (t === 'mosaic') mosaic(rectOf(d.start, d.last));
  else drawShape(eg, t, d.start, d.last, { fill: $('#eFill').checked });
});
// 글자
function startText(p, e) {
  const ta = document.createElement('textarea'); ta.className = 'etext';
  const fs = +$('#eFont').value; // 화면 px
  ta.style.left = (p.x * ED.zoom) + 'px'; ta.style.top = (p.y * ED.zoom - fs * 0.15) + 'px';
  ta.style.fontSize = fs + 'px'; ta.style.color = ED.color; ta.rows = 1;
  eStage.appendChild(ta); ED.textBox = { ta, p, fs };
  ta.focus(); setTimeout(() => ta.focus(), 0);
  ta.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); endText(true); } else if (ev.key === 'Escape') { ev.preventDefault(); endText(false); } ev.stopPropagation(); });
  ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; ta.style.width = 'auto'; ta.style.width = Math.max(40, ta.scrollWidth + 4) + 'px'; });
}
async function endText(commit) {
  const tb = ED.textBox; if (!tb) return; ED.textBox = null; const text = tb.ta.value; tb.ta.remove();
  if (!commit || !text.trim()) return;
  await snap();
  const fs = tb.fs / ED.zoom; eg.save(); eg.fillStyle = tb.ta.style.color || ED.color; eg.font = `bold ${fs}px ${FONT_STACK}`; eg.textBaseline = 'top';
  text.split('\n').forEach((line, i) => eg.fillText(line, tb.p.x, tb.p.y + i * fs * 1.25)); eg.restore();
}
// 회전·뒤집기·자르기 (원본 기준 이미지도 같이 바꿈)
async function edTransform(fn) {
  endText(true); await snap();
  const c = fn(eCanvas); const nb = fn(ED.base);
  eCanvas.width = eOver.width = c.width; eCanvas.height = eOver.height = c.height; eg.drawImage(c, 0, 0);
  ED.base = await createImageBitmap(nb); ED.crop = null; $('#eCropApply').hidden = true; ED.fit = true; layoutEditor();
}
$('#eCropApply').onclick = () => { const r = ED.crop; if (!r) return; edTransform((src) => { const k = src.width / eCanvas.width; const c = newCanvas(r.w * k, r.h * k); c.getContext('2d').drawImage(src, r.x * k, r.y * k, r.w * k, r.h * k, 0, 0, c.width, c.height); return c; }); };
$('#eRotL').onclick = () => edTransform((s) => rotateCanvas(s, -90));
$('#eRotR').onclick = () => edTransform((s) => rotateCanvas(s, 90));
$('#eFlip').onclick = () => edTransform((s) => flipCanvas(s, true));
$('#eTools').onclick = (e) => { const b = e.target.closest('[data-tool]'); if (b) setTool(b.dataset.tool); };
$('#eSw').onclick = (e) => { const b = e.target.closest('[data-c]'); if (b) setColor(b.dataset.c); };
$('#eColor').oninput = (e) => setColor(e.target.value);
$('#eWidth').oninput = (e) => ($('#eWidthV').textContent = e.target.value);
$('#eRatio').onchange = () => { ED.crop = null; drawCropOverlay(); og.clearRect(0, 0, eOver.width, eOver.height); $('#eCropApply').hidden = true; };
$('#eUndo').onclick = edUndo; $('#eRedo').onclick = edRedo;
$('#eIn').onclick = () => { ED.fit = false; ED.zoom = Math.min(8, ED.zoom * 1.25); layoutEditor(); };
$('#eOut').onclick = () => { ED.fit = false; ED.zoom = Math.max(0.05, ED.zoom * 0.8); layoutEditor(); };
$('#eFit').onclick = () => { ED.fit = true; layoutEditor(); };
eBody.addEventListener('wheel', (e) => { if (e.ctrlKey) { e.preventDefault(); ED.fit = false; ED.zoom = Math.min(8, Math.max(0.05, ED.zoom * (e.deltaY < 0 ? 1.1 : 0.9))); layoutEditor(); } }, { passive: false });
window.addEventListener('resize', () => { if (!$('#editor').hidden && ED.fit) layoutEditor(); });
$('#eCancel').onclick = () => { if (ED.undo.length && !confirm('편집한 내용을 버릴까?')) return; closeEditor(); };
$('#eDone').onclick = async () => {
  await endText(true);
  const it = ED.it; if (!it) return closeEditor();
  if (!ED.undo.length) return closeEditor();
  busy('적용 중…'); await tick();
  try {
    const blob = await blobOf(eCanvas, workType(it), 0.95);
    pushIUndo(); IC.items = IC.items.map((x) => x.id === it.id ? withBlob(x, blob, eCanvas.width, eCanvas.height) : x);
    closeEditor(); scheduleEstimate(); toast('편집 적용됨');
  } finally { unbusy(); }
};
function edKey(e, ctrl, k, typing) {
  if (typing) return;
  if (ctrl && k === 'z' && !e.shiftKey) { e.preventDefault(); edUndo(); }
  else if (ctrl && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); edRedo(); }
  else if (ctrl && k === 's') { e.preventDefault(); $('#eDone').click(); }
  else if (e.key === 'Escape') { if (ED.tool === 'crop' && ED.crop) { ED.crop = null; og.clearRect(0, 0, eOver.width, eOver.height); $('#eCropApply').hidden = true; } else $('#eCancel').click(); }
  else if (e.key === 'Enter' && ED.tool === 'crop' && ED.crop) { e.preventDefault(); $('#eCropApply').click(); }
  else if (!ctrl) { const m = { p: 'pen', h: 'hl', a: 'arrow', b: 'rect', o: 'ellipse', t: 'text', m: 'mosaic', e: 'eraser', c: 'crop' }[k]; if (m) setTool(m); }
}
setColor('#e53935');
