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

// ---------- biomes and terrain characters ----------
test('biomes: Sahara is desert, Amazon jungle, Kansas grassland, Greenland ice, Paris none of them', () => {
  const b = (la, lo) => V.biomeOf(V.cellOf(la, lo));
  assert.deepStrictEqual([b(23, 10), b(-3, -60), b(38.5, -98.5), b(72, -40), b(48.85, 2.35)], ['desert', 'jungle', 'grass', 'ice', '']);
});
test('terrain characters: Rabbit walks 10 km/h on grass but 5 km/h in Paris; Fox runs 20 km/h in jungle', () => {
  try {
    V.setCharacter('rabbit');
    assert.strictEqual(V.speedAt('walk', V.cellOf(38.5, -98.5), 38.5, 0), 10); // 5 × (1 + 1)
    assert.strictEqual(V.speedAt('walk', V.cellOf(48.85, 2.35), 48.85, 0), 5);
    V.setCharacter('fox'); assert.strictEqual(V.speedAt('run', V.cellOf(-3, -60), -3, 0), 20); // 10 × (1 + 0.5 + 0.5)
    V.setCharacter('camel'); assert.strictEqual(V.speedAt('run', V.cellOf(23, 10), 23, 0), 20);
    V.setCharacter('penguin');
    assert.strictEqual(V.speedAt('walk', V.cellOf(72, -40), 72, 0), 15); // 5 × 3 on ice
    assert.strictEqual(V.speedAt('sled', V.cellOf(72, -40), 72, 0), 18); // 12 × 1.5
    assert.strictEqual(V.hoursPerDay('swim', 70), 8); // no cold-water limit
  } finally { V.setCharacter('none'); }
});
test('terrain characters: a Rabbit\'s best walk across the Great Plains is about twice as fast', () => {
  try {
    const a = [39, -101], b = [39, -97];
    const plain = V.solveRoute(a, b, ['walk']).hours;
    V.setCharacter('rabbit');
    const rabbit = V.solveRoute(a, b, ['walk']).hours;
    assert.ok(rabbit < plain * 0.6, `rabbit ${rabbit} vs ${plain}`);
  } finally { V.setCharacter('none'); }
});

