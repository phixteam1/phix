// 소화기 히어로를 벡터로 그린다. 머리, 장갑, 장화, 소화기, 망토 모양은 원본 그림에서 딴 윤곽선(parts.js)을 쓰고,
// 팔다리는 관절 위치로 그때그때 만든다. 좌표는 원본 그림(756x1033) 픽셀 단위.
// drawChar(ctx, pose, t): pose.x, pose.y는 골반(J.pelvis)이 놓일 화면 위치.
const PAL = {
  purple: ["#a36ae0", "#6c35ad", "#3a1068"], blue: ["#4a86ea", "#1f58c4", "#0a2c78"], red: ["#ff7058", "#f0220c", "#a00400"],
  yellow: ["#ffd347", "#fbb015", "#d68502"], orange: ["#ffa24a", "#f27a18", "#b85800"], face: ["#fffaf2", "#ffeede", "#f6cdb4"],
  hair: ["#3a3a40", "#141416", "#000"], black: ["#5a5a62", "#222226", "#050505"], gold: ["#ffe36a", "#f5b400", "#a87200"],
};
const J = {   // 원본 그림 속 관절 자리 (손은 손목, 발은 발목)
  pelvis: [315, 835], neck: [305, 560], shL: [150, 620], shR: [470, 625], hipL: [238, 818], hipR: [392, 818],
  handL: [128, 648], handR: [438, 694], ankleL: [150, 925], ankleR: [522, 888], cape: [468, 575], valve: [288, 682],
};
const LIMB = { upper: 84, fore: 66, thigh: 70, shin: 68 };

function pathOf(ctx, pts) {   // 윤곽점들을 매끈한 곡선으로
  const n = pts.length;
  const mid = i => [(pts[i % n][0] + pts[(i + 1) % n][0]) / 2, (pts[i % n][1] + pts[(i + 1) % n][1]) / 2];
  let m = mid(n - 1); ctx.moveTo(m[0], m[1]);
  for (let i = 0; i < n; i++) { const q = mid(i); ctx.quadraticCurveTo(pts[i][0], pts[i][1], q[0], q[1]); }
  ctx.closePath();
}
const MULTI = new Set(["extRing", "extLever", "band", "glintL", "glintR"]);   // 여러 조각(구멍 포함)으로 된 부위
function shape(ctx, name, only) {
  ctx.beginPath();
  const ps = PARTS[name].paths;
  (only != null ? [ps[only]] : MULTI.has(name) ? ps : ps.slice(0, 1)).forEach(p => pathOf(ctx, p));
}
function shade(ctx, name, pal, o = {}) {   // 윤곽 채우기: 왼쪽 위가 밝은 둥근 그라데이션 + 어두운 테두리 + 광택
  const [x0, y0, x1, y1] = PARTS[name].bbox, w = x1 - x0, h = y1 - y0;
  const cx = x0 + w * (o.lx ?? 0.32), cy = y0 + h * (o.ly ?? 0.28);
  const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, Math.hypot(w, h) * (o.r ?? 0.8));
  g.addColorStop(0, pal[0]); g.addColorStop(o.mid ?? 0.45, pal[1]); g.addColorStop(1, pal[2]);
  shape(ctx, name, o.only); ctx.fillStyle = g; ctx.fill("evenodd");
  if (o.edge !== 0) { ctx.lineWidth = o.edge ?? 3; ctx.strokeStyle = o.edgeCol ?? pal[2]; ctx.globalAlpha = 0.7; ctx.stroke(); ctx.globalAlpha = 1; }
  if (o.gloss) {
    ctx.save(); shape(ctx, name, o.only); ctx.clip("evenodd");
    for (const [gx, gy, rx, ry, a, al] of o.gloss) {
      ctx.fillStyle = `rgba(255,255,255,${al ?? 0.45})`;
      ctx.beginPath(); ctx.ellipse(x0 + w * gx, y0 + h * gy, w * rx, h * ry, a || 0, 0, 7); ctx.fill();
    }
    ctx.restore();
  }
}

