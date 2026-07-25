#!/usr/bin/env node
// factory-eval.mjs — the factory's own golden probe: scaffold a throwaway app and
// assert the MACHINERY is intact. Run after any factory/template change.
//
//   node scripts/factory-eval.mjs            quick: scaffold + structural assertions (~10s)
//   node scripts/factory-eval.mjs --full     quick + npm ci + verify.mjs in the probe (needs Docker)
//   node scripts/factory-eval.mjs --keep     leave the probe on disk for inspection
//
// Purely additive: touches nothing in the factory; creates and (by default) deletes
// C:\Users\Thinkpad\Agents\factory-eval-probe. The agent-behavior half of the eval
// (a real /new-app → /ship run) is the pilot app — this proves everything scripted.
import { execSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const FACTORY = dirname(dirname(fileURLToPath(import.meta.url)));
const SLUG = 'factory-eval-probe';
const DEST = join('C:\\Users\\Thinkpad\\Agents', SLUG);
const full = process.argv.includes('--full');
const keep = process.argv.includes('--keep');

let pass = 0, fail = 0;
function check(name, ok, detail = '') {
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${name.padEnd(34)} ${detail}`.trimEnd());
  ok ? pass++ : fail++;
}
function cleanup() {
  // safety: only ever delete the probe slug under Agents
  if (!keep && DEST.endsWith(SLUG) && existsSync(DEST)) rmSync(DEST, { recursive: true, force: true });
}

console.log('\n  Factory eval — golden probe');
console.log('  ----------------------------------------------------');
if (existsSync(DEST)) rmSync(DEST, { recursive: true, force: true }); // stale probe from an aborted run

// 1. the REAL scaffolder, unmodified
const scaffold = spawnSync('node', [join(FACTORY, 'scaffolder', 'scaffold.mjs'), SLUG], { encoding: 'utf8' });
check('scaffolder exits 0', scaffold.status === 0, scaffold.status === 0 ? '' : (scaffold.stderr || '').split('\n')[0]);
if (scaffold.status !== 0) { cleanup(); process.exit(1); }

const read = (p) => readFileSync(join(DEST, p), 'utf8');
const has = (p) => existsSync(join(DEST, p));

// 2. identity renames
try {
  const appJson = read('app.json');
  check('app.json renamed', !appJson.includes('"template"') && appJson.includes(`com.appfactory.${SLUG.replace(/-/g, '')}`));
  check('package.json renamed', !read('package.json').includes('"name": "template"'));
  check('supabase project_id renamed', read('supabase/config.toml').includes(SLUG));
} catch (e) { check('identity renames', false, e.message); }

// 3. secrets & gate hygiene
check('.env NOT copied', !has('.env'));
check('.env.example present', has('.env.example'));
check('.verify-pass NOT copied', !has('.verify-pass'));
check('.gitignore covers .env', /^\.env$/m.test(read('.gitignore')));
check('keys marker NOT copied', !has('config/.keys-provisioned'));

// 4. the system travels with the app
for (const s of ['new-app', 'design-import', 'preview', 'build', 'verify-app', 'review', 'ship', 'app', 'undo', 'discuss', 'research-apis'])
  check(`skill ${s}`, has(`.claude/skills/${s}/SKILL.md`));
for (const a of ['advisor', 'code-reviewer', 'db-guard', 'api-designer', 'backend-engineer', 'frontend-engineer'])
  check(`subagent ${a}`, has(`.claude/agents/${a}.md`));
check('advisor pinned to Fable 5', has('.claude/agents/advisor.md') && read('.claude/agents/advisor.md').includes('model: claude-fable-5'));
// The three domain designers must be on a frontier model — their whole value is judgement
// (schema shape, operation placement, screen architecture), which is exactly what degrades
// on a cheaper tier. Assert the current set, not one hardcoded id (see the note below).
for (const a of ['api-designer', 'backend-engineer', 'frontend-engineer'])
  check(
    `${a} on a frontier model`,
    has(`.claude/agents/${a}.md`) && /^model:\s*claude-(opus|sonnet)-5\s*$/m.test(read(`.claude/agents/${a}.md`)),
  );
try {
  const settings = JSON.parse(read('.claude/settings.json'));
  // Assert a CURRENT frontier model, not one exact string — pinning the assertion to a
  // single id turned this check into a ratchet that reported GREEN for a stale pin.
  // Update the allowed set deliberately when a new frontier model ships.
  check(
    `executor pinned to a current model (got ${settings.model})`,
    ['claude-opus-5', 'claude-sonnet-5'].includes(settings.model),
  );
  const hookCmds = JSON.stringify(settings.hooks || {});
  check('guard hooks wired', hookCmds.includes('guard-run.mjs') && hookCmds.includes('secret-scan.mjs'));
} catch (e) { check('settings.json parses', false, e.message); }
for (const s of ['verify.mjs', 'collect-keys.mjs', 'guard-run.mjs', 'guard-bash.mjs', 'secret-scan.mjs', 'new-migration.mjs', 'design-brief.mjs', 'design-import.mjs', 'deploy-web.mjs', 'lib/dbclient.mjs', 'arch-check.mjs', 'runtime-check.mjs'])
  check(`script ${s}`, has(`scripts/${s}`));
check('LESSONS.md travels', has('LESSONS.md'));

// 5. key intake behaves: manifest sane, --check is RED before any key exists
try {
  const manifest = JSON.parse(read('config/integrations.json'));
  const required = (manifest.keys || []).filter((k) => k.required);
  check('integrations manifest sane', required.length >= 2 && required.every((k) => k.env && k.format));
} catch (e) { check('integrations manifest sane', false, e.message); }
const kc = spawnSync('node', ['scripts/collect-keys.mjs', '--check'], { cwd: DEST, encoding: 'utf8' });
check('collect-keys --check RED pre-keys', kc.status === 1, `exit ${kc.status}`);

// 6. fresh git history
try {
  const log = execSync('git log --oneline', { cwd: DEST, encoding: 'utf8' }).trim().split('\n');
  check('git init + first commit', log.length === 1);
  const dirty = execSync('git status --porcelain', { cwd: DEST, encoding: 'utf8' }).trim();
  check('working tree clean', dirty === '');
} catch (e) { check('git history', false, e.message); }

// 7. --full: the expensive half (npm ci + the real gate)
if (full) {
  console.log('  --- full mode: npm ci + verify.mjs (this takes minutes) ---');
  const ci = spawnSync('npm', ['ci', '--no-audit', '--no-fund'], { cwd: DEST, encoding: 'utf8', shell: true });
  check('npm ci', ci.status === 0, ci.status === 0 ? '' : (ci.stderr || '').split('\n').slice(-2).join(' '));
  if (ci.status === 0) {
    const v = spawnSync('node', ['scripts/verify.mjs'], { cwd: DEST, encoding: 'utf8' });
    // env-complete is expected RED on a fresh probe (no keys) — everything else must pass.
    const out = (v.stdout || '') + (v.stderr || '');
    const onlyEnvRed = v.status !== 0 && /env/i.test(out) && !/FAIL(?!.*env)/i.test(out);
    check('verify.mjs (env-red allowed)', v.status === 0 || onlyEnvRed, `exit ${v.status}`);
  }
}

cleanup();
console.log('  ----------------------------------------------------');
console.log(`  ${fail === 0 ? 'GREEN' : 'RED'} — ${pass} passed, ${fail} failed${keep ? ` (probe kept at ${DEST})` : ''}\n`);
process.exit(fail === 0 ? 0 : 1);
