#!/usr/bin/env node
// Serves a build.js output folder like the real static host does (ETag, 304, 404), for testing the app:
//
//   node serve.js <out dir> [port]          then: adb reverse tcp:8787 tcp:8787
//   and build the app with -PstreetTilesUrl=http://127.0.0.1:8787/v1/
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.resolve(process.argv[2] || 'out');
const port = Number(process.argv[3] || 8787);

http.createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = path.join(root, url);
  let status;
  if (!file.startsWith(root) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    status = 404;
    res.writeHead(404).end();
  } else {
    const body = fs.readFileSync(file);
    const etag = `"${crypto.createHash('sha1').update(body).digest('hex').slice(0, 16)}"`;
    if (req.headers['if-none-match'] === etag) {
      status = 304;
      res.writeHead(304, { ETag: etag }).end();
    } else {
      status = 200;
      const type = file.endsWith('.json') ? 'application/json' : 'application/octet-stream';
      res.writeHead(200, { ETag: etag, 'Content-Type': type, 'Content-Length': body.length }).end(body);
    }
  }
  console.log(`${new Date().toISOString().slice(11, 19)} ${req.method} ${url} ${status}`);
}).listen(port, '127.0.0.1', () => console.log(`serving ${root} on http://127.0.0.1:${port}/`));
