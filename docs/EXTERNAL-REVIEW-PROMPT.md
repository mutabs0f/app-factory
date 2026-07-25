# External review prompt — paste everything below the divider

*(Every factual claim below was fact-checked against the repo before publishing. Where a control is
narrower than it sounds, the narrow version is what is written.)*

---

I want you to critically assess an agentic software-development system I own. Be rigorous and
adversarial. I am not looking for encouragement — I am looking for the failure modes I cannot see.
Where something is well built, say so in one line and move on; spend your effort on what is wrong,
risky, or missing.

**The entire system is public. Read the code before judging it:**
https://github.com/mutabs0f/app-factory

On my machine it lives at `C:\Users\Thinkpad\Agents\app-factory\`. Every app I build is a **full
clone** of `template/` into a sibling directory (`C:\Users\Thinkpad\Agents\<app-slug>\`), so the
whole agentic system travels per-app rather than living centrally. That is a deliberate design
choice and one of the things I want judged.

## Who I am and what I am trying to do

I am **not a developer**. I do not read stack traces and I do not want to edit config files. My
goal: **I describe an app, and the system builds it well enough that I actually use it on my
iPhone.** I judge the result by using it, not by reading its code.

My constraints are hard and they shape every decision:

- **Windows 11, no Mac, ever.**
- **No Apple Developer account** — my application was rejected and cannot be reopened. No
  TestFlight, no App Store, no paid signing, no EAS device builds.
- **I am in Saudi Arabia.** Google Cloud (including Maps Platform) must be purchased through an
  exclusive local reseller whose individual onboarding has been closed since ~Feb 2025 — so I
  cannot obtain a Google API key at all. SMS/OTP providers require a company registration I do not
  have. One real app is parked because of exactly this.
- The apps are **personal** — usually just me, sometimes a handful of people. No compliance regime.

What I asked for most recently, and want judged: **the system should handle backend, frontend and
API design — all of them excellently** — rather than one general-purpose agent writing every layer
shallowly.

## What has been built

**Stack (fixed, no alternatives):** Expo SDK 54 + Supabase. TypeScript strict, expo-router.
Postgres Row-Level Security is the **only** authorization layer; the client is untrusted and ships
a public key. Auth is email OTP via custom SMTP. There is deliberately **no custom backend server** —
the client talks to Supabase directly, with Postgres RPC functions for anything that must be atomic
and Edge Functions only for third-party secrets or server-authoritative logic. Expo is pinned to
SDK 54 because that is the last Expo Go build on the App Store, and Expo Go is how I preview on my
phone.

**Delivery with no Apple account:** a GitHub Actions macOS runner archives with code signing
disabled and packages the `.app` into a `Payload/` zip to produce an **unsigned IPA**, which I sign
on Windows with Sideloadly using a free Apple ID. Real installed app, 7-day expiry, no push (the
entitlement is stripped). Alternative path: a PWA added to the home screen.

**The core doctrine — judge this hardest:**

> A claim of "done" is a hint, never a verdict. The only verdict is `scripts/verify.mjs` exiting 0.
> A missing result is a failure that halts — never something to paper over.

This exists because the predecessor system fabricated its success signals: hardcoded PASS verdicts,
auto-generated "complete" records for agents that had crashed, security checklists hardcoded true.
It shipped apps with broken auth and contract drift while reporting everything green.

### The gate — `template/scripts/verify.mjs` (678 lines), 21 checks

**21 for an iOS-delivery app; 22 when `DECISIONS.md` resolves Delivery to PWA** (a second bundle
check is added). Code half: typecheck · lint · jest · **architecture** (import boundaries + cycle
detection) · delivery bundle builds · **the app actually runs in a browser** · secret scan of
source · secret scan of the **shipped bundle** · dependency audit · every DECISIONS "X or Y"
resolved · required API keys present.

Database half: full migration replay from zero · RLS coverage · SECURITY DEFINER exposure · table
GRANTs matching policy operations · **anon-role reachability** · user-editable-claims-in-policies ·
storage bucket privacy · **RLS cross-user isolation, two checks** (a static one that every policy
binds to *which* user, plus a runtime probe that impersonates a stranger and asserts they cannot see
every row) · generated-type drift.

Runs against local Supabase in Docker **or** a cloud dev project via the Supabase Management API.
Cloud mode needs `$SUPABASE_ACCESS_TOKEN` **and** a project ref written into `.dev-branch` (which
ships comments-only and is fail-closed) — so Docker is optional only after that setup. If neither
database is available the DB checks **fail** — never skipped green.

**Be precise about these three, because they sound broader than they are:**

- **The dependency audit fails on CRITICAL only.** High and moderate are printed on every run and
  deliberately do not fail: the forced SDK 54 pin carries build-time advisories whose only fix is a
  major Expo bump, which would break the Expo Go preview path entirely.
- **The HMAC-signed pass marker gates exactly one thing** — Supabase MCP cloud writes. Nothing else
  reads it. An unverified tree can still build and sideload an IPA.
- **The PreToolUse guard protects 4 paths**: `verify.mjs`, `guard-bash.mjs`, `guard-run.mjs`,
  `.claude/settings.json`. The *other* check implementations (`arch-check.mjs`, `runtime-check.mjs`,
  `secret-scan.mjs`, `collect-keys.mjs`, `lib/dbclient.mjs`) are **not** protected, and between them
  they implement 8 of the 21 checks. I want your view on whether that hole matters.

There is also a **PostToolUse hook that runs a secret scan after every Edit/Write**, independent of
the gate.

### The agent architecture

**Stages** (Claude Code skills, markdown): `discuss` (talk the idea through — propose, don't
interrogate) → `research-apis` (find what services the app needs **and verify I can obtain them**)
→ `new-app` (spec, schema, decisions, key form) → `design-import` → `preview` → `build` → `review`
→ `ship`. Plus `app` (runs the whole sequence, stopping at 4 human gates) and `undo`. Two further
skill directories are third-party Supabase agent-skills, not stages.

**Subagents, fresh context:** `api-designer` (where each operation lives — direct table access vs
Postgres RPC vs Edge Function — and its contract), `backend-engineer` (schema, constraints, indexes,
RLS correctness, query cost), `frontend-engineer` (screen architecture, the four states every screen
owes the user, Arabic/RTL, accessibility, perceived speed) — these three are pinned to Opus 5.
`advisor` (consulted only when stuck) is pinned to a different model on purpose. `code-reviewer`
(reviews the diff, did not write the code, read-only) and `db-guard` (reviews each migration)
**inherit the session model rather than being pinned.**

**Specialists design; a single executor implements.** Deliberate: the predecessor had 14 agents each
writing their own half and the contracts drifted into two payment implementations and a
client/server that disagreed about auth.

**The build loop:** `/build` is documented to run under a `/goal` loop that exits only on a green
gate, capped at 8 turns. **Be aware: `/goal` may not exist in my Claude Code install** — the skill
itself says "if unavailable, re-run `/build` manually against the verify output." So the turn cap
and the automatic re-invocation are, today, prose in a markdown file rather than an enforced
mechanism. Judge accordingly.

**Key handling:** I never edit `.env`. A local script serves a one-page form — **127.0.0.1 by
default, with a `--lan` flag that binds all interfaces** so I can fill it in on my phone — behind a
one-time token. It validates each key's shape and refuses a secret-shaped value from entering the
app's files. For anything secret it **captures no value at all**: it shows the dashboard click-path
and records only that I confirmed it, by name. Every key has an "I can't get this one yet" option;
a deferred *required* key keeps the gate red on purpose.

## Directory map

```
app-factory/
├── scaffolder/scaffold.mjs         deterministic clone+rename+git-init (no LLM in the loop)
├── scripts/                        the FACTORY's own tooling (not shipped into apps)
│   ├── doctor.mjs                  environment preflight
│   ├── factory-eval.mjs            golden probe: scaffolds a throwaway app, 49 assertions, green
│   └── run-metrics.mjs             per-stage duration / edit counts / gate attempts (no tokens)
├── office/                         a 3D "watch the agents work" viewer — cosmetic, ignore
└── template/                       ← THE PRODUCT. Every app is a clone of this.
    ├── CLAUDE.md                   operating rules every stage reads first
    ├── LESSONS.md                  accumulated failure→fix lessons
    ├── .claude/
    │   ├── settings.json           hooks (PostToolUse secret scan, PreToolUse guard) + model pin
    │   ├── skills/                 13 dirs: the 11 stages above + 2 third-party Supabase skills
    │   └── agents/                 6 subagents (above)
    ├── scripts/                    THE DETERMINISTIC HALF — shipped into every app
    │   ├── verify.mjs              ★ THE GATE, 678 lines
    │   ├── runtime-check.mjs       builds the WEB bundle, serves it, walks every route in Chromium
    │   ├── arch-check.mjs          import boundaries, feature encapsulation, cycles (src/ only)
    │   ├── lib/dbclient.mjs        one SQL interface, two backends (Docker | cloud Mgmt API)
    │   ├── secret-scan.mjs         source, and --bundle for the shipped artifact
    │   ├── collect-keys.mjs        the one-time-token key form
    │   ├── guard-bash.mjs          PreToolUse guard (4 protected paths + dev-only DB writes)
    │   ├── guard-run.mjs           fail-closed launcher — itself a protected gate file
    │   └── new-migration.mjs · deploy-web.mjs · design-brief.mjs · design-import.mjs
    ├── supabase/migrations/        the ONLY source of schema truth
    ├── src/  app/ (routes only) · features/ · lib/ · components/ · constants/ · hooks/ ·
    │         types/database.types.ts (generated from the schema; drift fails the gate)
    ├── config/integrations.json    approved services — names/formats only, NEVER values
    ├── docs/                       SPEC · DECISIONS · REVIEW-LOG · OBTAINABLE-SERVICES
    └── .github/workflows/ios-build.yml   unsigned IPA + 5 of the gate's code checks
