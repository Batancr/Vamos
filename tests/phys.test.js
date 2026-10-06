// Run from the repo root:  node tests/phys.test.js
// Expected values are worked out by hand in the comments next to each check.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const V = require('../docs/phys.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('ok   ' + name); }
  catch (e) { console.log('FAIL ' + name + '\n     ' + e.message); process.exitCode = 1; }
}
const near = (got, want, tol, msg) => assert.ok(Math.abs(got - want) <= tol, `${msg || ''} expected ${want} ± ${tol}, got ${got}`);

// ---------- pure maths, no map data ----------
test('1° of longitude on the equator is 111.19 km', () => {
  // Earth diameter 12742 km: 12742 × π/360 = 111.195 km
  near(V.hav(0, 0, 0, 1), 111.195, 0.01);
});
test('rest days: 30h of driving at 12h a day needs two 12h nights', () => {
  // ceil(30 / 12) = 3 driving days, so 2 nights × (24 − 12) = 24h
  assert.strictEqual(V.restFor(30, 12), 24);
});
test('rest days: exactly one full day of driving needs no night', () => {
  assert.strictEqual(V.restFor(12, 12), 0); // ceil(12/12) − 1 = 0
});
test('rest days: modes that run 24h a day never rest', () => {
  assert.strictEqual(V.restFor(100, 24), 0);
});
test('balloon rides the westerlies at 45°N', () => {
  // 15 km/h base + 25 km/h wind × 1 (heading due east) = 40
  assert.strictEqual(V.speedAt('balloon', 0, 45, 1), 40);
});
test('balloon against the westerlies drops to the 2 km/h floor', () => {
  // 15 − 25 = −10, floored at 2
  assert.strictEqual(V.speedAt('balloon', 0, 45, -1), 2);
});
test('balloon rides the trade winds west at 10°N', () => {
  // tropics blow west: 15 + 25 × (−1 × −1) = 40
  assert.strictEqual(V.speedAt('balloon', 0, 10, -1), 40);
});
test('cold water cuts swimming to 3h a day above 50° latitude', () => {
  assert.strictEqual(V.hoursPerDay('swim', 55), 3);
  assert.strictEqual(V.hoursPerDay('swim', 20), 8);
});
test('time formatting', () => {
  assert.strictEqual(V.fmtH(26.5), '1d 2h');   // 26h30m rounds down to whole hours once days show
  assert.strictEqual(V.fmtH(24), '1d');
  assert.strictEqual(V.fmtH(1.25), '1h 15m');
  assert.strictEqual(V.fmtH(2), '2h');
  assert.strictEqual(V.fmtH(0.5), '30m');
});
test('grades', () => {
  assert.strictEqual(V.grade(1.2), 'A+');  // faster than the best route
  assert.strictEqual(V.grade(0.85), 'A');
  assert.strictEqual(V.grade(0.6), 'C');
  assert.strictEqual(V.grade(0.1), 'F');
});
test('grid cell numbering: top-left and bottom-right corners', () => {
  assert.strictEqual(V.cellOf(89.99, -179.99), 0);
  assert.strictEqual(V.cellOf(-89.99, 179.99), 720 * 1440 - 1);
  // 0°N 0°E is row 360, column 720 → 360 × 1440 + 720
  assert.strictEqual(V.cellOf(0.1, 0.1), 359 * 1440 + 720);
});
test('daily trip: 1 Oct 2026 is trip #1, 5 Oct is #5', () => {
  assert.deepStrictEqual(V.dailyTrip(Date.UTC(2026, 9, 1, 12)), { idx: 0, no: 1 });
  assert.deepStrictEqual(V.dailyTrip(Date.UTC(2026, 9, 5, 12)), { idx: 4, no: 5 });
});
test('every rule set only uses modes that exist, and none of them has planes', () => {
  for (const r of Object.values(V.RULES)) for (const m of r.modes) assert.ok(V.MODES[m], m);
  assert.ok(!V.MODES.plane);
});

// ---------- with the real map data ----------
const gz = fs.readFileSync(path.join(__dirname, '..', 'docs', 'data', 'grid.bin'));
V.setGrid(new Uint8Array(zlib.gunzipSync(gz)));

