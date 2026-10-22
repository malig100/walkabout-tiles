// Street tile format v1: one gzipped binary file per tile of the app's 0.02° x 0.04° grid.
//
//   header   "WATL", varint version, zigzag row, zigzag col, varint OSM timestamp (seconds)
//   strings  varint count, then varint byte length + UTF-8 each; sorted, always starts with "" (no name)
//   nodes    varint count, then per node (sorted by id): varint id delta,
//            zigzag lat delta, zigzag lng delta (1e-7 degrees, first delta from the tile's south-west corner)
//   pieces   varint count, then per piece of a way (sorted by way id): zigzag way id delta,
//            varint highway string, varint name string, varint node count (>= 2), zigzag node index deltas
//
// A street edge is two consecutive nodes of a piece. Each edge is in exactly one tile: the one holding its midpoint.

const MAGIC = 'WATL';
const VERSION = 1;
const LAT_STEP_E7 = 200_000; // 0.02°
const LNG_STEP_E7 = 400_000; // 0.04°

class Writer {
  constructor() { this.bytes = []; }
  varint(n) {
    if (!Number.isSafeInteger(n) || n < 0) throw new Error(`bad varint ${n}`);
    while (n >= 128) { this.bytes.push((n % 128) | 128); n = Math.floor(n / 128); }
    this.bytes.push(n);
  }
  zigzag(n) { this.varint(n >= 0 ? n * 2 : -n * 2 - 1); }
  string(s) {
    const b = Buffer.from(s, 'utf8');
    this.varint(b.length);
    for (const x of b) this.bytes.push(x);
  }
  buffer() { return Buffer.from(this.bytes); }
}

class Reader {
  constructor(buf) { this.buf = buf; this.pos = 0; }
  varint() {
    let n = 0, mul = 1, b;
    do {
      if (this.pos >= this.buf.length) throw new Error('truncated tile');
      b = this.buf[this.pos++];
      n += (b & 127) * mul;
      mul *= 128;
    } while (b & 128);
    return n;
  }
  zigzag() { const n = this.varint(); return n % 2 ? -(n + 1) / 2 : n / 2; }
  string() {
    const len = this.varint();
    const s = this.buf.subarray(this.pos, this.pos + len).toString('utf8');
    this.pos += len;
    return s;
  }
}

const tileKey = (row, col) => `${row}:${col}`;
const edgeKey = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);

/**
 * [pieces]: [{ wayId, highway, name (or null), nodes: [{ id, latE7, lngE7 }] }].
 * Returns the raw (not gzipped) tile.
 */
function encodeTile({ row, col, osmTimestamp, pieces }) {
  const w = new Writer();
  for (const c of MAGIC) w.bytes.push(c.charCodeAt(0));
  w.varint(VERSION);
  w.zigzag(row);
  w.zigzag(col);
  w.varint(osmTimestamp);

  const sorted = pieces.map((p, i) => ({ p, i })).sort((x, y) => x.p.wayId - y.p.wayId || x.i - y.i).map(x => x.p);

  const strings = [...new Set(['', ...sorted.flatMap(p => [p.highway, p.name ?? ''])])].sort();
  const stringIndex = new Map(strings.map((s, i) => [s, i]));
  w.varint(strings.length);
  strings.forEach(s => w.string(s));

  const nodeById = new Map();
  for (const p of sorted) for (const n of p.nodes) nodeById.set(n.id, n);
  const nodes = [...nodeById.values()].sort((a, b) => a.id - b.id);
  const nodeIndex = new Map(nodes.map((n, i) => [n.id, i]));
  w.varint(nodes.length);
  let id = 0, lat = row * LAT_STEP_E7, lng = col * LNG_STEP_E7;
  for (const n of nodes) {
    w.varint(n.id - id);
    w.zigzag(n.latE7 - lat);
    w.zigzag(n.lngE7 - lng);
    id = n.id; lat = n.latE7; lng = n.lngE7;
  }

  w.varint(sorted.length);
  let way = 0;
  for (const p of sorted) {
    if (p.nodes.length < 2) throw new Error(`piece of way ${p.wayId} has < 2 nodes`);
    w.zigzag(p.wayId - way);
    way = p.wayId;
    w.varint(stringIndex.get(p.highway));
    w.varint(stringIndex.get(p.name ?? ''));
    w.varint(p.nodes.length);
    let prev = 0;
    for (const n of p.nodes) { const i = nodeIndex.get(n.id); w.zigzag(i - prev); prev = i; }
  }
  return w.buffer();
}

/** Raw tile -> { row, col, osmTimestamp, edges: [{ key, wayId, name, highway, nodeA, nodeB, latA, lngA, latB, lngB }] }. */
function decodeTile(buf) {
  const r = new Reader(buf);
  const magic = buf.subarray(0, 4).toString('latin1');
  if (magic !== MAGIC) throw new Error(`not a street tile (${magic})`);
  r.pos = 4;
  const version = r.varint();
  if (version !== VERSION) throw new Error(`unsupported tile version ${version}`);
  const row = r.zigzag(), col = r.zigzag(), osmTimestamp = r.varint();

  const strings = [];
  for (let i = r.varint(); i > 0; i--) strings.push(r.string());

  const nodes = [];
  let id = 0, lat = row * LAT_STEP_E7, lng = col * LNG_STEP_E7;
  for (let i = r.varint(); i > 0; i--) {
    id += r.varint(); lat += r.zigzag(); lng += r.zigzag();
    nodes.push({ id, lat: lat / 1e7, lng: lng / 1e7 });
  }

  const edges = [];
  let way = 0;
  for (let i = r.varint(); i > 0; i--) {
    way += r.zigzag();
    const highway = strings[r.varint()];
    const name = strings[r.varint()] || null;
    let idx = 0, prev = null;
    for (let j = r.varint(); j > 0; j--) {
      idx += r.zigzag();
      const n = nodes[idx];
      if (prev) {
        edges.push({ key: edgeKey(prev.id, n.id), wayId: way, name, highway, nodeA: prev.id, nodeB: n.id, latA: prev.lat, lngA: prev.lng, latB: n.lat, lngB: n.lng });
      }
      prev = n;
    }
  }
  if (r.pos !== buf.length) throw new Error('trailing bytes in tile');
  return { row, col, osmTimestamp, edges };
}

module.exports = { encodeTile, decodeTile, tileKey, edgeKey, LAT_STEP_E7, LNG_STEP_E7, VERSION };
