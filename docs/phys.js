// Vamos game rules. Pure functions only (no DOM), so they run in the page, the worker and Node tests.
// Grid: 0.25° cells, 720 rows (90N→90S) × 1440 cols (180W→180E).
const G = { R: 720, C: 1440, step: 0.25 };
let ELEV, MAXE, ROUGH, LAND;
function setGrid(buf) {
  const n = G.R * G.C;
  ELEV = buf.subarray(0, n);          // mean land elevation, 25 m units
  MAXE = buf.subarray(n, 2 * n);      // highest point in cell, 40 m units
  ROUGH = buf.subarray(2 * n, 3 * n); // elevation spread in cell, 5 m units
  LAND = buf.subarray(3 * n, 4 * n);  // surface: 0 = sea, 1 = land, 2 = lake
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
const isLake = i => LAND[i] === 2;
// Somewhere a paraglider can launch: a peak at least 300 m above the cell's average ground.
const isHill = i => LAND[i] === 1 && (MAXE[i] * 40 - ELEV[i] * 25) >= 300;
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
  hitch:   { name: 'Hitchhike', icon: '👍', color: '#9c6b2f', dash: [1, 4], speed: 80, hours: 12, terrain: 'land', climb: 0, setup: 3, gap: 25, noIce: true, roughK: 400 },
  train:   { name: 'Train', icon: '🚆', color: '#5b3fa8', dash: [10, 4], speed: 120, hours: 24, terrain: 'land', climb: 0, setup: 1, gap: 55, noIce: true, roughK: 200 },
  ferry:   { name: 'Boat', icon: '⛴️', color: '#1d5e9e', dash: [12, 5], speed: 30, hours: 24, terrain: 'water', climb: 0, setup: 2, gap: 25 },
  sail:    { name: 'Sailboat', icon: '⛵', color: '#4a6fb5', dash: [8, 3, 2, 3], speed: 10, hours: 24, terrain: 'water', climb: 0, setup: 2, gap: 25 },
  kayak:   { name: 'Kayak', icon: '🛶', color: '#2f8f6b', dash: [6, 4], speed: 6, hours: 8, terrain: 'water', climb: 0, human: true, setup: 0.5, gap: 5 },
  swim:    { name: 'Swim', icon: '🏊', color: '#2aa6c9', dash: [3, 4], speed: 2.4, hours: 8, terrain: 'water', climb: 0, human: true, setup: 0, gap: 25 },
  glide:   { name: 'Paraglider', icon: '🪂', color: '#e07b1f', dash: [2, 3], speed: 25, hours: 6, terrain: 'glide', climb: 0, setup: 0.5, gap: 10, maxKm: 150 },
  sled:    { name: 'Dog sled', icon: '🛷', color: '#6b7f99', dash: [], speed: 12, hours: 8, terrain: 'snow', climb: 0, setup: 1, gap: 3 },
  balloon: { name: 'Hot air balloon', icon: '🎈', color: '#e0457b', dash: [1, 6], speed: 15, hours: 24, terrain: 'air', climb: 0, setup: 3, gap: 0, silly: true },
  tortoise:{ name: 'Giant tortoise', icon: '🐢', color: '#5f8a3a', dash: [1, 3], speed: 0.3, hours: 24, terrain: 'land', climb: 0, setup: 0, gap: 0.5, silly: true },
  cannon:  { name: 'Human cannonball', icon: '💥', color: '#444', dash: [1, 8], speed: 0.15, hours: 12, terrain: 'land', climb: 0, setup: 1, gap: 0.3, silly: true },
  carpet:  { name: 'Magic carpet', icon: '🪄', color: '#8e44ad', dash: [10, 3, 2, 3], speed: 60, hours: 24, terrain: 'any', climb: 0, setup: 0, gap: 0, char: true },
  hammer:  { name: 'Hammer flight', icon: '🔨', color: '#5a6fa8', dash: [12, 4], speed: 250, hours: 12, terrain: 'any', climb: 0, setup: 0, gap: 0, char: true },
  fly:     { name: 'Superflight', icon: '🦸', color: '#d63b3b', dash: [16, 4], speed: 1000, hours: 24, terrain: 'any', climb: 0, setup: 0, gap: 0, char: true },
  web:     { name: 'Web swing', icon: '🕸️', color: '#c0392b', dash: [3, 3], speed: 40, hours: 10, terrain: 'land', climb: 0, setup: 0, gap: 3, char: true },
  rocket:  { name: 'Rocket', icon: '🚀', color: '#222', dash: [14, 6], hours: 24, terrain: 'space', setup: 72, flight: 1, silly: true },
  moon:    { name: 'Rocket via the Moon', icon: '🌕', color: '#8a7a2e', dash: [14, 6], hours: 24, terrain: 'space', setup: 72, flight: 145, silly: true },
};
const MODE_KEYS = Object.keys(MODES);

