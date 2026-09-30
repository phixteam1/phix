// 소화기 히어로를 도형으로 그린다. 부위(머리, 몸, 팔, 다리, 망토, 소화기)가 나뉘어 있어 포즈를 자유롭게 줄 수 있다.
// drawChar(ctx, pose, t): pose의 좌표는 골반 기준(원본 그림 픽셀 단위, 키 약 900), 손발은 목표 위치를 주면 관절이 알아서 굽는다.
const CH = {
  hood: ["#9a5cf0", "#6a2fc4", "#43188c"], helmet: ["#ff6a48", "#e8281c", "#a8140e"], band: "#7b3ad6",
  emblem: ["#ffae3a", "#ff7a1e"], stripe: "#ffb52a", face: ["#fffaf2", "#ffe9d6"], hair: "#121014",
  cheek: "rgba(245,120,125,0.55)", mouth: "#e2302a", tongue: "#ff8c8c",
  suit: ["#5b90f2", "#2f5fd0", "#1d3c9c"], red: ["#ff6a4c", "#e8251a", "#a3120c"], cape: ["#ffd84a", "#ffb81a", "#e89400"],
  metal: ["#ffe27a", "#e0a800"], black: ["#4a4a52", "#16161a"],
};
const SH_L = [-150, -190], SH_R = [150, -190], HIP_L = [-80, -4], HIP_R = [80, -4], NECK = [0, -245];
const ARM = [112, 104], LEG = [94, 90];

function ik(p0, target, l1, l2, bend) {
  let dx = target[0] - p0[0], dy = target[1] - p0[1], d = Math.hypot(dx, dy);
  const dmax = l1 + l2 - 0.5, dmin = Math.abs(l1 - l2) + 1;
  const dd = Math.max(dmin, Math.min(dmax, d));
  if (d < 1e-6) { dx = 0; dy = 1; d = 1; }
  const ux = dx / d, uy = dy / d;
  const a = (l1 * l1 + dd * dd - l2 * l2) / (2 * dd), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const elbow = [p0[0] + ux * a - uy * h * bend, p0[1] + uy * a + ux * h * bend];
  const end = [p0[0] + ux * dd, p0[1] + uy * dd];
  return [elbow, end];
}
const rot2 = (p, a) => [p[0] * Math.cos(a) - p[1] * Math.sin(a), p[0] * Math.sin(a) + p[1] * Math.cos(a)];

function radial(ctx, x, y, r, cols, hx = -0.35, hy = -0.4) {
  const g = ctx.createRadialGradient(x + r * hx, y + r * hy, r * 0.05, x, y, r * 1.1);
  g.addColorStop(0, cols[0]); g.addColorStop(0.55, cols[1]); g.addColorStop(1, cols[2] || cols[1]);
  return g;
}

function limb(ctx, a, b, c, w, cols) {   // 통통한 팔다리: 어두운 테두리, 본색, 밝은 하이라이트 순으로 겹쳐 긋는다
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  const path = () => { ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.quadraticCurveTo(b[0], b[1], (b[0] + c[0]) / 2, (b[1] + c[1]) / 2); ctx.lineTo(c[0], c[1]); };
  ctx.strokeStyle = cols[2]; ctx.lineWidth = w + 8; path(); ctx.stroke();
  ctx.strokeStyle = cols[1]; ctx.lineWidth = w; path(); ctx.stroke();
  ctx.save(); ctx.translate(-w * 0.14, -w * 0.16);
  ctx.strokeStyle = cols[0]; ctx.globalAlpha = 0.55; ctx.lineWidth = w * 0.32; path(); ctx.stroke();
  ctx.restore();
}

