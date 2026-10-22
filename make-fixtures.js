#!/usr/bin/env node
// Writes the shared test tiles to the folder named in fixtures-dir.js (used by the app's decoder tests
// and by test/build.test.js). Each tile is <name>_<row>_<col>.bin.gz plus a .json with the expected edges.
//
//   node make-fixtures.js                       synthetic tiles only
//   node make-fixtures.js <built dir> <row:col>  also copy one real tile from a build.js output
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { encodeTile, decodeTile } = require('./format');
const { buildTiles } = require('./tiles');
const { syntheticWays, syntheticCoordOf, OSM_TIMESTAMP } = require('./fixtures');

const OUT = require('./fixtures-dir');

function write(name, row, col, gz, edges, osmTimestamp) {
  const base = path.join(OUT, `${name}_${row}_${col}`);
  fs.writeFileSync(`${base}.bin.gz`, gz);
  const sorted = [...edges].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  fs.writeFileSync(`${base}.json`, JSON.stringify({ row, col, osmTimestamp, edges: sorted }, null, 1) + '\n');
  console.log(`${path.basename(base)}: ${edges.length} edges, ${gz.length} bytes`);
}

fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) if (f.startsWith('synthetic_')) fs.unlinkSync(path.join(OUT, f));
for (const t of buildTiles(syntheticWays(), syntheticCoordOf).values()) {
  const raw = encodeTile({ row: t.row, col: t.col, osmTimestamp: OSM_TIMESTAMP, pieces: t.pieces });
  write('synthetic', t.row, t.col, zlib.gzipSync(raw, { level: 9 }), t.edges, OSM_TIMESTAMP);
}

const [builtDir, tile] = process.argv.slice(2);
if (builtDir) {
  const [row, col] = tile.split(':');
  const gz = fs.readFileSync(path.join(builtDir, 'v1', 't', row, `${col}.bin.gz`));
  // build.js already checked this tile against the source edges, so its decoded edges are the expected ones.
  const decoded = decodeTile(zlib.gunzipSync(gz));
  write('stockholm', decoded.row, decoded.col, gz, decoded.edges, decoded.osmTimestamp);
}
