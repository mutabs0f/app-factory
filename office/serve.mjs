#!/usr/bin/env node
// office/serve.mjs — serves the AI Office viewer for one app repo.
//
//   node office/serve.mjs <path-to-app-repo> [port]
//
// Serves index.html on 127.0.0.1 (default port 4180) and exposes the repo's
// .office/events.jsonl as JSON at /events. Read-only: it never writes to the
// repo and binds to localhost only.
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const lan = process.argv.includes('--lan'); // opt-in: expose on the local network (for the iPhone)
const args = process.argv.slice(2).filter((a) => a !== '--lan');
const repo = resolve(args[0] || process.cwd());
const port = Number(args[1] || 4180);

function projectName() {
  for (const f of ['app.json', 'package.json']) {
    try {
      const j = JSON.parse(readFileSync(join(repo, f), 'utf8'));
      const n = j?.expo?.name || j?.name;
      if (n) return String(n);
    } catch {
      /* try next */
    }
  }
  return repo.split(/[\\/]/).filter(Boolean).pop();
}

function readEvents(since) {
  const file = join(repo, '.office', 'events.jsonl');
  if (!existsSync(file)) return [];
  const lines = readFileSync(file, 'utf8').split('\n').filter(Boolean);
  const events = [];
  for (const line of lines.slice(-800)) {
    try {
      const e = JSON.parse(line);
      if (!since || e.t > since) events.push(e);
    } catch {
      /* skip bad line */
    }
  }
  return events;
}

const STATIC = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/3d': ['office3d.html', 'text/html; charset=utf-8'],
  '/office3d.html': ['office3d.html', 'text/html; charset=utf-8'],
  '/vendor/three.module.min.js': ['vendor/three.module.min.js', 'text/javascript; charset=utf-8'],
};

const server = createServer((req, res) => {
  const u = new URL(req.url, 'http://127.0.0.1');
  const hit = STATIC[u.pathname];
  if (hit) {
    res.writeHead(200, { 'content-type': hit[1] });
    res.end(readFileSync(join(HERE, hit[0])));
    return;
  }
  if (u.pathname === '/events') {
    const since = Number(u.searchParams.get('since') || 0);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ project: projectName(), repo, now: Date.now(), events: readEvents(since) }));
    return;
  }
  res.writeHead(404, { 'content-type': 'text/plain' });
  res.end('not found');
});

server.listen(port, lan ? '0.0.0.0' : '127.0.0.1', () => {
  console.log(`AI Office watching ${repo}`);
  console.log(`3D show   http://127.0.0.1:${port}/3d        (live)  ·  /3d?demo=1 (demo day)`);
  console.log(`2D floor  http://127.0.0.1:${port}/          (live)  ·  /?demo=1   (demo day)`);
  if (lan) {
    const ips = Object.values(networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal);
    for (const ip of ips) console.log(`iPhone    http://${ip.address}:${port}/3d   (same Wi-Fi; director cam follows the action)`);
    console.log(`--lan is ON: anyone on this Wi-Fi can view (read-only). Omit --lan for PC-only.`);
  }
});