function glove(ctx, p, r, ang) {
  ctx.save(); ctx.translate(p[0], p[1]); ctx.rotate(ang);
  ctx.fillStyle = CH.red[2]; ctx.beginPath(); ctx.arc(0, 0, r + 4, 0, 7); ctx.fill();
  ctx.fillStyle = radial(ctx, 0, 0, r, CH.red); ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill();
  ctx.strokeStyle = "rgba(120,10,6,0.45)"; ctx.lineWidth = 4; ctx.lineCap = "round";
  for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.moveTo(r * 0.15, k * r * 0.32); ctx.lineTo(r * 0.75, k * r * 0.3); ctx.stroke(); }
  ctx.fillStyle = radial(ctx, -r * 0.35, -r * 0.7, r * 0.42, CH.red);
  ctx.beginPath(); ctx.ellipse(-r * 0.3, -r * 0.72, r * 0.42, r * 0.3, -0.5, 0, 7); ctx.fill();
  ctx.restore();
}

function boot(ctx, knee, foot, dir) {
  const ang = Math.atan2(foot[1] - knee[1], foot[0] - knee[0]) - Math.PI / 2;
  ctx.save(); ctx.translate(foot[0], foot[1]); ctx.rotate(ang);
  ctx.fillStyle = CH.red[2];
  ctx.beginPath(); ctx.roundRect(-56, -62, 112, 90, 26); ctx.fill();
  ctx.beginPath(); ctx.ellipse(dir * 34, 26, 86, 50, 0, 0, 7); ctx.fill();
  ctx.fillStyle = radial(ctx, 0, -20, 60, CH.red); ctx.beginPath(); ctx.roundRect(-52, -58, 104, 84, 24); ctx.fill();
  ctx.fillStyle = radial(ctx, dir * 30, 20, 84, CH.red); ctx.beginPath(); ctx.ellipse(dir * 34, 24, 82, 46, 0, 0, 7); ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.28)"; ctx.beginPath(); ctx.ellipse(dir * 20 - 12, 6, 34, 13, -0.2 * dir, 0, 7); ctx.fill();
  ctx.restore();
}

function cape(ctx, pose, t) {
  const c = pose.cape || {}, a = c.a ?? 1.25, L = c.len ?? 360, wv = c.wave ?? 14, sp = c.speed ?? 6;
  const d = [Math.sin(a), Math.cos(a)], n = [-d[1], d[0]];
  const tl = rot2([-90, -236], pose.torso || 0), tr = rot2([90, -236], pose.torso || 0);
  const w = k => Math.sin(t * sp - k * 3.2) * wv * k;
  const pt = (base, k, side) => [base[0] + d[0] * L * k + n[0] * (w(k) + side * 200 * k), base[1] + d[1] * L * k + n[1] * (w(k) + side * 200 * k)];
  const A = [], B = [];
  for (let i = 0; i <= 8; i++) { A.push(pt(tl, i / 8, -1)); B.push(pt(tr, i / 8, 1)); }
  ctx.beginPath(); ctx.moveTo(A[0][0], A[0][1]);
  for (let i = 1; i <= 8; i++) ctx.lineTo(A[i][0], A[i][1]);
  const e1 = A[8], e2 = B[8];   // 끝단은 물결 두 번
  const m = [(e1[0] + e2[0]) / 2 + d[0] * (-26 + 12 * Math.sin(t * sp)), (e1[1] + e2[1]) / 2 + d[1] * (-26 + 12 * Math.sin(t * sp))];
  ctx.quadraticCurveTo(e1[0] + (m[0] - e1[0]) * 0.5 + d[0] * 40, e1[1] + (m[1] - e1[1]) * 0.5 + d[1] * 40, m[0], m[1]);
  ctx.quadraticCurveTo(m[0] + (e2[0] - m[0]) * 0.5 + d[0] * 40, m[1] + (e2[1] - m[1]) * 0.5 + d[1] * 40, e2[0], e2[1]);
  for (let i = 7; i >= 0; i--) ctx.lineTo(B[i][0], B[i][1]);
  ctx.closePath();
  const g = ctx.createLinearGradient(tl[0], tl[1], tl[0] + n[0] * 200 + d[0] * L, tl[1] + n[1] * 200 + d[1] * L);
  g.addColorStop(0, CH.cape[2]); g.addColorStop(0.4, CH.cape[1]); g.addColorStop(0.75, CH.cape[0]); g.addColorStop(1, CH.cape[1]);
  ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = CH.cape[2]; ctx.lineWidth = 5; ctx.stroke();
  ctx.strokeStyle = "rgba(200,120,0,0.35)"; ctx.lineWidth = 6; ctx.lineCap = "round";   // 주름
  for (const s of [-0.35, 0.3]) {
    ctx.beginPath();
    for (let i = 2; i <= 7; i++) { const k = i / 8, p = pt([(tl[0] + tr[0]) / 2, (tl[1] + tr[1]) / 2], k, s); i === 2 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1]); }
    ctx.stroke();
  }
}

