#!/usr/bin/env node
// design-import.mjs — validate a Claude Design export and reconcile it against the SPEC.
//
// Detects design/input/*.zip → extracts → checks the bundle (tokens + >=1 screen, manifest
// optional) → compares the screens in the design against SPEC's screen list. Any SPEC screen
// with NO matching design file is reported as a GAP for Basim to decide (re-design or scaffold
// plainly) — never silently invented. Records the zip filename+hash in docs/REVIEW-LOG.md.
//
// Exit: 0 all covered · 1 gaps (ask Basim) · 2 malformed OR unsafe bundle (bad format /
//       path-traversal / symlink) · 3 no zip found · 4 SPEC precondition (missing/empty screens).
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

const ROOT = process.cwd();
const INPUT = join(ROOT, 'design', 'input');
const EXTRACT = join(INPUT, '_extracted');
const SPEC = join(ROOT, 'docs', 'SPEC.md');
const REVIEW_LOG = join(ROOT, 'docs', 'REVIEW-LOG.md');

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'screen';

// Same parser as design-brief.mjs (kept local so the two scripts don't couple).
function parseScreens(md) {
  const lines = md.split('\n');
  const start = lines.findIndex((l) => /^##\s+Screens/i.test(l));
  if (start < 0) return [];
  const screens = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) break;
    const m = lines[i].match(/^[-*]\s+(.+?)\s*$/); // column-0 bullets only — sub-bullets are not screens
    if (!m) continue;
    const name = m[1].split(/\s+[—:–-]\s+/)[0].trim();
    if (!name || name === '—') continue;
    screens.push({ name, slug: slugify(name) });
  }
  return screens;
}

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

