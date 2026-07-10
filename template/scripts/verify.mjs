#!/usr/bin/env node
// verify.mjs — THE deterministic gate for every build/edit turn.
// Runs all checks, reports each independently, and exits 0 ONLY when every one
// is green. A claim of "done" is a hint; THIS script's exit code is the verdict.
//
// Checks: 1 typecheck · 2 lint · 3 tests · 4 iOS bundle · 5 secret scan
//         6 db reset + RLS coverage · 7 generated-types freshness
//
// Assumes the local Supabase stack is running (`supabase start`). If Docker/local
// Supabase is unavailable, checks 6 & 7 fail honestly (never skipped green).
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
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

// A hash of git state, so the push guard can tell whether the working tree changed
// since verify last passed (the .verify-pass marker embeds it).
function stateHash() {
  const opt = { cwd: TEMPLATE, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] };
  try {
    const head = execSync('git rev-parse HEAD', opt).trim();
    const dirty = execSync('git status --porcelain', opt);
    return createHash('sha256').update(`${head}\n${dirty}`).digest('hex');
  } catch {
    return 'nogit';
  }
}

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
// 5 — no secrets anywhere (before DB checks, so it can never be skipped by an earlier failure)
{ const r = tryRun('node scripts/secret-scan.mjs'); record('secret scan', r.ok, r.ok ? '' : tail(r.out)); }

// 6 — full migration replay + RLS coverage
const reset = tryRun('supabase db reset');
record('db reset (migration replay)', reset.ok, reset.ok ? '' : tail(reset.out));

if (reset.ok) {
  const client = new pg.Client({ connectionString: DB_URL });
  try {
    await client.connect();
    // Base tables only; view/matview RLS-bypass is covered by get_advisors (CLAUDE.md).
    // permissive_count flags `using(true)`/`with check(true)` — RLS present but wide open.
    const { rows } = await client.query(`
      select c.relname as table_name,
             c.relrowsecurity as rls_enabled,
             (select count(*) from pg_policy p where p.polrelid = c.oid) as policy_count,
             (select count(*) from pg_policies pp
                where pp.schemaname = 'public' and pp.tablename = c.relname
                  and (pp.qual = 'true' or pp.with_check = 'true')) as permissive_count
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
      order by c.relname;`);
    const bad = rows.filter(
      (r) => !r.rls_enabled || Number(r.policy_count) === 0 || Number(r.permissive_count) > 0,
    );
    if (rows.length === 0) record('RLS coverage', true, 'no public tables');
    else if (bad.length)
      record(
        'RLS coverage',
        false,
        'insecure tables: ' +
          bad
            .map((b) =>
              Number(b.permissive_count) > 0
                ? `${b.table_name} (has using(true)/with check(true) policy)`
                : `${b.table_name} (rls=${b.rls_enabled}, policies=${b.policy_count})`,
            )
            .join(', '),
      );
    else record('RLS coverage', true, `${rows.length} table(s), all RLS + ≥1 non-permissive policy`);
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
    let committed = null;
    try {
      committed = readFileSync(join(TEMPLATE, 'src/types/database.types.ts'), 'utf8');
    } catch {
      committed = null;
    }
    const norm = (s) => s.replace(/\r\n/g, '\n').trimEnd();
    if (committed === null)
      record('types freshness', false, 'src/types/database.types.ts missing — regenerate it');
    else if (norm(gen.out) === norm(committed)) record('types freshness', true, 'types match schema');
    else record('types freshness', false, 'src/types/database.types.ts is stale — regenerate it');
  }
} else {
  record('RLS coverage', false, 'skipped — db reset failed (is `supabase start` running?)');
  record('types freshness', false, 'skipped — db reset failed');
}

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

// Marker for the PreToolUse push guard: timestamp + a hash of the verified git
// state, so a later working-tree change invalidates the "verified" pass.
if (allOk) {
  try {
    writeFileSync(join(TEMPLATE, '.verify-pass'), `${Date.now()}:${stateHash()}`);
  } catch {
    /* marker is best-effort */
  }
}
process.exit(allOk ? 0 : 1);
