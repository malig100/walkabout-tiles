#!/usr/bin/env node
// Stops a weekly build that shrank: compares a new index.json with the published one.
//
//   node check.js <new index.json> <published index.json URL> [--max-drop 0.05]
//
// Fails if the number of tiles or edges dropped more than --max-drop (default 5 %), which guards
// against a broken or truncated extract. A missing published index (first build) passes.
const fs = require('fs');

async function main() {
  const [file, url, flag, value] = process.argv.slice(2);
  if (!file || !url) throw new Error('usage: node check.js <new index.json> <published index.json URL> [--max-drop 0.05]');
  const maxDrop = flag === '--max-drop' ? Number(value) : 0.05;
  const next = JSON.parse(fs.readFileSync(file, 'utf8'));

  const res = await fetch(url, { cache: 'no-store' });
  if (res.status === 404) { console.log('no published index yet, nothing to compare'); return; }
  if (!res.ok) throw new Error(`published index: HTTP ${res.status}`);
  const prev = await res.json();
  if (prev.format !== next.format) { console.log(`format ${prev.format} -> ${next.format}, not compared`); return; }

  for (const key of ['tiles', 'edges']) {
    const drop = (prev[key] - next[key]) / prev[key];
    console.log(`${key}: ${prev[key]} -> ${next[key]} (${(-drop * 100).toFixed(1)} %)`);
    if (drop > maxDrop) throw new Error(`${key} dropped ${(drop * 100).toFixed(1)} %, more than ${maxDrop * 100} %`);
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });
