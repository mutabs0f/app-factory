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

const HERE = dirname(fileURLToPath(import.meta.url));
const repo = resolve(process.argv[2] || process.cwd());
const port = Number(process.argv[3] || 4180);

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

const server = createServer((req, res) => {
  const u = new URL(req.url, 'http://127.0.0.1');
  if (u.pathname === '/') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(readFileSync(join(HERE, 'index.html')));
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

server.listen(port, '127.0.0.1', () => {
  console.log(`AI Office watching ${repo}`);
  console.log(`Open  http://127.0.0.1:${port}/        (live)`);
  console.log(`Or    http://127.0.0.1:${port}/?demo=1  (demo mode, fake day at the office)`);
});