// Characters change what you can do. Each one is inspired by a story, with an original name.
// boost: extra speed per mode (0.5 = 50% faster), on top of earned stats. modes: extra ways to travel.
const CHARS = {
  none:     { name: 'Traveller', icon: '🧍', power: 'Plain old you.' },
  fox:      { name: 'Fox', icon: '🦊', power: 'Runs 15 km/h and walks 6 km/h.', boost: { run: 0.5, walk: 0.2 } },
  climber:  { name: 'Mountaineer', icon: '🧗', power: 'Never gets altitude sickness and climbs twice as fast on foot.', noAltitude: true, climbMul: 2 },
  mermaid:  { name: 'Mermaid', icon: '🧜', power: 'Swims 20 km/h, 24 hours a day, in any water temperature.', boost: { swim: 20 / 2.4 - 1 }, noCold: true, swimHours: 24 },
  genie:    { name: 'Genie', icon: '🧞', power: 'Rides a magic carpet: 60 km/h, day and night, over anything.', modes: ['carpet'] },
  thunder:  { name: 'Thunder God', icon: '⚡', power: 'Hammer flight: 250 km/h for 12 hours a day, over anything.', modes: ['hammer'] },
  caped:    { name: 'Caped Hero', icon: '🦸', power: 'Superflight: 1,000 km/h, nonstop, up to the edge of space.', modes: ['fly'] },
  knight:   { name: 'Star Knight', icon: '🧙', power: 'Never waits: no setup or hitchhiking delays, and runs twice as fast.', noSetup: true, boost: { run: 1 } },
  relic:    { name: 'Relic Hunter', icon: '🤠', power: 'Whip-swings across up to 10 km of water on land modes, and never gets seasick.', gapBonus: 10, noSeasick: true },
  web:      { name: 'Web Slinger', icon: '🕷️', power: 'Web swing: 40 km/h, and mountains don\'t slow it.', modes: ['web'] },
};
let CH = CHARS.none;
function setCharacter(id) { CH = CHARS[id] || CHARS.none; }
// Speed-ups from earned stats and from the character, added together.
function totalBoost(boost, m) { return ((boost && boost[m]) || 0) + ((CH.boost && CH.boost[m]) || 0); }
// The modes a player may use: the rule set's plus the character's own.
function allowedModes(rulesKey) { return [...RULES[rulesKey].modes, ...(CH.modes || []).filter(m => !RULES[rulesKey].modes.includes(m))]; }

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
  } else if (M.terrain === 'snow') {
    if (!land) return 'water';
    if (!isIce(i, lat, lon) && Math.abs(lat) < 60) return 'snow';
  } else if (M.terrain === 'glide') {
    if (!land) return 'water';
    if (maxM(i) > 4500) return 'peak';
  } else if (M.terrain === 'any') {
    return null;
  } else if (M.terrain === 'air') {
    if (maxM(i) > 4500) return 'peak';
  }
  return null;
}
// Prevailing winds: +1 blows east (westerlies, 30°–60°), −1 blows west (trade and polar easterlies).
const windDir = lat => { const a = Math.abs(lat); return a >= 30 && a < 60 ? 1 : -1; };
// eastFrac: share of the step heading east (-1..1), for winds.
// boost: the player's earned speed-ups, e.g. { swim: 0.06 } for 6% faster swimming (see boostsFrom).
function speedAt(m, i, lat, eastFrac, boost) {
  const M = MODES[m];
  if (m === 'balloon') return Math.max(2, 15 + 25 * windDir(lat) * eastFrac);
  if (m === 'sail') return Math.max(4, 10 + 8 * windDir(lat) * eastFrac); // tacking still gets you upwind, slowly
  let v = M.speed * (1 + totalBoost(boost, m));
  if (M.roughK) v = v / (1 + roughM(i) / M.roughK);
  return v;
}
function hoursPerDay(m, lat) {
  if (m === 'swim' && CH.swimHours) return CH.swimHours;
  if (m === 'swim' && Math.abs(lat) > 50 && !CH.noCold) return 3; // cold water
  return MODES[m].hours;
}
// Extra hours for climbing dElev metres plus the hidden ups and downs of rough ground.
function climbHours(m, dElev, i, km) {
  const M = MODES[m];
  if (!M.climb || !isLand(i)) return 0;
  return (Math.max(0, dElev) + roughM(i) * 0.6 * km / 10) / (M.climb * (M.human && CH.climbMul || 1));
}

