// 소화기 히어로 산불 진화 장면. drawAt(t)가 t초의 한 프레임을 1080x1920 캔버스에 그린다.
// 모든 입자는 t와 번호만으로 위치가 정해져서 아무 시점으로나 건너뛸 수 있다.
const W = 1080, H = 1920, TOTAL = 30;
const cv = document.getElementById("c"), ctx = cv.getContext("2d");
const hero = new Image();
hero.src = HERO_SRC;
const HW = 756, HH = 1033, HCX = 378, HCY = 516;   // 스프라이트 크기와 중심
const NOZZLE = [20, 713], CAN_BOTTOM = [334, 1015]; // 스프라이트 안의 노즐 끝, 소화기 바닥

const T = { LAND: 2.0, SPRAY0: 3.2, SPRAY1: 9.0, FLARE: 7.0, CROUCH: 9.6, LAUNCH: 10.4, CAM0: 10.6, CAM1: 14.3,
  CH0: 14.9, CH1: 18.8, THROW: 19.3, DROP0: 19.6, IMP: 21.4, CALM: 23.5, DESC0: 25.2, LAND2: 27.0 };
const CAM_TOP = 3600, IMPX = 540, IMPY = 1480, HOVER_Y = 1180, BOMB_Y = 620;

const rnd = i => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const lerp = (a, b, k) => a + (b - a) * k;
const seg = (t, a, b) => clamp((t - a) / (b - a));
const eio = k => k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
const eout = k => 1 - Math.pow(1 - k, 3);
const bell = k => Math.sin(Math.PI * clamp(k));
const mixc = (a, b, k) => a.map((v, i) => Math.round(lerp(v, b[i], k)));
const rgb = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const groundY = x => 1540 + 30 * Math.sin((x - 760) * 0.006);

// ---------- 불꽃 배치
const FLAMES = [];
for (let i = 0; i < 16; i++) FLAMES.push({ x: 20 + i * 68 + rnd(i) * 30, y: 1335 + rnd(i + 50) * 25, h: 130 + rnd(i + 9) * 110, w: 70 + rnd(i + 3) * 30, sd: i });
for (let i = 0; i < 14; i++) {
  const x = 10 + rnd(i + 100) * 560, y = 1500 + rnd(i + 200) * 260;
  FLAMES.push({ x, y, h: 170 + rnd(i + 300) * 170, w: 100 + rnd(i + 400) * 50, sd: 40 + i, hit: x > 170 && x < 560 && y < 1700 });
}
FLAMES.push({ x: 960, y: 1640, h: 220, w: 110, sd: 90 }, { x: 1060, y: 1760, h: 260, w: 130, sd: 91 });
FLAMES.sort((a, b) => a.y - b.y);
for (const f of FLAMES) f.arr = T.IMP + 0.05 + Math.hypot(f.x - IMPX, (f.y - IMPY) * 1.6) / 2200;

function fireGlobal(t) {
  return (0.75 + 0.25 * seg(t, 0, 2)) * (1 + 0.45 * eout(seg(t, T.FLARE, T.FLARE + 0.5)));
}
function flameLevel(f, t) {
  let k = fireGlobal(t);
  if (f.hit) k *= 1 - 0.6 * eio(seg(t, 3.8, 6.2)) * (1 - seg(t, T.FLARE, T.FLARE + 0.4));
  return k * (1 - eout(seg(t, f.arr, f.arr + 0.45)));
}
const fireAmount = t => t < T.IMP ? 1 : 1 - seg(t, T.IMP, T.IMP + 1.3);
const greenK = t => eio(seg(t, T.CALM, 27));

// ---------- 카메라
function bombWorldY(t) { const k = seg(t, T.DROP0, T.IMP); return BOMB_Y - CAM_TOP + (IMPY - BOMB_Y + CAM_TOP) * k * k; }
function camY(t) {
  if (t < T.DROP0) return eio(seg(t, T.CAM0, T.CAM1)) * CAM_TOP;
  return Math.max(0, BOMB_Y - bombWorldY(t));
}

