// Vamos game rules. Pure functions only (no DOM), so they run in the page, the worker and Node tests.
// Grid: 0.25° cells, 720 rows (90N→90S) × 1440 cols (180W→180E).
const G = { R: 720, C: 1440, step: 0.25 };
let ELEV, MAXE, ROUGH, LAND;
function setGrid(buf) {
  const n = G.R * G.C;
  ELEV = buf.subarray(0, n);          // mean land elevation, 25 m units
  MAXE = buf.subarray(n, 2 * n);      // highest point in cell, 40 m units
  ROUGH = buf.subarray(2 * n, 3 * n); // elevation spread in cell, 5 m units
  LAND = buf.subarray(3 * n, 4 * n);  // 1 = land
}
function cellOf(lat, lon) {
  let r = Math.floor((90 - lat) * 4), c = Math.floor((lon + 180) * 4);
  r = r < 0 ? 0 : r >= G.R ? G.R - 1 : r;
  c = c < 0 ? 0 : c >= G.C ? G.C - 1 : c;
  return r * G.C + c;
}
const cellLat = r => 90 - (r + 0.5) / 4;
const cellLon = c => -180 + (c + 0.5) / 4;
const elevM = i => ELEV[i] * 25;
const maxM = i => MAXE[i] * 40;
const roughM = i => ROUGH[i] * 5;
const isLand = i => LAND[i] === 1;
function isIce(i, lat, lon) {
  return LAND[i] === 1 && (lat < -62 || (lat > 60 && lon > -74 && lon < -12 && ELEV[i] * 25 > 300));
}
function hav(lat1, lon1, lat2, lon2) {
  const d = Math.PI / 180, a = Math.sin((lat2 - lat1) * d / 2) ** 2 +
    Math.cos(lat1 * d) * Math.cos(lat2 * d) * Math.sin((lon2 - lon1) * d / 2) ** 2;
  return 12742 * Math.asin(Math.min(1, Math.sqrt(a)));
}

// speed: km/h while moving. hours: moving hours per day (the rest is sleep/rest).
// climb: metres of ascent per extra hour (Naismith-style). roughK: mountain slow-down.
// gap: km of the "wrong" surface a segment may cross (bridges, tunnels, portages).
const MODES = {
  walk:    { name: 'Walk', icon: '🚶', color: '#3d7a3a', dash: [], speed: 5, hours: 10, terrain: 'land', climb: 600, human: true, setup: 0, gap: 3 },
  run:     { name: 'Run', icon: '🏃', color: '#d9772b', dash: [], speed: 10, hours: 5, terrain: 'land', climb: 800, human: true, setup: 0, gap: 3 },
  bike:    { name: 'Bicycle', icon: '🚲', color: '#1f8a8a', dash: [], speed: 20, hours: 8, terrain: 'land', climb: 700, human: true, setup: 0.25, gap: 3, noIce: true },
  skate:   { name: 'Skateboard', icon: '🛹', color: '#b5338a', dash: [2, 5], speed: 12, hours: 4, terrain: 'land', climb: 300, human: true, setup: 0, gap: 3, noIce: true, roughK: 150 },
  car:     { name: 'Car', icon: '🚗', color: '#c23b2e', dash: [], speed: 80, hours: 12, terrain: 'land', climb: 0, setup: 0.5, gap: 25, noIce: true, roughK: 400 },
  train:   { name: 'Train', icon: '🚆', color: '#5b3fa8', dash: [10, 4], speed: 120, hours: 24, terrain: 'land', climb: 0, setup: 1, gap: 55, noIce: true, roughK: 200 },
  ferry:   { name: 'Boat', icon: '⛴️', color: '#1d5e9e', dash: [12, 5], speed: 30, hours: 24, terrain: 'water', climb: 0, setup: 2, gap: 25 },
  swim:    { name: 'Swim', icon: '🏊', color: '#2aa6c9', dash: [3, 4], speed: 3, hours: 8, terrain: 'water', climb: 0, human: true, setup: 0, gap: 25 },
  balloon: { name: 'Hot air balloon', icon: '🎈', color: '#e0457b', dash: [1, 6], speed: 15, hours: 24, terrain: 'air', climb: 0, setup: 3, gap: 0, silly: true },
  rocket:  { name: 'Rocket', icon: '🚀', color: '#222', dash: [14, 6], hours: 24, terrain: 'space', setup: 72, flight: 1, silly: true },
  moon:    { name: 'Rocket via the Moon', icon: '🌕', color: '#8a7a2e', dash: [14, 6], hours: 24, terrain: 'space', setup: 72, flight: 145, silly: true },
};
const MODE_KEYS = Object.keys(MODES);

