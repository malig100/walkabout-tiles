// Hand-made OSM data covering the edge cases of the tile builder. Used by the tests and make-fixtures.js.
const { walkable } = require('./tiles');

const BIG = 12_000_000_000; // node ids above 2^32 exist in OSM

const nodes = {
  1001: [59.3300000, 18.0500000],
  [BIG + 2]: [59.3310000, 18.0500000],
  1003: [59.3320000, 18.0510000],
  [BIG + 4]: [59.3399000, 18.0520000], // just south of the 59.34 tile border
  1005: [59.3405000, 18.0520000], // just north of it
  1006: [59.3420000, 18.0530000],
  1007: [59.3310000, 18.0480000],
  1008: [59.3305000, 18.0490000],
  // Cape Town: negative row
  2001: [-33.9250000, 18.4240000],
  2002: [-33.9260000, 18.4250000],
  // London: negative column
  3001: [51.5000000, -0.1200000],
  3002: [51.5010000, -0.1210000],
};

const rawWays = [
  // Crosses into the next tile row: one piece in each tile.
  { id: 100, tags: { highway: 'residential', name: 'Sankt Göransgatan' }, refs: [1001, BIG + 2, 1003, BIG + 4, 1005, 1006] },
  // Repeated node (skipped edge) splits the piece.
  { id: 50, tags: { highway: 'footway' }, refs: [BIG + 2, BIG + 2, 1007] },
  // First edge duplicates way 100's (lower id wins), second is new.
  { id: 200, tags: { highway: 'service' }, refs: [1001, BIG + 2, 1008] },
  // Node 999 is missing from the extract: both edges are dropped.
  { id: 300, tags: { highway: 'path' }, refs: [1008, 999, 1001] },
  // Not walkable.
  { id: 400, tags: { highway: 'motorway' }, refs: [1001, 1003] },
  { id: 401, tags: { highway: 'residential', access: 'private' }, refs: [1001, 1003] },
  { id: 402, tags: { highway: 'pedestrian', area: 'yes' }, refs: [1001, 1003] },
  { id: 403, tags: { highway: 'service', service: 'driveway' }, refs: [1001, 1003] },
  { id: 404, tags: { highway: 'path', foot: 'no' }, refs: [1001, 1003] },
  { id: 500, tags: { highway: 'tertiary', name: 'Long Street' }, refs: [2001, 2002] },
  { id: 600, tags: { highway: 'pedestrian', name: 'Strand ✓ 東' }, refs: [3001, 3002] },
];

const OSM_TIMESTAMP = 1_792_000_000;

function syntheticWays() {
  return rawWays
    .filter(w => walkable(w.tags))
    .map(w => ({ id: w.id, highway: w.tags.highway, name: w.tags.name ?? null, refs: w.refs }))
    .sort((a, b) => a.id - b.id);
}

function syntheticCoordOf(id) {
  const c = nodes[id];
  return c && { latE7: Math.round(c[0] * 1e7), lngE7: Math.round(c[1] * 1e7) };
}

module.exports = { syntheticWays, syntheticCoordOf, OSM_TIMESTAMP };