// ---------- 주인공 위치 (화면 좌표)
function heroState(t, cam) {
  const st = { x: 760, y: 1330, s: 0.42, rot: 0, sx: 1, sy: 1, cape: 6, vis: true };
  if (t < 0.8) { st.vis = false; return st; }
  if (t < T.LAND) {
    const k = seg(t, 0.8, T.LAND);
    st.x = lerp(1300, 760, eout(k)); st.y = lerp(-350, 1330, 1 - (1 - k) * (1 - k));
    st.rot = lerp(25, 0, k); st.cape = 20; st.sy = 1.08; st.sx = 0.95;
    return st;
  }
  if (t < T.CROUCH) {
    const l = seg(t, T.LAND, T.LAND + 0.45);
    st.sy = 1 - 0.14 * bell(l); st.sx = 1 + 0.08 * bell(l);
    st.y += 1330 * 0 + (1 - st.sy) * 250;
    if (t > T.SPRAY0 && t < T.SPRAY1) { st.x += Math.sin(t * 43) * 2.5; st.y += Math.sin(t * 37) * 1.5; }
    const sh = seg(t, T.FLARE, T.FLARE + 0.7);
    st.x += 40 * bell(sh); st.y -= 50 * bell(sh); st.rot = 8 * bell(sh);
    return st;
  }
  if (t < T.LAUNCH) {
    const k = eout(seg(t, T.CROUCH, T.CROUCH + 0.5));
    st.sy = 1 - 0.13 * k; st.sx = 1 + 0.09 * k; st.y += 0.13 * k * 250; st.rot = -6 * k; st.cape = 10;
    return st;
  }
  if (t < T.CAM1 + 0.7) {
    const k = eout(seg(t, T.LAUNCH, T.LAUNCH + 0.8));
    const s2 = eio(seg(t, T.CAM1 - 0.3, T.CAM1 + 0.7));
    st.x = lerp(760, 600, k) + Math.sin(t * 3) * 25 * (1 - s2);
    st.y = lerp(1330, 900, k) + Math.sin(t * 4) * 15 * (1 - s2);
    st.x = lerp(st.x, 540, s2); st.y = lerp(st.y, HOVER_Y, s2);
    st.rot = lerp(-14 + Math.sin(t * 5) * 3, 0, s2);
    st.sy = lerp(1 + 0.15 * (1 - seg(t, T.LAUNCH, T.LAUNCH + 1.2)) + 0.04, 1, s2); st.sx = 2 - st.sy;
    st.cape = lerp(24, 10, s2); st.s = lerp(0.42, 0.38, s2);
    return st;
  }
  if (t < T.DESC0) {
    st.s = 0.38; st.cape = 10;
    st.x = 540; st.y = HOVER_Y + Math.sin(t * 2.5) * 12;
    const th = seg(t, T.THROW - 0.25, T.THROW + 0.35);
    st.y -= 50 * bell(th); st.sy = 1 + 0.1 * bell(th); st.sx = 1 - 0.06 * bell(th);
    const dodge = eio(seg(t, T.THROW, T.THROW + 0.6));
    st.x = lerp(540, 800, dodge); st.rot = 10 * bell(seg(t, T.THROW, T.THROW + 0.8));
    if (t >= T.DROP0) st.y += cam - CAM_TOP;
    if (st.y < -400) st.vis = false;
    return st;
  }
  // 내려와서 착지, 기뻐서 한 번 폴짝
  const k = seg(t, T.DESC0, T.LAND2);
  st.x = lerp(900, 700, eout(k)); st.y = lerp(-350, 1330, 1 - (1 - k) * (1 - k));
  st.rot = lerp(-12, 0, k); st.cape = lerp(22, 6, k);
  const l = seg(t, T.LAND2, T.LAND2 + 0.45);
  st.sy = 1 - 0.14 * bell(l); st.sx = 1 + 0.08 * bell(l); st.y += (1 - st.sy) * 250;
  const hop = seg(t, 27.8, 28.5);
  st.y -= 90 * bell(hop); st.sy += 0.06 * bell(hop); st.rot += -8 * bell(hop);
  return st;
}

function drawHero(st, t) {
  if (!st.vis || !hero.complete || !hero.naturalWidth) return;
  ctx.save();
  ctx.translate(st.x, st.y); ctx.rotate(st.rot * Math.PI / 180); ctx.scale(st.s * st.sx, st.s * st.sy); ctx.translate(-HCX, -HCY);
  const CX = 570, Y0 = 470, Y1 = 830;
  ctx.drawImage(hero, 0, 0, CX, HH, 0, 0, CX, HH);
  ctx.drawImage(hero, CX, 0, HW - CX, Y0, CX, 0, HW - CX, Y0);
  ctx.drawImage(hero, CX, Y1, HW - CX, HH - Y1, CX, Y1, HW - CX, HH - Y1);
  for (let x = CX; x < HW; x += 4) {   // 망토 펄럭임: 세로 띠를 물결 모양으로 밀어서 그린다
    const k = (x - CX) / (HW - CX);
    const dy = st.cape * Math.pow(k, 1.4) * Math.sin(t * 9 - k * 4);
    ctx.drawImage(hero, x, Y0, 4, Y1 - Y0, x, Y0 + dy, 4.6, Y1 - Y0);
  }
  ctx.restore();
}
function heroPoint(st, p) {
  const a = st.rot * Math.PI / 180, dx = (p[0] - HCX) * st.s * st.sx, dy = (p[1] - HCY) * st.s * st.sy;
  return [st.x + dx * Math.cos(a) - dy * Math.sin(a), st.y + dx * Math.sin(a) + dy * Math.cos(a)];
}

