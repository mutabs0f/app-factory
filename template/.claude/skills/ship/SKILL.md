---
name: ship
description: Cut the release and put the real app on Basim's phone — human gate #2. Use for stage S5 (SHIP) after /review is done and verify is green. Never report "shipped" without a green CI run URL + the artifact.
---

# /ship — S5 SHIP (human gate #2)

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
2. Watch the run to completion: `gh run watch` (or a `/loop 15m` CI watcher for long builds). Do NOT walk away claiming success.
3. **Confirm before reporting.** `gh run view <id>` must show conclusion `success`; `gh run view <id> --log` / the run's artifacts must list the built IPA. **Never report "shipped" without the green run URL AND the artifact — check, never assume.** A red/missing run HALTS.
4. Report to Basim: the **green run URL** + the **artifact (unsigned IPA) download link**, then his ~3-minute manual part:
   - Download the unsigned IPA from the run artifacts.
   - Open **Sideloadly**, drag the IPA in, sign in with the **free Apple ID**, Install.
   - App lands on the home screen; open it against the real cloud Supabase backend.
5. **Remind him of the free-account limits:** max **3** sideloaded apps at once; **7-day** re-sign (the app dies after a week — re-run Sideloadly to renew); **no remote push** (push-needing apps go PWA); and **don't rush iOS updates** — a major iOS bump can break the sideload toolchain.

## PWA path (web-target / push-needing apps)
1. Deploy the web build (Vercel or Supabase hosting) against the real cloud Supabase.
2. Confirm the deploy is live (open the URL, don't assume) and report the **URL**.
3. Basim's part: Safari → open the URL → **Share → Add to Home Screen**. It runs as a home-screen app, no 7-day expiry, push allowed.

## This is human gate #2
Done is Basim using the **real app on his own phone** against the **real cloud backend** — never a generated checklist, never a self-report. If anything is red or unverified, say so plainly and stop; a missing signal halts.

## Encode fixes
If shipping took more than one attempt (bad workflow secret, signing snag, wrong path), append one line to `LESSONS.md`: failure signature → winning fix.

## After the ship — the lessons cadence (10 minutes, every app)
The factory only compounds if each app makes the next one better. After human gate #2 passes:
1. **Measure the run:** if the office hooks were installed, run `node scripts/run-metrics.mjs . --append` and note the headline (wall clock, edits, gate attempts) in the ship report. Numbers, not vibes — the next app should beat them.
2. **Triage `LESSONS.md`:** for each lesson from THIS app, mark it `stable` (hit twice or clearly systemic) or leave it app-local. List the stable ones in the ship report as **"promote to template"** — Basim's factory session applies them to `app-factory/template` (an app session never edits the factory).
3. **Delete stale lessons** that this run proved obsolete — a lessons file nobody prunes becomes noise nobody reads.
