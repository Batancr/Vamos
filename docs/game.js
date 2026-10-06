// Vamos page: map drawing, input, playback and results. Rules live in phys.js.
// ---------- state ----------
const $ = id => document.getElementById(id);
const cv = $('map'), ctx = cv.getContext('2d');
const S = { trip: null, tripNo: 1, seed: 1, fair: true, rules: 'classic', mode: 'car', pts: [], legs: [], lines: [], sel: null, nextLine: 1, tool: 'tap', stroke: null, challenge: null, finished: false, ghosts: true, picking: null, char: 'none', show: { ports: true, hills: true, balloons: true, desert: false, grass: false, jungle: false, ice: false }, markers: [], view: { lon: 0, lat: 20, ppd: 4 }, best: null, playing: false, showBest: false, anim: null, progress: null };
let baseImg, W = 0, H = 0, DPR = 1;

// ---------- progress (stats and badges), kept in this browser only ----------
const PKEY = 'vamos.progress';
function loadProgress() {
  try { const o = JSON.parse(localStorage.getItem(PKEY) || 'null'); if (o && typeof o.km === 'object') return { ...emptyProgress(), ...o }; } catch {}
  return emptyProgress();
}
function saveProgress() { try { localStorage.setItem(PKEY, JSON.stringify(S.progress)); } catch {} if (window.Online) Online.progressChanged(); }
// Fair mode: everyone travels at base speed. Otherwise your earned stats apply, to you and to the best route.
const boost = () => S.fair ? {} : boostsFrom(S.progress);

function recompute() {
  const b = boost();
  const allowed = allowedModes(S.rules);
  S.legs = finalizeLegs(S.pts.slice(1).map((p, k) => evalLeg(p.mode, S.pts[k].ll, p.ll, b)), S.seed);
  for (const l of S.legs) if (!allowed.includes(l.mode) && !l.error) l.error = `${MODES[l.mode].name} isn't allowed in ${RULES[S.rules].name}. Tap the line and pick another way to travel.`;
  S.lines = linesOf(S.legs, S.pts);
  if (S.sel != null && !S.lines.some(L => L.id === S.sel)) S.sel = null;
}
// Something changed the route: drop the old result and redraw.
function routeChanged() { recompute(); S.best = null; $('result').hidden = true; renderModes(); renderLegs(); draw(); if (window.Online) Online.tripChanged(); }
const legPts = l => MODES[l.mode].terrain === 'space' ? arc(l.a, l.b) : [l.a, l.b];
const tripTotal = () => S.legs.reduce((s, l) => s + l.total, 0);
const atEnd = () => S.pts.length > 1 && S.pts[S.pts.length - 1].end;