// Spaceports. Coordinates are approximate (to about 0.1°).
const SITES = [
  ['Cape Canaveral, USA', 28.5, -80.6], ['Vandenberg, USA', 34.7, -120.6], ['Starbase, Texas', 26.0, -97.2],
  ['Kourou, French Guiana', 5.2, -52.8], ['Alcântara, Brazil', -2.3, -44.4], ['SaxaVord, Shetland', 60.8, -0.8],
  ['Andøya, Norway', 69.3, 16.0], ['Plesetsk, Russia', 62.9, 40.6], ['Baikonur, Kazakhstan', 45.9, 63.3],
  ['Palmachim, Israel', 31.9, 34.7], ['Sriharikota, India', 13.7, 80.2], ['Jiuquan, China', 41.0, 100.3],
  ['Wenchang, China', 19.6, 110.9], ['Naro, South Korea', 34.4, 127.5], ['Tanegashima, Japan', 30.4, 131.0],
  ['Vostochny, Russia', 51.9, 128.3], ['Māhia, New Zealand', -39.3, 177.9],
];

// Returns null if mode m may be in cell i, otherwise the kind of problem.
function terrainProblem(m, i, lat, lon) {
  const M = MODES[m], land = isLand(i);
  if (M.terrain === 'land') {
    if (!land) return 'water';
    if (M.noIce && isIce(i, lat, lon)) return 'ice';
  } else if (M.terrain === 'water') {
    if (land) return 'land';
  } else if (M.terrain === 'air') {
    if (maxM(i) > 4500) return 'peak';
  }
  return null;
}
// eastFrac: share of the step heading east (-1..1), for balloon winds.
function speedAt(m, i, lat, eastFrac) {
  const M = MODES[m];
  if (m === 'balloon') {
    const a = Math.abs(lat), toEast = a >= 30 && a < 60 ? 1 : -1; // westerlies vs trade/polar easterlies
    return Math.max(2, 15 + 25 * toEast * eastFrac);
  }
  let v = M.speed;
  if (M.roughK) v = v / (1 + roughM(i) / M.roughK);
  return v;
}
function hoursPerDay(m, lat) {
  if (m === 'swim' && Math.abs(lat) > 50) return 3; // cold water
  return MODES[m].hours;
}
// Extra hours for climbing dElev metres plus the hidden ups and downs of rough ground.
function climbHours(m, dElev, i, km) {
  const M = MODES[m];
  if (!M.climb || !isLand(i)) return 0;
  return (Math.max(0, dElev) + roughM(i) * 0.6 * km / 10) / M.climb;
}