// ---------- 팔다리: 관절을 지나는 곡선을 따라 두께를 줘서 매끈하게
function ik(p0, target, l1, l2, bend) {
  let dx = target[0] - p0[0], dy = target[1] - p0[1], d = Math.hypot(dx, dy) || 1;
  const dd = Math.max(Math.abs(l1 - l2) + 1, Math.min(l1 + l2 - 0.5, d));
  const ux = dx / d, uy = dy / d;
  const a = (l1 * l1 + dd * dd - l2 * l2) / (2 * dd), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  return [[p0[0] + ux * a - uy * h * bend, p0[1] + uy * a + ux * h * bend], [p0[0] + ux * dd, p0[1] + uy * dd]];
}
const angOf = (a, b) => Math.atan2(b[1] - a[1], b[0] - a[0]);
const ORIG = {   // 원본 포즈에서 정강이 방향 (장화 회전 기준)
  shinL: angOf(...ik(J.hipL, J.ankleL, LIMB.thigh, LIMB.shin, 1)), shinR: angOf(...ik(J.hipR, J.ankleR, LIMB.thigh, LIMB.shin, -1)),
};
function limb(ctx, A, E, B, rA, rB, pal) {
  const C = [2 * E[0] - (A[0] + B[0]) / 2, 2 * E[1] - (A[1] + B[1]) / 2];
  const N = 20, pts = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N, v = 1 - u;
    const p = [v * v * A[0] + 2 * u * v * C[0] + u * u * B[0], v * v * A[1] + 2 * u * v * C[1] + u * u * B[1]];
    const tg = [2 * v * (C[0] - A[0]) + 2 * u * (B[0] - C[0]), 2 * v * (C[1] - A[1]) + 2 * u * (B[1] - C[1])];
    const l = Math.hypot(tg[0], tg[1]) || 1;
    const r = (rA + (rB - rA) * u) * (1 + 0.06 * Math.sin(Math.PI * u));
    pts.push({ p, n: [-tg[1] / l, tg[0] / l], r });
  }
  const outline = () => {
    ctx.beginPath();
    pts.forEach((q, i) => { const x = q.p[0] + q.n[0] * q.r, y = q.p[1] + q.n[1] * q.r; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    const e = pts[N], ae = Math.atan2(e.n[1], e.n[0]);
    ctx.arc(e.p[0], e.p[1], e.r, ae, ae - Math.PI, true);
    for (let i = N; i >= 0; i--) { const q = pts[i]; ctx.lineTo(q.p[0] - q.n[0] * q.r, q.p[1] - q.n[1] * q.r); }
    const s0 = pts[0], as = Math.atan2(-s0.n[1], -s0.n[0]);
    ctx.arc(s0.p[0], s0.p[1], s0.r, as, as - Math.PI, true);
    ctx.closePath();
  };
  outline(); ctx.fillStyle = pal[1]; ctx.fill();
  ctx.save(); outline(); ctx.clip();
  // 원통 음영: 빛(왼쪽 위) 반대쪽은 어둡게, 빛 쪽은 밝게. 얇은 선을 여러 겹 겹쳐 부드럽게 만든다.
  const mi = pts[N >> 1], lit = mi.n[0] * -0.6 + mi.n[1] * -0.8 >= 0 ? 1 : -1;
  const band = (off, col, w, al) => {
    ctx.beginPath();
    pts.forEach((q, i) => { const o = lit * q.r * off, x = q.p[0] + q.n[0] * o, y = q.p[1] + q.n[1] * o; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.strokeStyle = col; ctx.globalAlpha = al; ctx.lineWidth = w; ctx.stroke();
  };
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  const R = (rA + rB) / 2;
  for (let k = 0; k < 7; k++) band(-1.05, pal[2], R * (1.3 - k * 0.14), 0.13);
  for (let k = 0; k < 7; k++) band(0.38, pal[0], R * (0.9 - k * 0.11), 0.13);
  ctx.restore(); ctx.globalAlpha = 1;
  // 테두리는 몸에 붙는 시작 쪽을 빼고 긋는다 (어깨, 엉덩이에 선이 안 생기게)
  ctx.beginPath();
  pts.forEach((q, i) => { if (i < 3) return; const x = q.p[0] + q.n[0] * q.r, y = q.p[1] + q.n[1] * q.r; i === 3 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); });
  const e2 = pts[N], ae2 = Math.atan2(e2.n[1], e2.n[0]);
  ctx.arc(e2.p[0], e2.p[1], e2.r, ae2, ae2 - Math.PI, true);
  for (let i = N; i >= 3; i--) { const q = pts[i]; ctx.lineTo(q.p[0] - q.n[0] * q.r, q.p[1] - q.n[1] * q.r); }
  ctx.lineWidth = 2.5; ctx.strokeStyle = pal[2]; ctx.globalAlpha = 0.45; ctx.stroke(); ctx.globalAlpha = 1;
}
function ball(ctx, p, r, pal) {   // 어깨처럼 둥글게 솟은 부분
  const g = ctx.createRadialGradient(p[0] - r * 0.35, p[1] - r * 0.4, r * 0.1, p[0], p[1], r * 1.05);
  g.addColorStop(0, pal[0]); g.addColorStop(0.55, pal[1]); g.addColorStop(1, pal[2]);
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, 7); ctx.fill();
}

// ---------- 떼어서 돌릴 수 있는 부품
function attached(ctx, anchor, to, ang, fn) {
  ctx.save(); ctx.translate(to[0], to[1]); ctx.rotate(ang); ctx.translate(-anchor[0], -anchor[1]); fn(); ctx.restore();
}
// 주먹 쥔 장갑. 손목(p)에서 팔뚝 방향(ang)으로 붙는다. 엄지는 화면 위쪽을 향하게 뒤집는다.
function drawFist(ctx, p, ang, sc = 1) {
  const flip = Math.cos(ang) >= 0 ? 1 : -1;
  ctx.save(); ctx.translate(p[0], p[1]); ctx.rotate(ang); ctx.scale(sc, sc * flip);
  const lg = [-0.55, -0.8], ca = Math.cos(-ang), sa = Math.sin(-ang);
  const L = [lg[0] * ca - lg[1] * sa, (lg[0] * sa + lg[1] * ca) * flip];   // 이 좌표계에서 빛이 오는 쪽
  const grad = (cx, cy, r) => {
    const g = ctx.createRadialGradient(cx + L[0] * r * 0.45, cy + L[1] * r * 0.45, r * 0.08, cx, cy, r * 1.1);
    g.addColorStop(0, PAL.red[0]); g.addColorStop(0.55, PAL.red[1]); g.addColorStop(1, PAL.red[2]); return g;
  };
  // 커프 + 주먹 + 손가락 마디 + 엄지를 한 덩어리로: 테두리를 먼저 굵게 긋고 그 위를 한 번에 칠해 이음새가 안 보이게
  const blob = () => {
    ctx.beginPath();
    ctx.ellipse(10, 0, 20, 46, 0, 0, 7);
    ctx.roundRect(12, -50, 96, 100, [44, 48, 52, 44]);
    for (let i = 0; i < 4; i++) ctx.ellipse(100, -33 + i * 22, 14, 13, 0, 0, 7);
    ctx.ellipse(56, -42, 36, 18, 0.15, 0, 7);
  };
  blob(); ctx.lineJoin = "round"; ctx.lineWidth = 6; ctx.strokeStyle = "#8a0300"; ctx.globalAlpha = 0.55; ctx.stroke(); ctx.globalAlpha = 1;
  blob(); ctx.fillStyle = grad(58, 0, 72); ctx.fill("nonzero");
  // 손가락 사이 주름, 엄지 경계, 커프 경계
  ctx.lineCap = "round"; ctx.strokeStyle = "rgba(150,0,0,0.4)"; ctx.lineWidth = 3.5;
  for (let i = 1; i < 4; i++) { const y = -33 + i * 22 - 11; ctx.beginPath(); ctx.moveTo(84, y + 1); ctx.quadraticCurveTo(100, y - 1, 112, y + 1); ctx.stroke(); }
  ctx.strokeStyle = "rgba(150,0,0,0.25)"; ctx.beginPath(); ctx.moveTo(34, -26); ctx.quadraticCurveTo(58, -20, 86, -28); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(24, -40); ctx.quadraticCurveTo(30, 0, 24, 40); ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.32)"; ctx.beginPath(); ctx.ellipse(52, -48, 20, 6, 0.15, 0, 7); ctx.fill();
  ctx.restore();
}
function drawBoot(ctx, side) {
  shade(ctx, side === "L" ? "bootL" : "bootR", PAL.red, { lx: 0.35, ly: 0.35, gloss: [[side === "L" ? 0.28 : 0.62, 0.62, 0.14, 0.07, 0.3, 0.35]] });
}
function drawNozzle(ctx) {   // 원추형 노즐 (원본 자리에 맞춰 직접 그림)
  const g = ctx.createLinearGradient(60, 640, 80, 730);
  g.addColorStop(0, "#6a6a72"); g.addColorStop(0.35, "#2a2a30"); g.addColorStop(1, "#0a0a0c");
  ctx.fillStyle = g; ctx.strokeStyle = "#050505"; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(160, 644); ctx.lineTo(118, 650); ctx.lineTo(10, 680); ctx.quadraticCurveTo(2, 720, 34, 748);
  ctx.lineTo(126, 682); ctx.lineTo(160, 674); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.beginPath(); ctx.moveTo(116, 656); ctx.lineTo(30, 684); ctx.lineTo(34, 692); ctx.lineTo(118, 664); ctx.closePath(); ctx.fill();
  ctx.save(); ctx.translate(20, 713); ctx.rotate(-0.3);
  ctx.fillStyle = "#1a1a1e"; ctx.beginPath(); ctx.ellipse(0, 0, 15, 38, 0, 0, 7); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#050507"; ctx.beginPath(); ctx.ellipse(2, 2, 9, 30, 0, 0, 7); ctx.fill();
  ctx.restore();
}
function drawExtinguisher(ctx) {   // 밸브(J.valve)를 기준으로 직접 그린 소화기
  ctx.save(); ctx.translate(J.valve[0], J.valve[1]);
  // 손잡이 고리
  ctx.lineWidth = 30; ctx.strokeStyle = PAL.red[2]; ctx.beginPath(); ctx.arc(-26, -70, 46, 0, 7); ctx.stroke();
  ctx.lineWidth = 24; const rg = ctx.createLinearGradient(-70, -120, 20, -20); rg.addColorStop(0, PAL.red[0]); rg.addColorStop(0.5, PAL.red[1]); rg.addColorStop(1, "#c01000");
  ctx.strokeStyle = rg; ctx.beginPath(); ctx.arc(-26, -70, 46, 0, 7); ctx.stroke();
  // 몸통
  ctx.save(); ctx.translate(14, 36); ctx.rotate(-0.13); ctx.scale(0.88, 0.9);
  const body = () => { ctx.beginPath(); ctx.moveTo(-92, 70); ctx.quadraticCurveTo(-92, 0, -20, -4); ctx.lineTo(20, -4); ctx.quadraticCurveTo(92, 0, 92, 70); ctx.lineTo(92, 282); ctx.quadraticCurveTo(92, 296, 78, 296); ctx.lineTo(-78, 296); ctx.quadraticCurveTo(-92, 296, -92, 282); ctx.closePath(); };
  const bg = ctx.createLinearGradient(-92, 0, 92, 0);
  bg.addColorStop(0, "#a80800"); bg.addColorStop(0.18, "#f0280e"); bg.addColorStop(0.3, "#ff7a60"); bg.addColorStop(0.42, "#f53a1c"); bg.addColorStop(0.8, "#d81600"); bg.addColorStop(1, "#8a0400");
  body(); ctx.fillStyle = bg; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = "#7a0300"; ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.55)"; ctx.beginPath(); ctx.roundRect(-50, 40, 12, 200, 6); ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.35)"; ctx.beginPath(); ctx.ellipse(-30, 14, 34, 9, -0.1, 0, 7); ctx.fill();
  const kb = ctx.createLinearGradient(-92, 0, 92, 0); kb.addColorStop(0, "#050505"); kb.addColorStop(0.3, "#55555c"); kb.addColorStop(0.5, "#1a1a1e"); kb.addColorStop(1, "#050505");
  ctx.fillStyle = kb; ctx.beginPath(); ctx.moveTo(-94, 262); ctx.lineTo(94, 262); ctx.lineTo(94, 290); ctx.quadraticCurveTo(94, 312, 72, 312); ctx.lineTo(-72, 312); ctx.quadraticCurveTo(-94, 312, -94, 290); ctx.closePath(); ctx.fill();
  ctx.restore();
  // 목, 은색 고리
  const ng = ctx.createLinearGradient(-22, 0, 22, 0); ng.addColorStop(0, "#a00800"); ng.addColorStop(0.35, "#ff6040"); ng.addColorStop(1, "#b00a00");
  ctx.fillStyle = ng; ctx.beginPath(); ctx.roundRect(-22, 14, 44, 34, 6); ctx.fill();
  // 레버 (위 손잡이, 아래 방아쇠)
  ctx.lineCap = "round"; ctx.strokeStyle = "#141418"; ctx.lineWidth = 20;
  ctx.beginPath(); ctx.moveTo(-60, -40); ctx.quadraticCurveTo(0, -30, 62, -38); ctx.stroke();
  ctx.lineWidth = 15; ctx.beginPath(); ctx.moveTo(-8, 4); ctx.lineTo(-82, 20); ctx.stroke();
  ctx.fillStyle = "#c8ccd4"; ctx.beginPath(); ctx.roundRect(-40, 2, 26, 18, 4); ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.3)"; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(-50, -46); ctx.quadraticCurveTo(0, -38, 50, -45); ctx.stroke();
  // 밸브
  const vg = ctx.createRadialGradient(-6, -6, 2, 0, 0, 26); vg.addColorStop(0, PAL.gold[0]); vg.addColorStop(0.6, PAL.gold[1]); vg.addColorStop(1, PAL.gold[2]);
  ctx.fillStyle = vg; ctx.beginPath(); ctx.ellipse(0, 0, 25, 23, 0, 0, 7); ctx.fill(); ctx.strokeStyle = PAL.gold[2]; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = "#b07800"; ctx.beginPath(); ctx.ellipse(2, 0, 9, 8, 0, 0, 7); ctx.fill();
  ctx.restore();
}
function drawCape(ctx, P, t) {
  const c = P.cape || {}, rot = c.rot ?? 0, wave = c.wave ?? 10, sp = c.speed ?? 5, str = c.stretch ?? 1;
  const A = J.cape, axis = Math.atan2(700 - A[1], 740 - A[0]) + rot;
  const tf = ([x, y]) => {
    const dx = x - A[0], dy = y - A[1];
    const k = Math.min(1, Math.hypot(dx, dy) / 300);
    const r = rot * (0.3 + 0.7 * k * k);   // 뿌리는 조금, 끝은 많이 돈다
    let px = dx * Math.cos(r) - dy * Math.sin(r), py = dx * Math.sin(r) + dy * Math.cos(r);
    const along = px * Math.cos(axis) + py * Math.sin(axis);
    px += Math.cos(axis) * along * (str - 1) * k; py += Math.sin(axis) * along * (str - 1) * k;
    const wv = wave * k * Math.sin(t * sp - k * 4 + (x + y) * 0.004);
    return [A[0] + px - Math.sin(axis) * wv, A[1] + py + Math.cos(axis) * wv];
  };
  const draw = (name, pal, o) => {
    const orig = PARTS[name].paths;
    PARTS[name].paths = orig.map(p => p.map(tf));
    shade(ctx, name, pal, o);
    PARTS[name].paths = orig;
  };
  draw("cape", PAL.yellow, { lx: 0.55, ly: 0.35, r: 0.75, mid: 0.5 });
  draw("capeFold", PAL.orange, { lx: 0.3, ly: 0.2, edge: 0 });
}
function drawHead(ctx, P) {
  const f = P.face || {};
  shade(ctx, "hood", PAL.purple, { lx: 0.2, ly: 0.35, r: 0.75, mid: 0.5, gloss: [[0.1, 0.42, 0.04, 0.16, 0.3, 0.3]] });
  shade(ctx, "face", PAL.face, { only: 0, lx: 0.4, ly: 0.45, r: 0.65, mid: 0.55, edge: 4, edgeCol: "#4a1a80" });
  ctx.save(); shape(ctx, "face", 0); ctx.clip();
  shade(ctx, "hair", PAL.hair, { lx: 0.4, ly: 0.2, edge: 0, gloss: [[0.42, 0.18, 0.2, 0.06, -0.1, 0.12]] });
  ctx.restore();
  for (const [x, y, rx, ry] of [[146, 412, 38, 33], [410, 456, 40, 35]]) {   // 볼
    const g = ctx.createRadialGradient(x, y, 2, x, y, rx);
    g.addColorStop(0, "rgba(255,125,125,0.8)"); g.addColorStop(0.7, "rgba(255,135,130,0.6)"); g.addColorStop(1, "rgba(255,150,140,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, 7); ctx.fill();
  }
  const blink = f.blink || 0, look = f.look || [0, 0];   // 눈: 깜빡임, 눈웃음, 시선
  for (const [e, gl] of [["eyeL", "glintL"], ["eyeR", "glintR"]]) {
    const [x0, y0, x1, y1] = PARTS[e].bbox, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    ctx.save(); ctx.translate(cx + look[0] * 6, cy + look[1] * 6);
    if (f.eyes === "happy") {
      ctx.strokeStyle = "#111"; ctx.lineWidth = 11; ctx.lineCap = "round";
      ctx.beginPath(); ctx.arc(0, 16, 26, Math.PI * 1.12, Math.PI * 1.88); ctx.stroke();
    } else {
      ctx.scale(1, Math.max(0.07, 1 - blink)); ctx.translate(-cx, -cy);
      shade(ctx, e, ["#2a2a30", "#0c0c0e", "#000"], { edge: 0 });
      if (blink < 0.5) { ctx.fillStyle = "#fff"; shape(ctx, gl); ctx.fill(); ctx.beginPath(); ctx.arc(x0 + (x1 - x0) * 0.35, y0 + (y1 - y0) * 0.72, 5, 0, 7); ctx.fill(); }
    }
    ctx.restore();
  }
  if (f.brow) {
    ctx.strokeStyle = "#111"; ctx.lineWidth = 9; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(178, 296); ctx.lineTo(228, 312); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(398, 330); ctx.lineTo(350, 336); ctx.stroke();
  }
  const mo = f.mouth || "open";   // 입
  if (mo === "open") {
    shade(ctx, "mouth", ["#f0443a", "#d4201a", "#8a0a08"], { edge: 2, lx: 0.5, ly: 0.2 });
    ctx.save(); shape(ctx, "mouth"); ctx.clip();
    ctx.fillStyle = "#ff8f8a"; ctx.beginPath(); ctx.ellipse(272, 470, 30, 18, 0, 0, 7); ctx.fill();
    ctx.restore();
  } else if (mo === "smile") {
    ctx.strokeStyle = "#c8201a"; ctx.lineWidth = 9; ctx.lineCap = "round"; ctx.beginPath(); ctx.arc(274, 412, 32, 0.35, Math.PI - 0.35); ctx.stroke();
  } else if (mo === "o") {
    ctx.fillStyle = "#c8201a"; ctx.beginPath(); ctx.ellipse(274, 440, 20, 26, 0, 0, 7); ctx.fill();
  } else if (mo === "grit") {
    ctx.fillStyle = "#c8201a"; ctx.beginPath(); ctx.roundRect(240, 420, 70, 30, 12); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.fillRect(248, 424, 54, 10);
  }
  shade(ctx, "band", PAL.purple, { lx: 0.3, ly: 0.2, r: 0.6, edge: 2, gloss: [[0.35, 0.25, 0.3, 0.08, 0.2, 0.25]] });   // 헬멧
  shade(ctx, "helmet", PAL.red, { lx: 0.2, ly: 0.2, r: 0.8, mid: 0.4, gloss: [[0.16, 0.3, 0.1, 0.06, -0.5, 0.35]] });
  shade(ctx, "emblem", PAL.orange, { lx: 0.35, ly: 0.3, r: 0.7, edge: 2 });
  ctx.save(); shape(ctx, "emblem"); ctx.clip(); shade(ctx, "stripe", ["#ffd060", "#ffb52a", "#e89000"], { edge: 0 }); ctx.restore();
  ctx.fillStyle = "rgba(255,255,255,0.8)"; shape(ctx, "hoodGlint"); ctx.fill();
}

const rot2 = (p, a, c) => { const dx = p[0] - c[0], dy = p[1] - c[1]; return [c[0] + dx * Math.cos(a) - dy * Math.sin(a), c[1] + dx * Math.sin(a) + dy * Math.cos(a)]; };
const TORSO = [[200, 548], [420, 548], [492, 592], [498, 680], [468, 772], [446, 852], [315, 884], [184, 852], [160, 772], [132, 680], [138, 592]];
function drawTorso(ctx) {
  ctx.beginPath(); pathOf(ctx, TORSO);
  const g = ctx.createRadialGradient(250, 640, 20, 300, 720, 290);
  g.addColorStop(0, PAL.blue[0]); g.addColorStop(0.5, PAL.blue[1]); g.addColorStop(1, PAL.blue[2]);
  ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = PAL.blue[2]; ctx.globalAlpha = 0.5; ctx.stroke(); ctx.globalAlpha = 1;
  ctx.save(); ctx.beginPath(); pathOf(ctx, TORSO); ctx.clip();
  ctx.fillStyle = "rgba(255,255,255,0.12)"; ctx.beginPath(); ctx.ellipse(245, 660, 60, 90, 0.2, 0, 7); ctx.fill();
  ctx.fillStyle = "rgba(0,20,70,0.25)"; ctx.beginPath(); ctx.ellipse(315, 900, 200, 60, 0, 0, 7); ctx.fill();
  ctx.restore();
}

// pose: x, y, s, rot, torso, head, lh, rh (손목 목표), lf, rf (발목 목표) - 모두 원본 그림 좌표, lb, rb, lkb, rkb (굽는 방향),
//       cape {rot, wave, speed, stretch}, face {mouth, eyes, blink, look, brow}, prop: "spray" | "hand" | "none", lBack, rBack
function drawChar(ctx, pose, t) {
  const P = Object.assign({ s: 1, rot: 0, torso: 0, head: 0, lb: 1, rb: -1, lkb: 1, rkb: -1, prop: "spray" }, pose);
  ctx.save(); ctx.translate(P.x, P.y); ctx.rotate(P.rot); ctx.scale(P.s * (P.sx || 1), P.s * (P.sy || 1)); ctx.translate(-J.pelvis[0], -J.pelvis[1]);
  const up = p => rot2(p, P.torso, J.pelvis);
  const shL = up(J.shL), shR = up(J.shR), neck = up(J.neck);
  const [kL, aL] = ik(J.hipL, P.lf || J.ankleL, LIMB.thigh, LIMB.shin, P.lkb);
  const [kR, aR] = ik(J.hipR, P.rf || J.ankleR, LIMB.thigh, LIMB.shin, P.rkb);
  const [eL, hL] = ik(shL, P.lh || J.handL, LIMB.upper, LIMB.fore, P.lb);
  const [eR, hR] = ik(shR, P.rh || J.handR, LIMB.upper, LIMB.fore, P.rb);
  const bodyRot = fn => { ctx.save(); ctx.translate(J.pelvis[0], J.pelvis[1]); ctx.rotate(P.torso); ctx.translate(-J.pelvis[0], -J.pelvis[1]); fn(); ctx.restore(); };
  const foreL = angOf(eL, hL), foreR = angOf(eR, hR);
  const arm = (sh, e, h) => limb(ctx, sh, e, h, 50, 42, PAL.blue);
  const fistL = () => { if (P.prop === "spray") attached(ctx, J.handL, hL, foreL - angOf(...ik(J.shL, J.handL, LIMB.upper, LIMB.fore, 1)), () => drawNozzle(ctx)); drawFist(ctx, hL, foreL, 1.1); };
  const fistR = () => drawFist(ctx, hR, foreR, 1.1);

  bodyRot(() => drawCape(ctx, P, t));
  const boot = (side, k, a, orig) => attached(ctx, side === "L" ? J.ankleL : J.ankleR, a, (angOf(k, a) - orig) * 0.45, () => drawBoot(ctx, side));
  limb(ctx, J.hipR, kR, aR, 62, 54, PAL.blue); boot("R", kR, aR, ORIG.shinR);
  limb(ctx, J.hipL, kL, aL, 62, 54, PAL.blue); boot("L", kL, aL, ORIG.shinL);
  if (P.rBack) { arm(shR, eR, hR); fistR(); }
  if (P.lBack) { arm(shL, eL, hL); fistL(); }
  bodyRot(() => drawTorso(ctx));
  if (!P.lBack) ball(ctx, shL, 52, PAL.blue);
  if (!P.rBack) ball(ctx, shR, 52, PAL.blue);
  attached(ctx, J.neck, neck, P.torso + P.head, () => drawHead(ctx, P));
  if (!P.lBack) arm(shL, eL, hL);
  if (!P.rBack) arm(shR, eR, hR);
  if (P.prop === "spray") {
    const valve = [hR[0] - 150, hR[1] - 8];
    attached(ctx, J.valve, valve, P.extAng || 0, () => drawExtinguisher(ctx));
    const nb = rot2([150, 660], foreL - angOf(...ik(J.shL, J.handL, LIMB.upper, LIMB.fore, 1)), J.handL); nb[0] += hL[0] - J.handL[0]; nb[1] += hL[1] - J.handL[1];
    ctx.strokeStyle = "#16161a"; ctx.lineWidth = 16; ctx.lineCap = "round";   // 호스
    ctx.beginPath(); ctx.moveTo(valve[0] + 62, valve[1] + 70); ctx.bezierCurveTo(valve[0] + 170, valve[1] + 150, valve[0] + 160, valve[1] - 10, valve[0] + 50, valve[1] - 34); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(valve[0] - 10, valve[1] - 20); ctx.quadraticCurveTo((valve[0] + nb[0]) / 2, Math.min(valve[1], nb[1]) - 40, nb[0], nb[1]); ctx.stroke();
  } else if (P.prop === "hand") {
    attached(ctx, [288, 640], [hR[0] + Math.cos(foreR) * 50, hR[1] + Math.sin(foreR) * 50 + 10], P.extAng || 0, () => drawExtinguisher(ctx));
  }
  if (!P.rBack) fistR();
  if (!P.lBack) fistL();
  ctx.restore();
  return { hL, hR };
}

const POSES = {
  spray: { face: { mouth: "open" } },
  stand: { lh: [120, 790], rh: [510, 790], lb: 1, rb: -1, lf: [235, 1000], rf: [395, 1000], prop: "hand", cape: { rot: 0.5, wave: 8, speed: 3 }, face: { mouth: "smile" } },
  run: { torso: 0.1, lh: [110, 720], rh: [540, 640], lb: 1, rb: -1, lf: [150, 960], rf: [470, 1010], prop: "none", cape: { rot: -0.05, wave: 18, speed: 10, stretch: 1.1 }, face: { mouth: "open", brow: 1 } },
  flyUp: { rot: -0.25, lBack: 1, lh: [70, 470], rh: [540, 770], lb: 1, rb: -1, lf: [290, 1020], rf: [360, 1030], lkb: 1, rkb: -1, prop: "hand", extAng: 0.3, cape: { rot: 0.9, wave: 26, speed: 12, stretch: 1.2 }, face: { mouth: "grit", brow: 1 } },
  lift: { lBack: 1, rBack: 1, head: -0.06, lh: [70, 470], rh: [560, 470], lb: -1, rb: 1, lf: [175, 990], rf: [455, 990], prop: "none", cape: { rot: 0.4, wave: 12, speed: 5 }, face: { mouth: "open", look: [0, -1] } },
  throwDown: { torso: 0.15, head: 0.1, lh: [60, 760], rh: [580, 760], lb: -1, rb: 1, lf: [155, 960], rf: [495, 950], prop: "none", cape: { rot: -0.8, wave: 22, speed: 10 }, face: { mouth: "grit", brow: 1 } },
  cheer: { lBack: 1, lh: [60, 470], rh: [520, 790], lb: -1, rb: -1, lf: [235, 1000], rf: [400, 1000], prop: "hand", cape: { rot: 0.3, wave: 12, speed: 5 }, face: { mouth: "open", eyes: "happy" } },
};

// 두 포즈 사이를 k(0~1)만큼 섞는다. 숫자와 좌표는 선형으로, 나머지(표정, 소품)는 가까운 쪽을 따른다.
function lerpPose(a, b, k) {
  const base = { rot: 0, torso: 0, head: 0, lh: J.handL, rh: J.handR, lf: J.ankleL, rf: J.ankleR, lb: 1, rb: -1, lkb: 1, rkb: -1, extAng: 0 };
  const A = Object.assign({}, base, a), B = Object.assign({}, base, b), out = Object.assign({}, k < 0.5 ? A : B);
  for (const key of ["rot", "torso", "head", "extAng"]) out[key] = A[key] + (B[key] - A[key]) * k;
  for (const key of ["lh", "rh", "lf", "rf"]) out[key] = [A[key][0] + (B[key][0] - A[key][0]) * k, A[key][1] + (B[key][1] - A[key][1]) * k];
  const ca = Object.assign({ rot: 0, wave: 10, speed: 5, stretch: 1 }, A.cape), cb = Object.assign({ rot: 0, wave: 10, speed: 5, stretch: 1 }, B.cape);
  out.cape = {}; for (const key in ca) out.cape[key] = ca[key] + (cb[key] - ca[key]) * k;
  return out;
}
