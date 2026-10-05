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
test('best route Inverness → Marrakesh on human power has to swim', () => {
  const r = V.solveRoute([57.48, -4.22], [31.63, -7.99], V.RULES.human.modes);
  assert.ok(r && r.runs.some(x => x.mode === 'swim'));
});

console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ''}`);