// Best-route solver: Dijkstra over grid cells using day-averaged speeds.
function solveRoute(startLL, endLL, allowed, boost) {
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
  const avgK = modes.map(m => hoursPerDay(m, 0) / 24);
  // A* heuristic: straight-line distance at the fastest day-averaged speed, or via the best spaceports.
  let vmax = 0;
  const capB = 1 + STAT_CAP / 100;
  for (const m of modes) vmax = Math.max(vmax, m === 'balloon' ? 40 : m === 'sail' ? 18 : MODES[m].speed * (capB + totalBoost(null, m)) * hoursPerDay(m, 0) / 24);
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
    const ns = 27.8, ew = 27.8 * Math.cos(ulat * Math.PI / 180), hillU = isHill(u);
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
        if (m === 'glide' && !hillU) continue; // the solver only glides off hills, one cell at a time (a cautious par)
        const frac = m === 'swim' ? hoursPerDay(m, vlat) / 24 : avgK[q];
        const h = (km / speedAt(m, v, vlat, east, boost) + climbHours(m, dE, v, km)) / frac;
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
  classic:  { name: 'Classic', modes: ['walk', 'run', 'bike', 'skate', 'car', 'hitch', 'train', 'ferry', 'sail', 'kayak', 'swim', 'glide', 'sled', 'balloon', 'tortoise', 'cannon', 'rocket', 'moon'], note: 'Everything except planes. Find the fastest mix.' },
  human:    { name: 'Human power', modes: ['walk', 'run', 'bike', 'skate', 'kayak', 'swim', 'glide'], note: 'No engines. Oceans are your problem.' },
  tri:      { name: 'Triathlon', modes: ['run', 'bike', 'swim'], note: 'Run, bike and swim only, and each for at least 1 hour.', min: 1 },
  nowheels: { name: 'No wheels', modes: ['walk', 'run', 'ferry', 'sail', 'kayak', 'swim', 'glide', 'sled', 'balloon', 'tortoise'], note: 'Feet, boats, wings, dogs and balloons.' },
  balloon:  { name: 'Balloonatic', modes: ['walk', 'balloon'], note: 'A hot air balloon and your own two feet. Winds blow east between 30° and 60° latitude, west elsewhere.' },
  rocket:   { name: 'Rocket Man', modes: ['walk', 'run', 'rocket', 'moon'], note: 'Rockets only fly between spaceports. You walk the rest.' },
  silly:    { name: 'Silly season', modes: ['walk', 'tortoise', 'cannon', 'swim', 'glide', 'balloon'], note: 'Only the daft ways to travel. Bring snacks.' },
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
  water: m => m === 'glide' ? 'Paragliders have to land on land. That leg ends up over open water.' :
    `You can't ${{ car: 'drive', hitch: 'hitch a lift', train: 'take a train', bike: 'cycle', skate: 'skate', run: 'run', sled: 'sled', tortoise: 'ride a tortoise', cannon: 'fire yourself' }[m] || 'walk'} across that much water. Switch to a boat or swim.`,
  land: m => m === 'swim' ? 'That swim crosses dry land. Get out and walk.' : m === 'kayak' ? 'Kayaks need water. Carry it a few km at most, then walk.' : 'Boats need water. That leg crosses land.',
  snow: () => 'Dog sleds need snow: ice sheets, or land beyond 60° north or south.',
  ice: m => `${MODES[m].name}s don't work on ice sheets. Walk it.`,
  peak: m => `Your ${m === 'glide' ? 'paraglider' : 'balloon'} crashed into the mountains. Go around peaks over 4,500 m.`,
};
// km of the wrong surface a leg may cross (bridges, canals); the Relic Hunter's whip adds more on land.
const gapOf = m => MODES[m].gap + (MODES[m].terrain === 'land' && CH.gapBonus || 0);
function evalLeg(mode, a, b, boost) {
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
  let along = 0, gapRun = 0, maxE = 0, cold = false, ice = false, lake = false, launch = false, prevCell = cellOf(a[0], a[1]);
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
      if (prob === 'water' || prob === 'land') { gapRun += km; if (gapRun > gapOf(mode) && !leg.error) leg.error = PROBLEM_TEXT[prob](mode); }
      else if (!leg.error) leg.error = PROBLEM_TEXT[prob](mode);
    } else gapRun = 0;
    const east = (lo1 - lo0) * 111.32 * Math.cos(mla * Math.PI / 180) / km;
    leg.moving += km / speedAt(mode, i, mla, east, boost) + climbHours(mode, elevM(i) - elevM(prevCell), i, km);
    if (isLand(i)) maxE = Math.max(maxE, elevM(i));
    if (mode === 'swim' && Math.abs(mla) > 50 && !CH.noCold && !CH.swimHours) cold = true;
    if (isIce(i, mla, mlo)) ice = true;
    if (isLake(i)) lake = true;
    if (along <= 15 && isHill(i)) launch = true;
    prevCell = i;
  }
  leg.maxE = maxE; leg.cold = cold; leg.ice = ice; leg.lake = lake;
  if (mode === 'glide' && !leg.error) {
    if (!launch) leg.error = 'Paragliders launch from hills. Start this leg somewhere hilly (300 m above the land around).';
    else if (leg.km > M.maxKm) leg.error = `A paraglider flies about ${M.maxKm} km in a day. Land, then launch again from a hill.`;
  }
  return leg;
}
// Auto-stop: where would a leg from a towards b have to stop? A boat heading inland stops at the coast,
// a car stops where the sea starts, a paraglider stops at its daily limit. Short stretches the mode may
// cross (bridges, canals) are kept unless the leg would end more than 15 km onto them. Returns null if the leg can't start.
function clipLeg(mode, a, b, finish) {
  const M = MODES[mode];
  if (M.terrain === 'space' || M.terrain === 'any') return { ll: b, clipped: false };
  const km0 = hav(a[0], a[1], b[0], b[1]), n = Math.max(1, Math.ceil(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])) / 0.01));
  const at = t => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  let along = 0, run = 0, runStart = -1, tail = 0, tailStart = -1, cut = -1, why = null;
  for (let k = 0; k < n; k++) {
    const t0 = k / n, t1 = (k + 1) / n, p0 = at(t0), p1 = at(t1), km = hav(p0[0], p0[1], p1[0], p1[1]);
    const mid = at((t0 + t1) / 2), prob = terrainProblem(mode, cellOf(mid[0], mid[1]), mid[0], mid[1]);
    if (M.maxKm && along + km > M.maxKm) { cut = t0; why = 'limit'; break; }
    along += km;
    if (prob === 'water' || prob === 'land') { if (tailStart < 0) tailStart = t0; tail += km; } else { tail = 0; tailStart = -1; }
    const edge = along <= 15 || km0 - along <= 15; // the same 15 km grace at each end as evalLeg
    if (!prob || edge) { run = 0; runStart = -1; continue; }
    if (prob !== 'water' && prob !== 'land') { cut = t0; why = prob; break; }
    if (runStart < 0) runStart = t0;
    run += km;
    if (run > gapOf(mode)) { cut = tailStart; why = prob; break; }
  }
  // Ends well onto the wrong surface (more than the 15 km of docks and coast): stop where it began.
  // Not when heading for the trip's finish, which may sit a little inland on this coarse map.
  if (cut < 0 && tailStart >= 0 && tail > 15 && !finish) { cut = tailStart; why = 'edge'; }
  if (cut < 0) return { ll: b, clipped: false };
  if (cut * km0 < 1) return null;
  return { ll: at(cut), clipped: true, why };
}

