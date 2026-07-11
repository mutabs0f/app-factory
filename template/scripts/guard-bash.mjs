#!/usr/bin/env node
// PreToolUse guard for the app-factory template. Reads the hook payload from stdin.
//
// Enforces (defense-in-depth — an agent with raw shell + filesystem read cannot be
// perfectly sandboxed by a hook; this closes the easy/accidental bypasses, refuses to
// LIE about what it enforces, and leaves human review at ship as the real backstop):
//   1. Dev-target only — MCP cloud writes (apply_migration / execute_sql /
//      deploy_edge_function / merge_branch / reset_branch) are allowed ONLY to a project
//      ref listed in .dev-branch. Any other target (incl. a linked prod project, or no
//      ref) is blocked REGARDLESS of verify state. Fail closed.
//   2. Verify before writing — the same MCP writes and `supabase db push` also require
//      verify.mjs green on the CURRENT tree. The .verify-pass marker is HMAC-signed with
//      a per-machine secret OUTSIDE the repo, so it cannot be minted by re-running the
//      public git-plumbing hash.
//   3. Gate integrity — blocks Edit/Write AND shell write/copy/move/delete/rename to the
//      gate files and to the .verify-pass marker, and refuses to trust verify when any
//      gate file differs from its committed version.
//
// Invoked via scripts/guard-run.mjs, which fails CLOSED (exit 2) if THIS file is missing —
// so deleting the guard can't silently disable it. Fail-OPEN here only on a genuinely
// unexpected internal error (so a guard bug can't brick a session); fail-CLOSED on every
// security decision (missing secret, unknown/none target, tampered gate → block).
import { execSync } from 'node:child_process';
import { createHash, createHmac } from 'node:crypto';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

let toolName = '';
let toolInput = {};
try {
  const payload = JSON.parse(readFileSync(0, 'utf8'));
  toolName = payload?.tool_name ?? '';
  toolInput = payload?.tool_input ?? {};
} catch {
  process.exit(0); // no/invalid payload → allow
}

const GATE_FILES = [
  'scripts/verify.mjs',
  'scripts/guard-bash.mjs',
  'scripts/guard-run.mjs',
  '.claude/settings.json',
];
const SECRET_FILE = join(homedir(), '.app-factory-gate-secret');

function block(msg) {
  console.error(msg);
  process.exit(2);
}

