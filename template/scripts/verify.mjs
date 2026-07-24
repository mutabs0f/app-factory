#!/usr/bin/env node
// verify.mjs — THE deterministic gate for every build/edit turn.
// Runs all checks, reports each independently, and exits 0 ONLY when every one
// is green. A claim of "done" is a hint; THIS script's exit code is the verdict.
//
// Checks: 1 typecheck · 2 lint · 3 tests · 4 iOS bundle · 5 secret scan ·
//         6 decisions resolved · 7 env complete · 8 db reset + RLS + definer + grants ·
//         9 generated-types freshness
//
// The DB checks run in one of TWO modes (scripts/lib/dbclient.mjs):
//   local — the Docker stack (`supabase start`), replayed with `supabase db reset`
//   cloud — a DEV project via the Supabase Management API; needs only
//           $SUPABASE_ACCESS_TOKEN and a ref in .dev-branch. NO DOCKER REQUIRED.
// Auto-selects local when Docker is up, else cloud. Force with --db=local|cloud.
// If NEITHER is available the DB checks fail honestly — they are never skipped green.
import { execSync } from 'node:child_process';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { genTypesCmd, modeHint, openDb, pickMode, resetDb } from './lib/dbclient.mjs';

const TEMPLATE = process.cwd();
const DB_URL =
  process.env.SUPABASE_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

