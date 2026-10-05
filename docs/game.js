// Vamos page: map drawing, input, playback and results. Rules live in phys.js.
// ---------- state ----------
const $ = id => document.getElementById(id);
const cv = $('map'), ctx = cv.getContext('2d');
const S = { trip: null, tripNo: 1, rules: 'classic', mode: 'car', pts: [], legs: [], view: { lon: 0, lat: 20, ppd: 4 }, best: null, playing: false, showBest: false, anim: null };
let baseImg, W = 0, H = 0, DPR = 1;

function recompute() {
  S.legs = finalizeLegs(S.pts.slice(1).map((p, k) => evalLeg(p.mode, S.pts[k].ll, p.ll)));
}
const tripTotal = () => S.legs.reduce((s, l) => s + l.total, 0);
const atEnd = () => S.pts.length > 1 && S.pts[S.pts.length - 1].end;

// ---------- view / projection (equirectangular) ----------
function toXY(la, lo) { const v = S.view; return [W / 2 + (lo - v.lon) * v.ppd, H / 2 - (la - v.lat) * v.ppd]; }
function toLL(x, y) { const v = S.view; return [v.lat - (y - H / 2) / v.ppd, v.lon + (x - W / 2) / v.ppd]; }
function clampView() {
  const v = S.view, minP = Math.max(W / 360, H / 180);
  v.ppd = Math.min(Math.max(v.ppd, minP), 400);
  const hw = W / 2 / v.ppd, hh = H / 2 / v.ppd;
  v.lon = Math.min(Math.max(v.lon, -180 + hw), 180 - hw);
  v.lat = Math.min(Math.max(v.lat, -90 + hh), 90 - hh);
}
function fitTrip() {
  const t = S.trip, pad = 18;
  const lo1 = Math.min(t.a[1], t.b[1]) - pad, lo2 = Math.max(t.a[1], t.b[1]) + pad;
  const la1 = Math.min(t.a[0], t.b[0]) - pad, la2 = Math.max(t.a[0], t.b[0]) + pad;
  S.view.ppd = Math.min(W / (lo2 - lo1), H / (la2 - la1));
  S.view.lon = (lo1 + lo2) / 2; S.view.lat = (la1 + la2) / 2;
  clampView(); draw();
}
function zoomAt(f, x, y) {
  const before = toLL(x, y); S.view.ppd *= f; clampView();
  const after = toLL(x, y); S.view.lon += before[1] - after[1]; S.view.lat += before[0] - after[0];
  clampView(); draw();
}

