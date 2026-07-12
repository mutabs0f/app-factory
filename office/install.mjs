#!/usr/bin/env node
// office/install.mjs — wire the AI Office event hooks into ONE app repo.
//
//   node office/install.mjs <path-to-app-repo>
//
// Writes hook entries into the app's .claude/settings.local.json (personal,
// gitignored — the guarded .claude/settings.json is never touched) and makes
// sure .office/ is gitignored. Idempotent: safe to run twice.
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const repo = resolve(process.argv[2] || '');
if (!repo || !existsSync(repo)) {
  console.error('Usage: node office/install.mjs <path-to-app-repo>');
  process.exit(1);
}

const cmd = `node "${join(HERE, 'log-event.mjs')}"`;
const hook = { type: 'command', command: cmd };
const EVENTS = ['PostToolUse', 'PreToolUse', 'UserPromptSubmit', 'SessionStart', 'Stop', 'SubagentStop'];

const claudeDir = join(repo, '.claude');
if (!existsSync(claudeDir)) mkdirSync(claudeDir, { recursive: true });
const settingsPath = join(claudeDir, 'settings.local.json');
let settings = {};
if (existsSync(settingsPath)) {
  try {
    settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
  } catch (e) {
    console.error(`Refusing to overwrite unparseable ${settingsPath}: ${e.message}`);
    process.exit(1);
  }
}
settings.hooks = settings.hooks || {};
for (const ev of EVENTS) {
  const entries = settings.hooks[ev] || [];
  const already = entries.some((m) => (m.hooks || []).some((h) => h.command === cmd));
  if (!already) {
    const matcher = ev === 'PostToolUse' || ev === 'PreToolUse' ? { matcher: '*', hooks: [hook] } : { hooks: [hook] };
    entries.push(matcher);
  }
  settings.hooks[ev] = entries;
}
writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');

const gi = join(repo, '.gitignore');
const giText = existsSync(gi) ? readFileSync(gi, 'utf8') : '';
if (!/^\.office\/?$/m.test(giText)) appendFileSync(gi, (giText.endsWith('\n') || !giText ? '' : '\n') + '.office/\n');

console.log(`AI Office hooks installed for ${repo}`);
console.log(`  events  → ${join(repo, '.office', 'events.jsonl')} (gitignored)`);
console.log(`  hooks   → ${settingsPath} (personal, not committed)`);
console.log(`Watch it: node "${join(HERE, 'serve.mjs')}" "${repo}"  → http://127.0.0.1:4180/`);
console.log(`NOTE: restart the Claude Code session in that repo so the new hooks load.`);