// ---------- danger: accidents and energy ----------
const plan = (mode, a, b, key, custom) => { const legs = V.finalizeLegs([V.evalLeg(mode, a, b)], 7); return { legs, r: V.applyDanger(legs, 7, V.dangerOf(key, custom), false) }; };
test('danger Off changes nothing: no energy, no risk, same time', () => {
  const legs = V.finalizeLegs([V.evalLeg('car', [48.85, 2.35], [45.76, 4.84])], 7), before = legs[0].total;
  const r = V.applyDanger(legs, 7, V.dangerOf('off'), true);
  assert.deepStrictEqual([r.energy, r.dead, r.incidents.length, legs[0].total], [100, null, 0, before]);
});
test('energy: a 200 km swim kills on Hard and costs a 24h collapse on Medium', () => {
  // 2.4 km/h × 8h = 19 km a day; each day uses 8 × 8 = 64% and a night gives back 16 × 2.5 = 40%, so 24% down a day
  const hard = plan('swim', [38, 5], [38, 7.3], 'hard'), med = plan('swim', [38, 5], [38, 7.3], 'medium');
  assert.ok(hard.r.dead && /exhaustion/.test(hard.r.dead.why), JSON.stringify(hard.r));
  assert.ok(!med.r.dead && med.legs[0].events.some(e => /Collapsed/.test(e)), med.legs[0].events.join('; '));
});
test('energy: walking 290 km on Hard is fine (30% a day used, 35% back each night)', () => {
  const { r } = plan('walk', [48.85, 2.35], [46.2, 2.35], 'hard');
  assert.ok(!r.dead && r.energy > 50, JSON.stringify(r));
});
test('energy: crossing the Sahara on foot on Hard kills a Traveller but not a Camel', () => {
  // desert heat: 3 × 1.6 = 4.8% an hour, 48% a day against 35% back
  assert.ok(plan('walk', [25, 0], [25, 5], 'hard').r.dead);
  try { V.setCharacter('camel'); assert.ok(!plan('walk', [25, 0], [25, 5], 'hard').r.dead); } finally { V.setCharacter('none'); }
});
test('accidents: the same seed and route give the same luck; zero odds give none', () => {
  const run = (seed, key, custom) => { const legs = V.finalizeLegs([V.evalLeg('car', [40, -100], [40, -90])], seed); return V.applyDanger(legs, seed, V.dangerOf(key, custom), true).incidents.map(i => i.t + i.h); };
  assert.deepStrictEqual(run(11, 'nightmare'), run(11, 'nightmare'));
  assert.deepStrictEqual(run(11, 'custom', { base: 'nightmare', g: 0, m: {} }), []);
  // over many seeds, a long Nightmare drive has accidents sometimes, not always
  let any = 0; for (let s = 1; s <= 200; s++) if (run(s, 'nightmare').length) any++;
  assert.ok(any > 20 && any < 200, `accidents on ${any} of 200 seeds`);
});
test('accidents: Easy only has hiccups; a car never crashes below Medium', () => {
  const l = V.finalizeLegs([V.evalLeg('car', [40, -100], [40, -90])], 1)[0];
  assert.deepStrictEqual(V.hazardsFor(l, V.dangerOf('easy')).map(x => x.H.t), ['🛞 Flat tyre']);
  assert.strictEqual(V.hazardsFor(l, V.dangerOf('medium')).length, 2);
});
test('danger travels in challenge links, and junk custom odds are cleaned', () => {
  const c = { v: 1, id: 'abcd1234', f: ['A', 10, 10], t: ['B', 20, 20], r: 'classic', s: 5, d: 'custom', dc: { base: 'hard', g: 9, m: { car: 2, nope: 1 } }, res: [] };
  const back = V.decodeChallenge(V.encodeChallenge(c));
  assert.deepStrictEqual([back.d, back.dc], ['custom', { base: 'hard', g: 3, m: { car: 2 } }]);
  assert.strictEqual(V.decodeChallenge(V.encodeChallenge({ ...c, d: 'nightmare', dc: null })).d, 'nightmare');
});
test('Zoo Bonanza: a camel ride goes 8 km/h in the Sahara and 4 elsewhere; horses avoid Tibet', () => {
  assert.strictEqual(V.speedAt('camelride', V.cellOf(23, 10), 23, 0), 8);
  assert.strictEqual(V.speedAt('camelride', V.cellOf(48.85, 2.35), 48.85, 0), 4);
  assert.ok(/3,000 m/.test(V.evalLeg('horse', [31.5, 85], [31.5, 90]).error));
  assert.ok(V.RULES.zoo.modes.every(m => V.MODES[m]));
});

