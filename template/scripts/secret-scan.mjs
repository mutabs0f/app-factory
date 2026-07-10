#!/usr/bin/env node
// secret-scan.mjs — fail if a real secret VALUE appears anywhere in the repo.
// Full-repo scan by default; `--changed` scans only git-changed/untracked files
// (used by the PostToolUse write-time hook). Exit 0 = clean, 2 = secret found
// (exit 2 so the hook feeds stderr back to Claude).
//
// It matches secret VALUES, not the words that describe them — so docs and the
// Supabase config can mention roles like `service_role` without tripping it. The
// legacy service_role JWT is caught precisely by decoding the token's payload
// (which distinguishes it from the harmless anon/publishable key).
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

const ROOT = process.cwd();
const CHANGED = process.argv.includes('--changed');

const PATTERNS = [
  { name: 'Supabase secret key', re: /sb_secret_[A-Za-z0-9_-]{16,}/ },
  { name: 'service_role key env var', re: /SUPABASE_SERVICE_ROLE_KEY/, allowDir: 'supabase/functions' },
  { name: 'OpenAI-style secret key', re: /\bsk-[A-Za-z0-9_-]{20,}/ },
  { name: 'Stripe secret key', re: /\b(sk|rk)_(live|test)_[A-Za-z0-9]{16,}/ },
  { name: 'AWS access key id', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'Private key block', re: /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/ },
  { name: 'GitHub token', re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36}\b/ },
  { name: 'GitHub fine-grained PAT', re: /\bgithub_pat_[A-Za-z0-9_]{60,}\b/ },
  { name: 'Google API key', re: /\bAIza[A-Za-z0-9_-]{35}\b/ },
  { name: 'Slack token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
];

const JWT_RE = /eyJ[A-Za-z0-9_-]{6,}\.([A-Za-z0-9_-]{6,})\.[A-Za-z0-9_-]{6,}/g;

// A Supabase service_role key is a JWT whose payload has "role":"service_role".
function hasServiceRoleJwt(line) {
  JWT_RE.lastIndex = 0;
  let m;
  while ((m = JWT_RE.exec(line))) {
    try {
      const json = Buffer.from(m[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
      if (/"role"\s*:\s*"service_role"/.test(json)) return true;
    } catch {
      /* not valid base64 — ignore */
    }
  }
  return false;
}

const IGNORE_DIRS = new Set([
  'node_modules', '.git', '.expo', 'dist', 'web-build', 'ios', 'android', '.vscode',
  '.temp', '.branches', // Supabase CLI scratch (gitignored; contains catalog dumps)
]);
const IGNORE_FILES = new Set(['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml']);
const ALLOW = new Set(['.env.example', 'scripts/secret-scan.mjs']);
const TEXT_EXT = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.sql', '.md',
  '.yml', '.yaml', '.txt', '.sh', '.toml', '.env', '.example', '.local',
]);

function listAllFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(entry.name)) continue;
      out.push(...listAllFiles(join(dir, entry.name)));
    } else {
      out.push(join(dir, entry.name));
    }
  }
  return out;
}

function changedFiles() {
  try {
    const opts = { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] };
    const tracked = execSync('git diff --name-only HEAD', opts);
    const untracked = execSync('git ls-files --others --exclude-standard', opts);
    const git = [...tracked.split('\n'), ...untracked.split('\n')]
      .map((f) => f.trim())
      .filter(Boolean)
      .map((f) => join(ROOT, f));
    // Always include .env-family files (gitignored, but the most likely place a
    // secret lands) so --changed and the full scan agree on scope.
    const env = ['.env', '.env.local', '.env.development.local', '.env.production.local']
      .map((f) => join(ROOT, f))
      .filter((p) => existsSync(p));
    return [...git, ...env];
  } catch {
    return null; // not a git repo yet — caller falls back to full scan
  }
}

const rel = (file) => relative(ROOT, file).replace(/\\/g, '/');

function scannable(file) {
  const r = rel(file);
  if (ALLOW.has(r)) return false;
  const base = r.split('/').pop() ?? '';
  if (IGNORE_FILES.has(base)) return false;
  if (r.split('/').some((seg) => IGNORE_DIRS.has(seg))) return false;
  const ext = base.startsWith('.env') ? '.env' : extname(base);
  return TEXT_EXT.has(ext);
}

const files = ((CHANGED ? changedFiles() : null) ?? listAllFiles(ROOT)).filter(scannable);
const findings = [];

for (const file of files) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  const r = rel(file);
  const ext = extname(r);
  text.split('\n').forEach((line, i) => {
    for (const p of PATTERNS) {
      if (p.skipExt?.includes(ext)) continue;
      if (p.allowDir && r.startsWith(p.allowDir)) continue;
      if (p.re.test(line)) findings.push({ file: r, line: i + 1, name: p.name });
    }
    if (hasServiceRoleJwt(line)) findings.push({ file: r, line: i + 1, name: 'service_role JWT' });
  });
}

if (findings.length) {
  console.error('\n  SECRET SCAN FAILED — remove these before committing:');
  for (const f of findings) console.error(`  ✗ ${f.file}:${f.line}  (${f.name})`);
  console.error('  Secrets belong in Supabase Edge Function env, never in the repo.\n');
  process.exit(2);
}

console.log(`  secret-scan: clean (${files.length} files scanned).`);
process.exit(0);
