#!/usr/bin/env node
// scaffold.mjs <slug> — deterministically clone the app-factory template into a
// new app repo (copy, rename identifiers, git init + first commit). The slower /
// interactive steps (npm install, skills add, gh repo create, Supabase, SMTP) are
// guided by the new-app-project SKILL.md, not done here.
import { execSync } from 'node:child_process';
import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
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
  // Drop the skills lockfile so `npx skills add` does a REAL install into the fresh app
  // instead of no-op'ing against stale recorded hashes (the guardrail skills would
  // otherwise never land on disk while the command still reports success).
  'skills-lock.json',
]);

cpSync(TEMPLATE, DEST, {
  recursive: true,
  filter: (src) => {
    const parts = src.split(/[\\/]/);
    const base = parts[parts.length - 1];
    if (EXCLUDE_BASE.has(base)) return false;
    // Skip only the INSTALLED agent-skill symlinks under .claude/skills (they are
    // reinstalled per app via `npx skills add`, and are broken symlinks if copied).
    // The factory's OWN skills (build/, new-app/, review/, …) ARE copied so each
    // app can run the stages. The `skills` parent guard keeps supabase/migrations/.
    if (parts[parts.length - 2] === 'skills' &&
        (base === 'supabase' || base === 'supabase-postgres-best-practices')) return false;
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

// Local Supabase stack name — rewrite so each app's `supabase start` is isolated.
// A shared project_id means two apps' local stacks collide on Docker container
// names / ports if they run at once. (Ports are NOT offset, so still only run one
// app's local stack at a time — the factory model is one Claude session per app.)
const cfgPath = join(DEST, 'supabase', 'config.toml');
if (existsSync(cfgPath)) {
  const cfg = readFileSync(cfgPath, 'utf8').replace(/^project_id = "template"$/m, `project_id = "${slug}"`);
  writeFileSync(cfgPath, cfg);
}

// Keep package-lock's name in sync with package.json so the first `npm install` does
// not immediately rewrite the lockfile and dirty the just-scaffolded commit.
const lockPath = join(DEST, 'package-lock.json');
if (existsSync(lockPath)) {
  const lock = readFileSync(lockPath, 'utf8').replaceAll('"name": "template"', `"name": "${slug}"`);
  writeFileSync(lockPath, lock);
}

// Cosmetic: the new app's README should name the app, not the factory template.
const readmePath = join(DEST, 'README.md');
if (existsSync(readmePath)) {
  const readme = readFileSync(readmePath, 'utf8').replace(/^# App Factory Template.*$/m, `# ${slug}`);
  writeFileSync(readmePath, readme);
}

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
console.log('  #   then CONFIRM the guardrail skills actually landed (skills add can no-op):');
console.log('  #   ls .claude/skills/supabase .claude/skills/supabase-postgres-best-practices');
console.log('  # cp .mcp.json.example .mcp.json   + set SUPABASE_ACCESS_TOKEN in your env');
console.log('  # put your DEV Supabase project ref in .dev-branch (the push guard needs it)');
console.log('  # gh repo create <slug> --source . --push   (ask Basim public/private)');
console.log('  # copy .env.example -> .env, fill in the dev Supabase URL + publishable key');
console.log('  # connect Resend SMTP on the Supabase project (email OTP needs it)');
console.log('  supabase start');
console.log('  # then in Claude Code:  /new-app "<your idea>"');