// ---------- modes from the travel-ideas backlog ----------
V.setPorts(JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'docs', 'data', 'places.json'))).ports);
const leg1 = (m, a, b) => V.finalizeLegs([V.evalLeg(m, a, b)], 1)[0];
test('new modes are appended after the elephant, so old challenge links keep their modes', () => {
  assert.strictEqual(V.MODE_KEYS.indexOf('elephant'), 24);
  assert.deepStrictEqual(V.MODE_KEYS.slice(25), ['skis', 'moto', 'bus', 'cargo', 'ostrich', 'whale', 'pogo', 'unicycle', 'trebuchet', 'flamingo', 'zorb', 'trolley', 'jetpack', 'dig']);
  for (const r in V.RULES) assert.ok(V.RULES[r].modes.every(m => V.MODES[m]), r);
});
test('skis need snow, like dog sleds', () => {
  assert.ok(/^Skis need snow/.test(V.evalLeg('skis', [48, 2], [48, 3]).error));
  assert.strictEqual(V.evalLeg('skis', [72, -40], [72, -35]).error, null);
});
test('motorbikes slow to 60% north of 55°', () => {
  // flat cells, no roughness: 70 km/h, and 70 × 0.6 = 42 km/h in the cold
  const flat = V.cellOf(52, 5); assert.strictEqual(V.roughM(flat), 0);
  near(V.speedAt('moto', flat, 52, 0), 70, 1e-9);
  near(V.speedAt('moto', flat, 56, 0), 42, 1e-9);
});
test('cargo ships load and unload at ports only', () => {
  assert.ok(/only load at ports/.test(V.evalLeg('cargo', [45, -40], [40, -30]).error));
  const p = V.nearestPort(51.9, 4.1); assert.ok(p.km < 30, p.port[0]);
  assert.ok(/only unload at ports/.test(V.evalLeg('cargo', [p.port[1], p.port[2]], [53, 3]).error));
  // a 12h load, and no seasickness on a ship this big
  const l = leg1('cargo', [p.port[1], p.port[2]], [V.nearestPort(53.55, 9.97).port[1], V.nearestPort(53.55, 9.97).port[2]]);
  assert.ok(!l.seasick); assert.ok(l.events.includes('12h to load the containers'));
});
test('pogo sticks need flat ground', () => {
  assert.ok(/flat ground/.test(V.evalLeg('pogo', [47, 8], [46.5, 9]).error)); // the Alps
  assert.strictEqual(V.terrainProblem('pogo', V.cellOf(52, 5), 52, 5), null); // the Netherlands
});
test('unicycles fall off once per 10 km of bumpy ground, an hour each', () => {
  const l = leg1('unicycle', [47, 8], [46.5, 9.5]);
  assert.ok(l.bumpy > 0); const n = Math.ceil(l.bumpy / 10);
  assert.ok(l.events.includes(`Fell off ${n} times on bumpy ground: +${n}h`));
});
test('a trebuchet throws you 1 km a day', () => {
  // 1 km at 1/24 km/h is 24h of moving; it never rests (24h a day)
  const l = leg1('trebuchet', [48, 2], [48, 2 + 1 / (111.195 * Math.cos(48 * Math.PI / 180))]);
  near(l.km, 1, 0.01); near(l.moving, 24, 0.3);
});
test('the flamingo drifts with the current: 2 km/h with it, 0.2 against it', () => {
  // 45°N currents run east (like the westerlies)
  assert.strictEqual(V.speedAt('flamingo', V.cellOf(45, -40), 45, 1), 2);
  assert.strictEqual(V.speedAt('flamingo', V.cellOf(45, -40), 45, -1), 0.2);
  assert.strictEqual(V.speedAt('flamingo', V.cellOf(10, -40), 10, -1), 2); // the tropics run west
});
test('whales only swim their migration lanes', () => {
  assert.strictEqual(V.evalLeg('whale', [50, -145], [40, -152]).error, null); // Alaska to Hawaii lane
  assert.ok(/migration routes/.test(V.evalLeg('whale', [30, -40], [30, -35]).error)); // middle of the Atlantic
});
test('zorbs and trolleys only go downhill, faster on steep slopes', () => {
  assert.strictEqual(V.evalLeg('zorb', [46.5, 8], [47.5, 8]).error, null);       // down out of the Alps
  assert.ok(/only goes downhill/.test(V.evalLeg('zorb', [47.5, 8], [46.5, 8]).error)); // back up
  const i = V.cellOf(52, 5);
  assert.strictEqual(V.speedAt('zorb', i, 52, 0, null, 0), 3);     // flat: 3 km/h
  assert.strictEqual(V.speedAt('zorb', i, 52, 0, null, 10), 18);   // 10 m per km: 3 + 10 × 1.5
  assert.strictEqual(V.speedAt('zorb', i, 52, 0, null, 100), 43);  // capped at 3 + 40
  assert.ok(leg1('trolley', [46.5, 8], [47.5, 8]).events.includes('🛒 Crashed at the bottom: +30m'));
});
test('jetpacks start at a spaceport and fly 25 km at most', () => {
  assert.strictEqual(V.evalLeg('jetpack', [28.5, -80.6], [28.6, -80.8]).error, null);
  assert.ok(/25 km at most/.test(V.evalLeg('jetpack', [28.5, -80.6], [29.5, -81]).error));
  assert.ok(/refuel at spaceports/.test(V.evalLeg('jetpack', [40, -100], [40, -99.9]).error));
});
test('digging with a spoon: 1 m a day, shown in years', () => {
  // 100 km = 100,000 m = 100,000 days = 274 years
  assert.strictEqual(V.fmtH(V.finalizeLegs([V.evalLeg('dig', [0, 10], [0, 10 + 100 / 111.195])], 1)[0].total), '274 years');
  assert.strictEqual(V.fmtH(400 * 24), '1.1 years');
});
test('the best-route computer never uses jetpacks or spoons, and the Silly season solve still works', () => {
  const r = V.solveRoute([46.5, 8], [52, 5], V.RULES.silly.modes, {});
  assert.ok(r && r.runs.every(x => x.mode !== 'jetpack' && x.mode !== 'dig'));
});
test('new badges: Boing at 100 km of pogo, Whale Rider, Patience', () => {
  const B = id => V.BADGES.find(b => b.id === id).test;
  assert.ok(B('boing')([{ mode: 'pogo', km: 60 }, { mode: 'walk', km: 5 }, { mode: 'pogo', km: 40 }], {}));
  assert.ok(!B('boing')([{ mode: 'pogo', km: 99 }], {}));
  assert.ok(B('whale')([{ mode: 'whale', km: 1 }], {}) && B('spoon')([{ mode: 'dig', km: 0.001 }], {}));
});