// ---------- 배경
function drawSky(t, cam) {
  const alt = clamp(cam / CAM_TOP), g = greenK(t);
  const top = mixc(mixc([58, 18, 34], [22, 64, 150], alt), [72, 160, 232], g);
  const bot = mixc(mixc([232, 96, 40], [140, 196, 245], alt), [206, 236, 255], g);
  const gr = ctx.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, rgb(top)); gr.addColorStop(1, rgb(bot));
  ctx.fillStyle = gr; ctx.fillRect(-60, -60, W + 120, H + 120);
  // 해
  const sun = ctx.createRadialGradient(860, 380, 10, 860, 380, 420);
  const sa = 0.25 + 0.35 * alt + 0.4 * g;
  sun.addColorStop(0, `rgba(255,248,220,${sa})`); sun.addColorStop(0.15, `rgba(255,236,180,${sa * 0.6})`); sun.addColorStop(1, "rgba(255,236,180,0)");
  ctx.fillStyle = sun; ctx.fillRect(0, 0, W, H);
}

function pine(x, y, h, col) {
  const w = h * 0.42;
  ctx.fillStyle = col;
  ctx.fillRect(x - w * 0.06, y - h * 0.18, w * 0.12, h * 0.2);
  for (let k = 0; k < 3; k++) {
    const by = y - h * (0.12 + k * 0.26), ww = w * (1 - k * 0.24), hh = h * 0.46;
    ctx.beginPath(); ctx.moveTo(x - ww / 2, by); ctx.lineTo(x, by - hh); ctx.lineTo(x + ww / 2, by); ctx.closePath(); ctx.fill();
  }
}

function drawGround(t) {
  const g = greenK(t);
  // 먼 산
  ctx.fillStyle = rgb(mixc([70, 30, 38], [112, 170, 140], g));
  ctx.beginPath(); ctx.moveTo(0, H);
  for (let x = 0; x <= W; x += 20) ctx.lineTo(x, 1170 - 70 * Math.sin(x * 0.005 + 1) - 40 * Math.sin(x * 0.013));
  ctx.lineTo(W, H); ctx.fill();
  // 뒷줄 나무
  const midCol = rgb(mixc([40, 18, 22], [52, 122, 72], g));
  for (let i = 0; i < 24; i++) pine(i * 47 + rnd(i + 500) * 20, 1350 + rnd(i + 600) * 30, 170 + rnd(i + 700) * 90, midCol);
  ctx.fillStyle = midCol; ctx.fillRect(0, 1340, W, 200);
  // 불꽃 뒤 광채
  const fa = fireAmount(t);
  if (fa > 0) {
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    const gl = ctx.createRadialGradient(360, 1420, 50, 360, 1420, 900);
    gl.addColorStop(0, `rgba(255,120,30,${0.35 * fa * fireGlobal(t)})`); gl.addColorStop(1, "rgba(255,80,20,0)");
    ctx.fillStyle = gl; ctx.fillRect(0, 500, W, H - 500);
    ctx.restore();
  }
  // 앞쪽 땅
  const gr = ctx.createLinearGradient(0, 1480, 0, H);
  gr.addColorStop(0, rgb(mixc([58, 30, 26], [96, 160, 70], g))); gr.addColorStop(1, rgb(mixc([26, 14, 14], [58, 112, 48], g)));
  ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(0, H);
  for (let x = 0; x <= W; x += 20) ctx.lineTo(x, groundY(x));
  ctx.lineTo(W, H + 80); ctx.lineTo(0, H + 80); ctx.fill();
}

function drawFrontTrees(t) {
  const col = rgb(mixc([22, 10, 14], [30, 88, 46], greenK(t)));
  pine(40, 1990, 760, col); pine(1070, 2010, 700, col);
}

