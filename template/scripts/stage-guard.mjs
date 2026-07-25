#!/usr/bin/env node
// stage-guard.mjs — the executable stage controller.
//
// WHY THIS EXISTS. The factory's stage order, its four human gates and its "never advance on
// red" rule all lived in markdown. Markdown is advice. On the first real run (spending-compass,
// 2026-07-25) the session was opened in the PARENT folder, `/app` never ran, no specialist was
// invoked, no gate was approved, the integrations table and key form never happened, and
// verify.mjs was never executed once — while the flow looked, from the outside, like it was
// working. Nothing detected any of that, because nothing was watching.
//
// This turns the prose into checks that HALT. It is deliberately small and deterministic.
//
//   node scripts/stage-guard.mjs --status
//   node scripts/stage-guard.mjs --enter <stage>      refuse if prerequisites are unmet
//   node scripts/stage-guard.mjs --complete <stage>   record completion + evidence
//   node scripts/stage-guard.mjs --approve <gate>     record a HUMAN approval
//
// Stages: discuss · research-apis · new-app · design-import · preview · build · review · ship
// Gates:  brief · integrations · preview · ship
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

const ROOT = process.cwd();
const STATE = join(ROOT, 'docs', 'RUN-STATE.json');

const STAGES = ['discuss', 'research-apis', 'new-app', 'design-import', 'preview', 'build', 'review', 'ship'];
const GATES = ['brief', 'integrations', 'preview', 'ship'];

const die = (msg, code = 1) => { console.error(`\n  ✗ STAGE GUARD — HALT\n\n${msg}\n`); process.exit(code); };
const say = (msg) => console.log(msg);

// ── 1. ARE WE EVEN IN AN APP? ────────────────────────────────────────────────────────────
// This is the check that would have caught the spending-compass failure outright, and it is
// the one an agent cannot talk its way past: either these files are here or they are not.
function assertInsideApp() {
  const markers = ['scripts/verify.mjs', 'config/integrations.json', 'docs/SPEC.md', 'app.json'];
  const missing = markers.filter((m) => !existsSync(join(ROOT, m)));
  if (missing.length) {
    die(
      `  You are not inside an app repo.\n` +
        `  Working directory: ${ROOT}\n` +
        `  Missing: ${missing.join(', ')}\n\n` +
        `  The factory's stages only work from INSIDE an app folder. If you just scaffolded,\n` +
        `  open a new session with the folder set to  C:\\Users\\Thinkpad\\Agents\\<slug>\n` +
        `  and run /app there. Do NOT run stages from C:\\Users\\Thinkpad\\Agents.`,
    );
  }
  // The app's safety hooks only load when the app IS the project root. If settings.json is
  // absent the PostToolUse secret scan and the PreToolUse gate guard are NOT running.
  if (!existsSync(join(ROOT, '.claude', 'settings.json')))
    die(`  ${ROOT} has no .claude/settings.json — the app's safety hooks are not loaded.\n  This app was not scaffolded correctly, or you are in the wrong folder.`);
}

