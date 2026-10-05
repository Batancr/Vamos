// Route-solver worker. The preview build prepends phys.js instead of importing it.
if (typeof solveRoute === 'undefined') importScripts('phys.js');
onmessage = e => {
  const d = e.data;
  if (d.grid) { setGrid(new Uint8Array(d.grid)); return; }
  postMessage({ id: d.id, r: solveRoute(d.a, d.b, d.modes) });
};