test('map data: Ely, Nevada is high land; the mid-Pacific is water', () => {
  const ely = V.cellOf(39.25, -114.89);
  assert.ok(V.isLand(ely));
  assert.ok(V.elevM(ely) > 1500 && V.elevM(ely) < 2600, `Ely is in the high desert; got a cell mean of ${V.elevM(ely)} m`);
  assert.ok(!V.isLand(V.cellOf(0, -150)));
});
test('driving straight from Ely to Cape Canaveral fails: it crosses the Gulf of Mexico', () => {
  const leg = V.evalLeg('car', [39.25, -114.89], [28.5, -80.6]);
  assert.match(leg.error, /water/);
});
test('rockets must start at a spaceport', () => {
  const leg = V.evalLeg('rocket', [39.25, -114.89], [13.7, 80.2]);
  assert.match(leg.error, /spaceport/);
});
test('rocket from Cape Canaveral to Sriharikota: 72h prep + 1h flight', () => {
  const [leg] = V.finalizeLegs([V.evalLeg('rocket', [28.5, -80.6], [13.7, 80.2])]);
  assert.strictEqual(leg.error, null);
  assert.strictEqual(leg.total, 73);
});
test('walking from Kathmandu towards Everest triggers altitude sickness (+24h)', () => {
  const [leg] = V.finalizeLegs([V.evalLeg('walk', [27.7, 85.32], [27.99, 86.93])]);
  assert.strictEqual(leg.extra, 24);
  assert.ok(leg.events.some(e => /Altitude/.test(e)));
});
test('two car legs in a row: one 30 min car hire, shared nights', () => {
  // Flat plains: 40°N from 100°W to 95°W, then on to 90°W (each about 427 km, 5–6h of driving)
  const legs = V.finalizeLegs([V.evalLeg('car', [40, -100], [40, -95]), V.evalLeg('car', [40, -95], [40, -90])]);
  assert.strictEqual(legs[0].setup, 0.5);
  assert.strictEqual(legs[1].setup, 0);
  near(legs[0].km, 426.6, 1, 'km');
  // ~11h of driving in total stays inside one 12h day, so no rest
  assert.strictEqual(legs[0].rest + legs[1].rest, 0);
});
test('best route Inverness → Marrakesh with everything allowed is 1–3 days', () => {
  const r = V.solveRoute([57.48, -4.22], [31.63, -7.99], V.RULES.classic.modes);
  assert.ok(r && r.hours > 24 && r.hours < 72, `got ${r && r.hours}`);
});
test('best route Inverness → Marrakesh on human power has to cross water by kayak or swimming', () => {
  const r = V.solveRoute([57.48, -4.22], [31.63, -7.99], V.RULES.human.modes);
  assert.ok(r && r.runs.some(x => x.mode === 'swim' || x.mode === 'kayak'));
});
test('without a kayak, the same trip has to swim', () => {
  const r = V.solveRoute([57.48, -4.22], [31.63, -7.99], ['walk', 'run', 'bike', 'skate', 'swim']);
  assert.ok(r && r.runs.some(x => x.mode === 'swim'));
});

// ---------- swimming, lakes and the new modes ----------
test('swimming is the average Channel swimmer: 33.2 km in 13.6 h ≈ 2.4 km/h', () => {
  assert.strictEqual(V.speedAt('swim', 0, 0, 0), 2.4);
});
test('sailboat: 10 km/h ± 8 with the wind, never below 4', () => {
  assert.strictEqual(V.speedAt('sail', 0, 45, 1), 18);  // westerlies, heading east: 10 + 8
  assert.strictEqual(V.speedAt('sail', 0, 45, -1), 4);  // 10 − 8 = 2, floored at 4 (tacking)
  assert.strictEqual(V.speedAt('sail', 0, 10, -1), 18); // trade winds blow west
});
test('lakes: Victoria and Superior are lake, the Caspian is sea, Geneva is too small to show', () => {
  assert.ok(V.isLake(V.cellOf(-1, 33)));
  assert.ok(V.isLake(V.cellOf(47.7, -87.5)));
  const casp = V.cellOf(42, 50);
  assert.ok(!V.isLand(casp) && !V.isLake(casp));
  assert.ok(V.isLand(V.cellOf(46.45, 6.55)));
});
test('kayak across the Strait of Dover: 40.5 km at 6 km/h ≈ 6.75 h', () => {
  const leg = V.evalLeg('kayak', [51.12, 1.33], [50.96, 1.85]);
  assert.strictEqual(leg.error, null);
  near(leg.moving, leg.km / 6, 0.001); // the leg is summed in short steps, so allow a hair of rounding
});
test('paraglider: needs a hill to launch, lands on land, flies at most 150 km', () => {
  assert.match(V.evalLeg('glide', [52.0, 5.5], [52.0, 6.3]).error, /launch from hills/); // flat Netherlands
  assert.match(V.evalLeg('glide', [52.3, 5.0], [52.3, 6.0]).error, /open water/);      // starts on the IJsselmeer
  assert.strictEqual(V.evalLeg('glide', [46.68, 7.86], [46.9, 8.6]).error, null);       // Interlaken to Lucerne, 61 km
  assert.match(V.evalLeg('glide', [46.68, 7.86], [48.5, 10.5]).error, /150 km/);        // 283 km
});
test('dog sled: only on snow, so the Kansas plains fail and Greenland works', () => {
  assert.match(V.evalLeg('sled', [40, -100], [40, -99]).error, /snow/);
  const leg = V.evalLeg('sled', [72, -40], [72, -30]);
  assert.strictEqual(leg.error, null);
  assert.ok(leg.ice);
});
test('hitchhiking luck: 0–6 h in 15 min steps, the same for everyone on the same trip', () => {
  const w = []; for (let k = 0; k < 1000; k++) w.push(V.luckWait(5, k));
  assert.ok(w.every(x => x >= 0 && x <= 6 && x * 4 === Math.round(x * 4)));
  assert.strictEqual(new Set(w).size, 25); // 0, 0.25 … 6
  assert.strictEqual(V.luckWait(5, 0), V.luckWait(5, 0));
  const legs = V.finalizeLegs([V.evalLeg('hitch', [40, -100], [40, -95]), V.evalLeg('hitch', [40, -95], [40, -90])], 5);
  assert.strictEqual(legs[0].setup, V.luckWait(5, 0)); // every lift is a new wait
  assert.strictEqual(legs[1].setup, V.luckWait(5, 1));
});
test('human cannonball: 2.56 km at 0.15 km/h = 17 h, so one 12 h night and a 1 h reload', () => {
  const [leg] = V.finalizeLegs([V.evalLeg('cannon', [40, -100], [40, -99.97])]);
  near(leg.moving, leg.km / 0.15, 0.01);
  assert.strictEqual(leg.rest, 12);
  assert.strictEqual(leg.setup, 1);
  assert.ok(leg.events.some(e => /Fired from the cannon 9 times/.test(e))); // 2.56 / 0.3 = 8.5, rounds to 9
});