// ── 2. STATE ─────────────────────────────────────────────────────────────────────────────
const blank = { app: basename(ROOT), stage: null, completed: [], approvals: {}, history: [] };
const load = () => {
  try { return { ...blank, ...JSON.parse(readFileSync(STATE, 'utf8')) }; } catch { return { ...blank }; }
};
const save = (s) => writeFileSync(STATE, JSON.stringify(s, null, 2) + '\n');
const stamp = () => {
  // No Date.now() games: use git's clock so the record matches the commit history.
  try { return execSync('git log -1 --format=%cI', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || 'unknown'; }
  catch { return 'unknown'; }
};

// ── 3. PREREQUISITES — the stage order, as code ──────────────────────────────────────────
// Each entry returns null when it is OK to enter, or a string explaining the halt.
const PREREQ = {
  discuss: () => null,
  'research-apis': (s) =>
    !existsSync(join(ROOT, 'docs', 'BRIEF.md'))
      ? 'docs/BRIEF.md does not exist. Run /discuss first — research without an agreed brief researches the wrong app.'
      : !s.approvals.brief
        ? 'Basim has not approved the brief yet. Show it to him and wait for his yes, then:\n    node scripts/stage-guard.mjs --approve brief'
        : null,
  'new-app': (s) =>
    !s.completed.includes('research-apis')
      ? 'research-apis has not completed. The schema must not be designed before the services are chosen AND confirmed obtainable — that is exactly how provider-scout got parked.'
      : !s.approvals.integrations
        ? 'Basim has not approved the integrations table. Show it, let him strike or add rows, then:\n    node scripts/stage-guard.mjs --approve integrations'
        : null,
  'design-import': (s) => (!s.completed.includes('new-app') ? 'new-app has not completed (no SPEC/schema to design against).' : null),
  preview: (s) => (!s.completed.includes('new-app') ? 'new-app has not completed — there is nothing to preview.' : null),
  build: (s) =>
    !s.approvals.preview
      ? 'Basim has not approved what he saw on his phone. /preview must happen and he must react, then:\n    node scripts/stage-guard.mjs --approve preview'
      : null,
  review: (s) => (!s.completed.includes('build') ? 'build has not completed with a green gate.' : null),
  ship: (s) =>
    !s.completed.includes('review')
      ? 'review has not completed.'
      : !s.approvals.ship
        ? 'Basim has not approved shipping. Ask, then:\n    node scripts/stage-guard.mjs --approve ship'
        : null,
};

// Completing a stage requires evidence, not a claim. `null` = no mechanical evidence exists
// for this stage, which is recorded honestly rather than pretended.
const EVIDENCE = {
  discuss: () => (existsSync(join(ROOT, 'docs', 'BRIEF.md')) ? 'docs/BRIEF.md exists' : 'docs/BRIEF.md is missing — /discuss did not produce its artifact'),
  'research-apis': () => {
    try {
      const n = JSON.parse(readFileSync(join(ROOT, 'config', 'integrations.json'), 'utf8')).keys?.length ?? 0;
      return `config/integrations.json has ${n} key entr${n === 1 ? 'y' : 'ies'}`;
    } catch { return 'config/integrations.json is unreadable'; }
  },
  'new-app': () => {
    const spec = join(ROOT, 'docs', 'SPEC.md');
    const tpl = /^#+ .*\n+_Replace|TODO|<!-- fill/i;
    const txt = existsSync(spec) ? readFileSync(spec, 'utf8') : '';
    if (!txt.trim()) return 'docs/SPEC.md is empty';
    if (txt.length < 400 || tpl.test(txt)) return 'docs/SPEC.md still looks like the blank template';
    return `docs/SPEC.md filled in (${txt.length} chars)`;
  },
  'design-import': () => 'design imported or explicitly scaffolded plainly',
  preview: () => 'preview served to Basim',
  build: () => (existsSync(join(ROOT, '.verify-pass')) ? '.verify-pass present (gate went green)' : 'NO .verify-pass — scripts/verify.mjs has never gone green in this app'),
  review: () => 'review completed',
  ship: () => 'shipped',
};

// ── 4. CLI ───────────────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] ?? true : null; };

assertInsideApp();
const state = load();

if (args.includes('--status') || args.length === 0) {
  say(`\n  ${state.app} — run state`);
  say('  ' + '-'.repeat(56));
  for (const s of STAGES) {
    const done = state.completed.includes(s);
    const blocked = PREREQ[s](state);
    say(`  ${done ? '[done]' : blocked ? '[locked]' : '[ready]'} ${s}${done ? '' : blocked ? `  — ${blocked.split('\n')[0].slice(0, 60)}` : ''}`);
  }
  say('  ' + '-'.repeat(56));
  say(`  human approvals: ${GATES.map((g) => `${g}=${state.approvals[g] ? 'yes' : 'NO'}`).join('  ')}`);
  const gateGreen = existsSync(join(ROOT, '.verify-pass'));
  say(`  gate: ${gateGreen ? '.verify-pass present' : 'NEVER GREEN in this app'}\n`);
  process.exit(0);
}

const enter = flag('--enter');
if (enter) {
  if (!STAGES.includes(enter)) die(`  Unknown stage "${enter}". Stages: ${STAGES.join(', ')}`);
  const blocked = PREREQ[enter](state);
  if (blocked) die(`  Cannot enter "${enter}" yet.\n\n  ${blocked}\n\n  Run  node scripts/stage-guard.mjs --status  to see where this app actually is.`);
  state.stage = enter;
  state.history.push({ at: stamp(), event: `enter:${enter}` });
  save(state);
  say(`  ✓ entered ${enter}`);
  process.exit(0);
}

const complete = flag('--complete');
if (complete) {
  if (!STAGES.includes(complete)) die(`  Unknown stage "${complete}".`);
  const ev = EVIDENCE[complete]();
  // Stage-specific hard evidence: build cannot be "complete" without a green gate, ever.
  if (complete === 'build' && !existsSync(join(ROOT, '.verify-pass')))
    die(`  Cannot complete "build": ${ev}.\n  A claim of done is a hint; the gate's exit code is the verdict. Run: node scripts/verify.mjs`);
  if (complete === 'new-app' && /blank template|empty/.test(ev))
    die(`  Cannot complete "new-app": ${ev}.\n  The SPEC is the contract every later stage consumes; an empty one poisons all of them.`);
  if (!state.completed.includes(complete)) state.completed.push(complete);
  state.history.push({ at: stamp(), event: `complete:${complete}`, evidence: ev });
  save(state);
  say(`  ✓ completed ${complete} — ${ev}`);
  process.exit(0);
}

const approve = flag('--approve');
if (approve) {
  if (!GATES.includes(approve)) die(`  Unknown gate "${approve}". Gates: ${GATES.join(', ')}`);
  state.approvals[approve] = { at: stamp() };
  state.history.push({ at: stamp(), event: `approve:${approve}` });
  save(state);
  say(`  ✓ recorded Basim's approval of the "${approve}" gate.`);
  // Honest about the limit: this records an approval, it cannot verify one happened. Like the
  // other guards it is a speed bump against drift, not a defence against a determined agent.
  say(`    (Only record this after he actually said yes in his own words. The record is`);
  say(`     auditable in docs/RUN-STATE.json — do not fabricate it.)`);
  process.exit(0);
}

die(`  Nothing to do. Use --status, --enter <stage>, --complete <stage>, or --approve <gate>.`);
