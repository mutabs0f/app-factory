---
name: app
description: Drive a whole app from one line — runs the S1→S5 factory stages end to end, stopping ONLY at the gates that genuinely need Basim. Use when he describes what he wants and expects you to just build it ("build me X", "make the app", "keep going", "carry on") rather than naming a stage.
---

# /app — the whole factory in one command

## STEP ZERO — run this before anything else, every time

```
node scripts/stage-guard.mjs --status
```

It prints where this app actually is: which stages are done, which are locked and why, which
human gates have been approved, and whether the gate has EVER gone green here. If it halts
because you are not inside an app repo, **stop and say so** — do not improvise.

Then, before each stage, `--enter` it; after each stage, `--complete` it; after Basim says yes
at a gate, `--approve` it:

```
node scripts/stage-guard.mjs --enter research-apis
node scripts/stage-guard.mjs --complete discuss
node scripts/stage-guard.mjs --approve brief
```

**This is not bookkeeping — it is the control flow.** `--enter` refuses when prerequisites are
unmet, and `--complete build` refuses without a green gate. The first real run of this factory
(spending-compass) skipped every stage, approved no gate, never ran verify.mjs once, and
nothing noticed, because the stage order lived only in prose like this paragraph. The guard is
what makes it real. Never work around it; if it blocks you, it is telling you something true.

Basim's words: *"I give the idea and the design, and it gets built."* He should not have to know
that there are seven stages. This skill runs them for him.

**You are still running the real stages** — `/new-app`, `/design-import`, `/preview`, `/build`,
`/review`, `/ship`. Read each one and follow it exactly when you reach it. This skill only removes
the need for him to *type* them. It grants **no** licence to skip a gate, soften a check, or report
a stage done without its evidence.

## The four times you stop

Everything else is yours. Stop, ask, and **wait** at exactly these points:

1. **The brief** (`/discuss`) — he agrees you understood the idea before anything is built.
2. **The integrations table** (`/research-apis`, confirmed in `/new-app`) — which external services
   the app will use, researched and **obtainability-checked**. His call, never yours.
3. **The phone preview** (`/preview`) — he walks the screens and reacts. His verbatim words go in
   `docs/REVIEW-LOG.md`. Your opinion of the screens is not a substitute.
4. **Ship** (`/ship`) — he approves before anything is published or installed.

The key form (`node scripts/collect-keys.mjs`) is not a stop *you* manage — run it in the
foreground and wait for it, as `/new-app` says.

## The run order

    S0  /discuss        → talk the idea through, propose don't interrogate → docs/BRIEF.md  [STOP]
        /research-apis  → find what services this app actually needs, CHECK HE CAN GET THEM,
                          → integrations table + config/integrations.json  [STOP — his approval]
    S1  /new-app        → SPEC + schema + DECISIONS (consuming the brief + approved integrations;
                          do NOT re-ask what /discuss already settled) + the key form
                          → hands him design/DESIGN-BRIEF.md for Claude Design
    S2  /design-import  → when his design zip lands in design/input/  (skip if he has no design:
                          scaffold plainly from the SPEC screen list and SAY that you did)
        /preview        → link and/or Expo Go  [STOP — his reaction]
    S3  /build          → wire it up under a /goal loop until scripts/verify.mjs exits 0
    S4  /review         → fresh-context reviewer + /code-review + the security gate
    S5  /ship           → IPA via CI, or the live URL  [STOP — his approval]

**`/discuss` and `/research-apis` run FIRST and are not optional.** Skipping to `/new-app` is what
produced an app whose only data source turned out to be unobtainable, after the schema was written.

## The specialists

Three Opus 5 domain designers back the building stages — `api-designer` (where each operation
lives and what its contract is), `backend-engineer` (schema, constraints, indexes, RLS
correctness, query cost) and `frontend-engineer` (screen architecture, the four states every
screen owes the user, Arabic/RTL, accessibility, perceived speed). `/new-app` consults the first
two before any SQL is written; `/build` consults whichever the change touches.

**They design; the executor implements.** Do not have specialists write competing halves of the
app — that is precisely how malaki ended up with two payment implementations and a client and
server that disagreed about auth. One writer, expert designs, deterministic gate.

Between stages: **commit**. A stage that produced artifacts and did not commit them has not
finished (provider-scout's entire S1 sat uncommitted for 10 days — don't repeat that).

## Rules that do not bend

- **`node scripts/verify.mjs` exiting 0 is the only verdict.** Not your judgement, not "it looks
  right". If it is red, you are not done — say what is red and keep working or halt honestly.
- **Never fabricate or assume a success signal.** A missing result is a failure that halts. If a
  check could not run, report it as failed, never as absent.
- **Never skip a stage silently.** If you skip one (no design supplied, PWA so no IPA), say which,
  and why, in plain words.
- **Stop on a blocker he alone can clear** (a key he can't obtain, a login only he can do, Docker
  needing his click). Say exactly what you need, and what is already done so nothing is lost.
- Read `LESSONS.md` before each stage; append to it whenever a fix takes more than one attempt.

## Telling him where things are

He is not a developer and is often on his phone. At each stop, in plain words:
- what just got built, in one sentence;
- what you need from him, as ONE action;
- what happens next.

No stage numbers, no file paths he doesn't need, no checklists. If something failed, show the real
error output — not a summary of it.