// ---------- progress ----------
test('stats: swimming 100 km gives +3% (one per 33 km), capped at +15%', () => {
  assert.strictEqual(V.boostPct('swim', 100), 3);
  assert.strictEqual(V.boostPct('swim', 1e6), 15);
  assert.strictEqual(V.boostPct('car', 1e6), 0); // engines don't get fitter
  assert.deepStrictEqual(V.boostsFrom({ km: { swim: 100, walk: 50 } }), { swim: 0.03 }); // 50 km walking is under 1%
});
test('a boost makes that mode faster: 2.4 × 1.03 = 2.472 km/h', () => {
  near(V.speedAt('swim', 0, 0, 0, { swim: 0.03 }), 2.472, 1e-9);
});
test('the best route uses your stats, so faster stats mean a faster par', () => {
  const a = V.solveRoute([57.48, -4.22], [31.63, -7.99], V.RULES.human.modes);
  const b = V.solveRoute([57.48, -4.22], [31.63, -7.99], V.RULES.human.modes, { bike: 0.15 });
  assert.ok(b.hours < a.hours);
});
test('recordTrip: km count once per trip, badges once ever', () => {
  const legs = [{ mode: 'swim', km: 40, error: null }, { mode: 'car', km: 500, error: null }];
  const one = V.recordTrip(V.emptyProgress(), legs, { total: 30, grade: 'B', rules: 'classic' }, '5|classic');
  assert.strictEqual(one.progress.km.swim, 40);
  assert.strictEqual(one.progress.km.car, undefined);
  assert.deepStrictEqual(one.gains, [{ mode: 'swim', from: 0, to: 1 }]); // floor(40 / 33) = 1
  assert.deepStrictEqual(one.newBadges.map(b => b.id), ['channel']);
  const two = V.recordTrip(one.progress, legs, { total: 30, grade: 'B', rules: 'classic' }, '5|classic');
  assert.strictEqual(two.progress.km.swim, 40);
  assert.strictEqual(two.gains.length + two.newBadges.length, 0);
});
test('backup codes round-trip, reject junk, and merging keeps the best of both', () => {
  const p = { v: 1, km: { swim: 40, walk: 300 }, badges: { channel: 5 }, done: [] };
  const q = V.decodeProgress(V.encodeProgress(p));
  assert.deepStrictEqual(q.km, p.km);
  assert.deepStrictEqual(q.badges, p.badges);
  assert.strictEqual(V.decodeProgress('not a code!'), null);
  const m = V.mergeProgress({ v: 1, km: { swim: 10 }, badges: { moon: 2 }, done: [] }, q);
  assert.deepStrictEqual(m.km, { swim: 40, walk: 300 });
  assert.deepStrictEqual(Object.keys(m.badges).sort(), ['channel', 'moon']);
});