function torso(ctx, lean) {
  ctx.save(); ctx.rotate(lean);
  const body = () => { ctx.beginPath(); ctx.moveTo(-120, -250); ctx.bezierCurveTo(-225, -245, -200, -100, -150, 10); ctx.quadraticCurveTo(0, 66, 150, 10); ctx.bezierCurveTo(200, -100, 225, -245, 120, -250); ctx.closePath(); };
  ctx.fillStyle = CH.suit[2]; ctx.save(); ctx.scale(1.03, 1.02); body(); ctx.fill(); ctx.restore();
  ctx.fillStyle = radial(ctx, -10, -130, 220, CH.suit, -0.3, -0.3); body(); ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.14)"; ctx.beginPath(); ctx.ellipse(-70, -160, 40, 70, 0.2, 0, 7); ctx.fill();
  ctx.restore();
}

function head(ctx, pose, t) {
  const f = pose.face || {};
  // 후드
  ctx.fillStyle = CH.hood[2]; ctx.beginPath(); ctx.ellipse(0, 4, 274, 244, 0, 0, 7); ctx.fill();
  ctx.fillStyle = radial(ctx, 0, 0, 270, CH.hood, -0.45, -0.35); ctx.beginPath(); ctx.ellipse(0, 0, 268, 238, 0, 0, 7); ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.22)"; ctx.beginPath(); ctx.ellipse(-205, -40, 26, 80, 0.25, 0, 7); ctx.fill();
  // 얼굴 테두리 안쪽 그림자
  ctx.fillStyle = "#3a137a"; ctx.beginPath(); ctx.ellipse(-12, 16, 204, 182, 0, 0, 7); ctx.fill();
  ctx.save();
  ctx.beginPath(); ctx.ellipse(-12, 20, 196, 174, 0, 0, 7); ctx.clip();
  const fg = ctx.createRadialGradient(-40, 20, 20, -12, 20, 210); fg.addColorStop(0, CH.face[0]); fg.addColorStop(1, CH.face[1]);
  ctx.fillStyle = fg; ctx.fillRect(-230, -170, 440, 380);
  // 머리카락
  ctx.fillStyle = CH.hair; ctx.beginPath();
  ctx.moveTo(-240, -200); ctx.lineTo(240, -200); ctx.lineTo(240, 20);
  ctx.quadraticCurveTo(200, -60, 60, -72);
  ctx.quadraticCurveTo(-10, -78, -32, -48);
  ctx.quadraticCurveTo(-60, -86, -120, -74);
  ctx.quadraticCurveTo(-215, -50, -236, 60);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.12)"; ctx.beginPath(); ctx.ellipse(-60, -130, 90, 18, -0.1, 0, 7); ctx.fill();
  ctx.restore();
  // 볼
  ctx.fillStyle = CH.cheek;
  ctx.beginPath(); ctx.ellipse(-168, 62, 40, 30, 0, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.ellipse(98, 96, 40, 30, 0, 0, 7); ctx.fill();
  // 눈
  const blink = f.blink || 0, look = f.look || [0, 0];
  for (const [ex, ey] of [[-108, 16], [52, 32]]) {
    ctx.save(); ctx.translate(ex + look[0] * 8, ey + look[1] * 6); ctx.scale(1, Math.max(0.08, 1 - blink));
    if (f.eyes === "happy") {
      ctx.strokeStyle = CH.hair; ctx.lineWidth = 12; ctx.lineCap = "round";
      ctx.beginPath(); ctx.arc(0, 14, 28, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
    } else {
      ctx.fillStyle = CH.hair; ctx.beginPath(); ctx.ellipse(0, 0, 31, 41, 0, 0, 7); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(9, -14, 12, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(-9, 14, 5, 0, 7); ctx.fill();
    }
    ctx.restore();
  }
  if (f.brow) {   // 결의에 찬 눈썹
    ctx.strokeStyle = CH.hair; ctx.lineWidth = 9; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(-140, -40); ctx.lineTo(-86, -28); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(78, -22); ctx.lineTo(28, -12); ctx.stroke();
  }
  // 입
  const mo = f.mouth || "open";
  ctx.save(); ctx.translate(-34, 86);
  if (mo === "o") {
    ctx.fillStyle = CH.mouth; ctx.beginPath(); ctx.ellipse(0, 6, 20, 26, 0, 0, 7); ctx.fill();
  } else if (mo === "smile") {
    ctx.strokeStyle = CH.mouth; ctx.lineWidth = 9; ctx.lineCap = "round"; ctx.beginPath(); ctx.arc(0, -10, 34, 0.35, Math.PI - 0.35); ctx.stroke();
  } else if (mo === "grit") {
    ctx.fillStyle = CH.mouth; ctx.beginPath(); ctx.roundRect(-38, -4, 76, 30, 12); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.fillRect(-30, 0, 60, 10);
  } else {
    const open = f.open ?? 1;
    ctx.fillStyle = "#8c1410"; ctx.beginPath(); ctx.moveTo(-44, -8); ctx.quadraticCurveTo(0, 8, 44, -12); ctx.quadraticCurveTo(24, 58 * open, -6, 56 * open); ctx.quadraticCurveTo(-38, 50 * open, -44, -8); ctx.fill();
    ctx.save(); ctx.clip();
    ctx.fillStyle = CH.tongue; ctx.beginPath(); ctx.ellipse(4, 50 * open, 32, 22, 0, 0, 7); ctx.fill();
    ctx.restore();
  }
  ctx.restore();
  // 헬멧
  ctx.save(); ctx.translate(26, -196); ctx.rotate(0.13); ctx.scale(0.92, 0.92);
  const dome = () => { ctx.beginPath(); ctx.moveTo(-238, 46); ctx.lineTo(-222, -74); ctx.quadraticCurveTo(-208, -132, -138, -136); ctx.lineTo(150, -136); ctx.quadraticCurveTo(222, -132, 234, -72); ctx.lineTo(246, 46); ctx.closePath(); };
  ctx.fillStyle = CH.helmet[2]; ctx.save(); ctx.translate(0, 5); dome(); ctx.fill(); ctx.restore();
  const hg = ctx.createLinearGradient(-230, -140, 240, 40); hg.addColorStop(0, CH.helmet[0]); hg.addColorStop(0.5, CH.helmet[1]); hg.addColorStop(1, CH.helmet[2]);
  ctx.fillStyle = hg; dome(); ctx.fill();
  ctx.save(); dome(); ctx.clip();
  ctx.fillStyle = radial(ctx, -14, -58, 98, [CH.emblem[0], CH.emblem[1], "#f25e14"]);
  ctx.beginPath(); ctx.ellipse(-14, -58, 98, 80, 0, 0, 7); ctx.fill();
  ctx.save(); ctx.beginPath(); ctx.ellipse(-14, -58, 98, 80, 0, 0, 7); ctx.clip();
  ctx.fillStyle = CH.stripe; ctx.beginPath(); ctx.moveTo(4, -150); ctx.lineTo(44, -150); ctx.lineTo(8, 40); ctx.lineTo(-32, 40); ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.fillStyle = "rgba(255,255,255,0.25)"; ctx.beginPath(); ctx.ellipse(-150, -95, 50, 16, -0.15, 0, 7); ctx.fill();
  ctx.restore();
  ctx.fillStyle = "#56209e"; ctx.beginPath(); ctx.roundRect(-252, 22, 506, 48, 24); ctx.fill();
  ctx.fillStyle = CH.band; ctx.beginPath(); ctx.roundRect(-250, 20, 502, 40, 20); ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.22)"; ctx.beginPath(); ctx.roundRect(-230, 26, 300, 8, 4); ctx.fill();
  ctx.restore();
}

function extinguisher(ctx, top, ang, nozzleHand, nozzleDir, sc = 1) {
  ctx.save(); ctx.translate(top[0], top[1]); ctx.rotate(ang); ctx.scale(sc, sc);
  const body = () => { ctx.beginPath(); ctx.roundRect(-72, 26, 144, 300, [62, 62, 16, 16]); };
  ctx.fillStyle = CH.red[2]; ctx.save(); ctx.translate(0, 4); body(); ctx.fill(); ctx.restore();
  const g = ctx.createLinearGradient(-72, 0, 72, 0); g.addColorStop(0, "#b8160e"); g.addColorStop(0.35, "#ff5a40"); g.addColorStop(0.6, "#e8251a"); g.addColorStop(1, "#9c100a");
  ctx.fillStyle = g; body(); ctx.fill();
  ctx.fillStyle = CH.black[1]; ctx.beginPath(); ctx.roundRect(-74, 296, 148, 36, 10); ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.3)"; ctx.fillRect(-42, 70, 14, 210);
  ctx.fillStyle = CH.black[1]; ctx.beginPath(); ctx.roundRect(-20, 4, 40, 30, 6); ctx.fill();
  ctx.fillStyle = radial(ctx, 0, 0, 22, [CH.metal[0], CH.metal[1], "#a07800"]); ctx.beginPath(); ctx.arc(0, 0, 22, 0, 7); ctx.fill();
  ctx.strokeStyle = CH.black[1]; ctx.lineWidth = 12; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(-10, -8); ctx.lineTo(-90, -24); ctx.stroke();   // 손잡이
  ctx.restore();
  if (!nozzleHand) return;
  // 호스와 노즐
  const valve = top;
  ctx.strokeStyle = CH.black[1]; ctx.lineWidth = 16; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(valve[0], valve[1]);
  ctx.bezierCurveTo(valve[0] + 60, valve[1] + 120, nozzleHand[0] + 40, nozzleHand[1] + 90, nozzleHand[0], nozzleHand[1]); ctx.stroke();
  ctx.save(); ctx.translate(nozzleHand[0], nozzleHand[1]); ctx.rotate(nozzleDir);
  ctx.fillStyle = CH.black[1];
  ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(110, -30); ctx.lineTo(110, 30); ctx.lineTo(0, 14); ctx.closePath(); ctx.fill();
  ctx.fillStyle = CH.black[0]; ctx.beginPath(); ctx.moveTo(10, -10); ctx.lineTo(100, -22); ctx.lineTo(100, -10); ctx.lineTo(10, -2); ctx.fill();
  ctx.fillStyle = "#2a2a30"; ctx.beginPath(); ctx.ellipse(110, 0, 10, 30, 0, 0, 7); ctx.fill();
  ctx.restore();
}