function extractZip(zip, dest) {
  if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  const attempts = [['tar', ['-xf', zip, '-C', dest]]]; // bsdtar handles zip on Win10+/macOS
  if (process.platform === 'win32')
    attempts.push(['powershell', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath "${zip}" -DestinationPath "${dest}" -Force`]]);
  else attempts.push(['unzip', ['-o', zip, '-d', dest]]);
  for (const [cmd, args] of attempts) {
    try {
      execFileSync(cmd, args, { stdio: 'ignore' });
      if (walk(dest).length) return true;
    } catch {
      /* try next extractor */
    }
  }
  return false;
}

function recordInReviewLog(zipName, hash, matched, total, gaps) {
  if (!existsSync(REVIEW_LOG)) return;
  let md = readFileSync(REVIEW_LOG, 'utf8');
  const date = new Date().toISOString().slice(0, 10);
  const row = `| ${zipName} | ${hash.slice(0, 12)} | ${matched}/${total} | ${gaps.length ? gaps.join(', ') : 'none'} | ${date} |`;
  if (!/^##\s+Design source/m.test(md)) {
    md = md.replace(/\n?$/, '') + `\n\n## Design source (which design zip a build implemented)\n| Zip | sha256 (12) | Screens matched | Gaps | Date |\n|---|---|---|---|---|\n${row}\n`;
  } else {
    md = md.replace(/(^##\s+Design source[\s\S]*?\|---\|---\|---\|---\|---\|\n)/m, `$1${row}\n`);
  }
  writeFileSync(REVIEW_LOG, md);
}

// ---- run ----
if (!existsSync(SPEC)) {
  console.error('docs/SPEC.md not found — run /new-app first (SPEC precondition, exit 4).');
  process.exit(4);
}
const specScreens = parseScreens(readFileSync(SPEC, 'utf8'));
if (specScreens.length === 0) {
  // Fail CLOSED: with no screen list there is nothing to reconcile against, so we must NOT
  // proceed (that would let any design through unchecked). Distinct exit 4 = SPEC precondition.
  console.error('Could not read a screen list from docs/SPEC.md "## Screens" — cannot reconcile.');
  console.error('Fill the screen list (run /new-app) and retry (exit 4).');
  process.exit(4);
}
// Distinct SPEC screens must not collapse to the same slug, or one design file would "cover"
// two of them — the same silent-drop class the exact-match fix targets, re-entering via collision.
const dupSlug = specScreens.map((s) => s.slug).find((s, i, a) => a.indexOf(s) !== i);
if (dupSlug) {
  console.error(`Two SPEC screens map to the same slug "${dupSlug}" — rename one so each screen is distinct (exit 4).`);
  process.exit(4);
}

const argZip = process.argv[2];
let zip = argZip;
if (!zip) {
  const zips = existsSync(INPUT)
    ? readdirSync(INPUT).filter((f) => f.toLowerCase().endsWith('.zip')).map((f) => join(INPUT, f))
    : [];
  if (zips.length === 0) {
    console.error('No design zip found in design/input/.');
    console.error('Paste the DESIGN-BRIEF into Claude Design, export the ZIP, and drop it in design/input/.');
    process.exit(3);
  }
  zip = zips.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0]; // newest
  if (zips.length > 1) console.log(`(${zips.length} zips present — using the newest: ${basename(zip)})`);
}
if (!existsSync(zip)) {
  console.error(`Zip not found: ${zip}`);
  process.exit(3);
}

const hash = createHash('sha256').update(readFileSync(zip)).digest('hex');
console.log(`Design zip: ${basename(zip)}  (sha256 ${hash.slice(0, 12)})`);

// Zip-slip guard: list entries first (bsdtar reads zip) and refuse absolute / traversal
// paths BEFORE extracting — the fallback extractors don't all protect against this.
try {
  // Run from the zip's dir with just the basename — a Windows absolute path (C:\…) makes
  // bsdtar treat "C:" as a remote host ("cannot connect to C:"), silently skipping the guard.
  const entries = execFileSync('tar', ['-tf', basename(zip)], { cwd: dirname(zip), encoding: 'utf8' })
    .split(/\r?\n/)
    .filter(Boolean);
  const unsafe = entries.find(
    (e) => e.startsWith('/') || e.startsWith('\\') || /^[a-zA-Z]:/.test(e) || /(^|[\\/])\.\.(?=[\\/]|$)/.test(e),
  );
  if (unsafe) {
    console.error(`Refusing unsafe path in zip (traversal/absolute): ${unsafe}`);
    process.exit(2);
  }
} catch {
  /* tar couldn't list (rare / not installed) — the post-extraction symlink check still applies */
}

if (!extractZip(zip, EXTRACT)) {
  console.error('Could not extract the zip (need tar/Expand-Archive/unzip). Re-export and retry.');
  process.exit(2);
}

const files = walk(EXTRACT);
for (const p of files) {
  if (lstatSync(p).isSymbolicLink()) {
    console.error(`Refusing symlink in design bundle: ${p}`);
    process.exit(2);
  }
}
const jsx = files.filter((f) => /\.jsx?$/.test(f));
const tokens = jsx.find((f) => /(^|[\\/])tokens\.jsx?$/.test(f));
const screenFiles = jsx.filter((f) => f !== tokens);
const manifest = files.find((f) => /(^|[\\/])manifest\.md$/i.test(f));

console.log(`\nBundle: ${screenFiles.length} screen file(s), tokens=${tokens ? 'yes' : 'NO'}, manifest=${manifest ? 'yes' : 'no (optional)'}`);

const problems = [];
if (!tokens) problems.push('missing tokens.jsx (the design system / colors)');
if (screenFiles.length === 0) problems.push('no screen .jsx files found');
if (problems.length) {
  console.error('\nMalformed design bundle:');
  for (const p of problems) console.error('  - ' + p);
  console.error('Re-export from Claude Design following the DESIGN-BRIEF output-format block.');
  process.exit(2);
}

// Reconcile: every SPEC screen must have a matching design file (by slug).
const designSlugs = screenFiles.map((f) => slugify(basename(f).replace(/\.jsx?$/, '')));
const designSet = new Set(designSlugs);
const specSet = new Set(specScreens.map((s) => s.slug));
// EXACT slug match only. Substring matching silently let one design file "cover" a distinct
// SPEC screen (e.g. add-habit covering "add") — which defeats the whole gap gate.
const matchOf = (spec) => designSet.has(spec.slug);
const covered = specScreens.filter(matchOf);
const gaps = specScreens.filter((s) => !matchOf(s));
const extras = designSlugs.filter((d) => !specSet.has(d));

console.log(`\nReconciled against SPEC (${specScreens.length} screen(s)):`);
for (const s of specScreens) console.log(`  ${matchOf(s) ? '✓' : '✗ MISSING'}  ${s.name}  (${s.slug})`);
if (extras.length) console.log(`  design files with no SPEC screen: ${extras.join(', ')}`);

recordInReviewLog(basename(zip), hash, covered.length, specScreens.length, gaps.map((g) => g.slug));

if (gaps.length) {
  console.error(`\n⚠ GAP: ${gaps.length} SPEC screen(s) have NO design and were NOT invented:`);
  for (const g of gaps) console.error(`   - ${g.name}`);
  console.error('\nAsk Basim to decide per missing screen: re-design it in Claude Design, or let the');
  console.error('system scaffold it plainly. Do NOT proceed to translate until he decides.');
  process.exit(1);
}
console.log('\n✓ Every SPEC screen has a matching design file. Proceed to faithful translation.');
process.exit(0);
