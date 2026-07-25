// dbclient.mjs — ONE SQL interface, TWO backends, so the gate no longer needs Docker.
//
//   local  → `pg` against the Docker stack (`supabase start`). Offline, fast, and the
//            migration replay is the CLI's own `supabase db reset`.
//   cloud  → the Supabase Management API (`POST /v1/projects/{ref}/database/query`)
//            against a DEV project ref. Needs only $SUPABASE_ACCESS_TOKEN.
//            NO DOCKER, NO WSL, NO ADMIN PROMPT.
//
// Both expose `query(sql) -> { rows }`, so every check in verify.mjs is written once.
//
// ⚠ SAFETY: cloud reset DROPS THE PUBLIC SCHEMA. It is therefore fail-closed on the
// `.dev-branch` allowlist — the same allowlist the MCP push guard uses. A ref that is
// not listed is refused outright, and we additionally refuse any project whose name
// looks like production. Never widen this.
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const API = 'https://api.supabase.com/v1';

// One line per entry, '#' comments ignored. Used for both .dev-branch (in-repo, gates MCP
// writes) and ~/.app-factory-resettable-refs (out-of-repo, gates destructive schema drops).
export function readRefList(file) {
  if (!existsSync(file)) return new Set();
  return new Set(
    readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#')),
  );
}

export function devRefs(root) {
  return [...readRefList(join(root, '.dev-branch'))];
}