// Per-machine secret (OUTSIDE the repo) that HMAC-signs the .verify-pass marker, so
// the marker can't be forged by an agent re-running the public git-plumbing hash.
// verify.mjs creates it on first green run; the push guard only reads it. It lives in
// the user's home dir, not the tree, so it is not committed and not in stateHash().
const SECRET_FILE = join(homedir(), '.app-factory-gate-secret');
function gateSecret() {
  try {
    if (existsSync(SECRET_FILE)) {
      const s = readFileSync(SECRET_FILE, 'utf8').trim();
      if (s) return s;
    }
  } catch {
    /* fall through to (re)create */
  }
  const s = randomBytes(32).toString('hex');
  try {
    writeFileSync(SECRET_FILE, s, { mode: 0o600 });
  } catch {
    /* best effort — a missing secret makes the guard fail CLOSED, which is safe */
  }
  return s;
}

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
  const q = { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] };
  try {
    // Discover the repo root + real .git dir (works even when run from a subdir),
    // then hash the full working-tree CONTENT (not just `git status` paths): a
    // throwaway index + write-tree is content-addressed, so editing an ALREADY-dirty
    // file changes it too. .gitignored paths (incl. .verify-pass, .env, node_modules)
    // are excluded automatically; the real index is untouched. Identical in guard-bash.mjs.
    const root = execSync('git rev-parse --show-toplevel', q).trim();
    const gitDir = execSync('git rev-parse --absolute-git-dir', q).trim();
    const head = execSync('git rev-parse HEAD', q).trim();
    const tmpIndex = join(gitDir, `verify-index-${process.pid}`);
    const idxOpt = { cwd: root, ...q, env: { ...process.env, GIT_INDEX_FILE: tmpIndex } };
    try {
      execSync('git add -A', idxOpt);
      const tree = execSync('git write-tree', idxOpt).trim();
      return createHash('sha256').update(`${head}\n${tree}`).digest('hex');
    } finally {
      try {
        rmSync(tmpIndex, { force: true });
      } catch {
        /* ignore */
      }
    }
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

function countMigrationFiles() {
  try {
    return readdirSync(join(TEMPLATE, 'supabase', 'migrations')).filter((f) => f.endsWith('.sql'))
      .length;
  } catch {
    return 0;
  }
}

// Anti-malaki mechanical check: every decision in docs/DECISIONS.md must be resolved to
// ONE choice. An empty Choice cell or a Choice still holding an "OR" is exactly the
// ambiguity that let malaki's client and server pick different halves — so fail the gate
// on it instead of trusting prose. Only the Choice column is inspected (not the rationale).
function checkDecisionsResolved() {
  let text;
  try {
    text = readFileSync(join(TEMPLATE, 'docs', 'DECISIONS.md'), 'utf8');
  } catch {
    record('decisions resolved', false, 'docs/DECISIONS.md not found');
    return;
  }
  const problems = [];
  let dataRows = 0;
  for (const line of text.split('\n')) {
    if (!line.trim().startsWith('|')) continue;
    const cells = line.split('|').map((c) => c.trim());
    const decision = cells[1] ?? '';
    const choice = cells[2] ?? '';
    if (!decision || /^:?-+:?$/.test(decision) || decision.toLowerCase() === 'decision') continue; // header / --- / :--- separator
    dataRows++;
    if (!choice) problems.push(`"${decision}": Choice is empty`);
    // Any "X or Y" reads as unresolved — no exemption. A deliberate "support both" must be
    // written WITHOUT "or" (use "+"/"and": "Apple + Google"). An earlier whole-cell exemption
    // for +/and/both let "X or Y ... and revisit later" slip through — a real split-brain hole.
    else if (/\s+or\s+/i.test(choice) || /\bOR\b/.test(choice))
      problems.push(`"${decision}": unresolved OR in Choice ("${choice}") — write "support both" as "X + Y"`);
  }
  if (dataRows === 0) problems.push('no decision rows found — the DECISIONS.md table is empty');
  record(
    'decisions resolved',
    problems.length === 0,
    problems.length ? problems.join('; ') : `${dataRows} decision(s), each resolved to one choice`,
  );
}

// The gate must check the artifact the user actually RECEIVES. An app whose DECISIONS.md
// resolves Delivery to PWA ships a WEB bundle — exporting only iOS would leave its real
// deliverable ungated (a green that proves nothing about what lands on his phone).
function deliveryTargets() {
  const targets = ['ios'];
  let text = '';
  try {
    text = readFileSync(join(TEMPLATE, 'docs', 'DECISIONS.md'), 'utf8');
  } catch {
    return targets;
  }
  for (const line of text.split('\n')) {
    if (!line.trim().startsWith('|')) continue;
    const cells = line.split('|').map((c) => c.trim());
    if (!/^delivery\b/i.test(cells[1] ?? '')) continue;
    if (/\bPWA\b|home[- ]screen|web export/i.test(cells[2] ?? '')) targets.push('web');
  }
  return targets;
}

// Ride out the container-restart race: `supabase db reset` can return while the DB
// container is still restarting, so the schema query can transiently see 0 tables
// (which used to flash a false "no public tables" green). Poll until a public table
// exists; the vacuous-green guard below then FAILs if migrations exist but nothing did.
async function waitForSchema(client, expectTables) {
  if (!expectTables) return;
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    try {
      const { rows } = await client.query(
        `select count(*)::int as n from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relkind = 'r'`,
      );
      if (rows[0].n > 0) return;
    } catch {
      /* schema not ready yet */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
}

// 1 — typecheck
{ const r = tryRun('npx tsc --noEmit'); record('typecheck (tsc)', r.ok, r.ok ? '' : tail(r.out)); }
// 2 — lint
{ const r = tryRun('npx eslint .'); record('lint (eslint)', r.ok, r.ok ? '' : tail(r.out)); }
// 3 — tests
{ const r = tryRun('npx jest --ci --forceExit'); record('tests (jest)', r.ok, r.ok ? '' : tail(r.out)); }
// 4 — the delivery bundle(s) actually build. Always iOS; ALSO web when this app's
// DECISIONS.md resolves Delivery to PWA (that web bundle IS the deliverable).
for (const platform of deliveryTargets()) {
  const r = tryRun(`npx expo export --platform ${platform}`);
  record(`${platform === 'ios' ? 'iOS' : 'web'} bundle (expo export)`, r.ok, r.ok ? '' : tail(r.out));
}
// 5 — no secrets anywhere (before DB checks, so it can never be skipped by an earlier failure)
{ const r = tryRun('node scripts/secret-scan.mjs'); record('secret scan', r.ok, r.ok ? '' : tail(r.out)); }
// 6 — every OR-decision resolved to one choice (anti-malaki; docs-only, so it always runs)
checkDecisionsResolved();
// 7 — required API keys present (PRESENCE only, never values; per config/integrations.json).
// Red on a fresh app until `/new-app` runs collect-keys.mjs; green once .env is filled.
{ const r = tryRun('node scripts/collect-keys.mjs --check'); record('env complete', r.ok, r.ok ? '' : tail(r.out, 3)); }

// 8 — full migration replay + RLS coverage, in whichever DB mode is available.
const DB_MODE = pickMode(TEMPLATE, process.argv);
const reset = DB_MODE
  ? await resetDb(DB_MODE, { root: TEMPLATE, dbUrl: DB_URL, run: tryRun })
  : {
      ok: false,
      out:
        `no database available for the gate — ${modeHint(TEMPLATE)}.\n` +
        `Fix ONE of them:\n` +
        `  • start Docker Desktop, then \`supabase start\`  (local mode), or\n` +
        `  • set $SUPABASE_ACCESS_TOKEN and put a dev project ref in .dev-branch  (cloud mode).\n` +
        `The DB checks are NOT skipped — a missing database is a failure.`,
    };
record(
  `db reset (migration replay${DB_MODE ? `, ${DB_MODE}` : ''})`,
  reset.ok,
  reset.ok ? tail(reset.out, 3) : tail(reset.out),
);

if (reset.ok) {
  const migCount = countMigrationFiles();
  const client = await openDb(DB_MODE, { root: TEMPLATE, dbUrl: DB_URL });
  try {
    await waitForSchema(client, migCount > 0); // guard the container-restart race
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
    if (rows.length === 0) {
      // Vacuous-green guard: migrations exist but nothing materialized → the reset
      // did not apply the schema (race or failure), NOT a legitimately empty DB.
      if (migCount > 0)
        record(
          'RLS coverage',
          false,
          `${migCount} migration(s) present but 0 public tables — db reset did not materialize the schema`,
        );
      else record('RLS coverage', true, 'no migrations, no public tables');
    }
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

    // No public SECURITY DEFINER function may be API-callable by anon/authenticated:
    // PostgREST exposes public functions as RPC, so a SECURITY DEFINER one is a
    // privilege-escalation surface (this is a get_advisors security finding — we
    // catch it locally, in-loop, too).
    const { rows: definer } = await client.query(`
      select p.proname
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosecdef = true
        and (has_function_privilege('anon', p.oid, 'EXECUTE')
             or has_function_privilege('authenticated', p.oid, 'EXECUTE'));`);
    if (definer.length)
      record(
        'definer fn exposure',
        false,
        'public SECURITY DEFINER function(s) API-callable: ' +
          definer.map((d) => d.proname).join(', ') +
          ' — revoke execute from anon, authenticated',
      );
    else record('definer fn exposure', true, 'no exposed SECURITY DEFINER functions');

    // Table GRANTs must match policy operations. Under Supabase's always-revoked
    // exposure default, RLS + policies alone do NOT let the app reach the table —
    // the authenticated role needs matching GRANTs or every query gets
    // "permission denied". (RLS-with-policies is NOT proof the app can read it.)
    const { rows: grantGaps } = await client.query(`
      with pol as (
        select pp.tablename,
               case when pp.cmd = 'ALL'
                    then array['SELECT','INSERT','UPDATE','DELETE']
                    else array[pp.cmd] end as ops
        from pg_policies pp
        where pp.schemaname = 'public'
      ),
      expanded as (select tablename, unnest(ops) as op from pol)
      select distinct e.tablename, e.op
      from expanded e
      where not has_table_privilege('authenticated', ('public.' || quote_ident(e.tablename))::regclass, e.op);`);
    if (grantGaps.length)
      record(
        'table grants',
        false,
        'authenticated lacks GRANT for policy op(s): ' +
          grantGaps.map((g) => `${g.tablename}.${g.op}`).join(', ') + ' — add matching GRANTs',
      );
    else record('table grants', true, 'grants match policy operations');
  } catch (e) {
    // Fail EVERY db-dependent check, not just the first — a check that silently
    // vanishes from the report reads as "not a problem" instead of "never ran".
    record('RLS coverage', false, `DB query failed: ${e.message}`);
    record('definer fn exposure', false, 'not run — DB query failed');
    record('table grants', false, 'not run — DB query failed');
  } finally {
    await client.end();
  }

  // 9 — generated types match the schema (no drift)
  const gen = tryRun(genTypesCmd(DB_MODE, { root: TEMPLATE, dbUrl: DB_URL }));
  if (!gen.ok) {
    record('types freshness', false, `gen types failed: ${tail(gen.out)}`);
  } else {
    let committed = null;
    try {
      committed = readFileSync(join(TEMPLATE, 'src/types/database.types.ts'), 'utf8');
    } catch {
      committed = null;
    }
    // `supabase gen types` emits an __InternalSupabase block (just the PostgREST version)
    // when generating from a CLOUD project, and omits it locally. Same schema, different
    // bytes — so without this the types would read "stale" forever after a mode switch.
    // Strip ONLY that block and its explanatory comment; everything else is compared byte
    // for byte. Do not grow this list — it is the one place a real diff could be hidden.
    const stripToolMeta = (s) => {
      const out = [];
      const lines = s.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (/^\s*\/\/ (Allows to automatically instantiate|instead of createClient<)/.test(lines[i])) continue;
        if (/^\s*__InternalSupabase:\s*\{/.test(lines[i])) {
          let depth = 0;
          do {
            depth += (lines[i].match(/\{/g) || []).length - (lines[i].match(/\}/g) || []).length;
            i++;
          } while (i < lines.length && depth > 0);
          i--; // the for-loop's i++ consumes the closing line
          continue;
        }
        out.push(lines[i]);
      }
      return out.join('\n');
    };
    const norm = (s) => stripToolMeta(s.replace(/\r\n/g, '\n')).replace(/\n{2,}/g, '\n').trimEnd();
    if (committed === null)
      record('types freshness', false, 'src/types/database.types.ts missing — regenerate it');
    else if (norm(gen.out) === norm(committed)) record('types freshness', true, 'types match schema');
    else record('types freshness', false, 'src/types/database.types.ts is stale — regenerate it');
  }
} else {
  // Every DB-dependent check is reported as FAILED (never omitted, never green).
  record('RLS coverage', false, 'not run — migration replay failed');
  record('definer fn exposure', false, 'not run — migration replay failed');
  record('table grants', false, 'not run — migration replay failed');
  record('types freshness', false, 'not run — migration replay failed');
}

// Report
let allOk = true;
const bar = '  ' + '-'.repeat(58);
// Name the app being verified, not the template it came from — running this in an app
// and seeing someone else's project name is exactly the kind of small lie that erodes trust.
let APP_NAME = 'app';
try {
  APP_NAME = JSON.parse(readFileSync(join(TEMPLATE, 'package.json'), 'utf8')).name || APP_NAME;
} catch {
  /* fall back to the generic label */
}
console.log(`\n  verify — ${APP_NAME}${DB_MODE ? `  [db: ${DB_MODE}]` : '  [db: UNAVAILABLE]'}`);
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
    const ts = Date.now();
    const hash = stateHash();
    const mac = createHmac('sha256', gateSecret()).update(`${ts}:${hash}`).digest('hex');
    writeFileSync(join(TEMPLATE, '.verify-pass'), `${ts}:${hash}:${mac}`);
  } catch {
    /* marker is best-effort */
  }
}
process.exit(allOk ? 0 : 1);
