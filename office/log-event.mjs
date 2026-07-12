#!/usr/bin/env node
// office/log-event.mjs — Claude Code hook sink for the AI Office viewer.
//
// Wired via .claude/settings.local.json (see office/install.mjs). Claude Code
// pipes the hook payload as JSON on stdin; we append ONE compact line to
// <project>/.office/events.jsonl and always exit 0 — the office is a window,
// never a gate. No key-shaped values are ever written: we record tool names,
// file paths, and short summaries only, never tool arguments wholesale.
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

function summarize(p) {
  const tool = p.tool_name || '';
  const input = p.tool_input || {};
  switch (p.hook_event_name) {
    case 'UserPromptSubmit':
      return String(p.prompt || '').slice(0, 100);
    case 'PreToolUse':
    case 'PostToolUse':
      if (tool === 'Edit' || tool === 'Write' || tool === 'NotebookEdit') return String(input.file_path || '');
      if (tool === 'Read') return String(input.file_path || '');
      if (tool === 'Bash' || tool === 'PowerShell') return String(input.command || '').slice(0, 100);
      if (tool === 'Task' || tool === 'Agent') return String(input.description || input.prompt || '').slice(0, 100);
      if (tool === 'Skill') return String(input.skill || '');
      if (tool === 'Glob' || tool === 'Grep') return String(input.pattern || '').slice(0, 80);
      return '';
    case 'SubagentStop':
      return String(p.agent_type || p.subagent_type || '');
    default:
      return '';
  }
}

try {
  let raw = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) raw += chunk;
  const p = JSON.parse(raw || '{}');
  const dir = join(p.cwd || process.cwd(), '.office');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const file = join(dir, 'events.jsonl');
  // rotate: keep the tail when the log grows past ~2 MB
  if (existsSync(file) && statSync(file).size > 2 * 1024 * 1024) {
    const lines = readFileSync(file, 'utf8').split('\n');
    writeFileSync(file, lines.slice(-1000).join('\n'));
  }
  const evt = {
    t: Date.now(),
    e: p.hook_event_name || 'unknown',
    tool: p.tool_name || undefined,
    s: summarize(p) || undefined,
    sid: (p.session_id || '').slice(0, 8) || undefined,
  };
  appendFileSync(file, JSON.stringify(evt) + '\n');
} catch {
  /* never block the session */
}
process.exit(0);