function flame(x, y, h, w, t, sd) {
  if (h < 3) return;
  const f1 = Math.sin(t * 11 + sd * 7) * 0.5 + Math.sin(t * 17.3 + sd * 3) * 0.5;
  const tx = x + f1 * w * 0.35;
  const layers = [[1, "#d8261a"], [0.74, "#ff7a1a"], [0.46, "#ffd84a"]];
  for (const [sc, col] of layers) {
    const hh = h * sc * (1 + 0.07 * Math.sin(t * 13 + sd + sc * 5)), ww = w * sc, tip = lerp(x, tx, sc);
    ctx.fillStyle = col; ctx.beginPath();
    ctx.moveTo(x - ww / 2, y);
    ctx.bezierCurveTo(x - ww * 0.62, y - hh * 0.45, tip - ww * 0.15, y - hh * 0.75, tip, y - hh);
    ctx.bezierCurveTo(tip + ww * 0.18, y - hh * 0.7, x + ww * 0.62, y - hh * 0.42, x + ww / 2, y);
    ctx.quadraticCurveTo(x, y + ww * 0.22, x - ww / 2, y);
    ctx.fill();
  }
}

function drawFlames(t, filter) {
  for (const f of FLAMES) {
    if (!filter(f)) continue;
    const lv = flameLevel(f, t);
    if (lv <= 0.01) continue;
    flame(f.x, f.y, f.h * lv, f.w * Math.sqrt(lv), t, f.sd);
  }
}

function drawSmoke(t) {
  const fa = fireAmount(t);
  if (fa <= 0) return;
  for (let i = 0; i < 26; i++) {
    const ph = (t * 0.07 + rnd(i + 800)) % 1;
    const x = rnd(i + 900) * W + Math.sin(t * 0.6 + i) * 40 + ph * 120;
    const y = 1400 - ph * 1800, r = 90 + ph * 280;
    ctx.fillStyle = `rgba(52,34,36,${0.2 * bell(ph) * fa})`;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  }
}

function drawEmbers(t) {
  const fa = fireAmount(t);
  if (fa <= 0) return;
  ctx.save(); ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < 70; i++) {
    const ph = (t * (0.18 + rnd(i + 1100) * 0.2) + rnd(i + 1000)) % 1;
    const x = rnd(i + 1200) * W * 0.75 + Math.sin(t * 2 + i) * 30 + ph * 150, y = 1720 - ph * 1500;
    ctx.fillStyle = `rgba(255,${150 + (i % 5) * 20},60,${(1 - ph) * 0.9 * fa})`;
    ctx.beginPath(); ctx.arc(x, y, 2.5 + rnd(i) * 4, 0, 7); ctx.fill();
  }
  ctx.restore();
}

function cloud(x, y, s, col) {
  ctx.fillStyle = col; ctx.beginPath();
  for (const [dx, dy, r] of [[-1.1, 0.15, 0.55], [-0.5, -0.2, 0.75], [0.25, -0.35, 0.85], [0.95, 0, 0.6], [0.3, 0.25, 0.6], [-0.4, 0.3, 0.55]]) {
    ctx.moveTo(x + dx * s + r * s, y + dy * s); ctx.arc(x + dx * s, y + dy * s, r * s, 0, 7);
  }
  ctx.fill();
}
function drawClouds(t, cam) {   // 월드 좌표 (cam만큼 이미 옮겨진 상태)
  for (let i = 0; i < 14; i++) {
    const y = -1300 - rnd(i + 1300) * 1300, x = rnd(i + 1400) * W + Math.sin(t * 0.3 + i) * 20;
    if (y + cam < -300 || y + cam > H + 300) continue;
    cloud(x, y, 110 + rnd(i + 1500) * 90, `rgba(255,${235 - i * 3},${225 - i * 4},0.92)`);
  }
  // 구름 바다 (공중에서 발밑에 깔림)
  if (cam > 1500) {
    for (let i = 0; i < 12; i++) cloud(i * 100 - 20, -2200 + (i % 3) * 40 + Math.sin(t + i) * 8, 130, "rgba(255,244,236,0.97)");
    ctx.fillStyle = "rgba(255,244,236,0.97)"; ctx.fillRect(0, -2170, W, 420);
    for (let i = 0; i < 12; i++) cloud(i * 100 + 30, -1760, 120, "rgba(255,244,236,0.97)");
  }
}