// ---------- route planner ----------
const PL = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'docs', 'data', 'planner.json')));
const CGRID = zlib.gunzipSync(fs.readFileSync(path.join(__dirname, '..', 'docs', 'data', 'countries.bin')));
const countryCells = name => { const k = PL.countries.findIndex(c => c[0] === name) + 1, out = []; for (let i = 0; i < CGRID.length; i++) if (CGRID[i] === k) out.push(i); return out; };
const AIR = PL.airports.map(a => [a[3], a[4], a[5]]);
test('planner data: country names are there and the country grid matches the game grid', () => {
  assert.strictEqual(CGRID.length, V.G.R * V.G.C);
  assert.ok(PL.countries.length > 200 && PL.countries.every(c => typeof c[0] === 'string' && c[0]));
  assert.ok(countryCells('Denmark').length > 50 && countryCells('Canada').length > 10000);
});
test('a flight: 3 h at the airports + 30 min taxi + km at 800 km/h', () => {
  near(V.flightHours(1600), 3 + 0.5 + 2, 1e-9); // 1600 / 800 = 2 h in the air
  assert.ok(V.canFly([0, 0, 1], [0, 0, 1], 15000) && !V.canFly([0, 0, 1], [0, 0, 0], 2600));
});
test('planner: walking from Canada to Denmark gets stuck at the sea and suggests a boat or a swim', () => {
  const r = V.planTrip(countryCells('Canada'), countryCells('Denmark'), ['walk'], { airports: AIR });
  assert.strictEqual(r.ok, false);
  assert.ok(r.leftKm > 500, 'still a long way off');
  assert.ok(['sea', 'lake'].includes(r.blocked.surface), r.blocked.surface);
  assert.ok(r.blocked.fix.includes('ferry') && r.blocked.fix.includes('swim'));
  assert.ok(r.runs.every(x => x.mode === 'walk'));
});
test('planner: adding a boat to walking reaches Denmark from Canada', () => {
  const r = V.planTrip(countryCells('Canada'), countryCells('Denmark'), ['walk', 'ferry'], { airports: AIR });
  assert.ok(r.ok && r.runs.some(x => x.mode === 'ferry'));
});
test('planner: Toronto to Copenhagen with a plane flies YYZ to CPH', () => {
  const r = V.planTrip([V.cellOf(43.70, -79.42)], [V.cellOf(55.68, 12.56)], ['walk', 'car', 'plane'], { airports: AIR });
  const f = r.runs.filter(x => x.mode === 'plane');
  assert.ok(r.ok && f.length === 1);
  assert.strictEqual(PL.airports[f[0].from][0] + '-' + PL.airports[f[0].to][0], 'YYZ-CPH');
  // about 6,270 km: 3.5 h at airports and taxiing + 7.8 h flying, plus a short drive to the airport
  near(r.hours, 12, 1.5);
});
test('planner: a plane alone cannot leave a place with no airport, and says what could', () => {
  const r = V.planTrip([V.cellOf(-25, 133)], [V.cellOf(-33.9, 151.2)], ['plane'], { airports: AIR }); // middle of Australia
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.runs.length, 0);
  assert.ok(r.blocked && r.blocked.fix.includes('walk'));
});
test('planner and game agree on a simple drive (Paris to Berlin by car)', () => {
  const r = V.planTrip([V.cellOf(48.87, 2.33)], [V.cellOf(52.52, 13.40)], ['car']);
  const g = V.solveRoute([48.87, 2.33], [52.52, 13.40], ['car'], {});
  near(r.hours, g.hours, 0.6);
});
test('planner: cars cross short bridges, so Paris to Copenhagen is about a day, not a drive round the Baltic', () => {
  const r = V.planTrip([V.cellOf(48.87, 2.33)], [V.cellOf(55.68, 12.56)], ['car']);
  assert.ok(r.ok && r.hours < 40, `got ${r.hours}`);
});


console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ''}`);
