// Route Planner tab. Not a game: pick a start and a finish (a place, a whole country or a spot on the map),
// pick the ways you may travel, and see the fastest route, or how far you get and what's in the way.
// It shares the map and the solver worker with the game (game.js), and the rules with phys.js (planTrip).
window.Planner = (() => {
  const P = { data: null, cgrid: null, loading: null, from: null, to: null, picking: null, modes: new Set(['walk']), result: null, runId: 0, masks: {} };
  const GROUPS = [
    ['On land', ['walk', 'run', 'bike', 'skate', 'car', 'moto', 'bus', 'hitch', 'train']],
    ['On water', ['ferry', 'cargo', 'sail', 'kayak', 'swim']],
    ['In the air', ['plane', 'balloon', 'glide', 'rocket']],
    ['Animals, snow and silly', ['horse', 'camelride', 'elephant', 'ostrich', 'sled', 'skis', 'whale', 'tortoise', 'cannon', 'pogo', 'unicycle', 'trebuchet', 'flamingo', 'zorb', 'trolley', 'moon']],
  ];
  const EVERYDAY = ['walk', 'bike', 'car', 'bus', 'train', 'ferry'];
  const SILLY = new Set(GROUPS[3][1].concat(['balloon', 'glide', 'rocket', 'skate', 'run', 'hitch', 'cargo', 'sail', 'kayak', 'swim', 'moto']));
  const info = m => m === 'plane' ? PLANE : MODES[m];
  const SURFACE = { sea: 'open sea', lake: 'a lake', ice: 'an ice sheet', high: 'high mountains (above 3,000 m)', land: 'dry land' };

  // ---------- data ----------
  function load() {
    if (P.loading) return P.loading;
    const inline = window.VAMOS_INLINE;
    P.loading = (async () => {
      if (inline && inline.planner) { P.data = inline.planner; P.cgrid = Uint8Array.from(atob(inline.countries), c => c.charCodeAt(0)); }
      else {
        const [j, b] = await Promise.all([fetch('data/planner.json'), fetch('data/countries.bin')]);
        if (!j.ok || !b.ok) throw new Error('Planner data failed to load');
        P.data = await j.json(); P.cgrid = new Uint8Array(await b.arrayBuffer());
      }
      P.cgrid = await gunzipIfNeeded(P.cgrid);
      P.airports = P.data.airports.map(a => [a[3], a[4], a[5]]);
      const opts = [];
      P.data.countries.forEach((c, k) => opts.push(`${c[0]} (country)`));
      P.data.cities.forEach(c => { const cn = P.data.countries[c[1]]; opts.push(cn ? `${c[0]}, ${cn[0]}` : c[0]); if (c[4]) opts.push(cn ? `${c[4]}, ${cn[0]}` : c[4]); });
      $('planList').innerHTML = [...new Set(opts)].sort().map(o => `<option value="${esc(o)}">`).join('');
    })();
    return P.loading;
  }
  // Text typed in a box → an endpoint, or null.
  function resolve(text) {
    const t = text.trim().toLowerCase(); if (!t) return null;
    const D = P.data, cn = k => D.countries[k] ? D.countries[k][0] : '';
    const country = t.replace(/\s*\(country\)$/, '');
    let k = D.countries.findIndex(c => c[0].toLowerCase() === country);
    if (k >= 0 && (t.endsWith('(country)') || !D.cities.some(c => c[0].toLowerCase() === t))) return countryEnd(k);
    const byName = c => [c[0], c[4]].filter(Boolean).some(n => n.toLowerCase() === t || `${n}, ${cn(c[1])}`.toLowerCase() === t);
    let c = D.cities.find(byName);
    if (!c) c = D.cities.find(c => c[0].toLowerCase().startsWith(t) || (c[4] || '').toLowerCase().startsWith(t));
    if (c) return { kind: 'place', name: c[0], sub: cn(c[1]), ll: [c[2], c[3]] };
    k = D.countries.findIndex(c => c[0].toLowerCase().startsWith(country));
    return k >= 0 ? countryEnd(k) : null;
  }
  const countryEnd = k => { const c = P.data.countries[k]; return { kind: 'country', k, name: c[0], sub: 'whole country', ll: [c[1], c[2]] }; };
  const label = e => e.kind === 'country' ? `${e.name} (country)` : e.kind === 'place' ? (e.sub ? `${e.name}, ${e.sub}` : e.name) : e.name;
  // The grid cells an endpoint covers, and a circle around them (for the solver's distance estimate).
  function cellsOf(e) {
    let cells = [];
    if (e.kind === 'country') { for (let i = 0; i < P.cgrid.length; i++) if (P.cgrid[i] === e.k + 1) cells.push(i); }
    if (!cells.length) { // a place, or a country too small for the grid: its cell plus anything within 25 km (docks, coasts)
      const [la, lo] = e.ll, r0 = Math.floor((90 - la) * 4), c0 = Math.floor((lo + 180) * 4);
      cells.push(cellOf(la, lo));
      for (let r = r0 - 1; r <= r0 + 1; r++) for (let c = c0 - 1; c <= c0 + 1; c++) {
        if (r < 0 || r >= G.R || c < 0 || c >= G.C) continue;
        if (hav(la, lo, cellLat(r), cellLon(c)) <= 25) cells.push(r * G.C + c);
      }
      cells = [...new Set(cells)];
    }
    let x = 0, y = 0, z = 0; const d = Math.PI / 180;
    for (const i of cells) { const la = cellLat((i / G.C) | 0) * d, lo = cellLon(i % G.C) * d; x += Math.cos(la) * Math.cos(lo); y += Math.cos(la) * Math.sin(lo); z += Math.sin(la); }
    const cla = Math.atan2(z, Math.hypot(x, y)) / d, clo = Math.atan2(y, x) / d;
    let rad = 0; for (const i of cells) rad = Math.max(rad, hav(cla, clo, cellLat((i / G.C) | 0), cellLon(i % G.C)));
    return { cells, near: [cla, clo, rad] };
  }
  function nearestCity(ll, maxKm = 300) {
    let b = null, bd = maxKm;
    for (const c of P.data.cities) { const d = hav(ll[0], ll[1], c[2], c[3]); if (d < bd) { bd = d; b = c; } }
    return b ? b[0] : null;
  }
  const where = ll => { const c = nearestCity(ll, 120), k = P.cgrid[cellOf(...ll)] - 1; return c ? `near ${esc(c)}` : k >= 0 ? `in ${esc(P.data.countries[k][0])} (${fmtLL(...ll)})` : esc(fmtLL(...ll)); };

  // ---------- panel ----------
  function speedText(m) {
    if (m === 'plane') return '800 km/h · 3½h at airports';
    const M = MODES[m];
    return M.terrain === 'space' ? 'spaceport to spaceport' : m === 'balloon' ? 'wind-powered' : m === 'sail' ? '4–18 km/h · wind' : m === 'cannon' ? '300 m a shot' :
      m === 'trebuchet' ? '1 km a day' : m === 'flamingo' ? 'drifts' : M.downhill ? 'downhill only' : m === 'whale' ? 'whale lanes only' :
      `${+M.speed.toFixed(1)} km/h · ${M.hours}h/day`;
  }
  function renderModes() {
    $('planModes').innerHTML = GROUPS.map(([name, ms], g) => `${g === 3 ? '<details class="more"><summary>' + name + '</summary>' : `<div class="label">${name}</div>`}<div class="modes">` +
      ms.map(m => { const M = info(m); return `<button class="mode" aria-pressed="${P.modes.has(m)}" data-m="${m}"><span class="ic">${M.icon}</span>${M.name}<span class="sp">${speedText(m)}</span><span class="sw" style="background:${M.color}"></span></button>`; }).join('') +
      `</div>${g === 3 ? '</details>' : ''}`).join('');
    $('planModes').querySelectorAll('.mode').forEach(b => b.onclick = () => { const m = b.dataset.m; P.modes.has(m) ? P.modes.delete(m) : P.modes.add(m); b.setAttribute('aria-pressed', P.modes.has(m)); });
  }
  function setEnd(which, e) {
    P[which] = e; $(which === 'from' ? 'planFrom' : 'planTo').value = e ? label(e) : '';
    P.result = null; $('planResult').innerHTML = ''; fit();
  }
  function onType(which) {
    const box = $(which === 'from' ? 'planFrom' : 'planTo');
    if (!P.data) return;
    const e = resolve(box.value);
    if (e) setEnd(which, e); else if (box.value.trim()) toast(`I couldn't find “${box.value.trim()}”. Pick from the list or tap the map.`, 3000);
  }
  function pickOnMap(which) { P.picking = which; toast(`Tap the map to set the ${which === 'from' ? 'start' : 'finish'}`, 3000); }

  async function run() {
    if (!P.from || !P.to) { toast('Pick a start and a finish first', 2500); return; }
    if (!P.modes.size) { toast('Pick at least one way to travel', 2500); return; }
    const A = cellsOf(P.from), B = cellsOf(P.to), id = ++P.runId, modes = [...P.modes];
    if (A.cells.some(c => B.cells.includes(c))) { toast('The start and finish overlap. Pick two different places.', 3000); return; }
    $('planGo').disabled = true; $('planResult').innerHTML = '<p class="hint">Working it out… big countries and lots of modes can take a few seconds.</p>';
    const r = await new Promise(res => {
      const w = getWorker(), h = e => { if (e.data.id === id && e.data.plan) { w.removeEventListener('message', h); res(e.data.r); } };
      w.addEventListener('message', h);
      w.postMessage({ id, plan: true, src: A.cells, dst: B.cells, modes, airports: P.airports, near: B.near });
    });
    if (id !== P.runId) return;
    $('planGo').disabled = false; P.result = { ...r, modes }; renderResult(); fit(); draw();
  }
  function runLine(r) {
    const M = info(r.mode);
    let what = esc(M.name);
    if (r.mode === 'plane') { const a = P.data.airports[r.from], b = P.data.airports[r.to]; what = `Fly ${esc(a[2] || a[1])} (${esc(a[0])}) → ${esc(b[2] || b[1])} (${esc(b[0])})`; }
    return `<li><span>${M.icon}</span><span>${what}</span><span class="t">${fmtH(r.hours)}</span><span class="why">${fmtKm(r.km)}</span></li>`;
  }
  function renderResult() {
    const r = P.result, picks = r.modes.map(m => `${info(m).icon} ${esc(info(m).name)}`);
    const only = picks.length === 1 ? `just ${picks[0]}` : picks.length <= 4 ? picks.join(' + ') : `these ${picks.length} ways`;
    let h = '';
    if (r.ok) {
      h += `<div class="result"><b>✅ Possible with ${only}</b><div class="total"><span>${fmtKm(r.km)}</span><span class="t">${fmtH(r.hours)}</span></div>`;
      if (P.from.kind === 'country' || P.to.kind === 'country') h += `<p class="hint">Fastest from ${where(r.start)} to ${where(r.end)}.</p>`;
    } else if (!r.runs.length) {
      h += `<div class="result bad"><b>🚧 You can't even leave the start with ${only}.</b>`;
    } else {
      h += `<div class="result bad"><b>🚧 Not possible with ${only}</b><p class="hint">The furthest you get is ${where(r.end)}: ${fmtKm(r.km)} in <b>${fmtH(r.hours)}</b>, still about <b>${fmtKm(r.leftKm)}</b> short.</p>`;
    }
    if (!r.ok && r.blocked) {
      const b = r.blocked, wide = b.km >= 20 ? `about ${fmtKm(b.km)} of ` : '';
      const fix = [...(b.surface === 'sea' || b.surface === 'lake' ? ['plane'] : []), ...b.fix.filter(m => !SILLY.has(m)), ...b.fix.filter(m => SILLY.has(m) && m !== 'flamingo' && m !== 'cannon')].filter((m, k, a) => !r.modes.includes(m) && a.indexOf(m) === k).slice(0, 7);
      h += `<p class="hint">In the way: ${wide}<b>${SURFACE[b.surface]}</b>${b.surface === 'land' ? ' (your picks can\'t go on land)' : ''}. Add one and try again:</p><div class="row">` +
        fix.map(m => `<button class="btn small" data-add="${m}">${info(m).icon} ${esc(info(m).name)}</button>`).join('') + '</div>';
    }
    if (r.runs.length) h += `<ul class="legs">${r.runs.map(runLine).join('')}</ul>`;
    h += '</div>';
    $('planResult').innerHTML = h;
    $('planResult').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    $('planResult').querySelectorAll('[data-add]').forEach(b => b.onclick = () => { P.modes.add(b.dataset.add); renderModes(); run(); });
  }

  // ---------- map ----------
  function mask(k, rgba) {
    const key = k + ':' + rgba; if (P.masks[key]) return P.masks[key];
    const c = document.createElement('canvas'); c.width = G.C; c.height = G.R;
    const g = c.getContext('2d'), im = g.createImageData(G.C, G.R), d = im.data;
    for (let i = 0; i < P.cgrid.length; i++) if (P.cgrid[i] === k + 1) d.set(rgba, i * 4);
    g.putImageData(im, 0, 0); return P.masks[key] = c;
  }
  function drawPlan() {
    S.markers = [];
    if (P.from && P.from.kind === 'country') drawWorld(mask(P.from.k, [47, 122, 69, 120]), false);
    if (P.to && P.to.kind === 'country') drawWorld(mask(P.to.k, [200, 64, 47, 120]), false);
    const r = P.result;
    if (r) {
      for (const run of r.runs) { const M = info(run.mode); pathLine(run.mode === 'plane' || M.terrain === 'space' ? arc(run.pts[0], run.pts[run.pts.length - 1]) : run.pts, M.color, M.dash, 5); }
      ctx.font = '18px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (const run of r.runs) {
        const pts = run.mode === 'plane' || info(run.mode).terrain === 'space' ? arc(run.pts[0], run.pts[run.pts.length - 1]) : run.pts, [x, y] = toXY(...pts[Math.floor(pts.length / 2)]);
        ctx.fillStyle = 'rgba(251,248,241,.95)'; ctx.beginPath(); ctx.arc(x, y, 14, 0, 7); ctx.fill(); ctx.strokeStyle = info(run.mode).color; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = '#000'; ctx.fillText(info(run.mode).icon, x, y + 1);
      }
      if (!r.ok) {
        if (r.blocked) pathLine([r.end, r.blocked.ll], '#c8402f', [3, 4], 3);
        const [x, y] = toXY(...r.end); ctx.font = '24px system-ui, sans-serif'; ctx.fillText('🚩', x + 6, y - 12);
      }
      ctx.textBaseline = 'alphabetic';
    }
    if (P.from) pin(...(r && r.runs.length ? r.start : P.from.ll), P.from.name, '#2f7a45');
    if (P.to) pin(...(r && r.ok ? r.end : P.to.ll), P.to.name, '#c8402f');
  }
  function fit() {
    const r = P.result, pts = (r && r.runs.length ? [...r.runs.flatMap(x => x.pts), r.blocked && r.blocked.ll, !r.ok && P.to.ll] : [P.from && P.from.ll, P.to && P.to.ll]).filter(Boolean);
    if (!pts.length || !W) return draw();
    const la = pts.map(p => p[0]), lo = pts.map(p => p[1]), pad = pts.length > 1 ? 8 : 20;
    const lo1 = Math.min(...lo) - pad, lo2 = Math.max(...lo) + pad, la1 = Math.min(...la) - pad, la2 = Math.max(...la) + pad;
    S.view.ppd = Math.min(W / (lo2 - lo1), H / (la2 - la1)); S.view.lon = (lo1 + lo2) / 2; S.view.lat = (la1 + la2) / 2;
    clampView(); draw();
  }
  function tap(ll) {
    const which = P.picking || (!P.from ? 'from' : !P.to ? 'to' : null);
    if (!which) { toast('Use 📍 next to Start or Finish to move them', 2500); return; }
    P.picking = null;
    const k = P.cgrid[cellOf(...ll)] - 1, c = nearestCity(ll, 40);
    setEnd(which, { kind: 'point', name: c ? `Near ${c}` : fmtLL(...ll), sub: k >= 0 ? P.data.countries[k][0] : '', ll });
    if (which === 'from' && !P.to) toast('Now pick the finish', 2500);
  }

  // ---------- tabs ----------
  async function show(tab) {
    S.tab = tab; document.body.classList.toggle('planning', tab === 'plan');
    $('tabGame').setAttribute('aria-selected', tab === 'game'); $('tabPlan').setAttribute('aria-selected', tab === 'plan');
    $('gamePanel').hidden = tab === 'plan'; $('planPanel').hidden = tab !== 'plan';
    $('map').setAttribute('aria-label', tab === 'plan' ? 'World map. Tap to set the start or finish of a route.' : 'World map. Click to add stops to your route.');
    if (tab === 'game') { fitTrip(); return; }
    try { await load(); } catch { $('planResult').innerHTML = '<p class="hint">The planner data did not load. Check your connection and reload the page.</p>'; return; }
    fit();
  }
  const setHash = h => { try { history.replaceState(null, '', h || location.pathname + location.search); } catch {} }; // can fail in sandboxed previews
  $('tabGame').onclick = () => { show('game'); if (location.hash === '#plan') setHash(''); };
  $('tabPlan').onclick = () => { show('plan'); setHash('#plan'); };
  $('planFrom').onchange = () => onType('from'); $('planTo').onchange = () => onType('to');
  $('planFromPin').onclick = () => pickOnMap('from'); $('planToPin').onclick = () => pickOnMap('to');
  $('planSwap').onclick = () => { const a = P.from; setEnd('from', P.to); setEnd('to', a); };
  $('planGo').onclick = run;
  document.querySelectorAll('[data-preset]').forEach(b => b.onclick = () => {
    const p = b.dataset.preset;
    P.modes = new Set(p === 'walk' ? ['walk'] : p === 'everyday' ? EVERYDAY : p === 'planes' ? [...EVERYDAY, 'plane'] : []);
    renderModes();
  });
  renderModes();
  return { draw: drawPlan, fit, tap, show, picking: () => !!P.picking };
})();
if (location.hash === '#plan') Planner.show('plan');