```

Most worth your time: `template/scripts/verify.mjs`, `template/scripts/arch-check.mjs`,
`template/scripts/guard-bash.mjs`, `template/.claude/agents/*.md`,
`template/.claude/skills/build/SKILL.md`.

⚠️ **`template/CLAUDE.md` and `build/SKILL.md` contain a stale description of the gate** (they say
9 checks and imply Docker is required). The code is authoritative; the drift is itself a finding and
I would like it called out.

## Proven versus merely built — weigh these differently

**Demonstrated by execution** (but see the caveat below): a real unsigned IPA was produced and its
structure verified — `Payload/<app>.app`, a 5.7 MB Mach-O binary, zero code-signature entries. The
gate passes in both database modes. Each new security check was demonstrated against a
**deliberately planted leak** — a policy that references the user but still exposes every row, and a
stray `grant ... to anon` — both of which the *previous* version of the gate passed as green. The
runtime check was proven by re-creating a real incident: a build that passed every other check while
rendering a blank white page now exits 1.

**The caveat, and treat it as a finding:** almost none of that is recorded in the repository. Two
incidents survive as code comments in `verify.mjs` and `runtime-check.mjs`; the IPA verification and
the planted-leak demonstrations exist only as my assertion. Nothing in `template/scripts/`
(~2,600 lines across 12 files) has a regression fixture — not the gate, not `arch-check.mjs`, not
the security checks whose proofs I just cited. If you cannot reproduce a claim, say so.

**Not proven at all: no app has ever gone from idea to my phone end to end. Not once.**

Also: **"the app actually runs" is web-only.** `runtime-check.mjs` builds and walks the *web*
bundle. Nothing ever launches the iOS bundle, which is the primary deliverable. It asserts that each
route mounts real content with zero console errors and zero failed requests; it does **not** log in,
and it does **not** assert where a protected route redirects to.

## A previous review already found this — do not just repeat it

An earlier assessment concluded the system was *"anti-spaghetti by instruction, but not yet
anti-spaghetti by enforcement"* — the architectural rules lived in prose, eslint ignored `scripts/`,
nothing checked import cycles or dependency direction, and CI never re-ran anything. That was
correct. Since then: `arch-check.mjs` makes the boundary rules mechanical (proven against planted
violations including a two-file cycle), the iOS workflow now runs five of the gate's code checks
before spending macOS minutes, and the reference screen was fixed to actually demonstrate the four
states its own specialist charter demands.

**I want findings that go past that review, not a re-run of it.**

## Known remaining gaps — go beyond these too

1. **Test coverage is ~9%** (24 source files + 2 test files). No screen, navigation or
   session-storage tests. No threshold, and `package.json` sets no `collectCoverageFrom`, so that
   number came from a one-off command-line measurement rather than a repeatable config.
2. **No template versioning or upgrade path.** Every app is an independent clone with its own git
   history, so today's fixes reach *new* apps only. Existing apps were updated by hand.
3. **The API specialist's contract is not persisted** as a committed artifact, so a later agent can
   reinterpret it from a thin SPEC.
4. **Migrations have no checksums**, and nothing tests old-client compatibility (sideloaded builds
   are not auto-updated, so an old client stays live for weeks).
5. **Nothing in `scripts/` has a regression test, and the whole directory is unlinted** —
   `eslint.config.js` ignores `scripts/*`, and `arch-check.mjs` only walks `src/`. The deterministic
   half of the system is outside both of its own quality checks.
6. **The runtime check does not log in**, does not assert redirect targets, and never touches iOS.
7. **Supabase's security advisor is executed and self-reported by the agent**, not by a script.
8. **Edge Functions have no scaffold, no template, and no gate coverage** — yet the architecture
   makes them the mandatory home for every third-party secret.
9. **No session time-box and no global sign-out** — a lost phone's session renews indefinitely.
10. **No token accounting.** Run metrics exist (`scripts/run-metrics.mjs`: duration, edit counts,
    gate attempts) but feed nothing and gate nothing.
11. **Proactive/scheduled loops are absent** — a deliberate choice, since I have no recurring stream
    of work. Tell me if that is wrong.

## What I want from you

Assess it as an **agentic system** — architecture, control flow, verification strategy, failure
modes — not as a code-style review.

**1. Security. Required section, and be specific.**
- Is RLS-as-sole-authorization sound given the client ships a public key? Where does it break?
- Is the two-layer isolation check (static policy analysis + runtime impersonation) sufficient to
  prove cross-user isolation? What does it miss?
- Attack the secrets story: the key form (including `--lan`), both scanners, the routing that means
  secret values are never captured locally at all. How would a secret still reach a shipped app?
- The anti-tamper guards exist to stop an agent weakening its own gate — but they protect 4 paths
  and not the other check implementations, and the signed marker only gates Supabase writes.
  Meaningful, or theatre? What is the realistic bypass?
- Assess the **delivery** posture: sideloading via a free Apple ID and a third-party signing tool,
  and a PWA on a public URL.
- Given 1–50 users per app, name which controls are **theatre at this scale** and should be dropped.
  I would rather have five checks I trust than twenty I ignore.

**2. The verification strategy.** Is "a deterministic script is the only definition of done" the
right core idea, or does it create false confidence by measuring what is easy to measure? What is
the single highest-value check that still does not exist? And: **is it a problem that the gate has
no test of its own?**

**3. The specialist architecture.** Is design-by-specialist / implement-by-one-executor right? Does
it raise engineering quality, or add cost and latency? **How would you mechanically verify that a
specialist contributed anything at all?** Nothing does today.

**4. The architectural bet.** No custom backend; Supabase + RLS + RPC + Edge Functions. Where does
that ceiling get hit, and what would I give up to go past it?

**5. The gaps above — which order?** Rank items 1-11 by what actually threatens my outcome, and say
which are safe to ignore indefinitely.

**6. What would you do differently?** If your goal were exactly mine — a non-technical person
reliably getting good apps onto an iPhone with no Apple account, from Windows — what would you keep,
delete, and add?

## How to answer

- **Read the repository before asserting anything about it.** If you cannot access it, say so
  explicitly and mark every claim as based only on this description.
- Cite specific files and lines when you criticise something.
- Rank by real risk **for personal apps with a handful of users**. Do not import enterprise
  assumptions — recommending SOC2 or a SIEM here would tell me you did not read the brief.
- Separate "this is broken" from "this is a trade-off I would make differently", and be explicit
  about which you are asserting.
- Where you lack evidence, say so instead of filling the gap confidently.
- Give a blunt overall verdict with a score out of 100, plus what a best-in-class alternative would
  score on the same scale, so I can calibrate.
- Finish with **the three things I should do next, in order.**