// ---------- drawing lines ----------
test('simplifying a stroke keeps the corner of an L and drops the wobble', () => {
  // (0,0) → (100,0) with a 2 px wobble, then up to (100,100). Tolerance 5 px keeps only the 3 corners.
  const pts = [[0, 0], [25, 2], [50, -2], [75, 1], [100, 0], [100, 50], [101, 100]];
  assert.deepStrictEqual(V.simplifyPath(pts, 5), [[0, 0], [100, 0], [101, 100]]);
  assert.deepStrictEqual(V.simplifyPath([[0, 0], [9, 9]], 5), [[0, 0], [9, 9]]);
});
test('legs drawn as one line are grouped, with their km and time added up', () => {
  const pts = [{ ll: [0, 0] }, { line: 1 }, { line: 1 }, { line: 2 }];
  const legs = [{ mode: 'walk', km: 10, total: 2, error: null, events: ['a'] }, { mode: 'walk', km: 5, total: 1, error: 'x', events: ['a', 'b'] }, { mode: 'car', km: 80, total: 1.5, error: null, events: [] }];
  const L = V.linesOf(legs, pts);
  assert.strictEqual(L.length, 2);
  assert.deepStrictEqual([L[0].legs, L[0].km, L[0].total, L[0].error, L[0].events], [[0, 1], 15, 3, 'x', ['a', 'b']]);
  assert.deepStrictEqual([L[1].id, L[1].mode, L[1].legs], [2, 'car', [2]]);
});

// ---------- friend challenges ----------
const CH = { id: 'ab12cd', f: ['Reykjavík', 64.15, -21.94], t: ['Lisbon', 38.72, -9.14], r: 'classic', s: 4242,
  res: [{ n: 'Alex', h: 301.234, g: 'F', p: '64.15,-21.94,-1,0;64.00,-23.30,8,1;38.72,-9.14,8,1' }] };
test('challenge links round-trip, with times rounded to 0.01 h and accents kept', () => {
  const c = V.decodeChallenge(V.encodeChallenge(CH));
  assert.deepStrictEqual(c.f, CH.f);
  assert.strictEqual(c.r, 'classic'); assert.strictEqual(c.s, 4242);
  assert.deepStrictEqual(c.res, [{ n: 'Alex', h: 301.23, g: 'F', p: CH.res[0].p, c: 'none' }]);
  const withChars = V.decodeChallenge(V.encodeChallenge({ ...CH, res: [{ n: 'Fox fan', h: 5, g: 'A', c: 'fox' }, { n: 'Sneaky', h: 6, g: 'A', c: 'toString' }] }));
  assert.deepStrictEqual(withChars.res.map(r => r.c), ['fox', 'none']); // unknown characters fall back to the plain traveller
  assert.ok(!/[+/=]/.test(V.encodeChallenge(CH))); // safe to paste in a URL
});
test('challenge links reject junk and bad fields', () => {
  assert.strictEqual(V.decodeChallenge('hello'), null);
  const bad = (patch) => V.decodeChallenge(V.encodeChallenge({ ...CH, ...patch }));
  assert.strictEqual(bad({ r: 'planes' }), null);              // no such rule set
  assert.strictEqual(bad({ f: ['X', 95, 0] }), null);          // latitude past the pole
  assert.strictEqual(bad({ id: '<script>' }), null);
  const c = bad({ res: [{ n: 'Sam', h: -5, g: 'A' }, { n: 'x'.repeat(99), h: 10, g: 'Z' }, { n: 'Kim', h: 50, g: 'B', p: 'nope' }] });
  assert.deepStrictEqual(c.res, [{ n: 'Kim', h: 50, g: 'B', p: '', c: 'none' }]); // negative time and unknown grade dropped, bad route blanked
});
test('routes encode to 2 decimals and decode back to stops with modes and lines', () => {
  const pts = [{ ll: [64.15, -21.94] }, { ll: [64.004, -23.296], mode: 'sail', line: 1 }, { ll: [38.72, -9.14], mode: 'walk', line: 2 }];
  const str = V.encodeRoute(pts);
  assert.strictEqual(str, `64.15,-21.94,-1,0;64.00,-23.30,${V.MODE_KEYS.indexOf('sail')},1;38.72,-9.14,0,2`);
  assert.deepStrictEqual(V.decodeRoute(str), [{ ll: [64.15, -21.94] }, { ll: [64, -23.3], mode: 'sail', line: 1 }, { ll: [38.72, -9.14], mode: 'walk', line: 2 }]);
  assert.strictEqual(V.decodeRoute('1,2,99,0;3,4,0,0'), null); // mode 99 doesn't exist
});
test('leaderboard keeps each player\'s best time, fastest first', () => {
  const r = V.mergeResults([{ n: 'Alex', h: 30 }, { n: 'Sam', h: 20 }], [{ n: 'alex', h: 25 }, { n: 'Kim', h: 40 }]);
  assert.deepStrictEqual(r.map(x => [x.n, x.h]), [['Sam', 20], ['alex', 25], ['Kim', 40]]);
});