// Consecutive legs with the same mode form one stint: one setup, shared rest days, one altitude stop.
function restFor(moving, hpd) { return hpd >= 24 ? 0 : Math.max(0, Math.ceil(moving / hpd - 1e-9) - 1) * (24 - hpd); }
function finalizeLegs(legs, seed) {
  let cum = 0, acclimatised = false;
  legs.forEach((l, k) => {
    const M = MODES[l.mode], first = k === 0 || legs[k - 1].mode !== l.mode;
    if (M.terrain === 'space') { cum = 0; acclimatised = false; return; }
    if (first) { cum = 0; acclimatised = false; }
    const hpd = l.cold ? 3 : M.hours, before = cum; cum += l.moving;
    l.rest = restFor(cum, hpd) - restFor(before, hpd);
    l.setup = CH.noSetup ? 0 : l.mode === 'hitch' ? luckWait(seed || 1, k) : first ? M.setup : 0; // every lift is a new wait
    if (l.rest > 0) l.events.push(`${fmtH(l.rest)} of sleep and rest (${hpd}h of ${M.name.toLowerCase()} a day)`);
    if (l.cold) l.events.push('Freezing water: only 3h of swimming a day');
    if (M.human && l.maxE >= 3000 && !acclimatised && !CH.noAltitude) { acclimatised = true; l.extra += 24; l.events.push(`Altitude sickness at about ${Math.round(l.maxE / 100) * 100} m: +24h to acclimatise`); }
    if ((l.mode === 'ferry' || l.mode === 'sail') && !CH.noSeasick) { const d = Math.floor(cum / 24) - Math.floor(before / 24); if (d > 0) { l.extra += 4 * d; l.seasick = d; l.events.push(`Seasick: +${4 * d}h lying down`); } }
    if (l.mode === 'swim' && l.km > 34) l.events.push('Longer than swimming the English Channel');
    if (l.mode === 'balloon' || l.mode === 'sail') l.events.push('Riding the prevailing winds');
    if (l.mode === 'tortoise') l.events.push('The tortoise never sleeps');
    if (l.mode === 'fly' && l.km > 2000) l.events.push('Popped up to the edge of space');
    if (l.mode === 'carpet') l.events.push('A whole new world');
    if (l.mode === 'cannon') l.events.push(`Fired from the cannon ${Math.max(1, Math.round(l.km / 0.3)).toLocaleString()} times`);
    if (l.lake && (l.mode === 'swim' || l.mode === 'kayak')) l.events.push('Across a lake');
    if (l.mode === 'hitch') l.events.push(l.setup ? `${fmtH(l.setup)} waiting for a lift` : 'Got a lift straight away');
    else if (l.setup) l.events.push(`${fmtH(l.setup)} to ${SETUP_TEXT[l.mode] || 'get ready'}`);
    l.total = l.setup + l.moving + l.rest + l.extra;
  });
  return legs;
}