function stateHash() {
  const q = { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] };
  try {
    // Content-addressed hash of the full working tree — MUST match verify.mjs's
    // stateHash exactly. Editing an already-dirty file changes it, so an unverified
    // change cannot ride a stale marker.
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

// Per-machine secret that signs the pass marker. verify.mjs creates it; the guard only
// reads it. Absent → we cannot trust ANY marker (fail closed).
function gateSecret() {
  try {
    const s = readFileSync(SECRET_FILE, 'utf8').trim();
    return s || null;
  } catch {
    return null;
  }
}

function verifiedForCurrentTree() {
  if (!existsSync('.verify-pass')) return false;
  const secret = gateSecret();
  if (!secret) return false; // no secret → forgery can't be ruled out → not verified
  try {
    const [tsStr, hash, mac] = readFileSync('.verify-pass', 'utf8').trim().split(':');
    if (!tsStr || !hash || !mac) return false; // legacy/unsigned marker → not trusted
    const ts = Number(tsStr);
    if (!Number.isFinite(ts) || Date.now() - ts > 30 * 60 * 1000) return false;
    if (hash === 'nogit') return false; // never trust a non-content hash
    const expect = createHmac('sha256', secret).update(`${tsStr}:${hash}`).digest('hex');
    if (mac !== expect) return false; // signature forged/invalid
    return hash === stateHash(); // tree unchanged since the verified run
  } catch {
    return false;
  }
}

// The gate files must be committed AND equal to their committed content. `git status
// --porcelain` reports any modified / UNTRACKED / deleted gate file (a stubbed-but-never-
// committed file would slip a HEAD-only diff), and we also assert each still exists. Runs
// from the guard's cwd (the app root) so the relative GATE_FILES pathspecs resolve. Any
// dirty/untracked gate file, missing file, or error → not intact → refuse to trust verify.
function gateFilesIntact() {
  try {
    const out = execSync(`git status --porcelain -- ${GATE_FILES.join(' ')}`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    if (out.trim() !== '') return false; // modified / untracked / deleted gate file
    for (const g of GATE_FILES) if (!existsSync(g)) return false;
    return true;
  } catch {
    return false;
  }
}

// Supabase project refs allowed to receive MCP cloud writes — one per line in .dev-branch
// (committed per app), '#' comments ignored. Absent/empty ⇒ none (all cloud writes blocked).
function allowedDevRefs() {
  try {
    return readFileSync('.dev-branch', 'utf8')
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter((s) => s && !s.startsWith('#'));
  } catch {
    return [];
  }
}
const targetRef = () => String(toolInput.project_id ?? toolInput.projectId ?? toolInput.ref ?? '').trim();

// --- Edit/Write to a gate file or the verify marker (tripwire) ---
if (/^(Edit|Write|MultiEdit)$/.test(toolName)) {
  const fp = (toolInput.file_path ?? '').replace(/\\/g, '/');
  if (GATE_FILES.some((g) => fp.endsWith(g)))
    block(
      `Blocked: edit to a gate file (${fp}).\n` +
        `verify.mjs / guard-bash.mjs / settings.json protect the deterministic gate and must\n` +
        `NOT be weakened without Basim's explicit approval. If this change is genuinely needed,\n` +
        `surface it to Basim and let him authorize or make it.`,
    );
  if (fp.endsWith('.verify-pass'))
    block(
      `Blocked: hand-writing .verify-pass.\n` +
        `The verify marker is written ONLY by scripts/verify.mjs after a real green run.\n` +
        `Creating it by hand is forging a success signal — the cardinal sin. Run the gate instead.`,
    );
  process.exit(0);
}

// --- Bash commands ---
if (toolName === 'Bash' || toolInput.command) {
  const command = toolInput.command ?? '';

  // Gate integrity: no shell write / copy / move / delete / rename onto a gate file or the
  // verify marker. (String-matching catches the obvious verbs; a determined agent can still
  // obfuscate — that is the defense-in-depth limit noted in CLAUDE.md.)
  // Distinctive gate scripts match by bare name anywhere; settings.json ONLY when path-
  // qualified as .claude/settings.json (so a legit .expo/.vscode/settings.json write isn't
  // blocked). String-matching still can't stop a determined obfuscated write — the conceded
  // defense-in-depth limit; gateFilesIntact() is the structural backstop for a stubbed gate.
  const gateName =
    '(?:verify\\.mjs|guard-bash\\.mjs|guard-run\\.mjs|\\.claude[\\\\/]settings\\.json|\\.verify-pass)';
  const redirWrite = new RegExp(
    `(?:>>?|\\btee\\b|Set-Content|Out-File|Add-Content|\\bsc\\b|\\bac\\b|sed\\s+-i)[^;&|]*${gateName}`,
    'i',
  );
  const fileOp = new RegExp(
    `(?:\\bcp\\b|\\bmv\\b|\\brm\\b|\\bdel\\b|\\bren\\b|\\bmove\\b|\\bcopy\\b|Copy-Item|Move-Item|Remove-Item|Rename-Item|New-Item|\\bri\\b|\\bmi\\b|\\bcpi\\b|\\bni\\b|\\brni\\b|unlink|unlinkSync|rmSync|writeFileSync|os\\.remove|shutil)[^;&|]*${gateName}`,
    'i',
  );
  if (redirWrite.test(command) || fileOp.test(command))
    block(
      `Blocked: shell write/copy/move/delete targeting a gate file or the verify marker.\n` +
        `verify.mjs / guard-bash.mjs / settings.json / .verify-pass must not be modified, replaced,\n` +
        `or removed via the shell — gate changes require Basim's explicit approval.`,
    );

  // `supabase db push` / `db remote commit` target the LINKED project or a raw --db-url,
  // neither of which can be dev-ref checked — so a green tree could still hit prod. Blocked
  // OUTRIGHT; apply schema to a DEV branch via the Supabase MCP apply_migration (which IS
  // gated against .dev-branch).
  const BLOCKED = [
    { re: /supabase\s+db\s+push/, why: 'Its target (linked project / --db-url) cannot be dev-ref checked. Apply migrations to a dev branch via the Supabase MCP apply_migration instead.' },
    { re: /supabase\s+db\s+remote\s+commit/, why: 'Do not commit remote drift — schema changes live in supabase/migrations/, applied to a dev branch via MCP.' },
  ];
  for (const b of BLOCKED) {
    if (b.re.test(command)) block(`Blocked: ${command}\n${b.why}`);
  }
  process.exit(0);
}

// --- MCP cloud mutations ---
// project_id-scoped writes (apply_migration / execute_sql / deploy_edge_function /
// pause_project / restore_project) are dev-ref gated. branch_id-scoped ops (merge_branch /
// reset_branch / delete_branch) expose no project ref, so targetRef() is '' and they are
// blocked OUTRIGHT — promoting/destroying a branch is a deliberate human step.
const MCP_MUTATION = /^mcp__.*__(apply_migration|deploy_edge_function|merge_branch|reset_branch|pause_project|restore_project|delete_branch)$/;
const MCP_EXEC_SQL = /^mcp__.*__execute_sql$/; // fail closed: ALL execute_sql is gated, not just keyword-detected writes

if (MCP_MUTATION.test(toolName) || MCP_EXEC_SQL.test(toolName)) {
  const ref = targetRef();
  const devRefs = allowedDevRefs();
  if (!ref || !devRefs.includes(ref))
    block(
      `Blocked: ${toolName} → "${ref || '(no project ref in tool input)'}".\n` +
        `MCP cloud writes may target ONLY a dev project ref listed in .dev-branch (one per line),\n` +
        `enforced independent of verify state — a green tree can NEVER write to prod. Branch-scoped\n` +
        `ops (merge/reset/delete branch) carry no project ref and are blocked outright.\n` +
        `Add your dev project ref to .dev-branch (a ref, not a secret), or use the local stack.`,
    );
  if (!verifiedForCurrentTree())
    block(
      `Blocked: ${toolName} → "${ref}".\n` +
        `MCP cloud writes require a verified tree — run \`node scripts/verify.mjs\` (green) first.`,
    );
  if (!gateFilesIntact())
    block(
      `Blocked: ${toolName} → "${ref}".\n` +
        `A gate file differs from its committed version — refusing to trust the verify marker.\n` +
        `Restore scripts/verify.mjs, scripts/guard-bash.mjs, .claude/settings.json to HEAD.`,
    );
  process.exit(0);
}

process.exit(0);
