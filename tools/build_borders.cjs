// Build docs/data/borders.json (country borders as delta-encoded lines, 0.05° units).
// Run from the repo root:  npm install --no-save world-atlas@2 topojson-client@3 && node tools/build_borders.cjs
const fs = require('fs');
const topojson = require('topojson-client');
const t = require('world-atlas/countries-50m.json');
const mesh = topojson.mesh(t, t.objects.countries, (a, b) => a !== b); // shared borders only, no coastlines
const out = mesh.coordinates.map(line => {
  let px = 0, py = 0, last = null; const s = [];
  for (const [x, y] of line) {
    const X = Math.round(x * 20), Y = Math.round(y * 20);
    if (last && last[0] === X && last[1] === Y) continue;
    s.push(X - px, Y - py); px = X; py = Y; last = [X, Y];
  }
  return s;
});
fs.writeFileSync('docs/data/borders.json', JSON.stringify(out));
console.log(`Wrote ${out.length} border lines`);
