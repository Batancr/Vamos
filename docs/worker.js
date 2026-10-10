// Route-solver worker. The preview build prepends phys.js instead of importing it.
if (typeof solveRoute === 'undefined') importScripts('phys.js');
onmessage = e => {
  const d = e.data;
  if (d.grid) { setGrid(new Uint8Array(d.grid)); return; }
  if (d.plan) { setCharacter('none'); postMessage({ id: d.id, plan: true, r: planTrip(d.src, d.dst, d.modes, { airports: d.airports, near: d.near }) }); return; } // the Route Planner tab
  setCharacter(d.char);
  postMessage({ id: d.id, r: solveRoute(d.a, d.b, d.modes, d.boost) });
};
