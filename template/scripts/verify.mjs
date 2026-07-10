#!/usr/bin/env node
// verify.mjs — THE deterministic gate for every build/edit turn.
// Runs all seven checks, reports each independently, and exits 0 ONLY when every
// one is green. A claim of "done" is a hint; THIS script's exit code is the verdict.
//
// Checks: 1 typecheck · 2 lint · 3 tests · 4 iOS bundle · 5 db reset + RLS coverage
//         6 secret scan · 7 generated-types freshness
//
// Assumes the local Supabase stack is running (`supabase start`). If Docker/local
// Supabase is unavailable, checks 5 & 7 fail honestly (they are never skipped green).
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';

const TEMPLATE = process.cwd();
const DB_URL =
  process.env.SUPABASE_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

// Docker/Supabase may have been installed after this shell started; pull the live
// PATH from the registry so their binaries resolve (Windows factory host).
function refreshWindowsPath() {
  if (process.platform !== 'win32') return;
  try {
    const live = execSync(
      `powershell -NoProfile -Command "[Environment]::ExpandEnvironmentVariables(([Environment]::GetEnvironmentVariable('Path','Machine')) + ';' + ([Environment]::GetEnvironmentVariable('Path','User')))"`,
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true },
    ).trim();
    if (live) process.env.PATH = live + ';' + (process.env.PATH || '');
  } catch {
    /* keep inherited PATH */
  }
}
refreshWindowsPath();

const results = [];
const record = (name, ok, detail = '') => results.push({ name, ok, detail });
const tail = (s, n = 25) => (s || '').split('\n').slice(-n).join('\n');

function tryRun(cmd) {
  try {
    return { ok: true, out: execSync(cmd, { cwd: TEMPLATE, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) };
  } catch (e) {
    return { ok: false, out: (((e.stdout || '') + (e.stderr || '')).trim()) || e.message };
  }
}

// 1 — typecheck
{ const r = tryRun('npx tsc --noEmit'); record('typecheck (tsc)', r.ok, r.ok ? '' : tail(r.out)); }
// 2 — lint
{ const r = tryRun('npx eslint .'); record('lint (eslint)', r.ok, r.ok ? '' : tail(r.out)); }
// 3 — tests
{ const r = tryRun('npx jest --ci --forceExit'); record('tests (jest)', r.ok, r.ok ? '' : tail(r.out)); }
// 4 — iOS bundle actually builds
{ const r = tryRun('npx expo export --platform ios'); record('iOS bundle (expo export)', r.ok, r.ok ? '' : tail(r.out)); }

// 5 — full migration replay + RLS coverage
const reset = tryRun('supabase db reset');
record('db reset (migration replay)', reset.ok, reset.ok ? '' : tail(reset.out));

if (reset.ok) {
  const client = new pg.Client({ connectionString: DB_URL });
  try {
    await client.connect();
    const { rows } = await client.query(`
      select c.relname as table_name,
             c.relrowsecurity as rls_enabled,
             (select count(*) from pg_policy p where p.polrelid = c.oid) as policy_count
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
      order by c.relname;`);
    const bad = rows.filter((r) => !r.rls_enabled || Number(r.policy_count) === 0);
    if (rows.length === 0) record('RLS coverage', true, 'no public tables');
    else if (bad.length)
      record('RLS coverage', false,
        'tables missing RLS/policies: ' +
          bad.map((b) => `${b.table_name}(rls=${b.rls_enabled}, policies=${b.policy_count})`).join(', '));
    else record('RLS coverage', true, `${rows.length} table(s), all with RLS + ≥1 policy`);
  } catch (e) {
    record('RLS coverage', false, `DB query failed: ${e.message}`);
  } finally {
    await client.end().catch(() => {});
  }

  // 7 — generated types match the schema (no drift)
  const gen = tryRun(`supabase gen types typescript --db-url "${DB_URL}"`);
  if (!gen.ok) {
    record('types freshness', false, `gen types failed: ${tail(gen.out)}`);
  } else {
    const norm = (s) => s.replace(/\r\n/g, '\n').trimEnd();
    const committed = readFileSync(join(TEMPLATE, 'src/types/database.types.ts'), 'utf8');
    if (norm(gen.out) === norm(committed)) record('types freshness', true, 'types match schema');
    else record('types freshness', false, 'src/types/database.types.ts is stale — regenerate it');
  }
} else {
  record('RLS coverage', false, 'skipped — db reset failed (is `supabase start` running?)');
  record('types freshness', false, 'skipped — db reset failed');
}

// 6 — no secrets anywhere in the repo
{ const r = tryRun('node scripts/secret-scan.mjs'); record('secret scan', r.ok, r.ok ? '' : tail(r.out)); }

// Report
let allOk = true;
const bar = '  ' + '-'.repeat(58);
console.log('\n  verify — app-factory template');
console.log(bar);
for (const r of results) {
  if (!r.ok) allOk = false;
  console.log(`  [${r.ok ? 'PASS' : 'FAIL'}] ${r.name}${r.ok && r.detail ? '  — ' + r.detail : ''}`);
  if (!r.ok && r.detail) for (const l of r.detail.split('\n')) console.log('         ' + l);
}
console.log(bar);
console.log(
  allOk
    ? '  ALL CHECKS GREEN.\n'
    : '  RED — fix the failures above. "done" is not a verdict; this script is.\n',
);
// Drop a marker the PreToolUse guard reads to allow verified remote pushes.
if (allOk) {
  try {
    writeFileSync(join(TEMPLATE, '.verify-pass'), String(Date.now()));
  } catch {
    /* marker is best-effort */
  }
}
process.exit(allOk ? 0 : 1);
