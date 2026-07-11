#!/usr/bin/env node
// Fail-CLOSED launcher for the PreToolUse guard. settings.json invokes THIS, not
// guard-bash.mjs directly, so that a MISSING/unreadable guard BLOCKS (exit 2) instead of
// the hook running `node scripts/guard-bash.mjs`, hitting module-not-found (exit 1), and
// PreToolUse failing OPEN. Keep it tiny; it is itself a gate file. The hook payload on
// stdin is inherited straight through to the guard.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const guard = 'scripts/guard-bash.mjs';
if (!existsSync(guard)) {
  console.error(
    'Blocked: scripts/guard-bash.mjs is missing — the gate guard must be present.\n' +
      'Restore it from HEAD; a missing guard fails CLOSED by design.',
  );
  process.exit(2);
}
const r = spawnSync(process.execPath, [guard], { stdio: 'inherit' });
// Any failure to run the guard (null status / signal) → block, never allow-by-default.
process.exit(r.status === null ? 2 : r.status);
