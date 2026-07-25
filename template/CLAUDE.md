@AGENTS.md

# App Factory Template — Operating Rules (read first, every stage)

This repo builds a mobile app on **Expo SDK 54 + Supabase** (thin-client model).
**Before starting any stage, read [LESSONS.md](LESSONS.md).**

## Non-negotiable principles
1. **Never fabricate a success signal.** No "done" without evidence. A missing result is a failure that halts — never something to paper over.
2. **The only verdict is `node scripts/verify.mjs` exiting 0**, run by you each turn — not self-reported. A claim of "done" is a hint, never the verdict.
3. **Verify inside the loop, not at the end.** Fix errors at their source.
4. **One source of truth per fact.** Schema lives in `supabase/migrations/`; types are generated from it (`src/types/database.types.ts`); screens consume the generated types. Never two implementations of anything.
5. **Fresh-context review.** Code review is done by a subagent / `/code-review` that did not write the code.
6. **Encode every fix.** When a `/goal` loop needs more than one attempt, append the failure signature + winning fix to `LESSONS.md`.

## The stack (fixed — no "OR"s)
- **Client:** Expo SDK 54 (pinned), TypeScript strict, expo-router. `@/*` → `./src/*`.
- **Data & auth:** Supabase via `@supabase/supabase-js`. **Postgres RLS is the only authorization layer; the client is untrusted.**
- **Auth:** email OTP — `signInWithOtp({email})` → `verifyOtp({email, token, type:'email'})` (first-time users fall back to `type:'signup'`, gated on the error — see `src/features/auth/api.ts`). No magic links, no deep links. **Requires custom SMTP** — the free built-in email can't deliver codes; provision Resend per project (see `docs/DECISIONS.md`).
- **Session storage:** `LargeSecureStore` (`src/lib/storage.ts`) — ships in the template, reused as-is.
- **Server logic:** Postgres `.rpc()` for atomic multi-statement ops; **Edge Functions only** for third-party secrets, signed webhooks, or server-authoritative logic (money, credits, cross-user writes).
- **Schema changes:** only by adding files to `supabase/migrations/` (never the dashboard). After each migration, regenerate types and run `get_advisors`.
- **A PAUSED Supabase project fakes a perfect security score.** Free-tier projects go `INACTIVE` after ~a week idle, and `get_advisors` on one returns `{"lints":[]}` — indistinguishable from "zero findings". **Always `list_projects` and confirm `status: ACTIVE_HEALTHY` before believing any advisor result.** An empty `lints` from a non-active project is a missing signal, and a missing signal is a failure that halts (principle #1) — never a pass.

## The seven mechanical rules
1. `src/app/` holds only route files; every route is a thin re-export of a screen from `src/features/`.
2. `import { supabase }` only in `src/lib/*` and `src/features/*/api.ts`. Screens/components use the feature's hooks.
3. Every `api.ts` function has an explicit return type built from `database.types.ts`.
4. Schema changes only via `supabase/migrations/`; regenerate types + advisors after each.
5. Every new-table migration includes RLS + per-op policies + policy-column indexes + **matching `GRANT`s** (policies alone don't grant access under Supabase's always-revoked default) — scaffold with `node scripts/new-migration.mjs <name>`.
6. Absolute `@/` imports across layers; no barrel `index.ts` re-exports.
7. A new external secret ⇒ a new Edge Function. Never a key in the app.

## The gate — `node scripts/verify.mjs`
**21 checks** (22 when DECISIONS resolves Delivery to PWA — the web bundle is checked too).
Code: typecheck · lint · jest · **architecture** (import boundaries, feature encapsulation, no
cycles) · delivery bundle builds · **the app actually runs** (`runtime-check.mjs` serves the web
build and walks every route in a browser: content mounted, zero console errors, zero failed
requests) · secret scan of source · secret scan of the **shipped bundle** · dependency audit
(fails on CRITICAL only — see the note in verify.mjs) · every DECISIONS "X or Y" resolved ·
required keys present.
Database: migration replay from zero · RLS coverage · definer-fn exposure · table GRANTs ·
**anon-role reachability** · no user-editable claims in policies · storage buckets private ·
**RLS cross-user isolation** (static + a runtime impersonation probe) · generated-types freshness.

**Docker is optional.** The DB half runs against the local stack (`supabase start`) OR a cloud dev
project via the Management API — needs `$SUPABASE_ACCESS_TOKEN` and a ref in `.dev-branch`. Force
either with `--db=local|cloud`. If NEITHER is available the DB checks **fail**; they are never
skipped green. Exit 0 is the only "done".

## Gate integrity (do not weaken)
- **Never edit `scripts/verify.mjs`, `scripts/guard-bash.mjs`, `scripts/guard-run.mjs`, or `.claude/settings.json`** (the deterministic gate + its hooks) without Basim's explicit approval. A PreToolUse hook flags such edits and blocks shell writes/copies/moves/deletes to them — and to the `.verify-pass` marker, which only `verify.mjs` may write. Do not route around it. Weakening a check to make it pass is the cardinal sin of this project.
- **MCP database writes** go only to a **dev project ref listed in `.dev-branch`**, and only after `verify.mjs` is green on the current tree — never to a linked production project. The push guard enforces both, fail-closed: `apply_migration` / `execute_sql` / `deploy_edge_function` / `pause_project` / `restore_project` (which carry a `project_id`) are blocked unless the target is in `.dev-branch`; branch-scoped ops (`merge_branch` / `reset_branch` / `delete_branch`) and the CLI `supabase db push` carry no checkable project ref and are blocked **outright** (promote via a deliberate step). The `.verify-pass` marker is HMAC-signed with a per-machine secret outside the repo, so it can't be forged by re-running the hash.
- **These guards are defense-in-depth speed bumps, not a sandbox.** An agent with raw shell + filesystem read can still find a way around string-matching or read the signing secret. They exist to stop the easy/accidental bypass and to keep the system honest — the real backstop is this principle plus human review at ship. A green guard is never permission to do something you know weakens the gate.

## Stage flow (one Claude session per app)
S1 SPEC (`/new-app`) → S2 DESIGN + PREVIEW (`/design-import`, `/preview`) → S3 BUILD (`/build` under a `/goal` loop until verify is green) → S4 REVIEW (`/review`: fresh-context reviewer + `/code-review`) → S5 SHIP (`/ship`) → S6 MAINTAIN.

## Secrets
`EXPO_PUBLIC_*` vars are inlined into the JS bundle — public **configuration**, not secrets. Only `EXPO_PUBLIC_SUPABASE_URL` and the **publishable** key (`sb_publishable_…`, governed by RLS) belong in `.env`. The secret key (`sb_secret_…` / `service_role`) must NEVER appear in this repo — the PostToolUse hook and `scripts/secret-scan.mjs` enforce it.

## Integrations & keys (Basim's decision, never a dotfile)
- **No external service / API / SDK is added without Basim's explicit approval** of the S1 integrations table (service · what for · free? · keys · where to get). "Nice to have" is not a reason. Approved integrations go in `config/integrations.json` (names only, never values) + `docs/DECISIONS.md`.
- **Never ask Basim to edit `.env`, and never hand-edit it yourself.** Keys are collected through `node scripts/collect-keys.mjs` — a local one-page browser form (127.0.0.1, one-time token, sends nothing anywhere). Public `EXPO_PUBLIC_*` config → `.env`; secret-shaped keys are **refused** from app files and routed server-side (`destination: supabase-secret`). `verify.mjs`'s `env complete` check gates on **presence** (never values) of the manifest's required keys.
