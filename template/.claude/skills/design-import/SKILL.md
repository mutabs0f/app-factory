---
name: design-import
description: Translate whatever Basim dropped in design/input/ (JSX/HTML, screenshots, or a written description) into mock-data Expo screens, faithfully — zero design changes. Use for stage S2 (DESIGN), before /preview.
---

# /design-import — S2 DESIGN (faithful translation)

> **Before you do anything in this stage:**  `node scripts/stage-guard.mjs --enter design-import`
> It refuses if the prerequisites are unmet or you are not inside an app repo — both
> real failures that have happened. When the stage is finished:
> `node scripts/stage-guard.mjs --complete design-import`

You are a **translator, not a designer.** Reproduce the input as given — layout, spacing, colors, copy, order. **Zero "improvements."** Every screen is scaffolded with MOCK data; **no Supabase wiring** here (that is S3 `/build`).

## Before you start
- Read `docs/SPEC.md` (the screen list is authoritative) and `LESSONS.md` (repo root).

## 1. Import & reconcile the design zip (never invent a missing screen)
Basim designs the app in Claude Design (from the `/new-app` brief) and drops the exported ZIP into `design/input/`. Run:
```
node scripts/design-import.mjs
```
It extracts the zip, validates the bundle (`tokens.jsx` + one `.jsx` per screen, optional `manifest.md`), reconciles the screens against SPEC, and records the zip filename+hash in `docs/REVIEW-LOG.md`. Act on the exit code — **never proceed silently past a gap**:
- **3** (no zip) → Basim hasn't dropped it: point him at `design/DESIGN-BRIEF.md` → claude.ai → export ZIP → `design/input/`.
- **2** (malformed or unsafe bundle) → re-export a clean zip: needs `tokens.jsx` + screen files, and no path-traversal / symlink entries.
- **1** (gap) → one or more SPEC screens have NO design. **STOP and ask Basim** per missing screen: re-design it in Claude Design, or let you scaffold it plainly. Do not invent it.
- **0** → every SPEC screen has a match in `design/input/_extracted/`. Proceed.
- **4** (SPEC precondition) → `docs/SPEC.md` is missing or has no screen list: run `/new-app` first — don't import against nothing.

The extracted files (per-screen JSX + `tokens.jsx`) are your source. Map JSX/HTML primitives to React Native: `div`→`View`, `p`/`span`/`h*`→`Text`, `img`→`expo-image`, `button`→`Pressable`, `input`→`TextInput`; keep every color/spacing value as a literal from `tokens.jsx`. If Basim dropped raw screenshots or a written description instead of a Claude Design zip, translate those directly (no import step).

## Translate (faithful)
1. For each screen in SPEC's screen list, build a screen component under `src/features/<feature>/<Screen>.tsx`; add a thin re-export route in `src/app/`.
2. Match the input **exactly**: same layout structure, same spacing/padding, same colors (as literal values), same copy in the same language (EN/AR per SPEC), same element order. Do not restyle, rename, re-order, or "clean up."
3. Feed each screen **local mock data** shaped like the eventual rows — hard-coded constants in the component or a `mocks.ts`. No `supabase` import anywhere; no `api.ts`/`hooks.ts` yet.
4. Reproduce every state the input shows (empty, loading, error, populated) with mock toggles; don't invent states it doesn't show.

## Concerns go in a note — NEVER into the design
When something is ambiguous, contradictory, inconsistent, or looks wrong (clashing colors, unreachable screen, missing state, RTL/i18n gap), **do not silently resolve it by changing the design.** Reproduce it as given and log it, one line each, in `design/translation-notes.md` (create it): what you saw → why it's a concern → what you'd need to decide it. Basim resolves these; you don't.

## Gate before handoff (all must be clean)
Translation is not done until, in THIS session:
1. `npx tsc --noEmit` — zero type errors.
2. `npx eslint .` — zero lint errors (catches structural / mechanical-rule issues at the stage that introduces them, so they don't accumulate into BUILD).
3. `npx expo export --platform ios` — bundles with zero errors.

Show the output. A missing or red result halts — never paper over it. `expo export` proves it bundles, not that it looks right; the real design check is Basim's eyes in `/preview`.

## Hand off
Point Basim to `/preview` (Gate #1 — he walks every screen on his phone) and surface `design/translation-notes.md` for any decisions. Do not start `/build` until the screens are visually approved.
