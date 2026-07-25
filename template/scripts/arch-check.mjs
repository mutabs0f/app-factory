#!/usr/bin/env node
// arch-check.mjs — makes the architecture rules MECHANICAL instead of advisory.
//
// CLAUDE.md declares "seven mechanical rules" but nothing enforced them: eslint loads
// only the Expo defaults (and ignores scripts/ entirely), so an agent could violate every
// structural rule and still get a green gate. That is "anti-spaghetti by instruction, not
// by enforcement" — the same shape of failure as the predecessor pipeline, whose rules
// also lived in prose. This script is the enforcement.
//
// Pure static import analysis. No new dependency.
//
//   node scripts/arch-check.mjs            check, exit 0/1
//   node scripts/arch-check.mjs --graph    also print the dependency graph
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');
const violations = [];
const add = (rule, file, detail) => violations.push({ rule, file, detail });

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e.name) && !e.name.endsWith('.d.ts')) out.push(p);
  }
  return out;
}

const rel = (f) => relative(ROOT, f).replace(/\\/g, '/');
const files = walk(SRC);

// Extract import/export-from specifiers. Regex is sufficient here: this codebase is ESM
// with top-of-file imports, and TypeScript strict would reject anything exotic.
function importsOf(text) {
  const specs = [];
  const re = /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(text))) specs.push(m[1]);
  const bare = /(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g;
  while ((m = bare.exec(text))) specs.push(m[1]);
  return specs;
}

// Resolve '@/x' → src/x, and relative paths, to a real file when we can.
function resolveSpec(spec, fromFile) {
  let base = null;
  if (spec.startsWith('@/')) base = join(SRC, spec.slice(2));
  else if (spec.startsWith('.')) base = resolve(dirname(fromFile), spec);
  else return null; // package import — not our concern
  for (const c of [base, base + '.ts', base + '.tsx', join(base, 'index.ts'), join(base, 'index.tsx')])
    if (existsSync(c) && statSync(c).isFile()) return c;
  return base; // unresolved (may not exist yet) — still usable for layer rules
}

const graph = new Map();

for (const file of files) {
  const r = rel(file);
  const text = readFileSync(file, 'utf8');
  const specs = importsOf(text);
  const resolved = [];

  const isRoute = r.startsWith('src/app/');
  const isApi = /\/api\.tsx?$/.test(r);
  const isLib = r.startsWith('src/lib/');
  const isTest = /\.(test|spec)\.tsx?$/.test(r);
  // `_layout.tsx` is the app SHELL, not a screen route: providers, the auth gate and the
  // navigator legitimately live there. Holding it to the thin-route limit was wrong.
  const isLayout = /(^|\/)_layout\.tsx$/.test(r);
  const feature = (r.match(/^src\/features\/([^/]+)\//) || [])[1] || null;

  // ── Rule 1: `supabase` is reachable ONLY from src/lib/* and a feature's api.ts.
  // This is the one that actually protects the data layer — a component holding a
  // client can bypass every hook, every type, and every cache.
  // Tests are exempt: mocking the client is how the data layer gets tested at all.
  if (/from\s*['"]@\/lib\/supabase['"]/.test(text) && !isLib && !isApi && !isTest)
    add('supabase-boundary', r, 'imports @/lib/supabase — allowed only in src/lib/* and src/features/*/api.ts');

  // ── Rule 2: a feature's PUBLIC surface is its hooks. Importing another feature's
  // `hooks` is normal and healthy (a home screen showing profile data is not a defect).
  // Importing another feature's `api` reaches past its boundary into its internals —
  // that is the coupling that makes features impossible to change independently.
  // Banning all cross-feature edges would just push everything into lib/, which is worse.
  for (const s of specs) {
    const m = s.match(/^@\/features\/([^/]+)\/(.+)$/);
    if (!m || !feature || m[1] === feature) continue;
    if (m[2] !== 'hooks')
      add('feature-boundary', r, `imports @/features/${m[1]}/${m[2]} — only another feature's "hooks" is public; everything else is its internals`);
  }

  // ── Rule 3: routes are thin. A route re-exports a screen; it holds no logic.
  if (isRoute && !isLayout) {
    const code = text.split('\n').filter((l) => l.trim() && !l.trim().startsWith('//')).length;
    if (code > 25) add('thin-route', r, `${code} code lines — routes re-export a screen from src/features, they do not hold logic`);
    if (/@\/lib\/supabase|useQuery|useMutation/.test(text))
      add('thin-route', r, 'route contains data logic — move it into the feature screen/hook');
  }

  // ── Rule 4: no barrel index re-exports (they hide cycles and defeat tree-shaking).
  if (/^src\/(features|lib|components)\/[^/]+\/index\.tsx?$/.test(r) && /export\s+\*/.test(text))
    add('no-barrel', r, 'barrel index re-export — import the concrete module instead');

  // ── Rule 5: shared components stay generic. Anything in src/components/ that imports a
  // FEATURE is not a shared component — it is a feature's screen living in the wrong place.
  if (r.startsWith('src/components/'))
    for (const s of specs) {
      const m = s.match(/^@\/features\/([^/]+)\//);
      if (m) add('shared-stays-generic', r, `src/components/ imports feature "${m[1]}" — move this into that feature`);
    }

  for (const s of specs) {
    const t = resolveSpec(s, file);
    if (t && t.startsWith(SRC)) resolved.push(rel(t));
  }
  graph.set(r, resolved);
}

// ── Rule 6: no import cycles. A cycle means there is no safe order to change things in.
const WHITE = 0, GREY = 1, BLACK = 2;
const colour = new Map([...graph.keys()].map((k) => [k, WHITE]));
const cycles = [];
function visit(node, stack) {
  colour.set(node, GREY);
  for (const next of graph.get(node) || []) {
    if (!graph.has(next)) continue;
    const c = colour.get(next);
    if (c === GREY) cycles.push([...stack.slice(stack.indexOf(next)), next].join(' → '));
    else if (c === WHITE) visit(next, [...stack, next]);
  }
  colour.set(node, BLACK);
}
for (const n of graph.keys()) if (colour.get(n) === WHITE) visit(n, [n]);
for (const c of [...new Set(cycles)]) add('no-cycles', c.split(' → ')[0], `import cycle: ${c}`);

if (process.argv.includes('--graph')) {
  console.log('\n  dependency graph');
  for (const [f, deps] of graph) if (deps.length) console.log(`  ${f}\n${deps.map((d) => `      → ${d}`).join('\n')}`);
}

const byRule = violations.reduce((a, v) => ((a[v.rule] ??= []).push(v), a), {});
if (violations.length) {
  console.error(`\n  arch-check: ${violations.length} violation(s) across ${Object.keys(byRule).length} rule(s)\n`);
  for (const [rule, vs] of Object.entries(byRule)) {
    console.error(`  [${rule}]`);
    for (const v of vs) console.error(`     ${v.file}: ${v.detail}`);
  }
  console.error('');
  process.exit(1);
}
console.log(`  arch-check: clean (${files.length} files, ${[...graph.values()].flat().length} internal imports, 0 cycles)`);
process.exit(0);
