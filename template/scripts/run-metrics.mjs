#!/usr/bin/env node
// run-metrics.mjs — turn an app's .office/events.jsonl into an honest build report:
// per-stage durations, edit counts, gate attempts. Read-only unless --append.
//
//   node scripts/run-metrics.mjs <app-repo>            print the report
//   node scripts/run-metrics.mjs <app-repo> --append   also append one summary line
//                                                      to <app>/.office/run-metrics.jsonl
//
// Honesty note: hook events carry commands, not exit codes — so gate ATTEMPTS are
// counted here; gate VERDICTS live in the session transcript and verify output.
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2).filter((a) => a !== '--append');
const append = process.argv.includes('--append');
const repo = resolve(args[0] || process.cwd());
const file = join(repo, '.office', 'events.jsonl');
if (!existsSync(file)) {
  console.error(`No ${file} — install the office hooks first (office/install.mjs) and run a session.`);
  process.exit(1);
}

const events = readFileSync(file, 'utf8').split('\n').filter(Boolean).flatMap((l) => {
  try { return [JSON.parse(l)]; } catch { return []; }
});
if (!events.length) { console.error('events.jsonl is empty.'); process.exit(1); }

const STAGE_RE = { S1: /new-app|spec/, S2: /design|preview/, S3: /build|goal/, S4: /review/, S5: /ship/ };
function stageOf(ev) {
  const s = (ev.s || '').toLowerCase();
  if (ev.e === 'UserPromptSubmit' || (ev.e === 'PreToolUse' && ev.tool === 'Skill'))
    for (const [k, re] of Object.entries(STAGE_RE)) if (re.test(s)) return k;
  return null;
}

// segment the timeline by stage markers
const segments = [];
let cur = null;
for (const ev of events) {
  const st = stageOf(ev);
  if (st && (!cur || cur.stage !== st)) { cur = { stage: st, start: ev.t, end: ev.t, edits: 0, cmds: 0, gates: 0, agents: 0 }; segments.push(cur); }
  if (!cur) { cur = { stage: 'pre', start: ev.t, end: ev.t, edits: 0, cmds: 0, gates: 0, agents: 0 }; segments.push(cur); }
  cur.end = ev.t;
  if (ev.e === 'PostToolUse') {
    if (['Edit', 'Write', 'NotebookEdit'].includes(ev.tool)) cur.edits++;
    if (['Bash', 'PowerShell'].includes(ev.tool)) { cur.cmds++; if (/verify\.mjs(?!.*--check)/.test(ev.s || '')) cur.gates++; }
    if (['Task', 'Agent'].includes(ev.tool)) cur.agents++;
  }
}

const fmt = (ms) => { const m = Math.round(ms / 60000); return m >= 60 ? `${(m / 60).toFixed(1)}h` : `${m}m`; };
const t0 = events[0].t, t1 = events[events.length - 1].t;
console.log(`\n  Build report — ${repo.split(/[\\/]/).pop()}`);
console.log(`  ${new Date(t0).toLocaleString()} → ${new Date(t1).toLocaleString()}  (${fmt(t1 - t0)} wall clock)`);
console.log('  ----------------------------------------------------------');
console.log('  stage   duration   edits   commands   gate runs   subagents');
const totals = { edits: 0, cmds: 0, gates: 0, agents: 0 };
for (const s of segments) {
  console.log(`  ${s.stage.padEnd(7)} ${fmt(s.end - s.start).padEnd(10)} ${String(s.edits).padEnd(7)} ${String(s.cmds).padEnd(10)} ${String(s.gates).padEnd(11)} ${s.agents}`);
  totals.edits += s.edits; totals.cmds += s.cmds; totals.gates += s.gates; totals.agents += s.agents;
}
console.log('  ----------------------------------------------------------');
console.log(`  total   ${fmt(t1 - t0).padEnd(10)} ${String(totals.edits).padEnd(7)} ${String(totals.cmds).padEnd(10)} ${String(totals.gates).padEnd(11)} ${totals.agents}`);
console.log(`  gate runs are ATTEMPTS (exit codes live in the verify output, not hook events)\n`);

if (append) {
  const line = { t: Date.now(), from: t0, to: t1, wallMs: t1 - t0, ...totals,
    stages: segments.map((s) => ({ stage: s.stage, ms: s.end - s.start, edits: s.edits, gates: s.gates })) };
  appendFileSync(join(repo, '.office', 'run-metrics.jsonl'), JSON.stringify(line) + '\n');
  console.log(`  appended → .office/run-metrics.jsonl\n`);
}
