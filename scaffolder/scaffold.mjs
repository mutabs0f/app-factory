#!/usr/bin/env node
// scaffold.mjs <slug> — deterministically clone the app-factory template into a
// new app repo (copy, rename identifiers, git init + first commit). The slower /
// interactive steps (npm install, skills add, gh repo create, Supabase, SMTP) are
// guided by the new-app-project SKILL.md, not done here.
import { execSync } from 'node:child_process';
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const slug = process.argv[2];
if (!slug || !/^[a-z][a-z0-9-]*$/.test(slug)) {
  console.error('Usage: node scaffold.mjs <slug>   (lowercase letters, digits, hyphens)');
  process.exit(1);
}

const AGENTS = 'C:\\Users\\Thinkpad\\Agents';
const TEMPLATE = join(AGENTS, 'app-factory', 'template');
const DEST = join(AGENTS, slug);

if (!existsSync(TEMPLATE)) {
  console.error(`Template not found at ${TEMPLATE}`);
  process.exit(1);
}
if (existsSync(DEST)) {
  console.error(`Refusing to overwrite existing ${DEST}`);
  process.exit(1);
}

const EXCLUDE_BASE = new Set([
  'node_modules', '.expo', 'dist', 'web-build', '.git', '.agents', 'ios', 'android',
  '.verify-pass', '.env',
]);

cpSync(TEMPLATE, DEST, {
  recursive: true,
  filter: (src) => {
    const parts = src.split(/[\\/]/);
    const base = parts[parts.length - 1];
    if (EXCLUDE_BASE.has(base)) return false;
    // Skip the .claude/skills symlink dir — reinstalled via `npx skills add`.
    if (base === 'skills' && parts[parts.length - 2] === '.claude') return false;
    return true;
  },
});

// Rename identifiers. Bundle id must be alphanumeric-only per segment.
const bundleId = `com.appfactory.${slug.replace(/-/g, '')}`;

const appJsonPath = join(DEST, 'app.json');
let appJson = readFileSync(appJsonPath, 'utf8');
appJson = appJson.replaceAll('"template"', `"${slug}"`).replaceAll('com.appfactory.template', bundleId);
writeFileSync(appJsonPath, appJson);

const pkgPath = join(DEST, 'package.json');
let pkg = readFileSync(pkgPath, 'utf8');
pkg = pkg.replace(/"name":\s*"template"/, `"name": "${slug}"`);
writeFileSync(pkgPath, pkg);

// Fresh git repo on main + a first commit (respects the copied .gitignore).
const git = (cmd) => execSync(cmd, { cwd: DEST, stdio: ['ignore', 'ignore', 'inherit'] });
git('git init -q');
try {
  git('git symbolic-ref HEAD refs/heads/main');
} catch {
  /* older git: default branch is fine */
}
git('git add -A');
try {
  git('git commit -q -m "chore: scaffold from app-factory template"');
} catch {
  console.error('First commit failed — set git user.name/email, then commit manually.');
}

console.log(`\nScaffolded ${DEST}  (bundle id: ${bundleId})\n`);
console.log('Next (see the new-app-project skill for the guided version):');
console.log(`  cd ${DEST}`);
console.log('  npm install');
console.log('  npx skills add supabase/agent-skills');
console.log('  # gh repo create <slug> --source . --push   (ask Basim public/private)');
console.log('  # copy .env.example -> .env, fill in the dev Supabase URL + publishable key');
console.log('  # connect Resend SMTP on the Supabase project (email OTP needs it)');
console.log('  supabase start');
console.log('  # then in Claude Code:  /new-app "<your idea>"');
