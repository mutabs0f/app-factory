#!/usr/bin/env node
// verify.mjs — THE deterministic gate for every build/edit turn.
// Runs all checks, reports each independently, and exits 0 ONLY when every one
// is green. A claim of "done" is a hint; THIS script's exit code is the verdict.
//
// 21 checks (22 when DECISIONS resolves Delivery to PWA — the web bundle is checked too).
// Code:     typecheck · lint · jest · architecture (boundaries + cycles) · delivery bundle(s)
//           build · the app actually RUNS in a browser · secret scan of source · secret scan
//           of the shipped bundle · dependency audit (CRITICAL only, see note below) ·
//           DECISIONS has no unresolved "X or Y" · required API keys present.
// Database: migration replay from zero · RLS coverage · SECURITY DEFINER exposure · table
//           GRANTs vs policy ops · anon-role reachability · no user-editable claims in
//           policies · storage buckets private · RLS cross-user isolation (static + runtime
//           impersonation probe) · generated-types drift.
// Keep this list in sync with CLAUDE.md and build/SKILL.md — it has drifted before.
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
// 3a — the GATE'S OWN tests. ~2,600 lines of control scripts decide whether every app may
// ship, and they had no test at all: three missing-import bugs shipped in one day. This runs
// first among the cheap checks, because a broken oracle makes every result below meaningless.
{ const r = tryRun('node scripts/scripts.test.mjs'); record('gate self-test', r.ok, r.ok ? tail(r.out, 1) : tail(r.out, 12)); }
// 3b — architecture. CLAUDE.md calls its structural rules "mechanical"; until this check
// existed they were prose, and eslint ignores scripts/ entirely — so an agent could
// violate every one of them and still get a green gate. Enforces the supabase boundary,
// feature encapsulation, thin routes, no barrels, and no import cycles.
{ const r = tryRun('node scripts/arch-check.mjs'); record('architecture (boundaries, cycles)', r.ok, r.ok ? tail(r.out, 1) : tail(r.out, 20)); }
// 4 — the delivery bundle(s) actually build. Always iOS; ALSO web when this app's
// DECISIONS.md resolves Delivery to PWA (that web bundle IS the deliverable).
// --clear is NOT optional here. Measured 2026-07-25: without it, `expo export` happily
// succeeds from a stale Metro cache and bakes in the env values from whenever that cache
// was built. A bundle built before .env was filled inlined `undefined` for
// EXPO_PUBLIC_SUPABASE_URL, so supabase.ts threw at import and the app rendered a BLANK
// PAGE — while this check reported PASS. The gate would bless a broken artifact, and the
// bundle secret-scan below would scan the wrong file. Correctness beats the extra seconds;
// the fast inner loop skips the export entirely rather than trusting a cache.
for (const platform of deliveryTargets()) {
  let r = tryRun(`npx expo export --platform ${platform} --clear`);
  // On Windows, dist/ is routinely held open by a preview server, an editor, or the
  // antivirus scanning the freshly-written bundle, and --clear then dies on EBUSY. That is
  // an environment problem, not a code defect — retry once, and if it persists say so in
  // words Basim can act on instead of dumping a Metro stack trace. A gate that reports a
  // file lock as a build failure is a gate that gets ignored.
  if (!r.ok && /EBUSY|resource busy or locked|being used by another process/i.test(r.out)) {
    await new Promise((s) => setTimeout(s, 3000));
    r = tryRun(`npx expo export --platform ${platform} --clear`);
    if (!r.ok && /EBUSY|resource busy or locked|being used by another process/i.test(r.out)) {
      record(
        `${platform === 'ios' ? 'iOS' : 'web'} bundle (expo export)`,
        false,
        'dist/ is locked by another program, so the bundle could not be rebuilt.\n' +
          '         Close any preview/dev server or editor tab using this folder and re-run.\n' +
          '         (This is a file lock, not a problem with your code.)',
      );
      continue;
    }
  }
  record(`${platform === 'ios' ? 'iOS' : 'web'} bundle (expo export)`, r.ok, r.ok ? '' : tail(r.out));
}
// 4b — RUNS THE APP AND LOOKS AT IT. Every other check proves the code compiles and the
// database is sound; only this one proves the thing actually renders. Measured: a build
// passed all 19 other checks while showing a blank white page. A missing browser is a
// FAILURE with a one-line fix, never a skip — see runtime-check.mjs.
{ const r = tryRun('node scripts/runtime-check.mjs'); record('app runs (every route renders)', r.ok, r.ok ? tail(r.out, 2) : tail(r.out, 14)); }
// 5 — no secrets anywhere (before DB checks, so it can never be skipped by an earlier failure)
{ const r = tryRun('node scripts/secret-scan.mjs'); record('secret scan (source)', r.ok, r.ok ? '' : tail(r.out)); }
// 5b — and no secrets in the BUILT bundle. Source being clean does not prove the shipped
// artifact is: a key can reach dist/ via app.config, a config plugin, or a dependency default.
// This is the file that actually goes to his phone / the browser.
{ const r = tryRun('node scripts/secret-scan.mjs --bundle'); record('secret scan (shipped bundle)', r.ok, r.ok ? '' : tail(r.out)); }
// 5c — known-vulnerable dependencies.
//
// Threshold is CRITICAL, deliberately, and the check is named for that so a PASS is not
// a lie. Reasoning, so nobody "helpfully" tightens it back: pinning Expo to SDK 54 is
// forced (it is the last Expo Go build on the App Store — the only way an app reaches
// the phone during development). SDK 54's own toolchain carries build-time advisories
// whose only remedy is a major Expo bump, which would break that path entirely. Those
// packages (postcss et al.) are build tooling and never reach the shipped bundle.
// Failing on them would leave the gate permanently red, and a permanently red gate
// trains everyone to ignore it — which hides the real finding when one arrives.
// So: FAIL on critical, and PRINT the high/moderate counts on every run so they are
// never invisible. Revisit when the SDK pin moves.
{
  const r = tryRun('npm audit --omit=dev --json');
  let counts = null;
  try {
    counts = JSON.parse(r.out).metadata?.vulnerabilities ?? null;
  } catch {
    counts = null;
  }
  if (!counts) record('dependency audit (prod, critical)', false, `npm audit did not return parseable JSON:\n${tail(r.out, 8)}`);
  else {
    const summary = `critical ${counts.critical}, high ${counts.high}, moderate ${counts.moderate} (production deps)`;
    record('dependency audit (prod, critical)', counts.critical === 0, counts.critical === 0 ? summary : `${summary} — fix the critical one(s): npm audit --omit=dev`);
  }
}
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

    // The ONE opt-out shared by the anon and isolation checks: a table genuinely meant to be
    // world-readable declares it in its own migration. This is a self-issued exemption, so it
    // is deliberately noisy — it lives in committed SQL where a human reviewing the diff sees
    // it, and every exempted table is named in the gate output below.
    const PUBLIC_MARK = '-- public-table: intentionally readable by everyone';
    const migrationText = (() => {
      try {
        const dir = join(TEMPLATE, 'supabase', 'migrations');
        return readdirSync(dir).filter((f) => f.endsWith('.sql'))
          .map((f) => readFileSync(join(dir, f), 'utf8')).join('\n');
      } catch { return ''; }
    })();
    const intentionallyPublic = new Set(
      migrationText.split('\n')
        .filter((l) => l.includes(PUBLIC_MARK))
        .map((l) => (l.match(/public-table:\s*intentionally readable by everyone\s*\((\w+)\)/) || [])[1])
        .filter(Boolean),
    );
    if (intentionallyPublic.size)
      console.log(`  note: table(s) declared world-readable by their migration: ${[...intentionallyPublic].join(', ')}`);

    // ANON REACHABILITY — the exact shape of the Lovable CVE-2025-48757 class of leak.
    // The publishable key ships in the client BY DESIGN, so `anon` is the attacker's role.
    // Above we check that `authenticated` HAS the grants its policies need; nothing checked
    // that `anon` does NOT have grants it shouldn't. RLS default-deny does most of the work,
    // but a stray GRANT ... TO anon plus any permissive policy is a public database.
    const { rows: anonGrants } = await client.query(`
      select c.relname as table_name, p.priv
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      cross join lateral (values ('SELECT'),('INSERT'),('UPDATE'),('DELETE')) as p(priv)
      where n.nspname = 'public' and c.relkind = 'r'
        and has_table_privilege('anon', c.oid, p.priv)
      order by 1,2;`);
    // The same explicit opt-out the isolation check uses — a table meant to be world-readable
    // must say so in its migration. (Earlier this message offered an escape hatch that was
    // not actually implemented, which would have made the check unfixable for a public table.)
    const anonLeaks = anonGrants.filter((g) => !intentionallyPublic.has(g.table_name));
    if (anonLeaks.length)
      record(
        'anon has no table grants',
        false,
        'the ANONYMOUS role can reach: ' +
          anonLeaks.map((g) => `${g.table_name}.${g.priv}`).join(', ') +
          ` — the publishable key ships inside the app, so this is public to anyone who downloads it.` +
          ` Revoke it, or if the table is genuinely meant to be world-readable add "${PUBLIC_MARK} (<table>)" to its migration.`,
      );
    else record('anon has no table grants', true, 'anonymous role cannot reach any app table');

    // A policy that reads user_metadata is user-editable privilege escalation: a user updates
    // their own JWT metadata and grants themselves whatever the policy checks for. This was
    // prose-only in db-guard/review, i.e. it depended on a subagent noticing.
    const { rows: meta } = await client.query(`
      select pp.tablename, pp.policyname
      from pg_policies pp
      where pp.schemaname = 'public'
        and (coalesce(pp.qual,'') || ' ' || coalesce(pp.with_check,'')) ilike '%user_metadata%';`);
    if (meta.length)
      record(
        'no user-editable claims in policies',
        false,
        'policy reads user_metadata (the user can edit it and escalate): ' +
          meta.map((m) => `${m.tablename}.${m.policyname}`).join(', ') +
          ' — use app_metadata or a server-side table instead',
      );
    else record('no user-editable claims in policies', true, 'no policy trusts user-editable claims');

    // Storage: every query above is scoped to the `public` schema, so buckets were entirely
    // out of scope. A public bucket is the single most common real-world data leak in this
    // stack, and the default when a bucket is created carelessly.
    try {
      const { rows: buckets } = await client.query(`select name, public from storage.buckets;`);
      const open = buckets.filter((b) => b.public);
      if (open.length)
        record('storage buckets private', false, 'PUBLIC bucket(s): ' + open.map((b) => b.name).join(', ') + ' — anyone with the URL can read every object');
      else record('storage buckets private', true, buckets.length ? `${buckets.length} bucket(s), none public` : 'no storage buckets');
    } catch (e) {
      // Only "the storage schema isn't installed" is a legitimate pass. Any OTHER error
      // (permissions, timeout, syntax) means the check DID NOT RUN — and a check that did
      // not run is a failure, never a green. An earlier version swallowed every error as PASS.
      const missing = /does not exist|undefined table|unknown relation/i.test(e.message || '');
      record(
        'storage buckets private',
        missing,
        missing ? 'storage schema not present (app uses no file storage)' : `check did not run: ${e.message}`,
      );
    }

    // ISOLATION — the check that actually matters. Everything above proves RLS is
    // switched ON and wired; none of it proves a policy SEPARATES one user from another.
    // A policy of `using (is_active)` passes every earlier check and leaks the whole table.
    //
    // Two layers, because neither alone is sufficient:
    //   (a) static  — every policy must actually reference the caller's identity
    //                 (auth.uid() / auth.jwt() / current_setting('request.jwt...')).
    //                 A policy that mentions none of them cannot be isolating anyone.
    //   (b) runtime — where seed data exists, impersonate a RANDOM authenticated user and
    //                 confirm they cannot see every row. This is real proof, not inference.
    const { rows: weak } = await client.query(`
      select pp.tablename, pp.policyname,
             coalesce(pp.qual,'') || ' ' || coalesce(pp.with_check,'') as expr
      from pg_policies pp
      where pp.schemaname = 'public';`);
    // NB: auth.role() is deliberately NOT accepted here. `using (auth.role() = 'authenticated')`
    // is the classic near-miss: it proves someone is signed in, but every signed-in user then
    // sees every row. Only expressions that bind to WHICH user it is count as isolation.
    const noIdentity = weak.filter(
      (p) =>
        !/auth\.uid\(\)|auth\.jwt\(\)|request\.jwt\.claim/i.test(p.expr) &&
        !intentionallyPublic.has(p.tablename),
    );
    if (noIdentity.length)
      record(
        'RLS isolation (policy references caller)',
        false,
        'policy does not reference the caller identity, so it cannot isolate users: ' +
          noIdentity.map((p) => `${p.tablename}.${p.policyname}`).join(', ') +
          `. Use auth.uid(), or mark the table "${PUBLIC_MARK} (<table>)" in its migration if it is meant to be world-readable.`,
      );
    else record('RLS isolation (policy references caller)', true, `${weak.length} policy/policies bind to the caller`);

    // Runtime probe — only meaningful where rows exist (seed.sql). Reported honestly as
    // "no data" rather than passed silently when there is nothing to prove.
    // Count rows visible to a specific signed-in user. The role switch and the JWT claim
    // MUST be separate statements in one transaction — an earlier version set both inside a
    // FROM-clause subquery, which does not apply before the scan: it reported a stranger
    // seeing every row as a PASS. Verified empirically (stranger 2/2 before, 0/2 after).
    const STRANGER = '00000000-0000-0000-0000-0000000000ff';
    async function visibleTo(ident, sub) {
      const claims = JSON.stringify({ sub, role: 'authenticated' }).replace(/'/g, "''");
      if (client.mode === 'local') {
        await client.query('begin');
        try {
          await client.query('set local role authenticated');
          await client.query(`select set_config('request.jwt.claims','${claims}', true)`);
          const r = await client.query(`select count(*)::int as n from ${ident};`);
          return r.rows[0].n;
        } finally {
          await client.query('rollback');
        }
      }
      // Cloud: each API call is its own session, so the whole thing goes as one batch.
      // The endpoint returns the LAST statement's rows (verified).
      const r = await client.query(
        `begin; set local role authenticated;` +
          ` select set_config('request.jwt.claims','${claims}', true);` +
          ` select count(*)::int as n from ${ident}; rollback;`,
      );
      const n = Array.isArray(r.rows) && r.rows.length ? r.rows[r.rows.length - 1].n : null;
      if (n === null || n === undefined) throw new Error('probe returned no count');
      return Number(n);
    }

    try {
      const probed = [];
      for (const t of rows) {
        if (intentionallyPublic.has(t.table_name)) continue;
        const ident = `public."${t.table_name.replace(/"/g, '""')}"`;
        const { rows: tot } = await client.query(`select count(*)::int as n from ${ident};`);
        if (!tot[0].n) continue;
        probed.push({ table: t.table_name, total: tot[0].n, visible: await visibleTo(ident, STRANGER) });
      }
      const leaks = probed.filter((p) => p.visible >= p.total && p.total > 0);
      if (leaks.length)
        record(
          'RLS isolation (runtime probe)',
          false,
          'a random signed-in user can see EVERY row of: ' +
            leaks.map((l) => `${l.table} (${l.visible}/${l.total})`).join(', '),
        );
      else if (!probed.length)
        record('RLS isolation (runtime probe)', true, 'no seed rows to probe — static check above is the binding one');
      else
        record('RLS isolation (runtime probe)', true,
          probed.map((p) => `${p.table} ${p.visible}/${p.total} visible to a stranger`).join('; '));
    } catch (e) {
      record('RLS isolation (runtime probe)', false, `probe failed: ${e.message}`);
    }
  } catch (e) {
    // Fail EVERY db-dependent check, not just the first — a check that silently
    // vanishes from the report reads as "not a problem" instead of "never ran".
    record('RLS coverage', false, `DB query failed: ${e.message}`);
    record('definer fn exposure', false, 'not run — DB query failed');
    record('table grants', false, 'not run — DB query failed');
    record('anon has no table grants', false, 'not run — DB query failed');
    record('no user-editable claims in policies', false, 'not run — DB query failed');
    record('storage buckets private', false, 'not run — DB query failed');
    record('RLS isolation (policy references caller)', false, 'not run — DB query failed');
    record('RLS isolation (runtime probe)', false, 'not run — DB query failed');
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
  record('anon has no table grants', false, 'not run — migration replay failed');
  record('no user-editable claims in policies', false, 'not run — migration replay failed');
  record('storage buckets private', false, 'not run — migration replay failed');
  record('RLS isolation (policy references caller)', false, 'not run — migration replay failed');
  record('RLS isolation (runtime probe)', false, 'not run — migration replay failed');
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