// ---------- drawing ----------
function resize() {
  const r = cv.getBoundingClientRect(); DPR = window.devicePixelRatio || 1;
  W = r.width; H = r.height; cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
  clampView(); draw();
}
function pathLine(pts, color, dash, width) {
  ctx.setLineDash([]); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); pts.forEach((p, k) => { const [x, y] = toXY(p[0], p[1]); k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
  ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = width + 4; ctx.stroke();
  ctx.setLineDash(dash.map(d => d * 1.4)); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke(); ctx.setLineDash([]);
}
function pin(la, lo, label, color) {
  const [x, y] = toXY(la, lo);
  ctx.fillStyle = color; ctx.strokeStyle = '#1c2a33'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x, y - 14, 9, Math.PI * 0.85, Math.PI * 2.15); ctx.lineTo(x, y); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y - 14, 3.5, 0, 7); ctx.fill();
  ctx.font = '700 13px Atkinson Hyperlegible, system-ui, sans-serif'; ctx.textAlign = 'center';
  ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(251,248,241,.95)'; ctx.strokeText(label, x, y - 28); ctx.fillStyle = '#1c2a33'; ctx.fillText(label, x, y - 28);
}
function draw() {
  if (!W || !S.trip) return;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = '#cfe4ea'; ctx.fillRect(0, 0, W, H);
  if (baseImg) {
    const [x0, y0] = toXY(90, -180), [x1, y1] = toXY(-90, 180);
    ctx.imageSmoothingEnabled = true; ctx.drawImage(baseImg, x0, y0, x1 - x0, y1 - y0);
  }
  // borders
  ctx.strokeStyle = 'rgba(28,42,51,.35)'; ctx.lineWidth = 0.8; ctx.setLineDash([]); ctx.beginPath();
  for (const l of BORDERS) { let X = 0, Y = 0; for (let k = 0; k < l.length; k += 2) { X += l[k]; Y += l[k + 1]; const [x, y] = toXY(Y / 20, X / 20); k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } }
  ctx.stroke();
  // spaceports
  const rules = RULES[S.rules];
  if (rules.modes.includes('rocket')) {
    ctx.font = `${S.mode === 'rocket' || S.mode === 'moon' ? 20 : 14}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const s of SITES) { const [x, y] = toXY(s[1], s[2]); ctx.fillText('🚀', x, y); }
    ctx.textBaseline = 'alphabetic';
  }
  // best route
  if (S.best && S.showBest) for (const r of S.best.runs) {
    const M = MODES[r.mode];
    pathLine(M.terrain === 'space' ? arc(r.pts[0], r.pts[r.pts.length - 1]) : r.pts, M.color, [2, 3], 3);
  }
  // player legs
  S.legs.forEach(l => {
    const M = MODES[l.mode], pts = M.terrain === 'space' ? arc(l.a, l.b) : [l.a, l.b];
    pathLine(pts, l.error ? '#c8402f' : M.color, l.error ? [4, 4] : M.dash, 5);
    const [mx, my] = toXY(...pts[Math.floor(pts.length / 2)]);
    ctx.font = '18px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(251,248,241,.95)'; ctx.beginPath(); ctx.arc(mx, my, 14, 0, 7); ctx.fill();
    ctx.strokeStyle = l.error ? '#c8402f' : M.color; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#000'; ctx.fillText(l.error ? '⚠️' : M.icon, mx, my + 1); ctx.textBaseline = 'alphabetic';
  });
  S.pts.forEach((p, k) => { if (k && !p.end) { const [x, y] = toXY(...p.ll); ctx.fillStyle = '#fff'; ctx.strokeStyle = '#1c2a33'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 5, 0, 7); ctx.fill(); ctx.stroke(); } });
  pin(S.trip.a[0], S.trip.a[1], S.trip.from.split(',')[0], '#2f7a45');
  pin(S.trip.b[0], S.trip.b[1], S.trip.to.split(',')[0], '#c8402f');
  if (S.anim) drawTraveller(S.anim);
}
// Rockets fly as a lifted arc on the flat map.
function arc(a, b) {
  const out = [], n = 40, lift = Math.min(25, hav(a[0], a[1], b[0], b[1]) / 400);
  for (let k = 0; k <= n; k++) { const t = k / n; out.push([a[0] + (b[0] - a[0]) * t + Math.sin(Math.PI * t) * lift, a[1] + (b[1] - a[1]) * t]); }
  return out;
}

// ---------- stick-figure traveller ----------
function drawTraveller(A) {
  const [x, y] = toXY(A.ll[0], A.ll[1]), M = MODES[A.mode], t = A.phase;
  ctx.save(); ctx.translate(x, y - 6); ctx.scale(1.4, 1.4);
  ctx.strokeStyle = '#1c2a33'; ctx.fillStyle = '#1c2a33'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
  const human = M.human, swing = human ? Math.sin(t * (A.mode === 'run' ? 18 : 10)) * 0.6 : 0.15;
  const swim = A.mode === 'swim';
  if (swim) ctx.rotate(-1.35);
  // vehicle bubble behind the figure
  if (!human || A.mode === 'bike' || A.mode === 'skate') { ctx.font = '26px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(M.icon, 0, 10); }
  ctx.beginPath(); ctx.arc(0, -26, 5, 0, 7); ctx.fillStyle = '#fbf8f1'; ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, -21); ctx.lineTo(0, -8);                       // body
  ctx.moveTo(0, -18); ctx.lineTo(Math.sin(swing) * 9, -10 + Math.cos(swing) * 2); // arm
  ctx.moveTo(0, -18); ctx.lineTo(-Math.sin(swing) * 9, -10 + Math.cos(swing) * 2);
  ctx.moveTo(0, -8); ctx.lineTo(Math.sin(swing) * 7, 2);                         // legs
  ctx.moveTo(0, -8); ctx.lineTo(-Math.sin(swing) * 7, 2);
  ctx.stroke();
  if (A.sick) { ctx.font = '14px system-ui, sans-serif'; ctx.fillText(A.sick, 10, -34); }
  ctx.restore();
}

// ---------- UI ----------
function renderModes() {
  const allowed = RULES[S.rules].modes;
  if (!allowed.includes(S.mode)) S.mode = allowed[0];
  $('modes').innerHTML = MODE_KEYS.filter(m => allowed.includes(m)).map(m => {
    const M = MODES[m];
    const sp = M.terrain === 'space' ? `${M.setup}h prep` : m === 'balloon' ? 'wind-powered' : `${M.speed} km/h · ${M.hours}h/day`;
    return `<button class="mode" aria-pressed="${m === S.mode}" data-m="${m}"><span class="ic">${M.icon}</span>${M.name}<span class="sp">${sp}</span><span class="sw" style="background:${M.color}"></span></button>`;
  }).join('');
  $('modes').querySelectorAll('.mode').forEach(b => b.onclick = () => { S.mode = b.dataset.m; renderModes(); draw(); });
}
function renderLegs() {
  const el = $('legs');
  if (!S.legs.length) {
    el.innerHTML = `<li class="empty">Start at ${S.trip.from.split(',')[0]}. Pick a way to travel and click the map to add your first stop.</li>`;
  } else el.innerHTML = S.legs.map((l, k) => {
    const M = MODES[l.mode];
    return `<li class="${l.error ? 'bad' : ''}"><span>${M.icon}</span><span>${M.name} · ${fmtKm(l.km)}</span><span class="t">${fmtH(l.total)}</span>${l.error ? `<span class="why">${l.error}</span>` : l.events.length ? `<span class="why">${l.events.join(' · ')}</span>` : ''}</li>`;
  }).join('');
  $('total').textContent = fmtH(tripTotal());
  const bad = S.legs.some(l => l.error);
  $('go').disabled = !atEnd() || bad || S.playing;
  $('undo').disabled = S.pts.length <= 1 || S.playing;
  $('clear').disabled = S.pts.length <= 1 || S.playing;
  $('hint').textContent = S.playing ? '' : bad ? 'Fix the red legs before you go.' : atEnd() ? 'You made it. Press Vamos! to watch the trip and get graded.' :
    `Click near ${S.trip.to.split(',')[0]} to finish. Scroll or pinch to zoom, drag to pan.`;
}
function setTrip(idx, no) {
  const t = TRIPS[idx % TRIPS.length];
  S.trip = { from: t[0], a: [t[1], t[2]], to: t[3], b: [t[4], t[5]], idx };
  S.tripNo = no; S.pts = [{ ll: S.trip.a }]; S.legs = []; S.best = null; S.showBest = false; S.anim = null;
  $('fromName').textContent = t[0]; $('toName').textContent = t[3];
  $('fromLL').textContent = fmtLL(t[1], t[2]); $('toLL').textContent = fmtLL(t[4], t[5]);
  $('tripNo').textContent = no ? `Trip #${no}` : 'Practice trip';
  $('result').hidden = true; $('result').innerHTML = '';
  renderLegs(); fitTrip();
}
function addPoint(ll) {
  if (S.playing || atEnd()) return;
  const m = S.mode, M = MODES[m];
  const end = S.trip.b, toEnd = hav(ll[0], ll[1], end[0], end[1]);
  const near = Math.hypot(...[toXY(...ll), toXY(...end)].reduce((a, b) => [a[0] - b[0], a[1] - b[1]]));
  let p = { ll, mode: m };
  if (M.terrain === 'space') { const s = nearestSite(ll[0], ll[1]).site; p.ll = [s[1], s[2]]; }
  else if (toEnd < 60 || (near < 12 && toEnd < 250)) p = { ll: end, mode: m, end: true };
  S.pts.push(p); recompute(); S.result = null; $('result').hidden = true; S.best = null; renderLegs(); draw();
}

// ---------- solver worker ----------
let worker;
function getWorker() {
  if (worker) return worker;
  const inline = window.VAMOS_INLINE;
  worker = inline
    ? new Worker(URL.createObjectURL(new Blob([inline.physSrc + '\n' + inline.workerSrc], { type: 'text/javascript' })))
    : new Worker('worker.js');
  worker.postMessage({ grid: GRIDBUF.slice().buffer });
  return worker;
}
function solveAsync(a, b, modes) {
  return new Promise(res => { const w = getWorker(), id = Math.random(); const h = e => { if (e.data.id === id) { w.removeEventListener('message', h); res(e.data.r); } }; w.addEventListener('message', h); w.postMessage({ id, a, b, modes }); });
}

// ---------- playback ----------
function toast(msg, ms = 1800) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => t.hidden = true, ms); }
async function go() {
  if (!atEnd()) return;
  S.playing = true; renderLegs();
  const rules = RULES[S.rules];
  const bestP = solveAsync(S.trip.a, S.trip.b, rules.modes);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  $('clock').hidden = false;
  let clock = 0;
  for (const l of S.legs) {
    const M = MODES[l.mode], pts = M.terrain === 'space' ? arc(l.a, l.b) : [l.a, l.b];
    const fun = l.events.find(e => !/sleep and rest|to (rent|hire|catch|board|inflate)/.test(e));
    toast(`${M.icon} ${M.name} · ${fmtKm(l.km)} · ${fmtH(l.total)}${fun ? ' · ' + fun : ''}`, 2600);
    const dur = reduce ? 200 : Math.min(3800, 1300 + l.km * 0.25), t0 = performance.now();
    await new Promise(done => {
      const step = now => {
        const f = Math.min(1, Math.max(0, (now - t0) / dur)), pos = f * (pts.length - 1), k = Math.min(pts.length - 2, Math.floor(pos)), r = pos - k;
        const ll = [pts[k][0] + (pts[k + 1][0] - pts[k][0]) * r, pts[k][1] + (pts[k + 1][1] - pts[k][1]) * r];
        S.anim = { ll, mode: l.mode, phase: now / 1000, sick: l.mode === 'ferry' && l.extra ? '🤢' : l.extra && M.human ? '😵' : '' };
        $('clock').textContent = `🕑 ${fmtH(clock + l.total * f)}`;
        draw(); f < 1 ? requestAnimationFrame(step) : done();
      };
      requestAnimationFrame(step);
    });
    clock += l.total;
  }
  $('clock').textContent = `🏁 ${fmtH(clock)}`;
  toast('Calculating the best route…', 8000);
  const best = await bestP;
  $('toast').hidden = true;
  S.best = best; S.showBest = !!best; S.playing = false;
  showResult(best); renderLegs(); draw();
  setTimeout(() => { $('clock').hidden = true; }, 2500);
}
function showResult(best) {
  const rules = RULES[S.rules], you = tripTotal();
  let dq = '';
  if (rules.min) {
    const per = {}; S.legs.forEach(l => per[l.mode] = (per[l.mode] || 0) + l.moving);
    const missing = rules.modes.filter(m => (per[m] || 0) < rules.min);
    if (missing.length) dq = `Disqualified: you need at least ${rules.min}h of ${missing.map(m => MODES[m].name.toLowerCase()).join(' and ')}.`;
  }
  const par = best ? best.hours : null;
  const g = dq ? 'DQ' : par ? grade(par / you) : '?';
  const icons = []; S.legs.forEach(l => { if (icons[icons.length - 1] !== MODES[l.mode].icon) icons.push(MODES[l.mode].icon); });
  const share = `Vamos ${S.tripNo ? '#' + S.tripNo : '(practice)'} · ${rules.name}\n${S.trip.from.split(',')[0]} → ${S.trip.to.split(',')[0]}\n${icons.join('')} ${fmtH(you)}\nBest route ${par ? fmtH(par) : '—'} · Grade ${g}`;
  const bestLine = best ? best.runs.filter(r => r.km >= 5 || MODES[r.mode].terrain === 'space').map(r => `${MODES[r.mode].icon} ${fmtKm(r.km)}`).join(' → ') : 'No route exists under these rules.';
  const note = g === 'A+' ? 'You beat the computer. Its route assumes full rest days, so short hops can sneak under it.' : '';
  $('result').innerHTML = `<div class="result">
    <div class="grade"><div class="g">${g}</div><div class="cmp">
      <span>Your trip</span><span class="t">${fmtH(you)}</span>
      <span>Best route</span><span class="t">${par ? fmtH(par) : '—'}</span></div></div>
    ${dq ? `<p class="hint" style="color:var(--stamp);font-weight:700">${dq}</p>` : ''}
    ${note ? `<p class="hint">${note}</p>` : ''}
    <div class="label">Best route (dotted on the map)</div><p class="hint">${bestLine}</p>
    <div class="label">Share</div><pre class="share" id="shareText">${share}</pre>
    <div class="row"><button class="btn" id="copy">Copy result</button><button class="btn" id="toggleBest">${S.showBest ? 'Hide' : 'Show'} best route</button><button class="btn" id="again">Try again</button></div>
  </div>`;
  $('result').hidden = false;
  $('copy').onclick = () => {
    const done = () => { $('copy').textContent = 'Copied'; };
    try { navigator.clipboard.writeText(share).then(done, () => selectShare()); } catch { selectShare(); }
  };
  $('toggleBest').onclick = () => { S.showBest = !S.showBest; $('toggleBest').textContent = `${S.showBest ? 'Hide' : 'Show'} best route`; draw(); };
  $('again').onclick = () => { S.pts = [{ ll: S.trip.a }]; S.legs = []; S.best = null; S.anim = null; $('result').hidden = true; renderLegs(); draw(); };
  $('result').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
function selectShare() { const r = document.createRange(); r.selectNodeContents($('shareText')); const s = getSelection(); s.removeAllRanges(); s.addRange(r); $('copy').textContent = 'Press Ctrl+C'; }

// ---------- input ----------
const ptrs = new Map(); let drag = null, pinch = null;
cv.addEventListener('pointerdown', e => {
  cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.offsetX, e.offsetY]);
  if (ptrs.size === 1) drag = { x: e.offsetX, y: e.offsetY, lon: S.view.lon, lat: S.view.lat, moved: false };
  if (ptrs.size === 2) { const [p, q] = [...ptrs.values()]; pinch = { d: Math.hypot(p[0] - q[0], p[1] - q[1]) }; drag = null; }
});
cv.addEventListener('pointermove', e => {
  const [la, lo] = toLL(e.offsetX, e.offsetY);
  if (e.pointerType === 'mouse' && la > -90 && la < 90) {
    const i = cellOf(la, lo), land = isLand(i);
    $('hover').hidden = false;
    $('hover').textContent = `${fmtLL(la, lo)} · ${land ? `land · ~${elevM(i).toLocaleString()} m${roughM(i) > 250 ? ' · mountains' : roughM(i) > 100 ? ' · hilly' : ''}` : 'water'}`;
  }
  if (!ptrs.has(e.pointerId)) return;
  ptrs.set(e.pointerId, [e.offsetX, e.offsetY]);
  if (pinch && ptrs.size === 2) {
    const [p, q] = [...ptrs.values()], d = Math.hypot(p[0] - q[0], p[1] - q[1]);
    zoomAt(d / pinch.d, (p[0] + q[0]) / 2, (p[1] + q[1]) / 2); pinch.d = d; return;
  }
  if (drag) {
    const dx = e.offsetX - drag.x, dy = e.offsetY - drag.y;
    if (Math.hypot(dx, dy) > 6) drag.moved = true;
    if (drag.moved) { S.view.lon = drag.lon - dx / S.view.ppd; S.view.lat = drag.lat + dy / S.view.ppd; clampView(); draw(); cv.style.cursor = 'grabbing'; }
  }
});
function endPtr(e) {
  if (drag && !drag.moved && ptrs.size === 1 && e.type === 'pointerup') addPoint(toLL(e.offsetX, e.offsetY));
  ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null; if (!ptrs.size) drag = null; cv.style.cursor = 'crosshair';
}
cv.addEventListener('pointerup', endPtr); cv.addEventListener('pointercancel', endPtr);
cv.addEventListener('pointerleave', () => { $('hover').hidden = true; });
cv.addEventListener('wheel', e => { e.preventDefault(); zoomAt(Math.exp(-e.deltaY * 0.0015), e.offsetX, e.offsetY); }, { passive: false });
$('zin').onclick = () => zoomAt(1.5, W / 2, H / 2);
$('zout').onclick = () => zoomAt(1 / 1.5, W / 2, H / 2);
$('zfit').onclick = fitTrip;
$('undo').onclick = () => { if (S.pts.length > 1) { S.pts.pop(); recompute(); S.best = null; $('result').hidden = true; renderLegs(); draw(); } };
$('clear').onclick = () => { S.pts = [{ ll: S.trip.a }]; recompute(); S.best = null; $('result').hidden = true; renderLegs(); draw(); };
$('go').onclick = go;
$('newTrip').onclick = () => { let k; do { k = Math.floor(Math.random() * TRIPS.length); } while (k === S.trip.idx); setTrip(k, 0); };
$('rules').innerHTML = Object.entries(RULES).map(([k, r]) => `<option value="${k}">${r.name}</option>`).join('');
$('rules').onchange = e => { S.rules = e.target.value; $('rulesNote').textContent = RULES[S.rules].note; renderModes(); recompute(); S.best = null; $('result').hidden = true; renderLegs(); draw(); };
window.addEventListener('resize', resize);