// Best-route solver: Dijkstra over grid cells using day-averaged speeds.
function solveRoute(startLL, endLL, allowed) {
  const R = G.R, C = G.C, N = R * C;
  const s = cellOf(startLL[0], startLL[1]), t = cellOf(endLL[0], endLL[1]);
  const modes = allowed.filter(m => MODES[m].terrain !== 'space');
  const space = allowed.filter(m => MODES[m].terrain === 'space');
  const siteCells = SITES.map(x => cellOf(x[1], x[2]));
  const siteOf = new Map(siteCells.map((c, k) => [c, k]));
  const dist = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), pmode = new Int8Array(N).fill(-1);
  const done = new Uint8Array(N);
  // binary heap of (key,node)
  let hk = new Float64Array(1 << 16), hn = new Int32Array(1 << 16), hs = 0;
  function push(k, n) {
    if (hs === hk.length) { const a = new Float64Array(hs * 2); a.set(hk); hk = a; const b = new Int32Array(hs * 2); b.set(hn); hn = b; }
    let j = hs++;
    while (j > 0) { const p = (j - 1) >> 1; if (hk[p] <= k) break; hk[j] = hk[p]; hn[j] = hn[p]; j = p; }
    hk[j] = k; hn[j] = n;
  }
  function pop() {
    const n = hn[0], k = hk[0], lk = hk[--hs], ln = hn[hs];
    let j = 0;
    for (;;) { let c = 2 * j + 1; if (c >= hs) break; if (c + 1 < hs && hk[c + 1] < hk[c]) c++; if (hk[c] >= lk) break; hk[j] = hk[c]; hn[j] = hn[c]; j = c; }
    hk[j] = lk; hn[j] = ln; return n;
  }
  const midx = modes.map(m => MODE_KEYS.indexOf(m));
  const avgK = modes.map(m => MODES[m].hours / 24);
  // A* heuristic: straight-line distance at the fastest day-averaged speed, or via the best spaceports.
  let vmax = 0;
  for (const m of modes) vmax = Math.max(vmax, m === 'balloon' ? 40 : MODES[m].speed * MODES[m].hours / 24);
  const tl = [cellLat((t / C) | 0), cellLon(t % C)];
  const nearSite = (la, lo) => { let b = Infinity; for (const x of SITES) b = Math.min(b, hav(la, lo, x[1], x[2])); return b; };
  const spaceCost = space.length ? Math.min(...space.map(m => MODES[m].setup + MODES[m].flight)) : Infinity;
  const tSite = space.length ? nearSite(tl[0], tl[1]) : 0;
  function heur(n) {
    const la = cellLat((n / C) | 0), lo = cellLon(n % C);
    let h = hav(la, lo, tl[0], tl[1]) * 0.98 / vmax;
    if (space.length) h = Math.min(h, (nearSite(la, lo) + tSite) * 0.98 / vmax + spaceCost);
    return h;
  }
  dist[s] = 0; push(heur(s), s);
  const DR = [-1, -1, -1, 0, 0, 1, 1, 1], DC = [-1, 0, 1, -1, 1, -1, 0, 1];
  while (hs > 0) {
    const u = pop();
    if (done[u]) continue;
    done[u] = 1;
    if (u === t) break;
    const ur = (u / C) | 0, uc = u - ur * C, ulat = cellLat(ur), du = dist[u];
    const ns = 27.8, ew = 27.8 * Math.cos(ulat * Math.PI / 180);
    for (let k = 0; k < 8; k++) {
      const vr = ur + DR[k], vc = uc + DC[k];
      if (vr < 0 || vr >= R || vc < 0 || vc >= C) continue;
      const v = vr * C + vc;
      if (done[v]) continue;
      const dx = DC[k] * ew, dy = DR[k] * ns, km = Math.sqrt(dx * dx + dy * dy), east = dx / km;
      const vlat = cellLat(vr), vlon = cellLon(vc), dE = (ELEV[v] - ELEV[u]) * 25;
      let best = Infinity, bm = -1;
      for (let q = 0; q < modes.length; q++) {
        const m = modes[q];
        if (terrainProblem(m, v, vlat, vlon)) continue;
        const frac = m === 'swim' ? hoursPerDay(m, vlat) / 24 : avgK[q];
        const h = (km / speedAt(m, v, vlat, east) + climbHours(m, dE, v, km)) / frac;
        if (h < best) { best = h; bm = midx[q]; }
      }
      if (bm >= 0 && du + best < dist[v]) { dist[v] = du + best; prev[v] = u; pmode[v] = bm; push(dist[v] + heur(v), v); }
    }
    if (space.length && siteOf.has(u)) {
      for (const m of space) {
        const cost = MODES[m].setup + MODES[m].flight, mi = MODE_KEYS.indexOf(m);
        for (const v of siteCells) if (v !== u && !done[v] && du + cost < dist[v]) { dist[v] = du + cost; prev[v] = u; pmode[v] = mi; push(dist[v] + heur(v), v); }
      }
    }
  }
  if (!isFinite(dist[t])) return null;
  const cells = [];
  for (let v = t; v !== -1; v = prev[v]) cells.push(v);
  cells.reverse();
  // Collapse into runs of the same mode.
  const runs = [];
  for (let j = 1; j < cells.length; j++) {
    const m = MODE_KEYS[pmode[cells[j]]], a = cells[j - 1], b = cells[j];
    const ll = c => [cellLat((c / C) | 0), cellLon(c % C)];
    const A = ll(a), B = ll(b), km = hav(A[0], A[1], B[0], B[1]);
    const last = runs[runs.length - 1];
    if (last && last.mode === m) { last.pts.push(B); last.km += km; last.hours += dist[b] - dist[a]; }
    else runs.push({ mode: m, pts: [A, B], km, hours: dist[b] - dist[a] });
  }
  let hours = dist[t];
  for (const r of runs) if (MODES[r.mode].terrain !== 'space') hours += MODES[r.mode].setup;
  return { hours, runs };
}

