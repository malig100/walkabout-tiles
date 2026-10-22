const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { encodeTile, decodeTile } = require('../format');
const { walkable, buildTiles } = require('../tiles');
const { syntheticWays, syntheticCoordOf, OSM_TIMESTAMP } = require('../fixtures');

const FIXTURES = require('../fixtures-dir');
const fixture = name => ({
  raw: zlib.gunzipSync(fs.readFileSync(path.join(FIXTURES, `${name}.bin.gz`))),
  expected: JSON.parse(fs.readFileSync(path.join(FIXTURES, `${name}.json`), 'utf8')),
});
const byKey = edges => [...edges].sort((a, b) => (a.key < b.key ? -1 : 1));

test('walkable follows the app filter', () => {
  assert.ok(walkable({ highway: 'footway' }));
  assert.ok(walkable({ highway: 'residential', access: 'yes' }));
  assert.ok(!walkable({ highway: 'motorway' }));
  assert.ok(!walkable({ highway: 'residential', access: 'private' }));
  assert.ok(!walkable({ highway: 'path', foot: 'no' }));
  assert.ok(!walkable({ highway: 'pedestrian', area: 'yes' }));
  assert.ok(!walkable({ highway: 'service', service: 'parking_aisle' }));
  assert.ok(!walkable({ building: 'yes' }));
});

test('synthetic tiles are built exactly like the shared fixtures', () => {
  const tiles = [...buildTiles(syntheticWays(), syntheticCoordOf).values()];
  assert.deepStrictEqual(tiles.map(t => `${t.row}:${t.col}`).sort(), ['-1697:460', '2575:-4', '2966:451', '2967:451']);
  for (const t of tiles) {
    const { raw, expected } = fixture(`synthetic_${t.row}_${t.col}`);
    const encoded = encodeTile({ row: t.row, col: t.col, osmTimestamp: OSM_TIMESTAMP, pieces: t.pieces });
    assert.ok(encoded.equals(raw), `tile ${t.row}:${t.col} bytes changed; run make-fixtures.js if intended`);
    assert.deepStrictEqual(byKey(t.edges), expected.edges);
  }
});

test('edge cases: border split, duplicates, repeated and missing nodes', () => {
  const tiles = buildTiles(syntheticWays(), syntheticCoordOf);
  const keys = [...tiles.values()].flatMap(t => t.edges.map(e => `${e.wayId}:${e.key}`)).sort();
  assert.deepStrictEqual(keys, [
    '100:1001-12000000002', '100:1003-12000000002', '100:1003-12000000004',
    '100:1005-1006', '100:1005-12000000004',
    '200:1008-12000000002',
    '500:2001-2002',
    '50:1007-12000000002',
    '600:3001-3002',
  ]);
});

test('every fixture decodes to its expected edges', () => {
  for (const f of fs.readdirSync(FIXTURES).filter(f => f.endsWith('.bin.gz'))) {
    const { raw, expected } = fixture(f.replace('.bin.gz', ''));
    const decoded = decodeTile(raw);
    assert.strictEqual(decoded.row, expected.row);
    assert.strictEqual(decoded.col, expected.col);
    assert.strictEqual(decoded.osmTimestamp, expected.osmTimestamp);
    assert.deepStrictEqual(byKey(decoded.edges), expected.edges, f);
  }
});

test('rejects broken tiles', () => {
  const { raw } = fixture('synthetic_2966_451');
  assert.throws(() => decodeTile(Buffer.from('NOPE')), /not a street tile/);
  assert.throws(() => decodeTile(raw.subarray(0, raw.length - 3)), /truncated/);
  assert.throws(() => decodeTile(Buffer.concat([raw, Buffer.from([0])])), /trailing/);
});
