---
name: research-apis
description: Work out which external services an app actually needs, verify Basim can ACTUALLY obtain each key from Saudi Arabia, and get his approval as an integrations table. Use after /discuss and before /new-app — no service enters an app without passing through here.
---

# /research-apis — find what it needs, and what he can actually get

> **Before you do anything in this stage:**  `node scripts/stage-guard.mjs --enter research-apis`
> It refuses if the prerequisites are unmet or you are not inside an app repo — both
> real failures that have happened. When the stage is finished:
> `node scripts/stage-guard.mjs --complete research-apis`

Two jobs, and the second is the one that matters:

1. Work out which external services this app genuinely needs.
2. **Verify he can actually obtain each one.** An API that is perfect and unobtainable is worse than
   a mediocre one that works — it costs a whole design before the wall appears.

> This stage exists because `provider-scout` was specced, schema'd and scaffolded around Google
> Maps Places, and only at the key form did it emerge that Google Cloud billing for a Saudi
> individual is gated behind a reseller whose individual onboarding has been closed since Feb 2025.
> The app is still parked. **Never let that happen again.**

## Step 1 — the best integration is none

Read `docs/BRIEF.md` ("Where the data comes from", "Open questions").

For each need, ask: **can the app do this without a new service?** Supabase already gives database,
auth, file storage, cron, and server-side functions. The device gives camera, GPS, local
notifications, and offline storage. A service is justified only when the app genuinely cannot work
without it. "It would be nice" is not a reason — that rule is in CLAUDE.md and it is load-bearing.

Think in **categories** first (maps, email, SMS, AI, payments…), never in brand names. Brands come
after obtainability.

## Step 2 — check obtainability BEFORE proposing anything

Read **`docs/OBTAINABLE-SERVICES.md`** (ships with the template) for what is known to work, and what
is known to be blocked, for a Saudi individual with no Commercial Registration. It covers maps,
email, SMS, push, AI, payments, storage and analytics, and it marks every claim `[VERIFIED]`,
`[SEARCH]` or `[UNVERIFIED]`. **Any `[SEARCH]`/`[UNVERIFIED]` figure sitting on a required path must
be re-checked live before you propose it** — quote free-tier numbers with their confidence marker,
never as fact.

Three things in it that overturn the obvious answer, so read it rather than guessing:
- **Google is blocked by billing ADDRESS, not by account type** — there is no individual exemption,
  and it explicitly includes Maps Platform. Gemini's paid tier routes back into the same gate.
- **SMS/OTP is effectively unavailable** to him (KSA sender-ID registration needs a company). Email
  OTP stays the default; challenge any "verify by phone" request during `/discuss`.
- **Payments may NOT be blocked** — Moyasar documents accepting a *freelance licence* (وثيقة العمل
  الحر, free via freelance.sa) in place of a CR. Don't tell him transactional apps are impossible
  without checking this.

That file is a starting point, not gospel — **verify current state with a web search**, because
free tiers and regional rules change. Then, for every candidate, establish all five:

| Question | Why it matters |
|---|---|
| Available in Saudi Arabia at all? | Some services simply refuse KSA signups |
| Behind a **regional reseller**? | The Google/CNTXT trap — the killer, and invisible until checkout |
| Needs a **company / CR number**? | He is an individual. This is usually fatal |
| Needs a **credit card**, even for free tier? | Sometimes acceptable; must be said up front |
| Free tier real, and enough for personal use? | Don't verify limits from memory — check |

A service that fails "reseller" or "needs a CR" is **not a candidate**. Do not list it as the
recommendation and hope.

## Step 3 — when the best option is blocked, STOP and ask

If the strongest option for a category is one he cannot obtain, **do not silently substitute** a
weaker one, and do not push on regardless. Stop and put the decision to him — with the work already
done, so it is one decision and not homework:

> "The best source for shop ratings is Google, but you can't get a Google key (that reseller
> problem again). Three real options: **(a)** Geoapify or LocationIQ — free tier, no card, works
> today, gives you places and addresses, but **no ratings**, so the app would rank on distance and
> opening hours instead of trustworthiness; **(b)** you get the free وثيقة العمل الحر, which *might*
> unlock a Google business account — a day of admin, and it might not work; **(c)** drop the ratings
> idea from v1. Which way?"

⚠ **Do not reflexively answer "just use OpenStreetMap".** The public Nominatim service explicitly
forbids this class of app — *"applications and services whose primary function is related to
geocoding must run their own service"*, 1 request/second, no client-side autocomplete — and OSM has
**no ratings or review counts at all**. Read the OSM warning in `docs/OBTAINABLE-SERVICES.md` §1
before proposing anything OSM-based. Recommending a service whose terms forbid the use case is the
same failure as recommending one he can't obtain.

Concrete alternatives, honest about what each costs him. Then wait.

**Never** propose a workaround that violates a provider's terms — no non-KSA billing address, no
fake company details, no scraping a service that forbids it. That risks his real accounts. If the
only route is a rule-break, say the feature is not available to him and offer the honest
alternatives.

## Step 4 — the integrations table (his approval gate)

Present exactly this, and **STOP**. He can strike or add rows.

| Service | What it does in THIS app | Free? | Card? | Key needed | Where he gets it |
|---|---|---|---|---|---|

Rules for the table:
- **"What it does in THIS app"** is specific to his app, not a description of the product.
  ✗ "Resend is an email API" ✓ "Sends your 6-digit sign-in code — without it you can't log in"
- Say plainly which rows are **required for the app to work at all** and which power one optional
  feature. Only the first kind gets `required: true` — a required key he cannot obtain freezes the
  entire pipeline at the S1 gate.
- Anything secret goes server-side (`destination: supabase-secret`), never into the app. A new
  external secret means a new Edge Function — CLAUDE.md rule 7.

## Step 5 — record the approved set

Only what he approved goes into:
- `config/integrations.json` — one entry per key: `env`, `service`, `destination`
  (`app-env` for public `EXPO_PUBLIC_*`, `supabase-secret` for anything secret), `why`, `howToGet`
  (the exact click path), `format` (a fully anchored `^…$` regex for app-env keys), `required`.
  **Names, never values.**
- `docs/DECISIONS.md` — the approved list, plus a line for anything **rejected and why**
  (especially anything rejected as unobtainable — that is the note that stops a future session
  cheerfully re-proposing it).

Then `/new-app` writes the SPEC and schema, and runs the key form.

## Never

- Never propose a service without checking he can obtain it. This is the whole point of the stage.
- Never mark a key `required: true` because the app is *better* with it — only if it cannot run without it.
- Never invent a free-tier limit, price, or click path. Check it, or say you couldn't and mark it unverified.
- Never add a service after this stage without coming back through it.