const SETUP_TEXT = { bike: 'rent a bike', car: 'hire a car', train: 'catch the train', ferry: 'board the boat', sail: 'rig the sails',
  kayak: 'rent a kayak', glide: 'lay out the wing', sled: 'harness the dogs', balloon: 'inflate the balloon', cannon: 'load the cannon' };
// Hitchhiking luck: a wait of 0 to 6 hours in 15-minute steps. Same trip and leg number, same wait, for everyone.
function luckWait(seed, k) {
  let a = (Math.imul(seed >>> 0, 2654435761) + Math.imul(k + 1, 40503)) >>> 0;
  a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), a | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * 25) / 4;
}

function grade(ratio) {
  return ratio >= 1 ? 'A+' : ratio >= 0.85 ? 'A' : ratio >= 0.7 ? 'B' : ratio >= 0.5 ? 'C' : ratio >= 0.3 ? 'D' : 'F';
}

// Daily trip number: trip #1 was 1 Oct 2026 (UTC).
function dailyTrip(nowMs) {
  const day = Math.floor((nowMs - Date.UTC(2026, 9, 1)) / 864e5);
  return { idx: ((day % TRIPS.length) + TRIPS.length) % TRIPS.length, no: Math.max(1, day + 1) };
}

// ---------- progress: earned speed-ups and badges ----------
// Doing an activity makes you better at it: +1% speed per this many km in total, up to +15%.
const STAT_KM = { walk: 333, run: 300, bike: 1000, skate: 300, kayak: 150, swim: 33, glide: 500 };
const STAT_CAP = 15;
function emptyProgress() { return { v: 1, km: {}, badges: {}, done: [] }; }
function boostPct(m, km) { return STAT_KM[m] ? Math.min(STAT_CAP, Math.floor((km || 0) / STAT_KM[m])) : 0; }
function boostsFrom(p) { const b = {}; for (const m in STAT_KM) { const x = boostPct(m, p.km[m]); if (x) b[m] = x / 100; } return b; }

