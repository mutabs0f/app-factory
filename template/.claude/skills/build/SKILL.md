---
name: build
description: Wire screens to Supabase under a /goal loop whose only exit is `node scripts/verify.mjs` exiting 0. Use for stage S3 (BUILD) — implementing features against the schema. Never report done without a green verify in this session.
---

# /build — S3 BUILD (the goal loop)

Wire the app's screens to Supabase (per-feature `api.ts` + `hooks.ts`, generated types, RLS-backed queries) until the deterministic gate is green.

## Before you start
- Read `LESSONS.md` (repo root) and `docs/SPEC.md`.
- Bring the local stack up: `supabase start`.

## Run the loop
Start a goal loop whose ONLY exit condition is the gate:

    /goal node scripts/verify.mjs exits 0 (typecheck, lint, jest, expo export, db reset + RLS/GRANT/definer coverage, secret scan, types-freshness all green), or stop after 8 turns

The evaluator (a fast model) checks the condition after every turn. You run `node scripts/verify.mjs` yourself each turn to iterate — ITS output is your retry feedback, and ITS exit code is the verdict. **Your claim of "done" is a hint, never the verdict.** (Requires Claude Code with `/goal`; if unavailable, re-run `/build` manually against the verify output until green.)

## Hard rules
1. **Never report a feature done unless `node scripts/verify.mjs` exited 0 in THIS session** — show the output.
2. **Every schema change is a migration** (`node scripts/new-migration.mjs <name>`), never the dashboard. The scaffold includes RLS + policies + matching GRANTs; after applying, regenerate `database.types.ts` and run `get_advisors`.
3. **The seven mechanical rules** (CLAUDE.md) hold: `import { supabase }` only in `src/lib/*` and `src/features/*/api.ts`; routes are thin re-exports of feature screens; every `api.ts` function has an explicit generated-type return; absolute `@/` imports; no barrel `index.ts`.
4. **Encode every multi-attempt fix**: whenever the loop needs more than one attempt to go green, append ONE line to `LESSONS.md` — failure signature → winning fix. Mechanical, not optional.
5. **Do NOT weaken the gate to make it pass.** `verify.mjs` / `guard-bash.mjs` / `.claude/settings.json` are protected; a PreToolUse hook blocks edits to them. Fix the code, never the check.

## If the loop can't go green in 8 turns
Stop honestly. Report the real failing-check output to Basim — never paper over it. A missing or failing result is a halt, not something to hide.

## UI changes
For any screen change, also run the `verify-app` on-device pass (open the changed screen in Expo Go via `/preview`, exercise it, check the Metro console) before calling it done — `expo export` proves it bundles, not that it works.