// ---------- 소화기 분사
function drawSpray(t, st) {
  if (t < T.SPRAY0 || t > T.SPRAY1 + 0.6) return;
  const [nx, ny] = heroPoint(st, NOZZLE);
  const on = seg(t, T.SPRAY0, T.SPRAY0 + 0.2) * (1 - seg(t, T.SPRAY1, T.SPRAY1 + 0.2));
  for (let i = 0; i < 110; i++) {
    const life = 0.85, age = ((t - T.SPRAY0) + rnd(i + 2000) * life) % life;
    const born = t - age;
    const alive = seg(born, T.SPRAY0, T.SPRAY0 + 0.2) * (1 - seg(born, T.SPRAY1, T.SPRAY1 + 0.2));
    if (alive <= 0) continue;
    const vx = -560 - rnd(i + 2100) * 260, vy = -60 + (rnd(i + 2200) - 0.5) * 220;
    const x = nx + vx * age, y = ny + vy * age + 380 * age * age, r = 10 + age * 70;
    ctx.fillStyle = `rgba(255,255,255,${0.75 * (1 - age / life) * alive})`;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  }
  if (on > 0) { ctx.fillStyle = `rgba(255,255,255,${0.9 * on})`; ctx.beginPath(); ctx.arc(nx - 8, ny, 16, 0, 7); ctx.fill(); }
}

// 날아오를 때 소화기 바닥에서 뿜는 분사
function drawJet(t, st) {
  if (t < T.LAUNCH || t > T.CAM1 + 0.8) return;
  const [bx, by] = heroPoint(st, CAN_BOTTOM);
  const on = 1 - seg(t, T.CAM1, T.CAM1 + 0.8);
  const a = st.rot * Math.PI / 180;
  for (let i = 0; i < 60; i++) {
    const life = 0.5, age = (t + rnd(i + 2500) * life) % life, sp = 900 + rnd(i + 2600) * 500;
    const spread = (rnd(i + 2700) - 0.5) * 0.5;
    const x = bx - Math.sin(a + spread) * sp * age * 0.6, y = by + Math.cos(a + spread) * sp * age;
    ctx.fillStyle = `rgba(255,255,255,${0.8 * (1 - age / life) * on})`;
    ctx.beginPath(); ctx.arc(x, y, 12 + age * 90, 0, 7); ctx.fill();
  }
}

function drawSpeedLines(t, speed) {
  if (speed <= 0.02) return;
  ctx.strokeStyle = `rgba(255,255,255,${0.5 * speed})`; ctx.lineWidth = 5; ctx.lineCap = "round";
  for (let i = 0; i < 26; i++) {
    const x = rnd(i + 3000) * W, y = (rnd(i + 3100) * (H + 600) + t * 2600) % (H + 600) - 300, L = 160 + rnd(i + 3200) * 220;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + L * speed); ctx.stroke();
  }
}

function dust(x, y, t0, t) {
  const u = t - t0;
  if (u < 0 || u > 0.9) return;
  for (let i = 0; i < 8; i++) {
    const d = i < 4 ? -1 : 1, k = eout(u / 0.9);
    ctx.fillStyle = `rgba(200,180,170,${0.55 * (1 - u / 0.9)})`;
    ctx.beginPath(); ctx.arc(x + d * (30 + (i % 4) * 40) * k * 2, y - 20 - (i % 4) * 12 * k, 22 + 30 * k, 0, 7); ctx.fill();
  }
}

