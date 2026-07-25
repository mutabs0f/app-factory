# External review prompt — paste this into the reviewing model

---

I want you to critically assess an agentic software-development system I own. Be rigorous and
adversarial. I am not looking for encouragement — I am looking for the failure modes I cannot see.
If something is well built, say so briefly and move on; spend your effort on what is wrong, risky,
or missing.

**The entire system is public. Read it before judging it:**
https://github.com/mutabs0f/app-factory
(On my machine it lives at `C:\Users\Thinkpad\Agents\app-factory\`. Every app I build is a full
clone of `template/` into a sibling directory, e.g. `C:\Users\Thinkpad\Agents\<app-slug>\`, so the
whole agentic system travels with each app rather than living in one shared place.)

## Directory map

```
app-factory/
├── scaffolder/
│   ├── SKILL.md                    the /new-app-project entry point I type
│   └── scaffold.mjs                deterministic clone+rename+git-init (no LLM in the loop)
├── scripts/                        the FACTORY's own tooling (not shipped into apps)
│   ├── doctor.mjs                  environment preflight; reports which DB mode the gate would use
│   ├── factory-eval.mjs            golden probe: scaffolds a throwaway app and asserts the
│   │                               machinery is intact (currently 47 assertions)
│   └── run-metrics.mjs
├── office/                         a 3D "watch the agents work" viewer — cosmetic, ignore it
└── template/                       ← THE PRODUCT. Every app is a clone of this.
    ├── CLAUDE.md                   the operating rules every stage reads first
    ├── AGENTS.md · LESSONS.md      conventions; accumulated failure→fix lessons
    ├── .claude/
    │   ├── settings.json           hooks (PostToolUse secret scan, PreToolUse gate guard) + model pin
    │   ├── skills/                 THE STAGES (each a markdown behaviour spec)
    │   │   ├── discuss/            talk the idea through — propose, don't interrogate
    │   │   ├── research-apis/      find services AND verify I can obtain them
    │   │   ├── new-app/            spec + schema + decisions + the key form
    │   │   ├── design-import/      import a design I made elsewhere, faithfully
    │   │   ├── preview/            get it onto my phone / a link
    │   │   ├── build/              the loop whose only exit is a green gate
    │   │   ├── verify-app/         the manual on-device pass
    │   │   ├── review/             fresh-context review + security gate
    │   │   ├── ship/               IPA via CI, or deploy the PWA
    │   │   ├── app/                runs the whole sequence; stops at 4 human gates
    │   │   └── undo/               restore a working version, non-destructively
    │   └── agents/                 THE SPECIALISTS (subagents, fresh context)
    │       ├── api-designer.md       where each operation lives + its contract
    │       ├── backend-engineer.md   schema, constraints, indexes, RLS correctness, query cost
    │       ├── frontend-engineer.md  screen architecture, the 4 states, RTL, a11y, perceived speed
    │       ├── code-reviewer.md      reviews the diff; did NOT write the code; read-only
    │       ├── db-guard.md           reviews each migration against the canonical RLS+GRANT pattern
    │       └── advisor.md            consulted only when stuck (different model, on purpose)
    ├── scripts/                    THE DETERMINISTIC HALF — shipped into every app
    │   ├── verify.mjs              ★ THE GATE. 19 checks. Exit 0 is the only definition of done.
    │   ├── lib/dbclient.mjs        one SQL interface, two backends (local Docker | cloud Mgmt API)
    │   ├── secret-scan.mjs         scans source AND (--bundle) the shipped artifact
    │   ├── collect-keys.mjs        the 127.0.0.1 one-time-token key form; refuses secrets into app files
    │   ├── guard-bash.mjs          PreToolUse guard: blocks gate edits + non-dev DB writes
    │   ├── guard-run.mjs           fail-closed launcher for the guard
    │   ├── new-migration.mjs       scaffolds a migration pre-filled with the RLS+GRANT pattern
    │   ├── deploy-web.mjs          export → deploy → GET the URL and require 2xx before reporting
    │   ├── design-brief.mjs        generates the design prompt I paste elsewhere
    │   └── design-import.mjs       validates + reconciles the returned design against the spec
    ├── supabase/
    │   ├── migrations/             the ONLY source of schema truth
    │   ├── seed.sql · config.toml
    ├── src/
    │   ├── app/                    routes ONLY — each a thin re-export of a feature screen
    │   │   ├── (auth)/sign-in · verify-otp
    │   │   └── (app)/index · settings
    │   ├── features/               auth · profile · home  (each: api.ts, hooks.ts, screens, tests)
    │   ├── lib/                    supabase.ts · auth.tsx · storage.ts (encrypted session store)
    │   └── types/database.types.ts generated FROM the schema; drift fails the gate
    ├── config/integrations.json    approved services — names/formats only, NEVER values
    ├── docs/                       SPEC · DECISIONS · REVIEW-LOG · OBTAINABLE-SERVICES
    ├── .github/workflows/ios-build.yml   unsigned-IPA build on a macOS runner
    ├── .dev-branch                 allowlist of DB refs the agent may write to (fail-closed)
    └── .env                        gitignored, never committed; written only by the key form
```

The files most worth your time, in order: `template/scripts/verify.mjs` (the gate — the whole
doctrine lives here), `template/CLAUDE.md` (the rules), `template/.claude/skills/build/SKILL.md`
(the loop), `template/.claude/agents/*.md` (the specialists), and
`template/scripts/guard-bash.mjs` (the anti-tamper story).

## Who I am and what I am trying to do

I am **not a developer**. I do not read stack traces, and I do not want to edit config files. My
goal is: **I describe an app I want, and the system builds it well enough that I can actually use
it on my iPhone.** I judge the result by using it, not by reading its code.

My constraints are hard and they shape everything:

- **Windows 11 PC, no Mac, ever.**
- **No Apple Developer account.** My application was rejected and cannot be reopened. So: no
  TestFlight, no App Store, no paid signing certificates, no EAS device builds.
- **I am in Saudi Arabia.** This blocks services people normally assume: Google Cloud (including
  Maps Platform) requires purchasing through an exclusive local reseller whose individual
  onboarding has been closed since ~Feb 2025, so I cannot get a Google API key at all. SMS/OTP
  providers require a company registration I do not have.
- The apps are **personal** — usually just me, sometimes a handful of people. Not a startup, not
  a product, no compliance regime.

What I asked for most recently, and want you to judge against: **the system should handle backend,
frontend and API design — all of them excellently** — rather than one general-purpose agent writing
every layer shallowly. I referenced Replit as a quality bar, but I do not want Replit's web-app
product; I want that level of engineering competence aimed at apps I install on my phone.

## What has been built

**Stack (fixed, no alternatives):** Expo SDK 54 + Supabase. TypeScript strict, expo-router.
Postgres Row-Level Security is the only authorization layer; the client is untrusted. Auth is
email OTP via custom SMTP. There is deliberately **no custom backend server** — the client talks to
Supabase directly, with Postgres RPC functions for anything that must be atomic and Edge Functions
only for third-party secrets or server-authoritative logic. Expo is pinned to SDK 54 because that
is the last Expo Go build available on the App Store, and Expo Go is how I preview apps on my
phone.

**Delivery, given no Apple account:** a GitHub Actions macOS runner builds an *unsigned* IPA
(archiving with code signing disabled and packaging the `.app` into a `Payload/` zip), which I then
sign on Windows with Sideloadly using a free Apple ID — this gives a real installed app that works
for 7 days before needing a re-sign, with no push notifications (the free-account entitlement is
stripped). The alternative path is a PWA added to the home screen.

**The core doctrine** — this is the part I care most about being judged:

> A claim of "done" is a hint, never a verdict. The only verdict is `scripts/verify.mjs` exiting 0.
> A missing result is a failure that halts — never something to paper over.

This exists because the predecessor system fabricated its success signals: hardcoded PASS verdicts,
auto-generated "complete" records for agents that had crashed, security checklists hardcoded to
true. It shipped apps with broken auth and contract drift while reporting everything green.

**The gate** (`template/scripts/verify.mjs`) — 19 checks, all deterministic, exit 0 or the work is
not done: typecheck, lint, tests, `expo export` for the app's actual delivery target(s), secret
scan of source **and of the shipped bundle**, dependency audit, a parser that fails the build if a
design decision is still recorded as an unresolved "X or Y", API-key presence, full migration replay
from zero, RLS coverage, SECURITY DEFINER exposure, table GRANTs matching policy operations,
anonymous-role reachability, user-editable-claims-in-policies, storage bucket privacy, RLS
cross-user isolation (both a static check that every policy binds to *which* user, and a runtime
probe that impersonates a stranger and asserts they cannot see every row), and generated-type drift.
It runs against local Supabase in Docker **or** against a cloud dev project via the Supabase
Management API, so Docker is optional. If neither database is available, the DB checks FAIL — they
are never skipped green.

**Anti-tampering:** the pass marker is HMAC-signed with a per-machine secret stored outside the
repo; PreToolUse hooks block edits to the gate scripts and to the hook config; database writes are
restricted to a dev-project allowlist. Their own documentation admits these are "defense-in-depth
speed bumps, not a sandbox".

**The agent architecture:** stages are Claude Code *skills* (markdown), and specialists are
*subagents*:
- Stages: `discuss` (talk the idea through — propose rather than interrogate), `research-apis`
  (find what services the app needs **and verify I can actually obtain them**), `new-app` (spec,
  schema, decisions), `design-import`, `preview`, `build` (a loop whose only exit is a green gate),
  `review`, `ship`, plus `app` (runs the whole sequence) and `undo`.
- Specialists (all on the top-tier model): `api-designer` (where each operation lives — direct
  table access vs Postgres RPC vs Edge Function — and its contract), `backend-engineer` (schema,
  constraints, indexes, RLS correctness, query cost), `frontend-engineer` (screen architecture,
  loading/empty/error/content states, Arabic-RTL, accessibility, perceived speed). Plus
  `code-reviewer` (fresh context, read-only), `db-guard` (reviews migrations), and `advisor`
  (consulted only when stuck).
- **Design/implement split:** specialists design, a single executor implements. This is deliberate
  — the predecessor had 14 agents each writing their own half and the contracts drifted badly.

**Key handling:** I never edit a `.env` file. A local script serves a one-page form on 127.0.0.1
behind a one-time token; it validates each key's shape, routes public config to `.env` and secret
keys to server-side storage, and **physically refuses** a secret-shaped key from entering the app's
files. Approved integrations are recorded by name only, never by value.

## What is actually proven versus merely built

I want you to weigh these differently, so here is the honest split.

**Proven by execution:** a real unsigned IPA exists and I verified its internal structure. The gate
passes 19/19 in both database modes. The security checks were each demonstrated against a
deliberately planted leak — a policy that mentions the user but still exposes every row, and a
stray grant to the anonymous role, both of which the *previous* version of the gate passed as
green.

**Not proven:** **no app has ever gone from idea to my phone end to end.** Not once.

## Known gaps (do not just rediscover these — go past them)

1. **Nothing ever runs the app and observes it.** The gate proves the code compiles and the
   database is sound; it proves nothing about whether the app works when tapped. This was
   demonstrated concretely: a build passed the gate while rendering a blank white page (a stale
   bundler cache had baked in undefined config). Fixed, but the class of failure is wide open.
2. The Supabase security-advisor check is executed and self-reported by the agent, not by a script.
3. Edge Functions have no scaffold, no template, and no gate coverage — yet the architecture makes
   them the mandatory home for every third-party secret.
4. No session time-box and no global sign-out — a lost phone's session renews indefinitely.
5. No static analysis of application code beyond a standard linter.
6. The specialists are prose charters. Nothing mechanically verifies that their designs are good.
7. A table can be exempted from two security checks by a comment in its own migration — a
   self-issued exemption.
8. Preview/ship still require a manual step from me each time.

## What I want from you

Assess it as an **agentic system** — the architecture, the control flow, the verification strategy,
the failure modes — not as a code-style review.

**1. Security. Treat this as a required section, and be specific.**
- Is Row-Level Security as the sole authorization layer sound for this architecture, given the
  client ships a public key? Where does that model break?
- Is the two-layer isolation check (static policy analysis + runtime impersonation probe) actually
  sufficient to prove cross-user isolation? What does it miss?
- Attack the secrets story: the key form, the source and bundle scanners, the public/secret routing.
  How would a secret still reach a shipped app?
- The anti-tamper guards protect against an agent weakening its own gate. Are they meaningful, or
  security theatre? What is the realistic bypass?
- Assess the **delivery** security posture: sideloading via a free Apple ID and a third-party
  signing tool, and a PWA on a public URL.
- Given these are personal apps with 1–50 users, tell me plainly which controls are **theatre at
  this scale** and should be dropped. I would rather have five checks I trust than twenty I ignore.

**2. The verification strategy.** Is "a deterministic script is the only definition of done" the
right core idea, or does it create a false sense of safety by measuring what is easy to measure?
What is the highest-value check that does not exist yet?

**3. The specialist architecture.** Is design-by-specialist / implement-by-one-executor the right
split? Does it actually raise engineering quality, or just add cost and latency? How would you
verify a specialist is contributing anything?

**4. The architectural bet.** No custom backend; Supabase plus RLS plus RPC plus Edge Functions.
Where does that ceiling get hit, and what would I have to give up to go past it?

**5. What would you do differently?** If your goal were exactly mine — a non-technical person
reliably getting good apps onto an iPhone with no Apple account, on Windows — what would you keep,
what would you delete, and what is missing entirely?

## How to answer

- **Read the repository before asserting anything about it.** If you cannot access it, say so
  explicitly and mark every claim as based only on my description.
- Cite specific files and lines when you criticise something.
- Rank findings by real risk **for personal apps with a handful of users**. Do not import
  enterprise assumptions. Calling for SOC2 or a SIEM here would tell me you did not read the brief.
- Separate "this is broken" from "this is a design trade-off I would make differently", and be
  explicit about which you are asserting.
- Where you are uncertain or lack evidence, say so rather than filling the gap confidently.
- Give me a blunt overall verdict with a score out of 100, and say what the same score would be for
  a best-in-class alternative, so I can calibrate.
- Finish with the **three things I should do next, in order.**