// pose: x, y, s, rot, torso, head, lh, rh, lf, rf (목표 위치), lb, rb (팔꿈치 굽는 방향), lfd, rfd (발끝 방향), cape, face, prop
function drawChar(ctx, pose, t) {
  const P = Object.assign({ s: 1, rot: 0, torso: 0, head: 0, lb: 1, rb: -1, lkb: -1, rkb: 1, lfd: -1, rfd: 1, prop: "none" }, pose);
  ctx.save(); ctx.translate(P.x, P.y); ctx.rotate(P.rot); ctx.scale(P.s * (P.sx || 1), P.s * (P.sy || 1));
  const sh = [rot2(SH_L, P.torso), rot2(SH_R, P.torso)], neck = rot2(NECK, P.torso);
  const [lk, lfoot] = ik(HIP_L, P.lf || [-150, 190], LEG[0], LEG[1], P.lkb);
  const [rk, rfoot] = ik(HIP_R, P.rf || [150, 190], LEG[0], LEG[1], P.rkb);
  const [le, lhand] = ik(sh[0], P.lh || [-190, -40], ARM[0], ARM[1], P.lb);
  const [re, rhand] = ik(sh[1], P.rh || [190, -40], ARM[0], ARM[1], P.rb);

  cape(ctx, P, t);
  limb(ctx, HIP_R, rk, rfoot, 120, CH.suit); boot(ctx, rk, rfoot, P.rfd);
  limb(ctx, HIP_L, lk, lfoot, 120, CH.suit); boot(ctx, lk, lfoot, P.lfd);
  if (P.prop === "back") extinguisher(ctx, rot2([150, -250], P.torso), P.torso + 0.45, null, 0, 0.75);
  limb(ctx, sh[1], re, rhand, 90, CH.suit);
  if (P.lBack) { limb(ctx, sh[0], le, lhand, 90, CH.suit); glove(ctx, lhand, 52, Math.PI); }
  if (P.rBack) glove(ctx, rhand, 50, 0);
  torso(ctx, P.torso);
  ctx.save(); ctx.translate(neck[0], neck[1]); ctx.rotate(P.torso + P.head); ctx.translate(0, -178); ctx.scale(1.04, 1.04); head(ctx, P, t); ctx.restore();
  if (P.prop === "spray") {
    const dir = Math.atan2(lhand[1] - rhand[1], lhand[0] - rhand[0]);
    extinguisher(ctx, [rhand[0] - 30, rhand[1] + 10], P.extAng || 0, lhand, P.nozzleDir ?? dir + 0.1, 0.95);
  }
  if (P.prop === "hand") extinguisher(ctx, [rhand[0], rhand[1] + 10], P.extAng || 0, null);
  if (!P.rBack) glove(ctx, rhand, 50, 0);
  if (!P.lBack) { limb(ctx, sh[0], le, lhand, 90, CH.suit); glove(ctx, lhand, 52, Math.PI); }
  ctx.restore();
  return { lhand, rhand };
}