// ---------- auto-stop ----------
test('auto-stop: a boat aimed at London stops at the English coast, and that leg is valid', () => {
  const c = V.clipLeg('ferry', [50.5, -1.0], [51.5, -0.12]);
  assert.ok(c.clipped && c.why === 'land');
  assert.ok(c.ll[0] > 50.6 && c.ll[0] < 50.9, `stopped at ${c.ll}`); // the Sussex coast is near 50.8°N
  assert.strictEqual(V.evalLeg('ferry', [50.5, -1.0], c.ll).error, null);
});
test('auto-stop: an all-sea boat leg is left alone', () => {
  const c = V.clipLeg('ferry', [50.5, -1.0], [50.0, -3.0]);
  assert.deepStrictEqual(c, { ll: [50.0, -3.0], clipped: false });
});
test('auto-stop: driving Paris → London stops where the Channel starts', () => {
  const c = V.clipLeg('car', [48.86, 2.35], [51.5, -0.12]);
  assert.strictEqual(c.why, 'water');
  assert.strictEqual(V.evalLeg('car', [48.86, 2.35], c.ll).error, null);
});
test('auto-stop: a 283 km paraglide is cut to the 150 km limit', () => {
  const c = V.clipLeg('glide', [46.68, 7.86], [48.5, 10.5]);
  assert.strictEqual(c.why, 'limit');
  near(V.hav(46.68, 7.86, ...c.ll), 150, 1);
});
test('auto-stop: a boat may still finish at a coastal city just inland (the 15 km dock grace)', () => {
  assert.strictEqual(V.clipLeg('ferry', [45, -15], [38.72, -9.14], true).clipped, false); // finishing in Lisbon
});
test('auto-stop: a car pointed straight out to sea can\'t start at all', () => {
  assert.strictEqual(V.clipLeg('car', [50.0, -3.0], [49.0, -6.0]), null);
});

// ---------- characters ----------
test('characters: Fox runs 15 km/h; Mermaid swims 20 km/h all day even in cold water', () => {
  try {
    V.setCharacter('fox'); assert.strictEqual(V.speedAt('run', 0, 0, 0), 15); // 10 × 1.5
    V.setCharacter('mermaid'); near(V.speedAt('swim', 0, 0, 0), 20, 1e-9); assert.strictEqual(V.hoursPerDay('swim', 60), 24);
  } finally { V.setCharacter('none'); }
});
test('characters: Mountaineer skips altitude sickness; Star Knight never waits for a lift', () => {
  try {
    V.setCharacter('climber'); assert.strictEqual(V.finalizeLegs([V.evalLeg('walk', [27.7, 85.32], [27.99, 86.93])])[0].extra, 0);
    V.setCharacter('knight'); assert.strictEqual(V.finalizeLegs([V.evalLeg('hitch', [40, -100], [40, -95])], 5)[0].setup, 0);
  } finally { V.setCharacter('none'); }
});
test('characters: Genie\'s carpet crosses the Atlantic; flying modes only come with their character', () => {
  try {
    V.setCharacter('genie');
    assert.strictEqual(V.evalLeg('carpet', [40, -70], [50, -5]).error, null);
    assert.ok(V.allowedModes('human').includes('carpet'));
    V.setCharacter('none');
    assert.ok(!V.allowedModes('classic').includes('carpet') && !V.allowedModes('classic').includes('fly'));
    V.setCharacter('relic'); assert.strictEqual(V.gapOf('walk'), 13); assert.strictEqual(V.gapOf('ferry'), 25); // whip only helps on land
  } finally { V.setCharacter('none'); }
});
test('characters: the best route uses the character too (Caped Hero just flies)', () => {
  try {
    V.setCharacter('caped');
    const r = V.solveRoute([57.48, -4.22], [31.63, -7.99], V.allowedModes('classic'));
    assert.deepStrictEqual(r.runs.map(x => x.mode), ['fly']);
    assert.ok(r.hours < 4, `got ${r.hours}`); // about 2,900 km at 1,000 km/h
  } finally { V.setCharacter('none'); }
});

console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ''}`);