// Trips (start, end). Coordinates are approximate (to about 0.05°).
const TRIPS = [
  ['Ely, Nevada', 39.25, -114.89, 'Hampi, India', 15.34, 76.46],
  ['Inverness, Scotland', 57.48, -4.22, 'Marrakesh, Morocco', 31.63, -7.99],
  ['Kathmandu, Nepal', 27.70, 85.32, 'Paris, France', 48.86, 2.35],
  ['Cape Town, South Africa', -33.92, 18.42, 'Cairo, Egypt', 30.04, 31.24],
  ['Reykjavík, Iceland', 64.15, -21.94, 'Lisbon, Portugal', 38.72, -9.14],
  ['Lhasa, Tibet', 29.65, 91.10, 'Singapore', 1.35, 103.82],
  ['Perth, Australia', -31.95, 115.86, 'Tokyo, Japan', 35.68, 139.69],
  ['Timbuktu, Mali', 16.77, -3.00, 'Moscow, Russia', 55.75, 37.62],
  ['Nome, Alaska', 64.50, -165.40, 'New York, USA', 40.71, -74.00],
  ['La Paz, Bolivia', -16.50, -68.15, 'Miami, USA', 25.76, -80.19],
  ['Tromsø, Norway', 69.65, 18.96, 'Athens, Greece', 37.98, 23.73],
  ['Ulaanbaatar, Mongolia', 47.90, 106.90, 'Istanbul, Türkiye', 41.01, 28.98],
  ['Nairobi, Kenya', -1.29, 36.82, 'Mumbai, India', 19.08, 72.88],
  ['Quito, Ecuador', -0.18, -78.47, 'Rio de Janeiro, Brazil', -22.91, -43.17],
  ['Edinburgh, Scotland', 55.95, -3.19, 'Oslo, Norway', 59.91, 10.75],
  ['Cusco, Peru', -13.53, -71.97, 'Buenos Aires, Argentina', -34.60, -58.38],
  ['Seoul, South Korea', 37.57, 126.98, 'Sydney, Australia', -33.87, 151.21],
  ['Dublin, Ireland', 53.35, -6.26, 'New York, USA', 40.71, -74.00],
  ['Fairbanks, Alaska', 64.84, -147.72, 'Mexico City, Mexico', 19.43, -99.13],
  ['Hobart, Tasmania', -42.88, 147.33, 'Darwin, Australia', -12.46, 130.84],
];

