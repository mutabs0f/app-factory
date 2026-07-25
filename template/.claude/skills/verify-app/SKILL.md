---
name: verify-app
description: Verify any change end-to-end before declaring it done — the deterministic gate, then actually opening the app and interacting with the change. Use whenever deciding whether work is finished, and always before saying a UI change works.
---

# verify-app — how "done" is proven

**Never report a change as complete based on a successful edit, or on a green compile alone.**
"Done" has three layers, and each one catches what the previous cannot.

## 1. The deterministic gate — `node scripts/verify.mjs` (exit 0)

21 checks. Exit 0 is the only green. Requires either local Supabase (`supabase start`, Docker)
or a cloud dev ref in `.dev-branch` with `$SUPABASE_ACCESS_TOKEN` — `--db=local|cloud` forces
one. If NEITHER is available the DB checks **fail**; they are never skipped green.

Code: typecheck · lint · jest · **architecture** (boundaries, no cycles) · delivery bundle(s)
build · **the app actually runs** · secret scan of source **and of the shipped bundle** ·
dependency audit · every DECISIONS "X or Y" resolved · required keys present.
Database: full migration replay from zero · RLS coverage · SECURITY DEFINER exposure · table
GRANTs · anon-role reachability · user-editable claims in policies · storage bucket privacy ·
**RLS cross-user isolation** (static + a runtime impersonation probe) · generated-type drift.

## 2. Open it and interact with it (required for ANY UI change)

`scripts/runtime-check.mjs` runs inside the gate and proves every route mounts, with zero
console errors and zero failed requests. **It cannot tell you whether the change does what it
was supposed to do.** For that, drive the app yourself:

1. Build and serve it, and leave it up:  `node scripts/runtime-check.mjs --keep`
   (it prints the URL; `--aria` also dumps each route's accessibility tree)
2. Open that URL in the browser and go to the screen you changed.
3. **Interact with the change directly.** A new button: click it and confirm the thing it
   promises actually happens — the row appears, the list updates, the error shows. A new
   input: type into it, submit it, submit it empty, submit it wrong.
4. Read the browser console: **zero new errors or warnings.**
5. Check the network tab for failed or 4xx/5xx requests — a Supabase 401/403 usually means
   an RLS policy or a missing GRANT, not a UI bug.
6. Confirm the four states are real, not theoretical: loading, empty, error, content.
   Force the error state (stop the local stack, or use a bad id) and look at what a user sees.

**If any step fails, fix the cause and rerun from step 1.** Do not hand back partially
verified work, and do not describe a screen you have not opened.

## 3. The on-device pass (before ship)

The web build is a proxy: it proves logic and flow, not native feel. Before `/ship`, run
`/preview` and open the changed screen in Expo Go **on the phone** — check touch targets,
safe areas, keyboard behaviour, Arabic/RTL layout, and the Metro console for red boxes.
Basim's reaction is the gate here, recorded verbatim in `docs/REVIEW-LOG.md`.

## What the gate still does NOT prove — say so rather than implying otherwise

- **Signed-in screens.** The runtime check walks the unauthenticated surface and confirms
  protected routes redirect; it does not log in. Authenticated flows need step 2 by hand.
- **Native-only behaviour.** Anything that does not exist on web (secure enclave, camera,
  push) is only ever proven by step 3.
- **That the app is a good idea.** No script judges that.

## Never

- Never claim done on a red or un-run check — run it and show the real output.
- Never weaken a check to make it pass; fix the cause. The gate files are hook-protected.
- A missing result is a failure that halts, not something to paper over. This single rule is
  what the whole factory exists to protect.
