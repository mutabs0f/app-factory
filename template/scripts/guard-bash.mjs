#!/usr/bin/env node
// PreToolUse(Bash) guard — enforces "migrations only; verify before pushing".
// Reads the hook payload from stdin and blocks direct remote DB mutations unless
// verify.mjs passed in the last 30 minutes AND the working tree is unchanged
// since (the .verify-pass marker embeds a hash of git state).
// Fail-OPEN: any unexpected condition exits 0 so this can never brick a session.
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

let command = '';
try {
  const payload = JSON.parse(readFileSync(0, 'utf8'));
  command = payload?.tool_input?.command ?? '';
} catch {
  process.exit(0); // no/invalid payload → allow
}

const BLOCKED = [
  {
    re: /supabase\s+db\s+push/,
    why: 'Push to the remote DB only through the ship flow, after verify passes.',
  },
  {
    re: /supabase\s+db\s+remote\s+commit/,
    why: 'Do not commit remote drift — schema changes live in supabase/migrations/.',
  },
];

function stateHash() {
  const opt = { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] };
  try {
    const head = execSync('git rev-parse HEAD', opt).trim();
    const dirty = execSync('git status --porcelain', opt);
    return createHash('sha256').update(`${head}\n${dirty}`).digest('hex');
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
    return hash === stateHash(); // unchanged since verify passed
  } catch {
    return false;
  }
}

for (const b of BLOCKED) {
  if (b.re.test(command)) {
    if (verifiedForCurrentTree()) process.exit(0);
    console.error(
      `Blocked: ${command}\n${b.why}\nRun \`node scripts/verify.mjs\` (green, on the current tree) first.`,
    );
    process.exit(2);
  }
}

process.exit(0);
