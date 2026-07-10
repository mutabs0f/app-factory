#!/usr/bin/env node
// scripts/doctor.mjs — Phase 0 preflight environment checks (doc 06).
// Re-runnable and honest: exits 0 ONLY when every PC-side check passes.
// Never fabricates a pass. The Supabase MCP connection and Expo Go on the
// iPhone are confirmed separately (human/assistant), not by this script.
import { execSync } from 'node:child_process';

const results = [];
const add = (name, ok, detail) => results.push({ name, ok, detail });

const sh = (cmd) =>
  execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', windowsHide: true }).trim();

// A tool installed after this shell started won't be on the inherited PATH.
// Pull the live PATH from the registry so freshly-installed tools (gh, Docker)
// are visible — prevents a FALSE red for something that is actually installed.
function refreshWindowsPath() {
  if (process.platform !== 'win32') return;
  try {
    const live = execSync(
      `powershell -NoProfile -Command "[Environment]::ExpandEnvironmentVariables(([Environment]::GetEnvironmentVariable('Path','Machine')) + ';' + ([Environment]::GetEnvironmentVariable('Path','User')))"`,
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }
    ).trim();
    if (live) process.env.PATH = live + ';' + (process.env.PATH || '');
  } catch {
    /* keep the inherited PATH if the refresh fails */
  }
}
refreshWindowsPath();

const semver = (s) => {
  const m = /(\d+)\.(\d+)\.(\d+)/.exec(s || '');
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
};
const gte = (a, b) => {
  for (let i = 0; i < 3; i++) {
    if ((a[i] || 0) > (b[i] || 0)) return true;
    if ((a[i] || 0) < (b[i] || 0)) return false;
  }
  return true;
};

// 1. Node >= 20 (the node actually running this script)
{
  const v = semver(process.version);
  add('node >= 20', !!(v && gte(v, [20, 0, 0])), process.version);
}

// Generic command check. `min` (optional) requires a semver >= min in output.
function cmdCheck(name, cmd, { min } = {}) {
  try {
    const out = sh(cmd);
    const first = (out.split('\n')[0] || '').trim();
    if (min) {
      const v = semver(out);
      if (!v || !gte(v, min)) {
        add(name, false, `${first || '(no version)'} — need >= ${min.join('.')}`);
        return;
      }
    }
    add(name, true, first || 'ok');
  } catch (e) {
    const msg = ((e.stderr || e.stdout || e.message || '') + '').trim().split('\n')[0];
    add(name, false, msg || 'not found / failed');
  }
}

cmdCheck('git', 'git --version');
cmdCheck('gh authenticated', 'gh auth status 2>&1'); // exit 0 only when logged in
cmdCheck('docker daemon', 'docker info --format "{{.ServerVersion}}"');
// Exercise the real worker binary (supabase-go), not just the shim — the shim
// reports a version even when supabase-go is missing (a vacuous green we hit once).
cmdCheck('supabase cli', 'supabase-go --version');
cmdCheck('claude >= 2.1.154', 'claude --version', { min: [2, 1, 154] });

// Report
let allOk = true;
const line = '  ' + '-'.repeat(52);
console.log('\n  Preflight doctor — app-factory');
console.log(line);
for (const r of results) {
  if (!r.ok) allOk = false;
  console.log(`  [${r.ok ? 'PASS' : 'FAIL'}] ${r.name.padEnd(20)} ${r.detail}`);
}
console.log(line);
console.log(
  allOk
    ? '  All PC-side checks green. (Confirm Supabase MCP + Expo Go separately.)\n'
    : '  RED — fix the FAILs above before advancing past Phase 0.\n'
);
process.exit(allOk ? 0 : 1);