// ---------- 물폭탄
function drawBomb(x, y, r, t, stretch = 1, glow = 1) {
  if (r < 2) return;
  ctx.save(); ctx.translate(x, y);
  const halo = ctx.createRadialGradient(0, 0, r * 0.8, 0, 0, r * 1.6);
  halo.addColorStop(0, `rgba(120,210,255,${0.45 * glow})`); halo.addColorStop(1, "rgba(120,210,255,0)");
  ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(0, 0, r * 1.6, 0, 7); ctx.fill();
  ctx.scale(1 / Math.sqrt(stretch), stretch);
  ctx.beginPath();
  for (let i = 0; i <= 64; i++) {
    const a = i / 64 * Math.PI * 2;
    const rr = r * (1 + 0.035 * Math.sin(a * 3 + t * 5) + 0.02 * Math.sin(a * 5 - t * 7));
    i ? ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  const gr = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.05, 0, 0, r * 1.05);
  gr.addColorStop(0, "rgba(235,252,255,0.97)"); gr.addColorStop(0.35, "rgba(110,208,255,0.93)");
  gr.addColorStop(0.8, "rgba(30,128,224,0.93)"); gr.addColorStop(1, "rgba(12,74,168,0.95)");
  ctx.fillStyle = gr; ctx.fill();
  ctx.lineWidth = 7; ctx.strokeStyle = "rgba(210,244,255,0.7)"; ctx.stroke();
  ctx.save(); ctx.clip();
  ctx.lineWidth = r * 0.05; ctx.lineCap = "round";
  for (let k = 0; k < 4; k++) {   // 안에서 도는 물살
    ctx.strokeStyle = `rgba(255,255,255,${0.22 + 0.08 * k})`;
    ctx.beginPath(); ctx.ellipse(0, 0, r * (0.35 + k * 0.15), r * (0.18 + k * 0.09), t * (1.2 + k * 0.3) + k, 0.3, 2.2); ctx.stroke();
  }
  for (let i = 0; i < 14; i++) {   // 거품
    const ph = (t * 0.4 + rnd(i + 3300)) % 1;
    ctx.fillStyle = `rgba(255,255,255,${0.5 * bell(ph)})`;
    ctx.beginPath(); ctx.arc((rnd(i + 3400) - 0.5) * r * 1.4, r * 0.7 - ph * r * 1.4, 5 + rnd(i) * 10, 0, 7); ctx.fill();
  }
  ctx.restore();
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.beginPath(); ctx.ellipse(-r * 0.38, -r * 0.45, r * 0.2, r * 0.1, -0.6, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.arc(-r * 0.12, -r * 0.62, r * 0.05, 0, 7); ctx.fill();
  ctx.restore();
}

function drawStreams(t, bx, by, r) {   // 사방에서 물줄기가 빨려 들어간다
  const on = seg(t, T.CH0, T.CH0 + 0.5) * (1 - seg(t, T.CH1, T.THROW));
  if (on <= 0) return;
  for (let i = 0; i < 10; i++) {
    const a0 = i / 10 * Math.PI * 2 + t * 0.7;
    for (let j = 0; j < 16; j++) {
      const u = (t * 0.9 + j / 16 + rnd(i + 3500)) % 1;
      const rad = lerp(760, r * 0.9, u), ang = a0 + u * 2.4;
      ctx.fillStyle = `rgba(${170 + j * 4},232,255,${0.85 * on * Math.min(1, u * 4)})`;
      ctx.beginPath(); ctx.arc(bx + Math.cos(ang) * rad, by + Math.sin(ang) * rad * 0.85, 7 + (1 - u) * 9, 0, 7); ctx.fill();
    }
  }
}

function bombRadius(t) {
  if (t < T.CH0) return 0;
  return 330 * eout(seg(t, T.CH0, T.CH1)) + 8 * Math.sin(t * 6) * seg(t, T.CH0, T.CH1) + 40 * seg(t, T.DROP0, T.IMP);
}

// ---------- 착탄
function drawImpact(t) {
  const u = t - T.IMP;
  if (u < 0) return;
  // 퍼지는 물 덩어리
  if (u < 0.9) {
    const k = eout(u / 0.9);
    ctx.fillStyle = `rgba(80,180,250,${0.85 * (1 - k)})`;
    ctx.beginPath(); ctx.ellipse(IMPX, IMPY, 370 + 900 * k, 60 + 330 * (1 - k), 0, Math.PI, 0); ctx.fill();
  }
  // 솟구치는 물기둥
  if (u < 1.6) {
    for (let i = 0; i < 26; i++) {
      const ang = -Math.PI / 2 + (rnd(i + 3900) - 0.5) * 1.6, sp = 900 + rnd(i + 3950) * 900;
      const x = IMPX + Math.cos(ang) * sp * u, y = IMPY + Math.sin(ang) * sp * u + 900 * u * u;
      ctx.fillStyle = `rgba(${200 + (i % 3) * 20},240,255,${0.9 * (1 - u / 1.6)})`;
      ctx.beginPath(); ctx.arc(x, y, (50 + rnd(i) * 60) * (0.6 + u), 0, 7); ctx.fill();
    }
  }
  // 충격파 고리
  if (u < 0.8) {
    ctx.strokeStyle = `rgba(230,248,255,${1 - u / 0.8})`; ctx.lineWidth = 16 * (1 - u / 0.8) + 2;
    ctx.beginPath(); ctx.ellipse(IMPX, IMPY, u * 1900, u * 420, 0, 0, 7); ctx.stroke();
  }
  // 튀어 오르는 물방울 왕관
  if (u < 2.4) {
    for (let i = 0; i < 230; i++) {
      const vx = (rnd(i + 4000) - 0.5) * 2600, vy = -(700 + rnd(i + 4100) * 1900);
      const x = IMPX + vx * u * 0.9, y = IMPY + vy * u + 1300 * u * u;
      if (y > H + 50) continue;
      ctx.fillStyle = `rgba(${150 + (i % 4) * 25},225,255,${0.95 * (1 - u / 2.4)})`;
      const r = 6 + rnd(i + 4200) * 14;
      ctx.beginPath(); ctx.ellipse(x, y, r * 0.8, r * 1.3, Math.atan2(vy + 2600 * u, vx), 0, 7); ctx.fill();
    }
  }
  // 빗방울
  if (u > 0.4 && u < 4.5) {
    const a = 0.5 * bell(seg(u, 0.4, 4.5));
    ctx.strokeStyle = `rgba(210,238,255,${a})`; ctx.lineWidth = 3;
    for (let i = 0; i < 90; i++) {
      const x = rnd(i + 4300) * W, y = (rnd(i + 4400) * H + t * 2200) % H;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 8, y + 50); ctx.stroke();
    }
  }
}

