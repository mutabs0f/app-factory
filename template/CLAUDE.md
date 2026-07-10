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
- **Auth:** email OTP — `signInWithOtp({email})` → `verifyOtp({email, token, type:'email'})`. No magic links, no deep links.
- **Session storage:** `LargeSecureStore` (`src/lib/storage.ts`) — ships in the template, reused as-is.
- **Server logic:** Postgres `.rpc()` for atomic multi-statement ops; **Edge Functions only** for third-party secrets, signed webhooks, or server-authoritative logic (money, credits, cross-user writes).
- **Schema changes:** only by adding files to `supabase/migrations/` (never the dashboard). After each migration, regenerate types and run `get_advisors`.

## The seven mechanical rules
1. `src/app/` holds only route files; every route is a thin re-export of a screen from `src/features/`.
2. `import { supabase }` only in `src/lib/*` and `src/features/*/api.ts`. Screens/components use the feature's hooks.
3. Every `api.ts` function has an explicit return type built from `database.types.ts`.
4. Schema changes only via `supabase/migrations/`; regenerate types + advisors after each.
5. Every new-table migration includes RLS + per-op policies + policy-column indexes — scaffold with `node scripts/new-migration.mjs <name>`.
6. Absolute `@/` imports across layers; no barrel `index.ts` re-exports.
7. A new external secret ⇒ a new Edge Function. Never a key in the app.

## The gate — `node scripts/verify.mjs`
Runs, in order: typecheck · lint · jest · `expo export` · `supabase db reset` + RLS coverage · secret scan · generated-types freshness. Requires `supabase start` running (Docker). Exit 0 is the only "done".

## Stage flow (one Claude session per app)
S1 SPEC (`/new-app`) → S2 DESIGN + PREVIEW (`/design-import`, `/preview`) → S3 BUILD (`/build` under a `/goal` loop until verify is green) → S4 REVIEW (`/review`: fresh-context reviewer + `/code-review`) → S5 SHIP (`/ship`) → S6 MAINTAIN.

## Secrets
`EXPO_PUBLIC_*` vars are inlined into the JS bundle — public **configuration**, not secrets. Only `EXPO_PUBLIC_SUPABASE_URL` and the **publishable** key (`sb_publishable_…`, governed by RLS) belong in `.env`. The secret key (`sb_secret_…` / `service_role`) must NEVER appear in this repo — the PostToolUse hook and `scripts/secret-scan.mjs` enforce it.
