#!/usr/bin/env node
// runtime-check.mjs — OPENS THE APP AND LOOKS AT IT.
//
// Everything else in the gate proves the code compiles and the database is sound. None of
// it proves the app RUNS. Measured 2026-07-25: a build passed the whole gate while
// rendering a blank white page (a stale bundler cache had inlined `undefined` for the
// Supabase URL, so the client threw at import and React mounted nothing). Nothing noticed,
// because nothing ever opened it.
//
// This closes that. Per the loops article's prescription for turn-based loops — give Claude
// tools to SEE, MEASURE and INTERACT with the result — and per this factory's doctrine that
// deterministic work belongs in a script, not in an agent's reasoning.
//
//   node scripts/runtime-check.mjs            build, serve, walk every route, assert
//   node scripts/runtime-check.mjs --keep     leave the server up for manual poking
//   node scripts/runtime-check.mjs --aria     also print the accessibility tree per route
//
// WHAT IT PROVES: every route mounts real content; zero console errors; zero failed network
// requests; protected routes redirect instead of crashing.
// WHAT IT DOES NOT PROVE: signed-in behaviour. Walking authenticated screens needs a seeded
// session, which is not built yet — that limit is printed on every run rather than implied away.
import { execSync, spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

const ROOT = process.cwd();
const OUT = join(ROOT, '.runtime-web');
const KEEP = process.argv.includes('--keep');
const SHOW_ARIA = process.argv.includes('--aria');
const PORT = 4610 + (process.pid % 300); // avoid collisions with a parallel run

const fail = (msg) => {
  console.error(`\n  runtime-check FAILED\n  ${msg}\n`);
  process.exit(1);
};

// ── 0. the browser must be present. A missing browser means the check CANNOT RUN, which is
// a failure with a one-line fix — never a silent skip. `doctor.mjs` checks this too.
let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  fail(
    'playwright is not installed.\n' +
      '  Run these two commands once, then re-run:\n\n' +
      '    npm i -D playwright\n' +
      '    npx playwright install chromium',
  );
}

// ── 1. build the web bundle. --clear is mandatory: see the stale-cache incident above.
console.log('  building web bundle…');
try {
  rmSync(OUT, { recursive: true, force: true });
  execSync(`npx expo export --platform web --clear --output-dir ${JSON.stringify('.runtime-web')}`, {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
} catch (e) {
  fail(`web export failed:\n${((e.stdout || '') + (e.stderr || '')).toString().split('\n').slice(-15).join('\n')}`);
}
if (!existsSync(join(OUT, 'index.html'))) fail('web export produced no index.html');

// ── 2. serve it (zero-dependency static server with SPA fallback)
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.map': 'application/json' };
const server = createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  let p = join(OUT, url.replace(/^(\.\.[/\\])+/, ''));
  if (existsSync(p) && statSync(p).isDirectory()) p = join(p, 'index.html');
  if (!existsSync(p) || statSync(p).isDirectory()) p = join(OUT, 'index.html'); // client route
  res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' });
  res.end(readFileSync(p));
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
const base = `http://127.0.0.1:${PORT}`;
console.log(`  serving ${base}`);

// ── 3. discover routes from the expo-router tree. Group segments "(x)" are not in the URL.
function routes() {
  const dir = join(ROOT, 'src', 'app');
  const found = [];
  const walk = (d, prefix) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) walk(join(d, e.name), /^\(.*\)$/.test(e.name) ? prefix : `${prefix}/${e.name}`);
      else if (/\.tsx?$/.test(e.name) && !e.name.startsWith('_')) {
        const n = e.name.replace(/\.tsx?$/, '');
        if (n.startsWith('+')) continue; // +not-found etc.
        found.push(n === 'index' ? prefix || '/' : `${prefix}/${n}`);
      }
    }
  };
  walk(dir, '');
  return [...new Set(found)].sort();
}

const results = [];
const browser = await chromium.launch();
try {
  for (const route of routes()) {
    const page = await browser.newPage();
    const errors = [];
    const failed = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
    page.on('pageerror', (e) => errors.push(`uncaught: ${e.message}`.slice(0, 300)));
    page.on('requestfailed', (r) => failed.push(`${r.method()} ${r.url().slice(0, 120)} — ${r.failure()?.errorText}`));
    page.on('response', (r) => { if (r.status() >= 500) failed.push(`${r.status()} ${r.url().slice(0, 120)}`); });

    let mounted = 0, text = '', aria = '';
    try {
      await page.goto(base + route, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(600); // let the router settle / redirect
      mounted = await page.evaluate(() => (document.getElementById('root')?.innerHTML || '').length);
      text = (await page.evaluate(() => document.body.innerText || '')).trim();
      if (SHOW_ARIA) aria = await page.evaluate(() =>
        [...document.querySelectorAll('[role],button,a,input,h1,h2')]
          .map((el) => `${el.tagName.toLowerCase()}${el.getAttribute('role') ? `[${el.getAttribute('role')}]` : ''} "${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 60)}"`)
          .slice(0, 25).join('\n      '));
    } catch (e) {
      errors.push(`navigation failed: ${e.message.split('\n')[0]}`);
    }
    await page.close();
    results.push({ route, mounted, textLen: text.length, errors, failed, aria, sample: text.slice(0, 70).replace(/\s+/g, ' ') });
  }
} finally {
  await browser.close();
  if (!KEEP) { server.close(); rmSync(OUT, { recursive: true, force: true }); }
}

// ── 4. verdict
console.log('');
let bad = 0;
for (const r of results) {
  // A route that mounts nothing is the blank-page failure. Text can legitimately be short
  // (a spinner), so the binding assertion is that the React root has real content.
  const problems = [];
  if (r.mounted < 50) problems.push(`root is empty (${r.mounted} chars) — blank screen`);
  if (r.errors.length) problems.push(`${r.errors.length} console error(s)`);
  if (r.failed.length) problems.push(`${r.failed.length} failed request(s)`);
  if (problems.length) {
    bad++;
    console.log(`  [FAIL] ${r.route.padEnd(14)} ${problems.join('; ')}`);
    for (const e of r.errors.slice(0, 3)) console.log(`           ! ${e}`);
    for (const f of r.failed.slice(0, 3)) console.log(`           ! ${f}`);
  } else {
    console.log(`  [ok]   ${r.route.padEnd(14)} mounted ${r.mounted} chars — "${r.sample}"`);
  }
  if (SHOW_ARIA && r.aria) console.log(`      ${r.aria}`);
}

console.log(`\n  ${results.length} route(s) walked. NOT covered: signed-in screens (needs a seeded session).`);
if (KEEP) console.log(`  server still up at ${base} — ctrl-c to stop.\n`);
if (bad) { console.error(`  runtime-check: ${bad} route(s) broken.\n`); process.exit(1); }
console.log('  runtime-check: every route renders, no console errors, no failed requests.\n');
process.exit(0);