function drawSteam(t) {
  for (const f of FLAMES) {
    const v = t - f.arr;
    if (v < 0 || v > 4.5) continue;
    for (let k = 0; k < 3; k++) {
      const w = v - k * 0.25;
      if (w < 0) continue;
      const a = 0.6 * (1 - w / 4.5);
      ctx.fillStyle = `rgba(245,248,250,${a})`;
      ctx.beginPath(); ctx.arc(f.x + Math.sin(w * 2 + f.sd) * 30 + k * 20, f.y - 40 - w * 170 - k * 50, 40 + w * 60, 0, 7); ctx.fill();
    }
  }
  const u = t - T.IMP;
  if (u > 0 && u < 6) { ctx.fillStyle = `rgba(240,246,250,${0.45 * bell(u / 6) * (u < 1 ? u : 1)})`; ctx.fillRect(0, 0, W, H); }
}

// ---------- 끝나고
function drawRainbow(t) {
  const a = 0.55 * seg(t, 25.0, 26.8);
  if (a <= 0) return;
  const cols = ["#ff5a5a", "#ff9f40", "#ffe14a", "#6ee06e", "#4ab8ff", "#5a6bff", "#a15aff"];
  ctx.save(); ctx.globalAlpha = a; ctx.lineWidth = 26;
  cols.forEach((c, i) => { ctx.strokeStyle = c; ctx.beginPath(); ctx.arc(540, 1500, 900 - i * 26, Math.PI, 0); ctx.stroke(); });
  ctx.restore();
}
function drawSparkles(t) {
  const a = seg(t, 24.5, 25.5);
  if (a <= 0) return;
  for (let i = 0; i < 24; i++) {
    const x = rnd(i + 5000) * W, y = groundY(x) + 40 + rnd(i + 5100) * 300;
    const s = (8 + rnd(i) * 12) * Math.max(0, Math.sin(t * 3 + i * 1.7)) * a;
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.beginPath(); ctx.moveTo(x, y - s * 2); ctx.lineTo(x + s * 0.4, y); ctx.lineTo(x, y + s * 2); ctx.lineTo(x - s * 0.4, y); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x - s * 2, y); ctx.lineTo(x, y + s * 0.4); ctx.lineTo(x + s * 2, y); ctx.lineTo(x, y - s * 0.4); ctx.closePath(); ctx.fill();
  }
}

// ---------- 자막
const CAPS = [[0.4, 2.9, "앗, 산불이다!"], [3.3, 6.5, "소화기 발사!"], [7.1, 9.4, "불이 너무 커..."], [9.6, 11.6, "그렇다면!"],
  [15.0, 19.0, "초대형 물폭탄 충전!"], [19.2, 21.0, "받아라~!"], [27.2, 29.9, "산불 진화 완료!"]];
function drawCaption(t) {
  for (const [a, b, s] of CAPS) {
    if (t < a || t > b) continue;
    const pop = eout(seg(t, a, a + 0.25)), out = 1 - seg(t, b - 0.25, b);
    ctx.save(); ctx.globalAlpha = out; ctx.translate(540, 215); ctx.scale(0.6 + 0.4 * pop, 0.6 + 0.4 * pop);
    ctx.font = '96px "Do Hyeon", sans-serif'; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.lineJoin = "round"; ctx.lineWidth = 18; ctx.strokeStyle = "#1b1830"; ctx.strokeText(s, 0, 0);
    ctx.fillStyle = s.includes("완료") ? "#ffe14a" : "#ffffff"; ctx.fillText(s, 0, 0);
    ctx.restore();
  }
}
function drawBang(t, st) {
  const k = seg(t, T.FLARE, T.FLARE + 1.1);
  if (k <= 0 || k >= 1) return;
  const [x, y] = heroPoint(st, [560, 40]);
  ctx.save(); ctx.translate(x + 30, y - 40); ctx.scale(eout(Math.min(1, k * 5)), eout(Math.min(1, k * 5)));
  ctx.font = '150px "Do Hyeon", sans-serif'; ctx.textAlign = "center"; ctx.lineJoin = "round";
  ctx.lineWidth = 16; ctx.strokeStyle = "#1b1830"; ctx.strokeText("!", 0, 0); ctx.fillStyle = "#ffd84a"; ctx.fillText("!", 0, 0);
  ctx.restore();
}