// 자주 쓰는 포즈
const POSES = {
  spray: { torso: 0.02, head: -0.06, lh: [-150, -130], rh: [80, -100], lb: -1, rb: 1, lf: [-160, 140], rf: [200, 130], lkb: 1, rkb: -1, prop: "spray", cape: { a: 1.15, len: 380, wave: 12 }, face: { mouth: "open" } },
  stand: { lh: [-215, -20], rh: [215, -20], lb: 1, rb: -1, lf: [-110, 195], rf: [110, 195], prop: "hand", cape: { a: 1.0, len: 330, wave: 10, speed: 3 }, face: { mouth: "smile" } },
  flyUp: { rot: -0.3, torso: 0, head: 0.1, lBack: 1, lh: [-330, -400], rh: [230, -30], lb: 1, rb: -1, lf: [-40, 220], rf: [60, 240], lkb: 1, rkb: -1, lfd: -0.4, rfd: 0.4, prop: "hand", extAng: 0.2, cape: { a: 0.55, len: 440, wave: 26, speed: 12 }, face: { mouth: "grit", brow: 1 } },
  lift: { head: -0.12, lBack: 1, rBack: 1, lh: [-320, -420], rh: [320, -420], lb: -1, rb: 1, lf: [-150, 180], rf: [150, 180], prop: "back", cape: { a: 1.1, len: 340, wave: 14, speed: 5 }, face: { mouth: "open", look: [0, -1] } },
  throwDown: { torso: 0.18, head: 0.15, lh: [-300, -80], rh: [300, -80], lb: -1, rb: 1, lf: [-170, 170], rf: [190, 150], prop: "back", cape: { a: 2.2, len: 380, wave: 22, speed: 10 }, face: { mouth: "grit", brow: 1 } },
  run: { torso: 0.12, head: 0.05, lh: [-120, -60], rh: [200, -160], lb: 1, rb: -1, lf: [-170, 130], rf: [170, 200], lkb: -1, rkb: 1, prop: "hand", extAng: -0.3, cape: { a: 1.35, len: 380, wave: 20, speed: 10 }, face: { mouth: "open", brow: 1 } },
  cheer: { lBack: 1, lh: [-330, -400], rh: [160, -20], lb: -1, rb: -1, lf: [-120, 190], rf: [120, 190], prop: "hand", cape: { a: 1.1, len: 340, wave: 12, speed: 5 }, face: { mouth: "open", eyes: "happy" } },
};
