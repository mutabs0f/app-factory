#!/usr/bin/env node
// PreToolUse(Bash) guard — enforces "migrations only; verify before pushing".
// Reads the hook payload from stdin and blocks direct remote DB mutations unless
// `node scripts/verify.mjs` passed in the last 30 minutes (marker: .verify-pass).
// Fail-OPEN: any unexpected condition exits 0 so this can never brick a session.
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

for (const b of BLOCKED) {
  if (b.re.test(command)) {
    if (existsSync('.verify-pass')) {
      const ts = Number(readFileSync('.verify-pass', 'utf8').trim());
      if (Number.isFinite(ts) && Date.now() - ts < 30 * 60 * 1000) process.exit(0);
    }
    console.error(
      `Blocked: ${command}\n${b.why}\nRun \`node scripts/verify.mjs\` (must be green) first.`,
    );
    process.exit(2);
  }
}

process.exit(0);
