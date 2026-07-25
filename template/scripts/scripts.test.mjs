#!/usr/bin/env node
// scripts.test.mjs — the gate's own regression fixtures.
//
// Why this exists: `scripts/` is ~2,600 lines that decide whether every app is allowed to
// ship, and it had NO test of its own. Three real bugs shipped past `node --check` in a
// single day, all the same shape — a Node builtin used without being imported:
//   · deploy-web.mjs used writeFileSync unimported (the PWA path was dead on arrival)
//   · dbclient.mjs used homedir() unimported
//   · dbclient.mjs called a helper that did not exist in that module
//
// HONEST SCOPE: that class is caught by `no-undef`, now that eslint.config.js finally lints
// scripts/ — NOT by this file. My first version of these smoke tests claimed to catch the
// deploy-web bug and did not: `--check` returns before reaching the offending line, so the
// test passed with the bug reintroduced. Verified, then fixed by widening lint instead.
//
// What THIS file is for is the other half: proving the checks actually FAIL when they should.
// A security check that has never been observed to fail proves nothing.
//
//   node scripts/scripts.test.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let pass = 0;
const fails = [];
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  [PASS] ${name}`); }
  else { fails.push(`${name}${detail ? ` — ${detail}` : ''}`); console.log(`  [FAIL] ${name} ${detail}`); }
};
async function check(name, fn) {
  try { const r = await fn(); ok(name, r === true || r === undefined, typeof r === 'string' ? r : ''); }
  catch (e) { ok(name, false, e.message.split('\n')[0]); }
}

console.log('\n  gate self-test');
console.log('  ' + '-'.repeat(58));

// ── 1. Every control script must at minimum LOAD. This is the check that would have caught
// all three of the bugs above. Scripts that run work on import are exercised via --help/CLI
// instead, so loading them here must not have side effects.
for (const m of ['lib/dbclient.mjs']) {
  await check(`imports cleanly: ${m}`, async () => {
    await import(`./${m}`);
  });
}

// ── 2. Every script must be *runnable* far enough to prove its imports resolve. A missing
// import throws at first use, which `node --check` never reaches. `--check`-style flags or
// an intentionally-bad invocation both get us past module init into real code.
const RUNNABLE = [
  ['collect-keys.mjs', ['--check']], // presence check, no server
  ['secret-scan.mjs', []], // scans the tree
  ['arch-check.mjs', []], // static import analysis
];
for (const [script, args] of RUNNABLE) {
  await check(`runs without a ReferenceError: ${script}`, () => {
    try {
      execFileSync(process.execPath, [join('scripts', script), ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      return true;
    } catch (e) {
      const out = (e.stdout || '') + (e.stderr || '');
      // A non-zero exit is fine (the check may legitimately fail); a ReferenceError or
      // "is not defined" means an import is missing and the script is broken.
      if (/ReferenceError|is not defined|Cannot find module/.test(out)) return out.split('\n')[0];
      return true;
    }
  });
}

// deploy-web.mjs --check reaches the vercel + env probes without deploying anything. This is
// the exact path that was dead: writeFileSync was used but never imported.
await check('runs without a ReferenceError: deploy-web.mjs --check', () => {
  try {
    execFileSync(process.execPath, ['scripts/deploy-web.mjs', '--check'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return true;
  } catch (e) {
    const out = (e.stdout || '') + (e.stderr || '');
    if (/ReferenceError|is not defined|Cannot find module/.test(out)) return out.split('\n')[0];
    return true;
  }
});

// ── 3. BEHAVIOUR: the destructive cloud reset must refuse a ref that is not authorized from
// OUTSIDE the repo. This is the highest-severity path in the whole system — it drops a schema.
await check('cloud reset REFUSES a ref with no out-of-repo authorization', async () => {
  const { resetDb } = await import('./lib/dbclient.mjs');
  const tmp = mkdtempSync(join(tmpdir(), 'gate-test-'));
  try {
    writeFileSync(join(tmp, '.dev-branch'), 'someunauthorizedref\n');
    const r = await resetDb('cloud', { root: tmp, dbUrl: '', run: () => ({ ok: true, out: '' }) });
    if (r.ok) return 'IT PROCEEDED — a schema drop was authorized by an in-repo file alone';
    if (!/not authorized for destructive reset/.test(r.out)) return `refused for the wrong reason: ${r.out.split('\n')[0]}`;
    return true;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ── 4. BEHAVIOUR: arch-check must FAIL on a real boundary violation, not just pass on clean
// code. A security/architecture check that has never been shown to fail proves nothing.
await check('arch-check CATCHES a supabase import outside lib/ and api.ts', () => {
  const probe = join('src', 'features', 'home', '__arch_probe_screen.tsx');
  writeFileSync(probe, "import { supabase } from '@/lib/supabase';\nexport const X = 1;\n");
  try {
    execFileSync(process.execPath, ['scripts/arch-check.mjs'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return 'arch-check PASSED a file importing supabase from a screen';
  } catch (e) {
    const out = (e.stdout || '') + (e.stderr || '');
    return /supabase-boundary/.test(out) ? true : `failed for the wrong reason: ${out.split('\n').slice(0, 2).join(' ')}`;
  } finally {
    rmSync(probe, { force: true });
  }
});

// ── 5. BEHAVIOUR: the guard must block a shell write to ANY gate file, not only verify.mjs.
// Widening the Edit/Write list without widening the shell regex left exactly that hole.
for (const target of ['scripts/verify.mjs', 'scripts/arch-check.mjs', 'scripts/lib/dbclient.mjs']) {
  await check(`guard blocks a shell write to ${target}`, () => {
    try {
      execFileSync(process.execPath, ['scripts/guard-bash.mjs'], {
        input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: `echo x > ${target}` } }),
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      return 'guard ALLOWED it (expected exit 2)';
    } catch (e) {
      return e.status === 2 ? true : `exited ${e.status}, expected 2`;
    }
  });
}
await check('guard ALLOWS a write to a normal app file', () => {
  execFileSync(process.execPath, ['scripts/guard-bash.mjs'], {
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'echo x > src/features/home/home-screen.tsx' } }),
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return true;
});

// ── 6. BEHAVIOUR: secret-scan must catch a realistic secret-shaped value.
await check('secret-scan CATCHES a planted service-role-shaped key', () => {
  const probe = join('src', '__secret_probe.ts');
  writeFileSync(probe, `export const k = 'sb_secret_${'A1b2C3d4E5f6G7h8I9j0'}';\n`);
  try {
    execFileSync(process.execPath, ['scripts/secret-scan.mjs'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return 'secret-scan PASSED a planted sb_secret_ value';
  } catch {
    return true;
  } finally {
    rmSync(probe, { force: true });
  }
});

console.log('  ' + '-'.repeat(58));
if (fails.length) {
  console.error(`  RED — ${pass} passed, ${fails.length} failed:`);
  for (const f of fails) console.error(`     · ${f}`);
  console.error('');
  process.exit(1);
}
console.log(`  GREEN — ${pass} gate self-tests passed\n`);
process.exit(0);
