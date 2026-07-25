---
name: ship
description: Cut the release and put the real app on Basim's phone — human gate #2. Use for stage S5 (SHIP) after /review is done and verify is green. Never report "shipped" without a green CI run URL + the artifact.
---

# /ship — S5 SHIP (human gate #2)

> **Before you do anything in this stage:**  `node scripts/stage-guard.mjs --enter ship`
> It refuses if the prerequisites are unmet or you are not inside an app repo — both
> real failures that have happened. When the stage is finished:
> `node scripts/stage-guard.mjs --complete ship`

Turn a green tree into a running app on Basim's phone. `/ship --dry-run` prints the plan and stops — no tag, no build.

## Before you start
- Read `docs/SPEC.md` and `LESSONS.md`.
- **Preflight (all required, else STOP):**
  1. `node scripts/verify.mjs` exited 0 **in this session** — show the output. A stale green from earlier doesn't count.
  2. S4 `/review` is done and `docs/REVIEW-LOG.md` records it clean.
  3. `node scripts/collect-keys.mjs --check` — every required API key is present (presence only, never values). Red → re-run `node scripts/collect-keys.mjs` before building; the app can't run without them.
- Decide the path from `docs/SPEC.md`: **Native** (default, iOS app) vs **PWA** (web-target apps, or any app that needs remote push — the free Apple ID can't do push).

## Native path (default)
1. Tag the release commit: `git tag v<n>` and push it — or fire `.github/workflows/ios-build.yml` via `gh workflow run ios-build.yml` (workflow_dispatch). The push of a `v*` tag triggers the same build.
2. **Watch the run to completion — this is a time-based loop, use one.** The build takes
   25-40 minutes, which is longer than a single turn should block on. Start:

       /loop 10m check the ios-build run for <slug>: if it is still running, say so and stop; if it succeeded, report the artifact URL; if it failed, read the failing step's log and fix the cause

   The loop re-runs on the interval and ends when the run finishes (the article's exact
   time-based case: "a PR which may receive code reviews or fail CI"). Prefer this to
   blocking on `gh run watch` — and if `/loop` is unavailable, poll with
   `gh run view <id> --json status,conclusion` and say plainly that you are polling.
   **Never walk away claiming success**: report only what `gh run view` actually returned.
3. **Confirm before reporting.** `gh run view <id>` must show conclusion `success`; `gh run view <id> --log` / the run's artifacts must list the built IPA. **Never report "shipped" without the green run URL AND the artifact — check, never assume.** A red/missing run HALTS.
4. Report to Basim: the **green run URL** + the **artifact (unsigned IPA) download link**, then his ~3-minute manual part:
   - Download the unsigned IPA from the run artifacts.
   - Open **Sideloadly**, drag the IPA in, sign in with the **free Apple ID**, Install.
   - App lands on the home screen; open it against the real cloud Supabase backend.
5. **Remind him of the free-account limits:** max **3** sideloaded apps at once; **7-day** re-sign (the app dies after a week — re-run Sideloadly to renew); **no remote push** (push-needing apps go PWA); and **don't rush iOS updates** — a major iOS bump can break the sideload toolchain.

## PWA path (web-target apps)
The host is **Vercel** — one choice, no "or". (`vercel --prod` on a static export; the factory
does not maintain a second hosting path. If Vercel is ever unavailable, that is a DECISIONS.md
change Basim approves, not an in-the-moment improvisation.)

1. `node scripts/verify.mjs` must be green **including the `web bundle (expo export)` check** — for a
   PWA app that web bundle IS the deliverable, so a gate that only built iOS proves nothing. If you
   don't see a `web bundle` line, `docs/DECISIONS.md` doesn't say PWA — stop and reconcile it.
2. Deploy — one command does export + deploy + liveness proof:

       node scripts/deploy-web.mjs

   It refuses to deploy a build whose `.env` points at localhost/LAN (the malaki mistake), and it
   **GETs the deployed URL and requires a 2xx before printing it** — a CLI exit code is not proof a
   site is up. First run needs a one-time `npx vercel login` in Basim's own terminal; the script
   prints that instruction and halts rather than pretending. Don't background it.
3. Report the URL the script printed. Never a URL you did not see it verify.
4. Basim's part: Safari → open the URL → **Share → Add to Home Screen**. It runs as a home-screen
   app with its own icon, no 7-day expiry, nothing to re-sign.

**Be accurate about push:** iOS supports Web Push **only** for a site the user has added to the Home
Screen, and it needs a VAPID web-push server that this template does **not** ship. So: "no push
today; possible later without Apple's involvement." Do not tell him push works out of the box.

## This is human gate #2
Done is Basim using the **real app on his own phone** against the **real cloud backend** — never a generated checklist, never a self-report. If anything is red or unverified, say so plainly and stop; a missing signal halts.

## Encode fixes
If shipping took more than one attempt (bad workflow secret, signing snag, wrong path), append one line to `LESSONS.md`: failure signature → winning fix.

## After the ship — the lessons cadence (10 minutes, every app)
The factory only compounds if each app makes the next one better. After human gate #2 passes:
1. **Measure the run:** if the office hooks were installed, run `node scripts/run-metrics.mjs . --append` and note the headline (wall clock, edits, gate attempts) in the ship report. Numbers, not vibes — the next app should beat them.
2. **Triage `LESSONS.md`:** for each lesson from THIS app, mark it `stable` (hit twice or clearly systemic) or leave it app-local. List the stable ones in the ship report as **"promote to template"** — Basim's factory session applies them to `app-factory/template` (an app session never edits the factory).
3. **Delete stale lessons** that this run proved obsolete — a lessons file nobody prunes becomes noise nobody reads.