// ctx: { total (hours), grade, rules }
const BADGES = [
  { id: 'channel', icon: '🏊', name: 'Channel Crosser', how: 'Swim 34 km or more in one leg', test: (L) => L.some(l => l.mode === 'swim' && l.km >= 34) },
  { id: 'lake', icon: '🛶', name: 'Lake Crosser', how: 'Swim or kayak across a lake', test: (L) => L.some(l => (l.mode === 'swim' || l.mode === 'kayak') && l.lake) },
  { id: 'peak', icon: '🏔️', name: 'Peak Bagger', how: 'Walk or run over ground above 4,000 m', test: (L) => L.some(l => (l.mode === 'walk' || l.mode === 'run') && l.maxE >= 4000) },
  { id: 'glide', icon: '🪂', name: 'Cloud Surfer', how: 'Paraglide 100 km in one leg', test: (L) => L.some(l => l.mode === 'glide' && l.km >= 100) },
  { id: 'sled', icon: '🛷', name: 'Mush!', how: 'Cross an ice sheet by dog sled', test: (L) => L.some(l => l.mode === 'sled' && l.ice) },
  { id: 'hitch', icon: '👍', name: 'Lucky Thumb', how: 'Get a lift with no wait', test: (L) => L.some(l => l.mode === 'hitch' && l.setup === 0) },
  { id: 'seasick', icon: '🤢', name: 'Seasick Sailor', how: 'Be seasick for 5 days in one trip', test: (L) => L.reduce((s, l) => s + (l.seasick || 0), 0) >= 5 },
  { id: 'tortoise', icon: '🐢', name: 'Slow and Steady', how: 'Ride a giant tortoise', test: (L) => L.some(l => l.mode === 'tortoise') },
  { id: 'cannon', icon: '💥', name: 'Human Cannonball', how: 'Get fired from a cannon', test: (L) => L.some(l => l.mode === 'cannon') },
  { id: 'moon', icon: '🌕', name: 'Moonwalker', how: 'Take the scenic route round the Moon', test: (L) => L.some(l => l.mode === 'moon') },
  { id: 'slow', icon: '🐌', name: 'Slowest Ever', how: 'Finish a trip that takes over a year', test: (L, c) => c.total > 365 * 24 },
  { id: 'nowheels', icon: '🦶', name: 'Wheel-free', how: 'Finish a No wheels trip', test: (L, c) => c.rules === 'nowheels' },
  { id: 'aplus', icon: '🏆', name: 'Beat the Computer', how: 'Score an A+', test: (L, c) => c.grade === 'A+' },
];
// Adds a finished trip. km only count the first time a trip is finished under a rule set (key), so replaying
// the same trip doesn't farm speed. Returns the new progress, badges just earned and stats that went up.
function recordTrip(p, legs, ctx, key) {
  const out = { v: 1, km: { ...p.km }, badges: { ...p.badges }, done: p.done.slice() }, gains = [], newBadges = [];
  if (!out.done.includes(key)) {
    out.done.push(key); if (out.done.length > 500) out.done.shift();
    for (const l of legs) if (STAT_KM[l.mode] && !l.error) out.km[l.mode] = (out.km[l.mode] || 0) + l.km;
    for (const m in STAT_KM) { const a = boostPct(m, p.km[m]), b = boostPct(m, out.km[m]); if (b > a) gains.push({ mode: m, from: a, to: b }); }
  }
  for (const B of BADGES) if (!out.badges[B.id] && B.test(legs, ctx)) { out.badges[B.id] = ctx.day || 1; newBadges.push(B); }
  return { progress: out, gains, newBadges };
}
// Backup codes: base64 JSON, so progress can move between devices.
function encodeProgress(p) { const j = JSON.stringify({ v: 1, km: p.km, badges: p.badges }); return typeof btoa === 'function' ? btoa(j) : Buffer.from(j).toString('base64'); }
function decodeProgress(code) {
  try {
    const j = typeof atob === 'function' ? atob(code.trim()) : Buffer.from(code.trim(), 'base64').toString();
    const o = JSON.parse(j), p = emptyProgress();
    if (!o || typeof o.km !== 'object') return null;
    for (const m in STAT_KM) { const v = o.km[m]; if (typeof v === 'number' && v > 0 && v < 1e7) p.km[m] = v; }
    for (const B of BADGES) if (o.badges && o.badges[B.id]) p.badges[B.id] = o.badges[B.id];
    return p;
  } catch { return null; }
}
function mergeProgress(a, b) {
  const p = { v: 1, km: { ...a.km }, badges: { ...b.badges, ...a.badges }, done: a.done.slice() };
  for (const m in b.km) p.km[m] = Math.max(p.km[m] || 0, b.km[m]);
  return p;
}

