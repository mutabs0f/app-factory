---
name: verify-app
description: The verification discipline — what `node scripts/verify.mjs` proves, plus the manual on-device pass required before any UI change is called done. Use whenever deciding whether work is actually finished.
---

# verify-app — how "done" is proven

"Done" is never self-reported. It has two layers.

## 1. The deterministic gate — `node scripts/verify.mjs` (exit 0)
All of these must pass:
1. `tsc --noEmit` — zero type errors.
2. `eslint .` — zero lint errors.
3. `jest --ci` — all tests pass (every feature adds at least a hook-level test).
4. `expo export --platform ios` — the bundle actually builds.
5. secret scan — no `sb_secret_` / service_role / third-party keys in the repo.
6. `supabase db reset` — all migrations replay from zero; then **RLS coverage** (every public table has RLS + ≥1 non-permissive policy), **definer-fn exposure** (no public SECURITY DEFINER function callable by anon/authenticated), and **table GRANTs** (authenticated has grants matching each policy's operations).
7. types freshness — `src/types/database.types.ts` matches the live schema.

Requires `supabase start` running (Docker). **Exit 0 is the only green.** If Docker is down, checks 6–7 fail honestly — they are never skipped-green.

## 2. The on-device pass (required for UI changes)
`expo export` proves the JS bundle compiles — NOT that a screen behaves. Before calling any UI change done:
- Run `/preview` (tunnel + QR); open the CHANGED screen in Expo Go on the phone.
- Exercise it (tap, type, submit); confirm it does what `docs/SPEC.md` says.
- Watch the Metro console for red-box errors and warnings.

## Never
- Never claim done on a red or un-run check — run it and show the output.
- Never weaken a check to make it pass; fix the cause.
- A missing result is a failure that halts, not something to paper over. This single rule is what the whole factory exists to protect.
