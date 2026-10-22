#!/usr/bin/env node
// Builds street tiles from an OSM extract.
//
//   node build.js <extract.osm.pbf> --out <dir> --region <name>:<south>,<west>,<north>,<east>
//                 [--region ...] [--osm-timestamp 2026-10-24T20:00:00Z] [--build 2026-10-25]
//
// Writes <dir>/v1/t/<row>/<col>.bin.gz and <dir>/v1/index.json, after decoding every tile again
// and comparing it with the source edges.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const parseOSM = require('osm-pbf-parser');
const { encodeTile, decodeTile, VERSION } = require('./format');
const { walkable, buildTiles } = require('./tiles');

function parseArgs(argv) {
  const args = { input: null, out: null, regions: [], osmTimestamp: null, build: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') args.out = argv[++i];
    else if (a === '--region') {
      const [name, box] = argv[++i].split(':');
      const [south, west, north, east] = box.split(',').map(Number);
      if (![south, west, north, east].every(Number.isFinite)) throw new Error(`bad --region ${argv[i]}`);
      args.regions.push({ name, south, west, north, east });
    } else if (a === '--osm-timestamp') args.osmTimestamp = argv[++i];
    else if (a === '--build') args.build = argv[++i];
    else if (!args.input) args.input = a;
    else throw new Error(`unknown argument ${a}`);
  }
  if (!args.input || !args.out || args.regions.length === 0) {
    throw new Error('usage: node build.js <extract.osm.pbf> --out <dir> --region <name>:<s>,<w>,<n>,<e> [...]');
  }
  return args;
}

function readPbf(file, onItem) {
  return new Promise((resolve, reject) => {
    fs.createReadStream(file).pipe(parseOSM())
      .on('data', items => { for (const it of items) onItem(it); })
      .on('end', resolve)
      .on('error', reject);
  });
}

function sameEdge(a, b) {
  return a.wayId === b.wayId && a.name === b.name && a.highway === b.highway &&
    a.nodeA === b.nodeA && a.nodeB === b.nodeB &&
    a.latA === b.latA && a.lngA === b.lngA && a.latB === b.latB && a.lngB === b.lngB;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const started = Date.now();
  const osmDate = args.osmTimestamp ? new Date(args.osmTimestamp) : new Date(fs.statSync(args.input).mtimeMs);
  const osmTimestamp = Math.floor(osmDate.getTime() / 1000);
  const build = args.build ?? new Date().toISOString().slice(0, 10);

  // Pass 1: walkable ways (pbf files list nodes before ways, so coordinates need a second pass).
  const ways = [];
  const needed = new Set();
  await readPbf(args.input, it => {
    if (it.type !== 'way' || !walkable(it.tags) || it.refs.length < 2) return;
    ways.push({ id: it.id, highway: it.tags.highway, name: it.tags.name || null, refs: it.refs });
    for (const r of it.refs) needed.add(r);
  });
  ways.sort((a, b) => a.id - b.id);

  // Pass 2: coordinates of the nodes those ways use, kept in typed arrays to save memory.
  const index = new Map();
  const lats = new Int32Array(needed.size), lngs = new Int32Array(needed.size);
  await readPbf(args.input, it => {
    if (it.type !== 'node' || !needed.has(it.id) || index.has(it.id)) return;
    const i = index.size;
    index.set(it.id, i);
    lats[i] = Math.round(it.lat * 1e7);
    lngs[i] = Math.round(it.lon * 1e7);
  });
  needed.clear();
  const coordOf = id => { const i = index.get(id); return i === undefined ? undefined : { latE7: lats[i], lngE7: lngs[i] }; };
  console.log(`${ways.length} ways, ${index.size} nodes (${((Date.now() - started) / 1000).toFixed(0)} s)`);

  const tiles = buildTiles(ways, coordOf);
  const root = path.join(args.out, `v${VERSION}`);
  fs.rmSync(path.join(root, 't'), { recursive: true, force: true });
  let edgeCount = 0, bytes = 0;
  for (const tile of tiles.values()) {
    const raw = encodeTile({ row: tile.row, col: tile.col, osmTimestamp, pieces: tile.pieces });
    // Check every tile before writing it: decoding must give back exactly the source edges.
    const decoded = new Map(decodeTile(raw).edges.map(e => [e.key, e]));
    if (decoded.size !== tile.edges.length || !tile.edges.every(e => decoded.has(e.key) && sameEdge(e, decoded.get(e.key)))) {
      throw new Error(`tile ${tile.row}:${tile.col} does not decode to its source edges`);
    }
    const gz = zlib.gzipSync(raw, { level: 9 });
    const dir = path.join(root, 't', String(tile.row));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${tile.col}.bin.gz`), gz);
    edgeCount += tile.edges.length;
    bytes += gz.length;
  }

  const indexJson = {
    format: VERSION,
    build,
    osmTimestamp: osmDate.toISOString(),
    regions: args.regions,
    tiles: tiles.size,
    edges: edgeCount,
  };
  fs.writeFileSync(path.join(root, 'index.json'), JSON.stringify(indexJson, null, 2) + '\n');
  console.log(`${tiles.size} tiles, ${edgeCount} edges, ${(bytes / 1048576).toFixed(1)} MB, all verified (${((Date.now() - started) / 1000).toFixed(0)} s)`);
}

main().catch(e => { console.error(e.message); process.exit(1); });