// ---------- drawing helpers ----------
// Ramer–Douglas–Peucker: keeps the corners of a freehand stroke and drops points within tol of the line.
// pts are [x, y] in screen pixels; the first and last points are always kept.
function simplifyPath(pts, tol) {
  if (pts.length < 3) return pts.slice();
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop(), [ax, ay] = pts[i], [bx, by] = pts[j], dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy);
    let far = -1, fd = tol;
    for (let k = i + 1; k < j; k++) {
      const d = L ? Math.abs(dy * (pts[k][0] - ax) - dx * (pts[k][1] - ay)) / L : Math.hypot(pts[k][0] - ax, pts[k][1] - ay);
      if (d > fd) { fd = d; far = k; }
    }
    if (far >= 0) { keep[far] = 1; stack.push([i, far], [far, j]); }
  }
  return pts.filter((p, k) => keep[k]);
}
// Groups legs into lines: legs whose end points share a line id were drawn together and share one mode.
// pts[k + 1] is the end of legs[k]. Returns [{ id, mode, legs: [index…], km, total, error, events }].
function linesOf(legs, pts) {
  const out = [];
  legs.forEach((l, k) => {
    const id = pts[k + 1].line, last = out[out.length - 1];
    const L = last && last.id === id ? last : (out.push({ id, mode: l.mode, legs: [], km: 0, total: 0, error: null, events: [] }), out[out.length - 1]);
    L.legs.push(k); L.km += l.km; L.total += l.total || 0;
    if (l.error && !L.error) L.error = l.error;
    for (const e of l.events) if (!L.events.includes(e)) L.events.push(e);
  });
  return out;
}

