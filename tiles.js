// Turns OSM ways and node coordinates into street tiles, with the same rules as the app's Overpass query
// (app/src/main/java/app/walkabout/streets/OverpassParser.kt).
const { edgeKey, tileKey, LAT_STEP_E7, LNG_STEP_E7 } = require('./format');

const HIGHWAY = /^(footway|path|pedestrian|living_street|residential|service|steps|track|cycleway|unclassified|tertiary|tertiary_link|secondary|secondary_link|primary|primary_link|road|bridleway)$/;

/** Walkable ways only: no motorways, private roads, parking aisles or areas. */
function walkable(tags) {
  if (!tags || !tags.highway || !HIGHWAY.test(tags.highway)) return false;
  if (tags.access && /^(private|no)$/.test(tags.access)) return false;
  if (tags.foot && /^(no|private)$/.test(tags.foot)) return false;
  if (tags.area === 'yes') return false;
  if (tags.service && /^(parking_aisle|driveway|drive-through)$/.test(tags.service)) return false;
  return true;
}

/**
 * [ways]: walkable ways in id order, [{ id, highway, name, refs }].
 * [coordOf]: node id -> { latE7, lngE7 } or undefined when the node is missing from the extract.
 * Returns Map tileKey -> { row, col, pieces, edges } where edges is the plain list (for checks and fixtures).
 * Like the app, an edge seen twice (overlapping ways) is kept once, from the first way.
 */
function buildTiles(ways, coordOf) {
  const tiles = new Map();
  const seen = new Set();
  for (const w of ways) {
    let piece = null, pieceTile = null;
    for (let i = 0; i < w.refs.length - 1; i++) {
      const a = w.refs[i], b = w.refs[i + 1];
      const pa = coordOf(a), pb = coordOf(b);
      const key = edgeKey(a, b);
      if (!pa || !pb || a === b || seen.has(key)) { piece = null; continue; }
      seen.add(key);
      const row = Math.floor((pa.latE7 + pb.latE7) / 2 / LAT_STEP_E7);
      const col = Math.floor((pa.lngE7 + pb.lngE7) / 2 / LNG_STEP_E7);
      const tk = tileKey(row, col);
      let tile = tiles.get(tk);
      if (!tile) { tile = { row, col, pieces: [], edges: [] }; tiles.set(tk, tile); }
      tile.edges.push({
        key, wayId: w.id, name: w.name ?? null, highway: w.highway, nodeA: a, nodeB: b,
        latA: pa.latE7 / 1e7, lngA: pa.lngE7 / 1e7, latB: pb.latE7 / 1e7, lngB: pb.lngE7 / 1e7,
      });
      if (piece && pieceTile === tk) {
        piece.nodes.push({ id: b, ...pb });
      } else {
        piece = { wayId: w.id, highway: w.highway, name: w.name ?? null, nodes: [{ id: a, ...pa }, { id: b, ...pb }] };
        pieceTile = tk;
        tile.pieces.push(piece);
      }
    }
  }
  return tiles;
}

module.exports = { walkable, buildTiles };
