#!/usr/bin/env node
// PreToolUse guard for the app-factory template. Reads the hook payload from stdin.
// Enforces:
//  1. "verify before pushing" — blocks `supabase db push` (Bash) AND MCP cloud
//     mutations (apply_migration / execute_sql when mutating / deploy_edge_function
//     / merge_branch / reset_branch) unless verify.mjs passed on the CURRENT tree
//     (.verify-pass embeds a content hash of git state).  [B7]
//  2. Gate integrity — blocks Bash writes to the gate files and flags Edit/Write to
//     them: verify.mjs / guard-bash.mjs / settings.json must not be weakened without
//     Basim's explicit approval.  [B8]
// Fail-OPEN on any unexpected condition, so this can never brick a session.
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync } from 'node:fs';
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

const GATE_FILES = ['scripts/verify.mjs', 'scripts/guard-bash.mjs', '.claude/settings.json'];

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

function verifiedForCurrentTree() {
  if (!existsSync('.verify-pass')) return false;
  try {
    const [tsStr, hash] = readFileSync('.verify-pass', 'utf8').trim().split(':');
    const ts = Number(tsStr);
    if (!Number.isFinite(ts) || Date.now() - ts > 30 * 60 * 1000) return false;
    if (hash === 'nogit') return false; // never trust a non-content hash
    return hash === stateHash();
  } catch {
    return false;
  }
}

// --- Edit/Write to a gate file (B8 tripwire) ---
if (/^(Edit|Write|MultiEdit)$/.test(toolName)) {
  const fp = (toolInput.file_path ?? '').replace(/\\/g, '/');
  if (GATE_FILES.some((g) => fp.endsWith(g)))
    block(
      `Blocked: edit to a gate file (${fp}).\n` +
        `verify.mjs / guard-bash.mjs / settings.json protect the deterministic gate and must\n` +
        `NOT be weakened without Basim's explicit approval. If this change is genuinely needed,\n` +
        `surface it to Basim and let him authorize or make it.`,
    );
  process.exit(0);
}

// --- Bash commands ---
if (toolName === 'Bash' || toolInput.command) {
  const command = toolInput.command ?? '';

  // B8: no sneaky shell writes to the gate files.
  const gateWrite =
    /(>|>>|Set-Content|Out-File|Add-Content|\btee\b|sed\s+-i)[^|]*\b(verify\.mjs|guard-bash\.mjs|settings\.json)/i;
  if (gateWrite.test(command))
    block(
      `Blocked: shell write to a gate file.\n` +
        `verify.mjs / guard-bash.mjs / settings.json must not be modified via the shell — gate\n` +
        `changes require Basim's explicit approval.`,
    );

  // B7/existing: no remote DB mutation without a verified tree.
  const BLOCKED = [
    { re: /supabase\s+db\s+push/, why: 'Push to the remote DB only through the ship flow, after verify passes.' },
    { re: /supabase\s+db\s+remote\s+commit/, why: 'Do not commit remote drift — schema changes live in supabase/migrations/.' },
  ];
  for (const b of BLOCKED) {
    if (b.re.test(command)) {
      if (verifiedForCurrentTree()) process.exit(0);
      block(`Blocked: ${command}\n${b.why}\nRun \`node scripts/verify.mjs\` (green, on the current tree) first.`);
    }
  }
  process.exit(0);
}

// --- MCP cloud mutations (B7) ---
const MCP_MUTATION = /^mcp__.*__(apply_migration|deploy_edge_function|merge_branch|reset_branch)$/;
const MCP_EXEC_SQL = /^mcp__.*__execute_sql$/;
const isMutatingSql = (sql) =>
  /\b(insert|update|delete|drop|alter|create|grant|revoke|truncate|replace)\b/i.test(sql || '');

if (MCP_MUTATION.test(toolName) || (MCP_EXEC_SQL.test(toolName) && isMutatingSql(toolInput.query))) {
  if (verifiedForCurrentTree()) process.exit(0);
  block(
    `Blocked: ${toolName}\n` +
      `MCP cloud writes require a verified tree (run node scripts/verify.mjs) and must target a\n` +
      `DEV branch — never a linked production project.`,
  );
}

process.exit(0);
