---
name: build
description: Wire screens to Supabase under a /goal loop whose only exit is `node scripts/verify.mjs` exiting 0. Use for stage S3 (BUILD) — implementing features against the schema. Never report done without a green verify in this session.
---

# /build — S3 BUILD (the goal loop)

> **Before you do anything in this stage:**  `node scripts/stage-guard.mjs --enter build`
> It refuses if the prerequisites are unmet or you are not inside an app repo — both
> real failures that have happened. When the stage is finished:
> `node scripts/stage-guard.mjs --complete build`

Wire the app's screens to Supabase (per-feature `api.ts` + `hooks.ts`, generated types, RLS-backed queries) until the deterministic gate is green.

## Before you start
- Read `LESSONS.md` (repo root) and `docs/SPEC.md`.
- Bring the local stack up: `supabase start`.

## Run the loop
Start a goal loop whose ONLY exit condition is the gate:

    /goal node scripts/verify.mjs exits 0 (all 21 checks green — typecheck, lint, jest, architecture, bundle builds, the app actually runs, both secret scans, dependency audit, decisions resolved, env complete, migration replay, RLS coverage + isolation, definer exposure, table GRANTs, anon reachability, storage privacy, types freshness), or stop after 8 turns

The evaluator (a fast model) checks the condition after every turn. You run `node scripts/verify.mjs` yourself each turn to iterate — ITS output is your retry feedback, and ITS exit code is the verdict. **Your claim of "done" is a hint, never the verdict.** (Requires Claude Code with `/goal`; if unavailable, re-run `/build` manually against the verify output until green.)

## Hard rules
1. **Never report a feature done unless `node scripts/verify.mjs` exited 0 in THIS session** — show the output.
2. **Every schema change is a migration** (`node scripts/new-migration.mjs <name>`), never the dashboard. The scaffold includes RLS + policies + matching GRANTs; after applying, regenerate `database.types.ts` and run `get_advisors`.
3. **The seven mechanical rules** (CLAUDE.md) hold: `import { supabase }` only in `src/lib/*` and `src/features/*/api.ts`; routes are thin re-exports of feature screens; every `api.ts` function has an explicit generated-type return; absolute `@/` imports; no barrel `index.ts`.
4. **Encode every multi-attempt fix**: whenever the loop needs more than one attempt to go green, append ONE line to `LESSONS.md` — failure signature → winning fix. Mechanical, not optional.
5. **Do NOT weaken the gate to make it pass.** `verify.mjs` / `guard-bash.mjs` / `.claude/settings.json` are protected; a PreToolUse hook blocks edits to them. Fix the code, never the check.

## Consult the specialists BEFORE you write, not after review rejects it

Three domain specialists (all Opus 5) design; **you implement**. This split is deliberate:
malaki failed because isolated agents each wrote their own half and the contracts drifted.
One executor writing against specialist designs keeps the app coherent.

| Call | When |
|---|---|
| **`api-designer`** | Any NEW operation, or a third-party call. It decides where the operation lives — direct table access vs Postgres RPC vs Edge Function — and returns the contract, including what failure looks like. |
| **`backend-engineer`** | Any schema change, RPC, or Edge Function. It owns constraints, indexes, RLS correctness and query cost — the things that are expensive to change once data exists. |
| **`frontend-engineer`** | Any new screen or feature. It owns screen architecture, the four states every screen owes the user (loading/empty/error/content), Arabic/RTL, accessibility labels and perceived speed. |

Call one **before** building the thing, with the SPEC section and the relevant files —
not after the fact. A design consult is cheap; rebuilding a feature is not. Do not call
all three out of habit: a screen that reads one existing table needs none of them.

## Escalate up, don't spin (the executor/advisor pattern)
You are the executor; the `advisor` subagent (Fable 5) is the thinker you call when stuck:
- **Trigger:** the SAME check fails twice with the same signature, or a bug survives two
  fix attempts, or you face an either-or where picking wrong is expensive to undo.
- **Call it ONCE per stuck signature** with: the failing check's real output, the failure
  signature, what you already tried, and the relevant file paths. Apply its plan in this
  loop yourself — the advisor diagnoses, you edit.
- **Never delegate routine building to subagents** — on a subscription, workers re-reading
  context costs more than doing the work here. Escalate up rarely; execute down here always.
- If the advisor's plan wins, the `LESSONS.md` line (rule 4) records its diagnosis as the fix.

## If the loop can't go green in 8 turns
Stop honestly. Report the real failing-check output to Basim — never paper over it. A missing or failing result is a halt, not something to hide. (If you never consulted the `advisor`, that's the first question Basim will ask — use it before you burn the turn budget.)

## UI changes
For any screen change, also run the `verify-app` on-device pass (open the changed screen in Expo Go via `/preview`, exercise it, check the Metro console) before calling it done — `expo export` proves it bundles, not that it works.