// ---------- boot ----------
let GRIDBUF, BORDERS = [];
async function gunzipIfNeeded(bytes) {
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return bytes; // the server may already have decoded it
  const ds = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(ds).arrayBuffer());
}
async function loadAssets() {
  const inline = window.VAMOS_INLINE; // set by tools/build_preview.py for the single-file preview
  let bytes, baseSrc;
  if (inline) {
    bytes = Uint8Array.from(atob(inline.grid), c => c.charCodeAt(0));
    baseSrc = inline.base; BORDERS = inline.borders;
  } else {
    const [g, b] = await Promise.all([fetch('data/grid.bin'), fetch('data/borders.json')]);
    if (!g.ok || !b.ok) throw new Error('Map data failed to load');
    bytes = new Uint8Array(await g.arrayBuffer()); BORDERS = await b.json();
    baseSrc = 'data/basemap.webp';
  }
  GRIDBUF = await gunzipIfNeeded(bytes);
  setGrid(GRIDBUF);
  baseImg = new Image(); baseImg.onload = draw; baseImg.src = baseSrc;
}
(async () => {
  try { await loadAssets(); }
  catch (err) { $('hint').textContent = 'The map data did not load. Check your connection and reload the page.'; return; }
  $('rulesNote').textContent = RULES[S.rules].note;
  renderModes();
  resize();
  const d = dailyTrip(Date.now());
  setTrip(d.idx, d.no);
})();