// ---------- friend challenges ----------
// A challenge is a trip plus everyone's results, carried in the link itself (#c=…), so it needs no server.
// Links come from anyone, so decoding checks every field and drops anything odd.
const b64e = t => typeof btoa === 'function' ? btoa(unescape(encodeURIComponent(t))) : Buffer.from(t, 'utf8').toString('base64');
const b64d = t => typeof atob === 'function' ? decodeURIComponent(escape(atob(t))) : Buffer.from(t, 'base64').toString('utf8');
const cleanName = (x, d) => typeof x === 'string' && x.trim() ? x.trim().replace(/[\u0000-\u001f]/g, '').slice(0, 40) : d;
const num = (x, lo, hi) => typeof x === 'number' && isFinite(x) && x >= lo && x <= hi;
// Route: "lat,lon,mode,line;…" with 2 decimals (about 1 km), at most 80 stops.
function encodeRoute(pts) {
  return pts.slice(0, 81).map(p => [p.ll[0].toFixed(2), p.ll[1].toFixed(2), p.mode ? MODE_KEYS.indexOf(p.mode) : -1, p.line || 0].join(',')).join(';');
}
function decodeRoute(str) {
  if (typeof str !== 'string' || str.length > 3000) return null;
  const out = [];
  for (const part of str.split(';').slice(0, 81)) {
    const [la, lo, m, l] = part.split(',').map(Number);
    if (!num(la, -90, 90) || !num(lo, -180, 180) || !Number.isInteger(m) || m < -1 || m >= MODE_KEYS.length) return null;
    out.push(m < 0 ? { ll: [la, lo] } : { ll: [la, lo], mode: MODE_KEYS[m], line: Number.isInteger(l) ? l : 0 });
  }
  return out.length >= 2 ? out : null;
}
// Keeps each player's fastest result, fastest first, at most 12.
function mergeResults(a, b) {
  const best = new Map();
  for (const r of [...(a || []), ...(b || [])]) { const k = r.n.toLowerCase(), o = best.get(k); if (!o || r.h < o.h) best.set(k, r); }
  return [...best.values()].sort((x, y) => x.h - y.h).slice(0, 12);
}
function encodeChallenge(c) {
  const j = JSON.stringify({ v: 1, id: c.id, f: c.f, t: c.t, r: c.r, s: c.s, res: c.res.map(r => ({ n: r.n, h: Math.round(r.h * 100) / 100, g: r.g, p: r.p, c: r.c || 'none' })) });
  return b64e(j).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function decodeChallenge(code) {
  try {
    if (typeof code !== 'string' || code.length > 60000) return null;
    const o = JSON.parse(b64d(code.replace(/-/g, '+').replace(/_/g, '/')));
    const place = (x, d) => Array.isArray(x) && num(x[1], -90, 90) && num(x[2], -180, 180) ? [cleanName(x[0], d), x[1], x[2]] : null;
    const f = place(o.f, 'Start'), t = place(o.t, 'Finish');
    if (!o || o.v !== 1 || !f || !t || !RULES[o.r] || !num(o.s, 1, 2 ** 31) || typeof o.id !== 'string' || !/^[a-z0-9]{4,16}$/.test(o.id)) return null;
    const res = [];
    for (const r of Array.isArray(o.res) ? o.res.slice(0, 12) : []) {
      if (!r || !num(r.h, 0, 1e7) || !['A+', 'A', 'B', 'C', 'D', 'F', '?'].includes(r.g)) continue;
      res.push({ n: cleanName(r.n, 'Player'), h: r.h, g: r.g, p: decodeRoute(r.p) ? r.p : '', c: CHARS[r.c] && Object.hasOwn(CHARS, r.c) ? r.c : 'none' });
    }
    return { v: 1, id: o.id, f, t, r: o.r, s: Math.floor(o.s), res: mergeResults(res, []) };
  } catch { return null; }
}

if (typeof module !== 'undefined') module.exports = { G, setGrid, cellOf, cellLat, cellLon, elevM, maxM, roughM, isLand, isLake, isHill, isIce, hav, MODES, MODE_KEYS, SITES, terrainProblem, windDir, speedAt, hoursPerDay, climbHours, solveRoute, TRIPS, RULES, fmtH, fmtKm, fmtLL, nearestSite, evalLeg, restFor, finalizeLegs, luckWait, grade, dailyTrip, STAT_KM, STAT_CAP, emptyProgress, boostPct, boostsFrom, BADGES, recordTrip, encodeProgress, decodeProgress, mergeProgress, simplifyPath, linesOf, CHARS, setCharacter, totalBoost, allowedModes, clipLeg, gapOf, encodeRoute, decodeRoute, mergeResults, encodeChallenge, decodeChallenge };