// ---------- map layers: satellite and streets ----------
// Satellite: EOxCloudless Sentinel-2 mosaic in plain lat/lon tiles (the WGS84 tile set), which matches this map's
// projection, so tiles draw straight onto the canvas. Level z has 2^(z+1) × 2^z tiles of 256 px, each 180/2^z° wide.
// Licence: CC BY-NC-SA 4.0, free for non-commercial use with the credit shown on the map (cloudless.eox.at).
// Streets: OpenStreetMap's standard tiles (Web Mercator), redrawn in strips so they line up with this flat map.
// Their tile policy allows interactive use in apps with the credit shown; no bulk or offline downloading.
const LAYERS = window.VAMOS_LAYERS || {
  sat: { name: 'Satellite', proj: 'wgs84', maxZ: 13, tile: (z, r, c) => `https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024/default/WGS84/${z}/${r}/${c}.jpg`,
    credit: '<a href="https://cloudless.eox.at" target="_blank" rel="noopener">EOxCloudless</a> by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2024)' },
  streets: { name: 'Streets', proj: 'merc', maxZ: 18, tile: (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`,
    credit: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors' },
};
const MAX_PPD = 12000; // about 9 m per screen pixel, the satellite imagery's full detail
const TILES_FROM = 10; // the built-in relief map is sharp enough below this zoom (pixels per degree)
let layer = 'sat'; try { layer = localStorage.getItem('vamos.layer') || 'sat'; } catch {}
if (layer !== 'relief' && !LAYERS[layer]) layer = 'sat';
const tiles = new Map();
let redrawQueued = false;
function queueDraw() { if (!redrawQueued) { redrawQueued = true; requestAnimationFrame(() => { redrawQueued = false; draw(); }); } }
function getTile(L, z, a, b) {
  const k = `${L}/${z}/${a}/${b}`;
  let t = tiles.get(k);
  if (!t) {
    t = { img: new Image(), ok: false };
    t.img.onload = () => { t.ok = true; queueDraw(); };
    t.img.src = LAYERS[L].tile(z, a, b);
    tiles.set(k, t);
    if (tiles.size > 800) tiles.delete(tiles.keys().next().value); // forget the oldest tiles
  }
  return t;
}
const mercLat = (y, n) => Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n))) * 180 / Math.PI;
const mercY = (lat, n) => { const r = Math.max(-85.05, Math.min(85.05, lat)) * Math.PI / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n; };
// Draws the active tile layer; returns how many tiles it drew.
function drawTiles() {
  const L = LAYERS[layer], v = S.view, [la0, lo0] = toLL(0, 0), [la1, lo1] = toLL(W, H);
  let drawn = 0;
  if (L.proj === 'wgs84') {
    const z = Math.max(0, Math.min(L.maxZ, Math.ceil(Math.log2(v.ppd * DPR * 180 / 256))));
    const span = 180 / 2 ** z;
    const r0 = Math.max(0, Math.floor((90 - la0) / span)), r1 = Math.min(2 ** z - 1, Math.floor((90 - la1) / span));
    const c0 = Math.max(0, Math.floor((lo0 + 180) / span)), c1 = Math.min(2 ** (z + 1) - 1, Math.floor((lo1 + 180) / span));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const [x, y] = toXY(90 - r * span, -180 + c * span), sz = span * v.ppd, t = getTile(layer, z, r, c);
      if (t.ok) { ctx.drawImage(t.img, x, y, sz + 0.5, sz + 0.5); drawn++; continue; }
      for (let up = 1; up <= 4 && z - up >= 0; up++) { // still loading: stretch the nearest coarser tile that has arrived
        const pr = r >> up, pc = c >> up, p = tiles.get(`${layer}/${z - up}/${pr}/${pc}`);
        if (p && p.ok) { const n = 2 ** up, s = 256 / n; ctx.drawImage(p.img, (c - pc * n) * s, (r - pr * n) * s, s, s, x, y, sz + 0.5, sz + 0.5); drawn++; break; }
      }
    }
  } else {
    const z = Math.max(0, Math.min(L.maxZ, Math.ceil(Math.log2(v.ppd * DPR * 360 / 256)))), n = 2 ** z;
    const x0 = Math.max(0, Math.floor((lo0 + 180) / 360 * n)), x1 = Math.min(n - 1, Math.floor((lo1 + 180) / 360 * n));
    const y0 = Math.max(0, Math.floor(mercY(la0, n))), y1 = Math.min(n - 1, Math.floor(mercY(la1, n)));
    const strips = z < 6 ? 16 : z < 10 ? 4 : 1; // Mercator stretches north–south, so slice tiles into bands
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
      const t = getTile(layer, z, tx, ty); if (!t.ok) continue;
      const xa = toXY(0, tx / n * 360 - 180)[0], xb = toXY(0, (tx + 1) / n * 360 - 180)[0];
      for (let k = 0; k < strips; k++) {
        const ya = toXY(mercLat(ty + k / strips, n), 0)[1], yb = toXY(mercLat(ty + (k + 1) / strips, n), 0)[1];
        ctx.drawImage(t.img, 0, k * 256 / strips, 256, 256 / strips, xa, ya, xb - xa + 0.5, yb - ya + 0.5);
      }
      drawn++;
    }
  }
  return drawn;
}

// ---------- stop points and zones ----------
// Ports (Natural Earth), famous balloon sites and the best paragliding hill nearby are shown as tap targets.
// Picking dog sled or paraglider shades where that mode can go (snow, or hills to launch from).
let PLACES = { ports: [], balloons: [] };
const zoneCache = {};
function zoneMask(kind) { // one pixel per grid cell
  if (zoneCache[kind]) return zoneCache[kind];
  const c = document.createElement('canvas'); c.width = G.C; c.height = G.R;
  const g = c.getContext('2d'), im = g.createImageData(G.C, G.R), d = im.data;
  for (let r = 0; r < G.R; r++) for (let q = 0; q < G.C; q++) {
    const i = r * G.C + q, on = kind === 'sled' ? !terrainProblem('sled', i, cellLat(r), cellLon(q)) : isHill(i);
    if (on) d.set(kind === 'sled' ? [225, 240, 255, 170] : [240, 130, 30, 110], i * 4);
  }
  g.putImageData(im, 0, 0); return zoneCache[kind] = c;
}
// Draws a whole-world image (360° × 180°), only the part on screen.
function drawWorld(img, smooth) {
  const k = img.width / 360, [la0, lo0] = toLL(0, 0), [la1, lo1] = toLL(W, H);
  const sx = Math.max(0, Math.floor((lo0 + 180) * k)), sy = Math.max(0, Math.floor((90 - la0) * k));
  const ex = Math.min(img.width, Math.ceil((lo1 + 180) * k)), ey = Math.min(img.height, Math.ceil((90 - la1) * k));
  if (ex <= sx || ey <= sy) return;
  const [dx, dy] = toXY(90 - sy / k, sx / k - 180), [dx2, dy2] = toXY(90 - ey / k, ex / k - 180);
  ctx.imageSmoothingEnabled = smooth; ctx.drawImage(img, sx, sy, ex - sx, ey - sy, dx, dy, dx2 - dx, dy2 - dy); ctx.imageSmoothingEnabled = true;
}
// Terrain shading: one pixel per grid cell, coloured by biome, only for the kinds switched on.
const BIOME_RGBA = { desert: [240, 170, 40, 150], grass: [140, 210, 60, 140], jungle: [10, 100, 40, 160], ice: [150, 205, 255, 150] };
function biomeMask() {
  const on = Object.keys(BIOME_RGBA).filter(k => S.show[k]), key = 'biome:' + on.join();
  if (!on.length) return null;
  if (zoneCache[key]) return zoneCache[key];
  const c = document.createElement('canvas'); c.width = G.C; c.height = G.R;
  const g = c.getContext('2d'), im = g.createImageData(G.C, G.R), d = im.data;
  for (let i = 0; i < G.R * G.C; i++) { const b = biomeOf(i); if (b && S.show[b]) d.set(BIOME_RGBA[b], i * 4); }
  g.putImageData(im, 0, 0); return zoneCache[key] = c;
}
function drawZones() {
  const bm = !S.playing && biomeMask(); if (bm) drawWorld(bm, S.view.ppd < 40);
  const kind = S.mode === 'sled' ? 'sled' : S.mode === 'glide' ? 'glide' : null;
  if (kind && !S.playing && allowedModes(S.rules).includes(S.mode)) drawWorld(zoneMask(kind), false);
}
function drawStops() {
  S.markers = [];
  if (S.playing) return;
  const allowed = allowedModes(S.rules), v = S.view, placed = [];
  const put = (ll, icon, name) => {
    const [x, y] = toXY(...ll);
    if (x < -12 || y < -12 || x > W + 12 || y > H + 12 || placed.some(([a, b]) => (a - x) ** 2 + (b - y) ** 2 < 26 * 26)) return;
    placed.push([x, y]); S.markers.push({ x, y, ll, name });
    ctx.fillStyle = 'rgba(251,248,241,.92)'; ctx.beginPath(); ctx.arc(x, y, 11, 0, 7); ctx.fill(); ctx.strokeStyle = '#1c2a33'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.font = '14px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#000'; ctx.fillText(icon, x, y + 1); ctx.textBaseline = 'alphabetic';
  };
  if (S.show.balloons && allowed.includes('balloon')) for (const b of PLACES.balloons) put([b[1], b[2]], '🎈', `${b[0]} (balloon site)`);
  if (S.show.ports && ['ferry', 'sail', 'kayak'].some(m => allowed.includes(m))) {
    const rank = v.ppd < 8 ? 4 : v.ppd < 20 ? 6 : 10; // only big ports when zoomed out
    for (const p of PLACES.ports) if (p[3] <= rank) put([p[1], p[2]], '⚓', `${p[0]} (port)`);
  }
  if (S.show.hills && allowed.includes('glide') && v.ppd >= 12) {
    // the best launch hill in each block of cells, with blocks sized so markers sit about 70 px apart
    const B = Math.max(1, Math.ceil(70 / (v.ppd * 0.25))), [la0, lo0] = toLL(0, 0), [la1, lo1] = toLL(W, H);
    const r0 = Math.max(0, Math.floor((90 - la0) * 4 / B) * B), r1 = Math.min(G.R - 1, Math.floor((90 - la1) * 4));
    const c0 = Math.max(0, Math.floor((lo0 + 180) * 4 / B) * B), c1 = Math.min(G.C - 1, Math.floor((lo1 + 180) * 4));
    for (let br = r0; br <= r1; br += B) for (let bc = c0; bc <= c1; bc += B) {
      let best = -1, bi = -1;
      for (let r = br; r < Math.min(br + B, G.R); r++) for (let c = bc; c < Math.min(bc + B, G.C); c++) {
        const i = r * G.C + c; if (isHill(i) && maxM(i) - elevM(i) > best) { best = maxM(i) - elevM(i); bi = i; }
      }
      if (bi >= 0) put([cellLat((bi / G.C) | 0), cellLon(bi % G.C)], '🪂', `Paragliding hill, peaks near ${maxM(bi).toLocaleString()} m`);
    }
  }
}
function stopAt(x, y) { let b = null, bd = 16 * 16; for (const m of S.markers) { const d = (m.x - x) ** 2 + (m.y - y) ** 2; if (d < bd) { bd = d; b = m; } } return b; }

// ---------- characters ----------
function renderChars() {
  $('chars').innerHTML = Object.entries(CHARS).map(([k, c]) => `<button class="char" data-c="${k}" aria-pressed="${k === S.char}" title="${esc(c.power)}"><span>${c.icon}</span>${esc(c.name)}</button>`).join('');
  $('charPower').textContent = `${CHARS[S.char].icon} ${CHARS[S.char].power}`;
  $('chars').querySelectorAll('.char').forEach(b => b.onclick = () => {
    S.char = b.dataset.c; setCharacter(S.char); try { localStorage.setItem('vamos.char', S.char); } catch {}
    renderChars(); routeChanged();
  });
}

// ---------- view / projection (equirectangular) ----------
function toXY(la, lo) { const v = S.view; return [W / 2 + (lo - v.lon) * v.ppd, H / 2 - (la - v.lat) * v.ppd]; }
function toLL(x, y) { const v = S.view; return [v.lat - (y - H / 2) / v.ppd, v.lon + (x - W / 2) / v.ppd]; }
function clampView() {
  const v = S.view, minP = Math.max(W / 360, H / 180);
  v.ppd = Math.min(Math.max(v.ppd, minP), MAX_PPD);
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
  if (baseImg) drawWorld(baseImg, true);
  const tilesOn = layer !== 'relief' && S.view.ppd >= TILES_FROM;
  const drawnTiles = tilesOn ? drawTiles() : 0;
  $('credit').hidden = !drawnTiles; if (drawnTiles) $('credit').innerHTML = LAYERS[layer].credit;
  drawZones();
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
  drawStops();
  if (S.challenge && S.finished && S.ghosts) drawGhosts();
  // player lines: a gold halo marks the one being edited, one badge per line shows its mode
  for (const L of S.lines) {
    const M = MODES[L.mode];
    if (L.id === S.sel) for (const k of L.legs) pathLine(legPts(S.legs[k]), '#e9b949', [], 13);
    for (const k of L.legs) { const l = S.legs[k]; pathLine(legPts(l), l.error ? '#c8402f' : M.color, l.error ? [4, 4] : M.dash, 5); }
    const mid = legPts(S.legs[L.legs[Math.floor(L.legs.length / 2)]]), [mx, my] = toXY(...(L.legs.length % 2 || L.legs.length === 1 ? mid[Math.floor(mid.length / 2)] : mid[0]));
    ctx.font = '18px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(251,248,241,.95)'; ctx.beginPath(); ctx.arc(mx, my, 14, 0, 7); ctx.fill();
    ctx.strokeStyle = L.id === S.sel ? '#1c2a33' : L.error ? '#c8402f' : M.color; ctx.lineWidth = L.id === S.sel ? 3 : 2; ctx.stroke();
    ctx.fillStyle = '#000'; ctx.fillText(L.error ? '⚠️' : M.icon, mx, my + 1); ctx.textBaseline = 'alphabetic';
  }
  // the line being drawn right now
  if (S.stroke && S.stroke.length > 1) {
    ctx.setLineDash([6, 5]); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = MODES[S.mode].color; ctx.lineWidth = 4;
    ctx.beginPath(); S.stroke.forEach(([x, y], k) => k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke(); ctx.setLineDash([]);
  }
  S.pts.forEach((p, k) => {
    if (!k || p.end) return;
    const join = !S.pts[k + 1] || S.pts[k + 1].line !== p.line, [x, y] = toXY(...p.ll);
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#1c2a33'; ctx.lineWidth = join ? 2 : 1.5; ctx.beginPath(); ctx.arc(x, y, join ? 5 : 2.5, 0, 7); ctx.fill(); ctx.stroke();
  });
  pin(S.trip.a[0], S.trip.a[1], S.trip.from.split(',')[0], '#2f7a45');
  pin(S.trip.b[0], S.trip.b[1], S.trip.to.split(',')[0], '#c8402f');
  if (S.anim) drawTraveller(S.anim);
  if (!$('lookMenu').hidden) { // the spot "Look around" will open
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(W / 2, H / 2, 11, 0, 7); ctx.stroke();
    ctx.strokeStyle = '#c8402f'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(W / 2, H / 2, 11, 0, 7); ctx.moveTo(W / 2 - 17, H / 2); ctx.lineTo(W / 2 + 17, H / 2); ctx.moveTo(W / 2, H / 2 - 17); ctx.lineTo(W / 2, H / 2 + 17); ctx.stroke();
  }
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
  if (!human || A.mode === 'bike' || A.mode === 'skate' || A.mode === 'kayak') { ctx.font = '26px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(M.icon, 0, 10); }
  if (S.char !== 'none') { // characters ride along as their emoji instead of the stick figure
    ctx.font = '24px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(CHARS[S.char].icon, Math.sin(swing) * 2, -16); ctx.restore(); return;
  }
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
  const allowed = allowedModes(S.rules);
  if (!allowed.includes(S.mode)) S.mode = allowed[0];
  const b = boost(), num = v => +v.toFixed(v < 1 ? 2 : 1);
  $('modes').innerHTML = MODE_KEYS.filter(m => allowed.includes(m)).map(m => {
    const M = MODES[m], up = Math.round(totalBoost(b, m) * 100);
    const sp = M.terrain === 'space' ? `${M.setup}h prep` : m === 'balloon' ? 'wind-powered' : m === 'sail' ? '4–18 km/h · wind' :
      m === 'cannon' ? '300 m a shot · 2h reload' : `${num(M.speed * (1 + totalBoost(b, m)))} km/h · ${hoursPerDay(m, 0)}h/day`;
    return `<button class="mode" aria-pressed="${m === S.mode}" data-m="${m}"><span class="ic">${M.icon}</span>${M.name}<span class="sp">${sp}${up ? ` <b class="up">+${up}%</b>` : ''}</span><span class="sw" style="background:${M.color}"></span></button>`;
  }).join('');
  $('modes').querySelectorAll('.mode').forEach(b => b.onclick = () => {
    S.mode = b.dataset.m;
    if (S.sel != null) { setLineMode(S.sel, S.mode); routeChanged(); } else { renderModes(); draw(); }
  });
  const n = S.lines.findIndex(L => L.id === S.sel);
  $('modeLabel').textContent = n >= 0 ? `Line ${n + 1}: pick how you travel it` : 'Pick a way to travel, then tap or draw on the map';
  $('doneSel').hidden = n < 0;
}
// Give every leg of a line a new mode. Rockets can't follow a wiggly line, so a rocket line becomes one hop
// from its start to the spaceport nearest its end.
function setLineMode(id, m) {
  const ks = S.pts.map((p, k) => p.line === id ? k : -1).filter(k => k > 0);
  if (!ks.length) return;
  if (MODES[m].terrain === 'space') {
    const last = S.pts[ks[ks.length - 1]], s = nearestSite(last.ll[0], last.ll[1]).site;
    S.pts.splice(ks[0], ks.length, { ll: [s[1], s[2]], mode: m, line: id });
  } else for (const k of ks) S.pts[k].mode = m;
}
function selectLine(id) { S.sel = S.sel === id ? null : id; const L = S.lines.find(x => x.id === id); if (S.sel != null && L) S.mode = L.mode; renderModes(); renderLegs(); draw(); }
function renderLegs() {
  const el = $('legs');
  if (!S.legs.length) {
    el.innerHTML = `<li class="empty">Start at ${esc(S.trip.from.split(',')[0])}. Pick a way to travel, then click the map to add a stop, or press ✏️ and drag to draw a line. Tap any line later to change how you travel it.</li>`;
  } else {
    el.innerHTML = S.lines.map((L, n) => {
      const M = MODES[L.mode], stops = L.legs.length > 1 ? ` · ${L.legs.length} bends` : '';
      return `<li class="${L.error ? 'bad' : ''}${L.id === S.sel ? ' sel' : ''}" data-line="${L.id}" role="button" tabindex="0" aria-pressed="${L.id === S.sel}" title="Tap to change how you travel this line"><span>${M.icon}</span><span>Line ${n + 1}: ${M.name} · ${fmtKm(L.km)}${stops}</span><span class="t">${fmtH(L.total)}</span>${L.error ? `<span class="why">${L.error}</span>` : L.events.length ? `<span class="why">${L.events.join(' · ')}</span>` : ''}</li>`;
    }).join('');
    el.querySelectorAll('li[data-line]').forEach(li => {
      if (S.playing) return;
      li.onclick = () => { selectLine(+li.dataset.line); if (S.sel != null) $('modes').scrollIntoView({ block: 'nearest', behavior: 'smooth' }); };
      li.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectLine(+li.dataset.line); } };
    });
  }
  $('total').textContent = fmtH(tripTotal());
  const bad = S.legs.some(l => l.error);
  $('go').disabled = !atEnd() || bad || S.playing;
  $('undo').disabled = S.pts.length <= 1 || S.playing;
  $('clear').disabled = S.pts.length <= 1 || S.playing;
  $('hint').textContent = S.playing ? '' : bad ? 'Fix the red lines before you go: tap one to change how you travel it.' : atEnd() ? 'You made it. Tap any line to change its mode, or press Vamos! to watch the trip.' :
    S.tool === 'draw' ? `Drag on the map to draw a line. Finish near ${S.trip.to.split(',')[0]}. Pinch or scroll to zoom.` :
    `Click near ${S.trip.to.split(',')[0]} to finish. Scroll or pinch to zoom, drag to pan, or press ✏️ to draw lines freehand.`;
}
function setTrip(idx, no) {
  const t = TRIPS[idx % TRIPS.length];
  startTrip({ from: t[0], a: [t[1], t[2]], to: t[3], b: [t[4], t[5]], idx }, no);
}
// trip: { from, a: [lat, lon], to, b, idx? }. no: daily trip number, or 0 for practice, custom and challenge trips.
function startTrip(trip, no, challenge) {
  S.trip = trip; S.challenge = challenge || null; S.match = null; S.finished = false; S.picking = null;
  S.tripNo = no; S.seed = challenge ? challenge.s : no || 1 + Math.floor(Math.random() * 1e6);
  S.fair = !!no || !!challenge; $('fair').checked = S.fair; $('fair').disabled = !!challenge; // Fair mode: on for the daily trip, always on in challenges
  if (!challenge && location.hash.startsWith('#c=')) history.replaceState(null, '', location.pathname + location.search);
  S.pts = [{ ll: S.trip.a }]; S.legs = []; S.lines = []; S.sel = null; S.best = null; S.showBest = false; S.anim = null;
  renderTripHead(); renderModes(); renderTraveller(); renderChallenge();
  $('tripNo').textContent = challenge ? '⚔️ Challenge' : no ? `Trip #${no}` : 'Practice trip';
  $('names').hidden = true; $('result').hidden = true; $('result').innerHTML = '';
  recompute(); renderLegs(); fitTrip();
  if (window.Online) Online.tripChanged();
}
function renderTripHead() {
  $('fromName').textContent = S.trip.from; $('toName').textContent = S.trip.to;
  $('fromLL').textContent = fmtLL(...S.trip.a); $('toLL').textContent = fmtLL(...S.trip.b);
}
// A stop near the destination snaps onto it and finishes the trip.
function snapEnd(ll) {
  const end = S.trip.b, toEnd = hav(ll[0], ll[1], end[0], end[1]);
  const near = Math.hypot(...[toXY(...ll), toXY(...end)].reduce((a, b) => [a[0] - b[0], a[1] - b[1]]));
  return toEnd < 60 || (near < 12 && toEnd < 250);
}
// Adds one line through the given stops (one stop for a tap, several for a freehand stroke).
// Taps auto-stop at the limit; a freehand stroke keeps the shape you drew (pick its mode afterwards).
function addLine(lls, freehand) {
  if (S.playing || atEnd() || !lls.length) return;
  const m = S.mode, M = MODES[m], id = S.nextLine++;
  if (M.terrain === 'space') { const s = nearestSite(...lls[lls.length - 1]).site; lls = [[s[1], s[2]]]; }
  let prev = S.pts[S.pts.length - 1].ll, msg = '';
  for (let ll of lls) {
    const end = M.terrain !== 'space' && snapEnd(ll); if (end) ll = S.trip.b;
    if (M.terrain !== 'space' && !freehand) { // auto-stop: go as far as this mode can, then stop at the edge
      const c = clipLeg(m, prev, ll, end);
      if (!c) { msg = evalLeg(m, prev, ll).error || `${M.name} can't go that way from here.`; break; }
      if (c.clipped) { S.pts.push({ ll: c.ll, mode: m, line: id }); msg = STOP_TEXT[c.why] ? STOP_TEXT[c.why](m) : `${PROBLEM_TEXT[c.why](m)} Stopped just before it.`; break; }
    }
    if (end) { S.pts.push({ ll, mode: m, line: id, end: true }); break; }
    S.pts.push({ ll, mode: m, line: id }); prev = ll;
  }
  if (msg) toast(msg, 3600);
  S.sel = null; routeChanged();
}
const STOP_TEXT = {
  land: m => `${MODES[m].name} stopped at the coast. Pick a way to travel on land to carry on.`,
  water: m => `${MODES[m].name} stopped at the water's edge. Switch to a boat or swim to cross.`,
  edge: m => MODES[m].terrain === 'water' ? `${MODES[m].name} stopped at the coast. Pick a way to travel on land to carry on.` : `${MODES[m].name} stopped at the water's edge. Switch to a boat or swim to cross.`,
  limit: () => 'Paragliders fly about 150 km a day, so you landed there. Walk to another 🪂 hill to launch again.',
};
const addPoint = ll => addLine([ll]);
// Screen distance from (x, y) to the nearest line, for tapping a line to select it.
function lineAt(x, y) {
  let best = null, bd = 10;
  for (const L of S.lines) for (const k of L.legs) {
    const P = legPts(S.legs[k]).map(p => toXY(...p));
    for (let j = 1; j < P.length; j++) {
      const [ax, ay] = P[j - 1], [bx, by] = P[j], dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
      const d = Math.hypot(x - ax - t * dx, y - ay - t * dy); if (d < bd) { bd = d; best = L.id; }
    }
  }
  return best;
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
function solveAsync(a, b, modes, boost) {
  return new Promise(res => { const w = getWorker(), id = Math.random(); const h = e => { if (e.data.id === id) { w.removeEventListener('message', h); res(e.data.r); } }; w.addEventListener('message', h); w.postMessage({ id, a, b, modes, boost, char: S.char }); });
}

// ---------- playback ----------
function toast(msg, ms = 1800) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => t.hidden = true, ms); }
async function go() {
  if (!atEnd()) return;
  S.playing = true; renderLegs();
  if (window.Online) Online.beforeGo();
  const rules = RULES[S.rules];
  const bestP = solveAsync(S.trip.a, S.trip.b, allowedModes(S.rules), boost());
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  $('clock').hidden = false;
  let clock = 0;
  for (const L of S.lines) {
    const l = { ...L, mode: L.mode, seasick: L.legs.some(k => S.legs[k].seasick), extra: L.legs.reduce((s, k) => s + S.legs[k].extra, 0) };
    const M = MODES[l.mode], pts = L.legs.flatMap((k, j) => j ? legPts(S.legs[k]).slice(1) : legPts(S.legs[k]));
    const fun = l.events.find(e => !/sleep and rest| to (rent|hire|catch|board|inflate|rig|lay out|harness|load|get ready)/.test(e));
    toast(`${M.icon} ${M.name} · ${fmtKm(l.km)} · ${fmtH(l.total)}${fun ? ' · ' + fun : ''}`, 2600);
    const dur = reduce ? 200 : Math.min(3800, 1300 + l.km * 0.25), t0 = performance.now();
    await new Promise(done => {
      const step = now => {
        const f = Math.min(1, Math.max(0, (now - t0) / dur)), pos = f * (pts.length - 1), k = Math.min(pts.length - 2, Math.floor(pos)), r = pos - k;
        const ll = [pts[k][0] + (pts[k + 1][0] - pts[k][0]) * r, pts[k][1] + (pts[k + 1][1] - pts[k][1]) * r];
        S.anim = { ll, mode: l.mode, phase: now / 1000, sick: l.seasick ? '🤢' : l.extra && M.human ? '😵' : '' };
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
  let earned = '';
  if (!dq) {
    const ctx = { total: you, grade: g, rules: S.rules, day: dailyTrip(Date.now()).no };
    const r = recordTrip(S.progress, S.legs, ctx, `${S.tripNo || 'p' + S.seed}|${S.rules}`);
    S.progress = r.progress; saveProgress(); renderTraveller();
    earned = r.newBadges.map(B => `<li>${B.icon} New badge: <b>${B.name}</b></li>`).join('') +
      r.gains.map(x => `<li>${MODES[x.mode].icon} ${MODES[x.mode].name} stat up to +${x.to}%${S.fair ? ' (used when Fair mode is off)' : ''}</li>`).join('');
  }
  const share = `Vamos ${S.challenge ? '⚔️ challenge' : S.tripNo ? '#' + S.tripNo : '(practice)'} · ${rules.name} · ${S.fair ? 'Fair mode' : 'Stats on'}\n${S.trip.from.split(',')[0]} → ${S.trip.to.split(',')[0]}\n${S.char !== 'none' ? CHARS[S.char].icon + ' ' : ''}${icons.join('')} ${fmtH(you)}\nBest route ${par ? fmtH(par) : '—'} · Grade ${g}`;
  const bestLine = best ? best.runs.filter(r => r.km >= 5 || MODES[r.mode].terrain === 'space').map(r => `${MODES[r.mode].icon} ${fmtKm(r.km)}`).join(' → ') : 'No route exists under these rules.';
  const note = g === 'A+' ? 'You beat the computer. Its route assumes full rest days, so short hops can sneak under it.' : '';
  $('result').innerHTML = `<div class="result">
    <div class="grade"><div class="g">${g}</div><div class="cmp">
      <span>Your trip</span><span class="t">${fmtH(you)}</span>
      <span>Best route</span><span class="t">${par ? fmtH(par) : '—'}</span></div></div>
    ${dq ? `<p class="hint" style="color:var(--stamp);font-weight:700">${dq}</p>` : ''}
    ${note ? `<p class="hint">${note}</p>` : ''}
    <p class="hint">Graded against the best route at ${S.fair ? 'base speeds (Fair mode)' : 'your stats'}.</p>
    ${earned ? `<ul class="events earned">${earned}</ul>` : ''}
    <div id="onlineResult"></div>
    <div class="label">Best route (dotted on the map)</div><p class="hint">${bestLine}</p>
    <div class="label">Share</div><pre class="share" id="shareText">${esc(share)}</pre>
    <div class="label">Challenge friends</div>
    <div class="row"><input id="myName" class="txt" maxlength="40" placeholder="Your name" aria-label="Your name" value="${esc(myName())}"><button class="btn" id="sendCh">${S.challenge ? 'Send to more friends' : 'Challenge a friend'}</button></div>
    <p class="hint" id="chMsg">${S.fair ? 'They play the same trip at base speed, then send their result back. Everyone who plays goes on one leaderboard.' : 'Your time goes on the board only in Fair mode, but friends can still play this trip.'}</p>
    <input id="chLink" class="txt" readonly hidden aria-label="Challenge link">
    <div class="row"><button class="btn" id="copy">Copy result</button><button class="btn" id="toggleBest">${S.showBest ? 'Hide' : 'Show'} best route</button><button class="btn" id="again">Try again</button></div>
  </div>`;
  $('result').hidden = false;
  const mine = !dq && S.fair ? { n: myName(), h: you, g, p: encodeRoute(S.pts), c: S.char } : null;
  if (S.challenge && mine) { S.challenge.res = mergeResults(S.challenge.res, [mine]); saveBoard(S.challenge); }
  S.finished = true; renderChallenge(); draw();
  if (window.Online) Online.finished(you, par, dq);
  $('myName').oninput = e => { try { localStorage.setItem('vamos.name', e.target.value.trim()); } catch {} if (mine && S.challenge) { mine.n = myName(); saveBoard(S.challenge); renderChallenge(); } };
  $('sendCh').onclick = () => {
    const name = myName(), c = S.challenge || { v: 1, id: Math.random().toString(36).slice(2, 10).padEnd(6, '0'), f: [S.trip.from, ...S.trip.a], t: [S.trip.to, ...S.trip.b], r: S.rules, s: S.seed, res: [] };
    if (mine) { mine.n = name; c.res = mergeResults(c.res.filter(r => r !== mine), [mine]); }
    S.challenge = c; saveBoard(c); renderChallenge();
    const url = `${location.href.split('#')[0]}#c=${encodeChallenge(c)}`, text = `Vamos challenge: ${S.trip.from} → ${S.trip.to}. ${mine ? `I did it in ${fmtH(you)}. ` : ''}Can you beat it?`;
    $('chLink').value = url; $('chLink').hidden = false;
    const copied = () => { $('chMsg').textContent = 'Link copied. Paste it in a chat with your friends.'; };
    const copy = () => { try { navigator.clipboard.writeText(url).then(copied, () => { $('chLink').select(); $('chMsg').textContent = 'Copy the link below.'; }); } catch { $('chLink').select(); } };
    if (navigator.share && matchMedia('(pointer: coarse)').matches) navigator.share({ title: 'Vamos challenge', text, url }).catch(copy); else copy();
  };
  $('copy').onclick = () => {
    const done = () => { $('copy').textContent = 'Copied'; };
    try { navigator.clipboard.writeText(share).then(done, () => selectShare()); } catch { selectShare(); }
  };
  $('toggleBest').onclick = () => { S.showBest = !S.showBest; $('toggleBest').textContent = `${S.showBest ? 'Hide' : 'Show'} best route`; draw(); };
  $('again').onclick = () => { S.pts = [{ ll: S.trip.a }]; S.legs = []; S.lines = []; S.sel = null; S.best = null; S.anim = null; S.finished = false; $('result').hidden = true; renderChallenge(); renderLegs(); draw(); };
  $('result').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
function selectShare() { const r = document.createRange(); r.selectNodeContents($('shareText')); const s = getSelection(); s.removeAllRanges(); s.addRange(r); $('copy').textContent = 'Press Ctrl+C'; }

// ---------- friend challenges ----------
const esc = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function myName() { try { return cleanName(($('myName') && $('myName').value) || localStorage.getItem('vamos.name'), 'Player'); } catch { return 'Player'; } }
const GHOST = ['#7b3fa8', '#d9772b', '#1f8a8a', '#b5338a', '#5f8a3a', '#9c6b2f', '#2aa6c9', '#c23b2e'];
// Boards are kept per challenge, so opening several friends' links builds one leaderboard.
function saveBoard(c) { try { localStorage.setItem('vamos.ch.' + c.id, JSON.stringify(c.res)); } catch {} }
function loadBoard(c) { try { const r = JSON.parse(localStorage.getItem('vamos.ch.' + c.id) || '[]'); if (Array.isArray(r)) c.res = mergeResults(c.res, r.filter(x => x && typeof x.n === 'string' && typeof x.h === 'number')); } catch {} }
function openChallenge(code) {
  const c = decodeChallenge(code);
  if (!c) { toast('That challenge link didn\'t work. Ask your friend to send it again.', 4000); return false; }
  loadBoard(c); saveBoard(c);
  S.rules = c.r; $('rules').value = c.r; $('rulesNote').textContent = RULES[c.r].note;
  startTrip({ from: c.f[0], a: [c.f[1], c.f[2]], to: c.t[0], b: [c.t[1], c.t[2]] }, 0, c);
  return true;
}
function renderChallenge() {
  const c = S.challenge, el = $('challenge');
  el.hidden = !c; if (!c) return;
  const me = myName().toLowerCase(), top = c.res[0];
  el.innerHTML = `<div class="label">⚔️ Challenge · ${esc(RULES[c.r].name)} · Fair mode</div>
    <p class="hint">${top ? `Beat ${esc(top.n)}'s ${fmtH(top.h)}.` : 'Be the first on the board.'} ${S.finished ? '' : 'Friends\' routes show once you finish.'}</p>
    ${c.res.length ? `<ol class="board">${c.res.map((r, k) => `<li class="${r.n.toLowerCase() === me ? 'me' : ''}"><span>${['🥇', '🥈', '🥉'][k] || k + 1}</span><span>${S.finished && r.p ? `<i style="background:${GHOST[k % GHOST.length]}"></i>` : ''}${r.c && r.c !== 'none' ? CHARS[r.c].icon + ' ' : ''}${esc(r.n)}</span><span class="t">${fmtH(r.h)} · ${r.g}</span></li>`).join('')}</ol>` : ''}
    ${S.finished && c.res.some(r => r.p) ? `<label class="fair"><input type="checkbox" id="ghosts" ${S.ghosts ? 'checked' : ''}><span>Show everyone's routes</span></label>` : ''}`;
  if ($('ghosts')) $('ghosts').onchange = e => { S.ghosts = e.target.checked; draw(); };
}
function drawGhosts() {
  S.challenge.res.forEach((r, k) => {
    const pts = r.p && decodeRoute(r.p);
    if (pts) pathLine(pts.map(p => p.ll), GHOST[k % GHOST.length], [6, 4], 3);
  });
}
// Custom trips: tap a start and a finish, then name them.
$('custom').onclick = () => {
  S.picking = 'start'; S.sel = null; $('names').hidden = true;
  toast('Tap where your trip starts', 3000); $('hint').textContent = 'Custom trip: tap the start on the map.';
};
function pickPlace(ll) {
  if (S.picking === 'start') { S.pickA = ll; S.picking = 'end'; toast('Now tap the finish', 3000); $('hint').textContent = 'Custom trip: now tap the finish.'; return; }
  if (hav(...S.pickA, ...ll) < 100) { toast('Pick a finish at least 100 km away', 2500); return; }
  startTrip({ from: 'Start', a: S.pickA, to: 'Finish', b: ll }, 0);
  $('nameA').value = ''; $('nameB').value = ''; $('names').hidden = false;
}
$('nameA').oninput = e => { S.trip.from = cleanName(e.target.value, 'Start'); renderTripHead(); draw(); };
$('nameB').oninput = e => { S.trip.to = cleanName(e.target.value, 'Finish'); renderTripHead(); draw(); };
window.addEventListener('hashchange', () => { if (location.hash.startsWith('#c=')) openChallenge(location.hash.slice(3)); });

// ---------- traveller panel: Fair mode, stats, badges, backup ----------
function renderTraveller() {
  const p = S.progress, got = BADGES.filter(B => p.badges[B.id]).length;
  $('travSum').textContent = `${got} of ${BADGES.length} badges · ${S.fair ? 'Fair mode' : 'stats on'}`;
  $('stats').innerHTML = Object.keys(STAT_KM).map(m => {
    const km = p.km[m] || 0, pct = boostPct(m, km), whole = k => `${Math.round(k).toLocaleString()} km`;
    const next = pct >= STAT_CAP ? 'maxed' : `next +1% at ${whole((pct + 1) * STAT_KM[m])}`;
    return `<li><span>${MODES[m].icon}</span><span>${MODES[m].name} <small>${whole(km)} · ${next}</small></span><b>+${pct}%</b></li>`;
  }).join('');
  $('badges').innerHTML = BADGES.map(B => `<li class="${p.badges[B.id] ? 'got' : ''}" title="${B.how}"><span>${B.icon}</span><span><b>${B.name}</b><small>${B.how}</small></span></li>`).join('');
}
function changedStats() { renderModes(); recompute(); S.best = null; $('result').hidden = true; renderLegs(); renderTraveller(); draw(); if (window.Online) Online.tripChanged(); }
$('fair').onchange = e => { S.fair = e.target.checked; changedStats(); };
$('backup').onclick = () => { $('code').value = encodeProgress(S.progress); $('code').select(); $('codeMsg').textContent = 'Copy this code and paste it into Vamos on another device.'; };
$('restore').onclick = () => {
  const q = decodeProgress($('code').value);
  if (!q) { $('codeMsg').textContent = 'That code did not work. Check you copied all of it.'; return; }
  S.progress = mergeProgress(S.progress, q); saveProgress(); changedStats();
  $('codeMsg').textContent = 'Restored. Stats and badges from both devices are combined.';
};

// ---------- input ----------
const ptrs = new Map(); let drag = null, pinch = null;
const canDraw = () => S.tool === 'draw' && !S.playing && !atEnd() && S.sel == null && !S.picking;
cv.addEventListener('pointerdown', e => {
  cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.offsetX, e.offsetY]);
  if (ptrs.size === 1) {
    drag = { x: e.offsetX, y: e.offsetY, lon: S.view.lon, lat: S.view.lat, moved: false };
    if (canDraw()) S.stroke = [toXY(...S.pts[S.pts.length - 1].ll), [e.offsetX, e.offsetY]]; // a new line starts where the last one ended
  }
  if (ptrs.size === 2) { const [p, q] = [...ptrs.values()]; pinch = { d: Math.hypot(p[0] - q[0], p[1] - q[1]), mx: (p[0] + q[0]) / 2, my: (p[1] + q[1]) / 2 }; drag = null; S.stroke = null; draw(); }
});
cv.addEventListener('pointermove', e => {
  const [la, lo] = toLL(e.offsetX, e.offsetY);
  if (e.pointerType === 'mouse' && la > -90 && la < 90) {
    const i = cellOf(la, lo), land = isLand(i), st = stopAt(e.offsetX, e.offsetY);
    $('hover').hidden = false;
    if (st) { $('hover').textContent = `${st.name} · click to stop here`; } else
    $('hover').textContent = `${fmtLL(la, lo)} · ${land ? `land · ~${elevM(i).toLocaleString()} m${roughM(i) > 250 ? ' · mountains' : roughM(i) > 100 ? ' · hilly' : ''}` : isLake(i) ? 'lake' : 'water'}`;
  }
  if (!ptrs.has(e.pointerId)) return;
  ptrs.set(e.pointerId, [e.offsetX, e.offsetY]);
  if (pinch && ptrs.size === 2) {
    const [p, q] = [...ptrs.values()], d = Math.hypot(p[0] - q[0], p[1] - q[1]);
    const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2; // two fingers pinch to zoom and drag to pan (also while drawing)
    S.view.lon -= (mx - pinch.mx) / S.view.ppd; S.view.lat += (my - pinch.my) / S.view.ppd;
    zoomAt(d / pinch.d, mx, my); pinch.d = d; pinch.mx = mx; pinch.my = my; return;
  }
  if (drag) {
    const dx = e.offsetX - drag.x, dy = e.offsetY - drag.y;
    if (Math.hypot(dx, dy) > 6) drag.moved = true;
    if (S.stroke) { const q = S.stroke[S.stroke.length - 1]; if (Math.hypot(e.offsetX - q[0], e.offsetY - q[1]) > 3) { S.stroke.push([e.offsetX, e.offsetY]); draw(); } return; }
    if (drag.moved) { S.view.lon = drag.lon - dx / S.view.ppd; S.view.lat = drag.lat + dy / S.view.ppd; clampView(); draw(); cv.style.cursor = 'grabbing'; }
  }
});
function endPtr(e) {
  const tap = drag && !drag.moved && ptrs.size === 1 && e.type === 'pointerup';
  if (S.stroke) {
    const st = S.stroke; S.stroke = null;
    const lastStop = stopAt(...st[st.length - 1]); if (lastStop) st[st.length - 1] = toXY(...lastStop.ll); // a stroke ending on a stop snaps to it
    if (drag && drag.moved && e.type === 'pointerup') { addLine(simplifyPath(st, 6).slice(1).filter((p, k, a) => k === a.length - 1 || Math.hypot(p[0] - a[k + 1][0], p[1] - a[k + 1][1]) > 8).map(p => toLL(...p)), true); }
    else draw();
  }
  if (tap && S.picking) pickPlace(toLL(e.offsetX, e.offsetY));
  else if (tap) {
    const st = stopAt(e.offsetX, e.offsetY), hit = st ? null : lineAt(e.offsetX, e.offsetY);
    if (st && S.sel == null) { addPoint(st.ll); ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null; if (!ptrs.size) drag = null; return; }
    if (hit != null) selectLine(hit);
    else if (S.sel != null) selectLine(S.sel); // tapping empty map ends editing
    else addPoint(toLL(e.offsetX, e.offsetY));
  }
  ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null; if (!ptrs.size) drag = null; cv.style.cursor = 'crosshair';
}
cv.addEventListener('pointerup', endPtr); cv.addEventListener('pointercancel', endPtr);
cv.addEventListener('pointerleave', () => { $('hover').hidden = true; });
cv.addEventListener('wheel', e => { e.preventDefault(); zoomAt(Math.exp(-e.deltaY * 0.0015), e.offsetX, e.offsetY); }, { passive: false });
$('zin').onclick = () => zoomAt(1.5, W / 2, H / 2);
$('zout').onclick = () => zoomAt(1 / 1.5, W / 2, H / 2);
$('zfit').onclick = fitTrip;
$('sat').onclick = () => { const open = $('layerMenu').hidden; $('layerMenu').hidden = !open; $('lookMenu').hidden = true; $('sat').setAttribute('aria-expanded', open); draw(); };
$('layerMenu').querySelectorAll('input[name=layer]').forEach(r => r.onchange = () => {
  layer = r.value; try { localStorage.setItem('vamos.layer', layer); } catch {}
  if (layer !== 'relief' && S.view.ppd < TILES_FROM) toast(`Zoom in to see ${LAYERS[layer].name.toLowerCase()}`);
  draw();
});
$('layerMenu').querySelectorAll('input[data-show]').forEach(b => b.onchange = () => {
  S.show[b.dataset.show] = b.checked; try { localStorage.setItem('vamos.show', JSON.stringify(S.show)); } catch {}
  draw();
});
// Look around: opens Google Maps at the middle of the map (Maps URLs need no API key).
$('look').onclick = () => {
  const open = $('lookMenu').hidden; $('lookMenu').hidden = !open; $('layerMenu').hidden = true; $('look').setAttribute('aria-expanded', open);
  if (open) { const [la, lo] = toLL(W / 2, H / 2), ll = `${la.toFixed(5)}%2C${lo.toFixed(5)}`, z = Math.round(Math.max(3, Math.min(18, Math.log2(S.view.ppd * 360 / 256))));
    $('lookSV').href = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${ll}`;
    $('lookSat').href = `https://www.google.com/maps/@?api=1&map_action=map&center=${ll}&zoom=${z}&basemap=satellite`; }
  draw();
};
$('undo').onclick = () => { if (S.pts.length > 1) { const id = S.pts[S.pts.length - 1].line; while (S.pts.length > 1 && S.pts[S.pts.length - 1].line === id) S.pts.pop(); routeChanged(); } }; // undo removes the whole last line
$('clear').onclick = () => { S.pts = [{ ll: S.trip.a }]; S.sel = null; routeChanged(); };
$('doneSel').onclick = () => { S.sel = null; renderModes(); renderLegs(); draw(); };
$('tool').onclick = () => { S.tool = S.tool === 'draw' ? 'tap' : 'draw'; $('tool').setAttribute('aria-pressed', S.tool === 'draw'); renderLegs(); };
$('go').onclick = go;
$('newTrip').onclick = () => { let k; do { k = Math.floor(Math.random() * TRIPS.length); } while (k === S.trip.idx); setTrip(k, 0); };
$('rules').innerHTML = Object.entries(RULES).map(([k, r]) => `<option value="${k}">${r.name}</option>`).join('');
$('rules').onchange = e => { S.rules = e.target.value; $('rulesNote').textContent = RULES[S.rules].note; routeChanged(); };
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
    baseSrc = inline.base; BORDERS = inline.borders; PLACES = inline.places || PLACES;
  } else {
    const [g, b, pl] = await Promise.all([fetch('data/grid.bin'), fetch('data/borders.json'), fetch('data/places.json')]);
    if (!g.ok || !b.ok) throw new Error('Map data failed to load');
    bytes = new Uint8Array(await g.arrayBuffer()); BORDERS = await b.json();
    if (pl.ok) PLACES = await pl.json(); // stop points are a nice extra; the game works without them
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
  const lr = $('layerMenu').querySelector(`input[value="${layer}"]`); if (lr) lr.checked = true;
  try { const sh = JSON.parse(localStorage.getItem('vamos.show') || '{}'); for (const k in S.show) if (typeof sh[k] === 'boolean') S.show[k] = sh[k]; } catch {}
  $('layerMenu').querySelectorAll('input[data-show]').forEach(b => b.checked = S.show[b.dataset.show]);
  S.progress = loadProgress();
  try { S.char = CHARS[localStorage.getItem('vamos.char')] ? localStorage.getItem('vamos.char') : 'none'; } catch {}
  setCharacter(S.char); renderChars();
  renderModes();
  resize();
  const d = dailyTrip(Date.now());
  if (!(location.hash.startsWith('#c=') && openChallenge(location.hash.slice(3)))) setTrip(d.idx, d.no);
})();