const RULES = {
  classic:  { name: 'Classic', modes: ['walk', 'run', 'bike', 'skate', 'car', 'train', 'ferry', 'swim', 'balloon', 'rocket', 'moon'], note: 'Everything except planes. Find the fastest mix.' },
  human:    { name: 'Human power', modes: ['walk', 'run', 'bike', 'skate', 'swim'], note: 'No engines. Oceans are your problem.' },
  tri:      { name: 'Triathlon', modes: ['run', 'bike', 'swim'], note: 'Run, bike and swim only, and each for at least 1 hour.', min: 1 },
  nowheels: { name: 'No wheels', modes: ['walk', 'run', 'ferry', 'swim', 'balloon'], note: 'Feet, boats and balloons.' },
  balloon:  { name: 'Balloonatic', modes: ['walk', 'balloon'], note: 'A hot air balloon and your own two feet. Winds blow east between 30° and 60° latitude, west elsewhere.' },
  rocket:   { name: 'Rocket Man', modes: ['walk', 'run', 'rocket', 'moon'], note: 'Rockets only fly between spaceports. You walk the rest.' },
};


// Formatting.
function fmtH(h) {
  if (!isFinite(h)) return '—';
  const m = Math.round(h * 60), d = Math.floor(m / 1440), hh = Math.floor((m % 1440) / 60), mm = m % 60;
  if (d) return hh ? `${d}d ${hh}h` : `${d}d`;
  if (hh) return mm ? `${hh}h ${String(mm).padStart(2, '0')}m` : `${hh}h`;
  return `${mm}m`;
}
const fmtKm = k => k >= 100 ? Math.round(k).toLocaleString() + ' km' : k.toFixed(1) + ' km';
const fmtLL = (la, lo) => `${Math.abs(la).toFixed(2)}°${la >= 0 ? 'N' : 'S'} ${Math.abs(lo).toFixed(2)}°${lo >= 0 ? 'E' : 'W'}`;