export function hasDocker() {
  try {
    execSync('docker info', { stdio: 'ignore', windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

export function accessToken() {
  return (process.env.SUPABASE_ACCESS_TOKEN || '').trim();
}

// local when Docker is up (richest replay); otherwise cloud when we have a dev ref and a
// token. Explicit --db=local|cloud always wins so a run can be pinned in CI or a test.
export function pickMode(root, argv = []) {
  const flag = (argv.find((a) => a.startsWith('--db=')) || '').split('=')[1];
  if (flag === 'local' || flag === 'cloud') return flag;
  if (hasDocker()) return 'local';
  if (devRefs(root).length && accessToken()) return 'cloud';
  return null; // caller must fail honestly — never silently skip the DB checks
}

export function modeHint(root) {
  const bits = [];
  if (!hasDocker()) bits.push('Docker is not running');
  if (!devRefs(root).length) bits.push('.dev-branch lists no dev project ref');
  if (!accessToken()) bits.push('$SUPABASE_ACCESS_TOKEN is not set');
  return bits.join('; ');
}

// ---------------------------------------------------------------- cloud transport
async function apiQuery(ref, token, sql) {
  const r = await fetch(`${API}/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const text = await r.text();
  if (!r.ok) {
    let msg = text;
    try {
      msg = JSON.parse(text).message || text;
    } catch {
      /* keep raw */
    }
    throw new Error(msg);
  }
  try {
    return JSON.parse(text);
  } catch {
    return [];
  }
}

async function projectStatus(ref, token) {
  try {
    const r = await fetch(`${API}/projects/${ref}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- open a connection
export async function openDb(mode, { root, dbUrl }) {
  if (mode === 'local') {
    const pg = (await import('pg')).default;
    const client = new pg.Client({ connectionString: dbUrl });
    await client.connect();
    return {
      mode,
      label: 'local Supabase (Docker)',
      query: (sql) => client.query(sql),
      end: () => client.end().catch(() => {}),
    };
  }
  const ref = devRefs(root)[0];
  const token = accessToken();
  return {
    mode,
    ref,
    label: `cloud dev project ${ref}`,
    query: async (sql) => ({ rows: await apiQuery(ref, token, sql) }),
    end: async () => {},
  };
}

// ---------------------------------------------------------------- migration replay
function migrationFiles(root) {
  const dir = join(root, 'supabase', 'migrations');
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith('.sql'))
      .sort() // timestamp-prefixed → lexical sort IS chronological
      .map((f) => ({ name: f, version: f.split('_')[0], sql: readFileSync(join(dir, f), 'utf8') }));
  } catch {
    return [];
  }
}

// A fresh public schema, matching what a new Supabase project starts with. Table-level
// privileges are deliberately NOT granted here — the always-revoked default is exactly
// what the "table grants" check exists to police, so granting would hide real bugs.
const FRESH_PUBLIC = `
drop schema if exists public cascade;
create schema public;
alter schema public owner to postgres;
grant usage on schema public to postgres, anon, authenticated, service_role;
`;

export async function resetDb(mode, { root, dbUrl, run }) {
  if (mode === 'local') return run('supabase db reset');

  const ref = devRefs(root)[0];
  const token = accessToken();
  if (!ref) return { ok: false, out: 'cloud reset refused: .dev-branch lists no dev project ref' };
  if (!token) return { ok: false, out: 'cloud reset refused: $SUPABASE_ACCESS_TOKEN is not set' };

  // ── THE DESTRUCTIVE-AUTHORIZATION GATE ────────────────────────────────────────────────
  // This function DROPS THE PUBLIC SCHEMA. The previous guards were: first ref in
  // .dev-branch, ACTIVE_HEALTHY, and a name not containing "prod". That is not enough —
  // .dev-branch lives INSIDE the repo and is therefore agent-writable, and a real
  // production project named "My App" passes every one of those checks and gets erased.
  //
  // Destructive authorization now lives OUTSIDE the repository, in a file only the human
  // creates, alongside the gate secret. Nothing an agent can write, clone, or open a PR
  // against can authorize a schema drop.
  const RESETTABLE = join(homedir(), '.app-factory-resettable-refs');
  if (!readRefList(RESETTABLE).has(ref))
    return {
      ok: false,
      out:
        `cloud reset REFUSED: ${ref} is not authorized for destructive reset.\n` +
        `  Dropping a schema needs authorization from OUTSIDE this repo, because .dev-branch\n` +
        `  is agent-writable and a production project can be named anything.\n\n` +
        `  If ${ref} is genuinely a throwaway DEV project, add its ref to:\n` +
        `    ${RESETTABLE}\n` +
        `  one ref per line. Never add a project holding data you care about.\n\n` +
        `  Otherwise run the gate against local Docker instead:  node scripts/verify.mjs --db=local`,
    };

  // Fail-closed guards. This drops a schema; be paranoid, loudly.
  const proj = await projectStatus(ref, token);
  if (!proj) return { ok: false, out: `cloud reset refused: cannot read project ${ref} (bad token or ref?)` };
  if (proj.status !== 'ACTIVE_HEALTHY')
    return {
      ok: false,
      out: `cloud reset refused: project ${ref} is ${proj.status}, not ACTIVE_HEALTHY.\n` +
        `A paused project answers queries emptily — that would be a vacuous green. Restore it first.`,
    };
  if (/prod|live/i.test(proj.name || ''))
    return { ok: false, out: `cloud reset REFUSED: project name "${proj.name}" looks like production.` };

  // Say out loud what is about to be destroyed. A surprised human is a bug report; a silent
  // drop is a disaster. Also note honestly that this is NOT a true from-zero replay: only
  // `public` is dropped — auth.users, storage objects and other schemas survive, so a cloud
  // green is weaker evidence than a local `supabase db reset`.
  const migs = migrationFiles(root);
  const log = [`cloud replay on ${proj.name} (${ref}) — ${migs.length} migration(s)`];
  try {
    const rows = await apiQuery(
      ref,
      token,
      `select (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
                where n.nspname='public' and c.relkind='r')::int as tables,
              (select count(*) from auth.users)::int as users;`,
    );
    const { tables = 0, users = 0 } = rows[0] || {};
    log.push(`  DROPPING public schema: ${tables} table(s). Project has ${users} auth user(s) (these survive).`);
  } catch {
    log.push('  (could not inventory before dropping; proceeding on the out-of-repo authorization)');
  }
  try {
    await apiQuery(ref, token, FRESH_PUBLIC);
    log.push('  public schema dropped + recreated');
    for (const m of migs) {
      try {
        await apiQuery(ref, token, m.sql);
        log.push(`  applied ${m.name}`);
      } catch (e) {
        log.push(`  FAILED ${m.name}: ${e.message}`);
        return { ok: false, out: log.join('\n') };
      }
    }
    // Keep the CLI's bookkeeping consistent with what we just replayed.
    await apiQuery(
      ref,
      token,
      `create schema if not exists supabase_migrations;
       create table if not exists supabase_migrations.schema_migrations (version text primary key);
       delete from supabase_migrations.schema_migrations;` +
        (migs.length
          ? ` insert into supabase_migrations.schema_migrations (version) values ${migs
              .map((m) => `('${m.version.replace(/'/g, "''")}')`)
              .join(',')};`
          : ''),
    );
    return { ok: true, out: log.join('\n') };
  } catch (e) {
    log.push(`  FAILED: ${e.message}`);
    return { ok: false, out: log.join('\n') };
  }
}

// ---------------------------------------------------------------- generated types
// `--project-id` goes through the Management API with the access token — no Docker.
export function genTypesCmd(mode, { root, dbUrl }) {
  return mode === 'local'
    ? `supabase gen types typescript --db-url "${dbUrl}"`
    : `supabase gen types typescript --project-id ${devRefs(root)[0]}`;
}
