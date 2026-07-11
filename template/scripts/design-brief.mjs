#!/usr/bin/env node
// design-brief.mjs — generate design/DESIGN-BRIEF.md from docs/SPEC.md.
//
// The brief is a copy-paste prompt for Claude Design (claude.ai): the app in a paragraph,
// the FULL screen list straight from SPEC (so the design can't silently drop a screen), and
// output-format instructions that make the exported zip importable by /design-import.
// Deterministic: the screen list is exactly SPEC's screen list, in order.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const SPEC = join(ROOT, 'docs', 'SPEC.md');
const OUT = join(ROOT, 'design', 'DESIGN-BRIEF.md');

if (!existsSync(SPEC)) {
  console.error('docs/SPEC.md not found — run /new-app first.');
  process.exit(1);
}
const spec = readFileSync(SPEC, 'utf8');

// Pull the bullets under a "## <heading>" until the next "## " heading.
function section(md, heading) {
  const lines = md.split('\n');
  const start = lines.findIndex((l) => new RegExp(`^##\\s+${heading}`, 'i').test(l));
  if (start < 0) return [];
  const out = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) break;
    out.push(lines[i]);
  }
  return out;
}
const firstLine = (arr, re) => (arr.find((l) => re.test(l)) || '').replace(re, '').trim();
const slugify = (s) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'screen';

// Screens: bullet list under "## Screens". "Name — what it does" or "Name: what it does".
// (design-import.mjs keeps its own copy of this parser so the two scripts stay decoupled.)
function parseScreens(md) {
  const screens = [];
  for (const raw of section(md, 'Screens')) {
    const m = raw.match(/^[-*]\s+(.+?)\s*$/); // column-0 bullets only — sub-bullets are not screens
    if (!m) continue;
    const text = m[1].trim();
    if (!text || text === '—') continue;
    const split = text.split(/\s+[—:–-]\s+/);
    const name = split[0].trim();
    const desc = split.slice(1).join(' — ').trim();
    screens.push({ name, desc, slug: slugify(name) });
  }
  return screens;
}

const appName = (spec.match(/^#\s*SPEC\s*[—:-]\s*(.+)$/m)?.[1] || '').trim() || 'this app';
const problemLines = section(spec, 'Problem');
const problem = firstLine(problemLines, /^-?\s*\*\*Problem:?\*\*\s*/i) || firstLine(problemLines, /^-\s*/);
const users = firstLine(problemLines, /^-?\s*\*\*Primary users:?\*\*\s*/i);
const brand = firstLine(section(spec, 'Brand'), /^-?\s*/) || '';
const screens = parseScreens(spec);

if (screens.length === 0) {
  console.error('No screens found in docs/SPEC.md "## Screens" — fill the screen list first.');
  process.exit(1);
}

const bodyBits = [problem, users && `Primary users: ${users}.`].filter(Boolean).join(' ');
const appPara = bodyBits
  ? `${appName} — ${bodyBits}`
  : 'A focused mobile app (fill in Problem & users in docs/SPEC.md for a richer brief).';

const screenList = screens
  .map((s, i) => `${i + 1}. **${s.name}**${s.desc ? ` — ${s.desc}` : ''}`)
  .join('\n');

const brief = `# Design brief — ${appName} (paste into Claude Design on claude.ai)

> Copy everything **below the line** into Claude Design (https://claude.ai → new chat → Design).
> When every screen looks right, use its **export/download** to get a ZIP, drop that ZIP into
> this project's \`design/input/\` folder, then run \`/design-import\`.

---

Design a mobile app: **${appName}**.

${appPara}

**Target device:** iPhone, portrait orientation only.
**Languages:** bilingual **English + Arabic**, with real right-to-left (RTL) layouts for Arabic — mirror the entire layout, not just the text.
**Brand direction:** ${brand || 'clean, modern, calm; pick one tasteful accent color and a neutral background. No specific brand supplied.'}

**Design every one of these screens** (this is the complete list from the product spec — design ALL of them; if any is unclear, ask me rather than dropping or inventing one):

${screenList}

## How to structure your output (important — this is what makes the export importable)
Produce these as separate artifacts:
- **One artifact per screen**, self-contained **JSX**, filename \`<screen-slug>.jsx\` (e.g. \`${screens[0].slug}.jsx\`). Inline everything — **no external images, fonts, or CDN links**; use simple colored shapes or emoji for any imagery.
- **\`tokens.jsx\`** — the design system as exported constants: colors (every color as a **hex** value), the type scale, the spacing scale, and corner radii.
- **\`manifest.md\`** — a list of every screen file and how the user navigates between the screens.
- Use **realistic placeholder data**: real-looking **Arabic names**, **SAR** amounts, plausible dates — never "lorem ipsum".

When all ${screens.length} screens look right, **export/download the project as a ZIP.**
`;

mkdirSync(join(ROOT, 'design'), { recursive: true });
writeFileSync(OUT, brief);
console.log(`Wrote design/DESIGN-BRIEF.md — ${screens.length} screen(s): ${screens.map((s) => s.name).join(', ')}`);
console.log('Next: paste it into Claude Design (claude.ai), export the ZIP, drop it into design/input/, then run /design-import.');