// ---------- 한 프레임
function drawAt(t) {
  const cam = camY(t), speed = clamp(Math.abs(camY(t + 0.03) - cam) / 0.03 / 2200);
  const st = heroState(t, cam);
  ctx.save();
  const u = t - T.IMP;
  if (u > 0 && u < 1.2) { const s = 34 * Math.exp(-u * 4); ctx.translate(Math.sin(t * 90) * s, Math.cos(t * 77) * s); }
  drawSky(t, cam);
  ctx.save(); ctx.translate(0, cam);
  if (t > 24.8) drawRainbow(t);
  if (cam < H + 400) {
    drawSmoke(t);
    drawGround(t);
    drawFlames(t, f => f.y < 1450);
    drawFlames(t, f => f.y >= 1450 && f.y < 1560);
    drawSparkles(t);
  }
  drawClouds(t, cam);
  ctx.restore();

  // 월드에 붙은 먼지는 cam=0 구간에만 나온다
  dust(760, 1545, T.LAND, t); dust(760, 1545, T.LAUNCH, t); dust(700, 1545, T.LAND2, t);
  drawJet(t, st);
  if (!(t >= T.DROP0 && t < T.IMP)) drawHero(st, t);
  drawSpray(t, st);
  if (cam < H) { ctx.save(); ctx.translate(0, cam); drawFlames(t, f => f.y >= 1560); drawFrontTrees(t); drawEmbers(t); ctx.restore(); }

  // 물폭탄
  if (t >= T.CH0 && t < T.IMP) {
    let bx = 540, by = BOMB_Y, stretch = 1;
    if (t >= T.DROP0) { by = bombWorldY(t) + cam; stretch = 1 + 0.18 * seg(t, T.DROP0, T.IMP); }
    else if (t > T.CH1) by = BOMB_Y - 30 * bell(seg(t, T.THROW - 0.25, T.THROW + 0.35));
    const r = bombRadius(t);
    if (t < T.THROW + 0.3) {   // 모으는 동안 주인공 주위 파란 빛
      const [hx, hy] = [st.x, st.y];
      const au = ctx.createRadialGradient(hx, hy, 50, hx, hy, 320);
      au.addColorStop(0, `rgba(140,220,255,${0.35 * seg(t, T.CH0, T.CH0 + 1)})`); au.addColorStop(1, "rgba(140,220,255,0)");
      ctx.fillStyle = au; ctx.fillRect(hx - 320, hy - 320, 640, 640);
    }
    drawStreams(t, bx, by, r);
    drawBomb(bx, by, r, t, stretch, 1);
    if (t >= T.DROP0) {   // 떨어질 때 위로 흩날리는 물방울
      for (let i = 0; i < 20; i++) {
        const ph = (t * 3 + rnd(i + 5500)) % 1;
        ctx.fillStyle = `rgba(190,235,255,${0.8 * (1 - ph)})`;
        ctx.beginPath(); ctx.arc(bx + (rnd(i + 5600) - 0.5) * r * 1.4, by - r * stretch + 20 - ph * 260, 8, 0, 7); ctx.fill();
      }
    }
  }
  drawSpeedLines(t, Math.max(speed, t > T.DESC0 && t < T.LAND2 ? 0.4 * (1 - seg(t, 26.4, T.LAND2)) : 0));
  if (t >= T.DROP0 && t < T.IMP) drawHero(st, t);
  if (cam < H) { ctx.save(); ctx.translate(0, cam); drawImpact(t); drawSteam(t); ctx.restore(); }
  drawBang(t, st);
  ctx.restore();

  if (u > 0 && u < 0.4) { ctx.fillStyle = `rgba(255,255,255,${0.9 * (1 - u / 0.4)})`; ctx.fillRect(0, 0, W, H); }
  drawCaption(t);
  const fo = seg(t, 29.3, 30) + (1 - seg(t, 0, 0.35));
  if (fo > 0) { ctx.fillStyle = `rgba(0,0,0,${clamp(fo)})`; ctx.fillRect(0, 0, W, H); }
}