// Leg timing: one leg is a straight line drawn with one mode.
function nearestSite(la, lo) {
  let b = null, bd = Infinity;
  for (const s of SITES) { const d = hav(la, lo, s[1], s[2]); if (d < bd) { bd = d; b = s; } }
  return { site: b, km: bd };
}
const PROBLEM_TEXT = {
  water: m => `You can't ${m === 'car' ? 'drive' : m === 'train' ? 'take a train' : m === 'bike' ? 'cycle' : m === 'skate' ? 'skate' : m === 'run' ? 'run' : 'walk'} across that much water. Switch to a boat or swim.`,
  land: m => m === 'swim' ? 'That swim crosses dry land. Get out and walk.' : 'Boats need water. That leg crosses land.',
  ice: m => `${MODES[m].name}s don't work on ice sheets. Walk it.`,
  peak: () => 'Your balloon crashed into the mountains. Go around peaks over 4,500 m.',
};
function evalLeg(mode, a, b) {
  const M = MODES[mode], leg = { mode, a, b, km: hav(a[0], a[1], b[0], b[1]), moving: 0, rest: 0, extra: 0, events: [], error: null };
  if (M.terrain === 'space') {
    const sa = nearestSite(a[0], a[1]), sb = nearestSite(b[0], b[1]);
    if (sa.km > 60) leg.error = 'Rockets launch from spaceports. Get to one first (the 🚀 pins).';
    else if (sb.km > 60) leg.error = 'Rockets can only land at a spaceport.';
    leg.moving = M.flight;
    leg.total = M.setup + M.flight;
    leg.events.push(`${M.setup}h of launch prep at ${sa.site[0]}`);
    if (mode === 'moon') leg.events.push('Scenic detour round the Moon, about 6 days');
    return leg;
  }
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])) / 0.05));
  let along = 0, gapRun = 0, maxE = 0, cold = false, prevCell = cellOf(a[0], a[1]);
  for (let k = 0; k < n; k++) {
    const t0 = k / n, t1 = (k + 1) / n;
    const la0 = a[0] + (b[0] - a[0]) * t0, lo0 = a[1] + (b[1] - a[1]) * t0;
    const la1 = a[0] + (b[0] - a[0]) * t1, lo1 = a[1] + (b[1] - a[1]) * t1;
    const km = hav(la0, lo0, la1, lo1); if (km === 0) continue;
    const mla = (la0 + la1) / 2, mlo = (lo0 + lo1) / 2, i = cellOf(mla, mlo);
    along += km;
    const edge = along <= 15 || leg.km - along <= 15; // 15 km grace at each end (docks, coasts)
    const prob = terrainProblem(mode, i, mla, mlo);
    if (prob && !edge) {
      if (prob === 'water' || prob === 'land') { gapRun += km; if (gapRun > M.gap && !leg.error) leg.error = PROBLEM_TEXT[prob](mode); }
      else if (!leg.error) leg.error = PROBLEM_TEXT[prob](mode);
    } else gapRun = 0;
    const east = (lo1 - lo0) * 111.32 * Math.cos(mla * Math.PI / 180) / km;
    leg.moving += km / speedAt(mode, i, mla, east) + climbHours(mode, elevM(i) - elevM(prevCell), i, km);
    if (isLand(i)) maxE = Math.max(maxE, elevM(i));
    if (mode === 'swim' && Math.abs(mla) > 50) cold = true;
    prevCell = i;
  }
  leg.maxE = maxE; leg.cold = cold;
  return leg;
}
// Consecutive legs with the same mode form one stint: one setup, shared rest days, one altitude stop.
function restFor(moving, hpd) { return hpd >= 24 ? 0 : Math.max(0, Math.ceil(moving / hpd - 1e-9) - 1) * (24 - hpd); }
function finalizeLegs(legs) {
  let cum = 0, acclimatised = false;
  legs.forEach((l, k) => {
    const M = MODES[l.mode], first = k === 0 || legs[k - 1].mode !== l.mode;
    if (M.terrain === 'space') { cum = 0; acclimatised = false; return; }
    if (first) { cum = 0; acclimatised = false; }
    const hpd = l.cold ? 3 : M.hours, before = cum; cum += l.moving;
    l.rest = restFor(cum, hpd) - restFor(before, hpd);
    l.setup = first ? M.setup : 0;
    if (l.rest > 0) l.events.push(`${fmtH(l.rest)} of sleep and rest (${hpd}h of ${M.name.toLowerCase()} a day)`);
    if (l.cold) l.events.push('Freezing water: only 3h of swimming a day');
    if (M.human && l.maxE >= 3000 && !acclimatised) { acclimatised = true; l.extra += 24; l.events.push(`Altitude sickness at about ${Math.round(l.maxE / 100) * 100} m: +24h to acclimatise`); }
    if (l.mode === 'ferry') { const d = Math.floor(cum / 24) - Math.floor(before / 24); if (d > 0) { l.extra += 4 * d; l.events.push(`Seasick: +${4 * d}h lying down`); } }
    if (l.mode === 'swim' && l.km > 34) l.events.push('Longer than swimming the English Channel');
    if (l.mode === 'balloon') l.events.push('Riding the prevailing winds');
    if (l.setup) l.events.push(`${fmtH(M.setup)} to ${{ bike: 'rent a bike', car: 'hire a car', train: 'catch the train', ferry: 'board the boat', balloon: 'inflate the balloon' }[l.mode]}`);
    l.total = l.setup + l.moving + l.rest + l.extra;
  });
  return legs;
}

function grade(ratio) {
  return ratio >= 1 ? 'A+' : ratio >= 0.85 ? 'A' : ratio >= 0.7 ? 'B' : ratio >= 0.5 ? 'C' : ratio >= 0.3 ? 'D' : 'F';
}

// Daily trip number: trip #1 was 1 Oct 2026 (UTC).
function dailyTrip(nowMs) {
  const day = Math.floor((nowMs - Date.UTC(2026, 9, 1)) / 864e5);
  return { idx: ((day % TRIPS.length) + TRIPS.length) % TRIPS.length, no: Math.max(1, day + 1) };
}

if (typeof module !== 'undefined') module.exports = { G, setGrid, cellOf, cellLat, cellLon, elevM, maxM, roughM, isLand, isIce, hav, MODES, MODE_KEYS, SITES, terrainProblem, speedAt, hoursPerDay, climbHours, solveRoute, TRIPS, RULES, fmtH, fmtKm, fmtLL, nearestSite, evalLeg, restFor, finalizeLegs, grade, dailyTrip };
