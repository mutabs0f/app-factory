# Start-an-app prompt (Basim's fill-in template)

## Before you paste (once per app)

1. **Docker Desktop** open, whale icon steady. (It is slow to start — wait for it. If it
   refuses, that is fine: the gate can run against a cloud dev project instead.)
2. **New Claude Code session** with the folder set to `C:\Users\Thinkpad\Agents`.
3. Fill in the brackets below, paste the whole thing, send.
4. **When it finishes scaffolding, close that session and open a NEW one with the folder set
   to the new app** (`C:\Users\Thinkpad\Agents\<slug>`). Then type `/app`.

Step 4 matters: `Agents\` holds every project you have ever built, and a session sitting there
can see all of them. Inside the app folder it sees one app — which is the point.

That is it. Everything else is the system's job.

---

```
/new-app-project [slug-in-english-lowercase-with-dashes] "[App name — the idea in a few words]"

THE IDEA
[2-3 sentences: what the app does and why I want it. Plain words.]

WHO USES IT
[e.g. "just me" / "me and my family" / "people who ..."]

MUST-HAVE IN V1 (keep it short — this is version 1, not the dream)
- [feature 1]
- [feature 2]
- [feature 3]

NOT IN V1 (so nobody builds it)
- [things that sound nice but I don't need yet]

MY ANSWERS TO YOUR USUAL QUESTIONS
- Notifications when the app is closed: [yes / no]
- Shared with other people or private to me: [private / shared]
- On my phone as: [installed app / a link I add to my home screen / you decide and tell me why]

LOOK & FEEL (for the design brief you'll hand me)
- Language: [Arabic-first with English / English-first with Arabic]
- Mood & colors: [e.g. "calm, dark green, feels premium" — or "you decide"]
- Apps I like the feel of: [optional]

SERVICES
Only the defaults — show me the integrations table before adding anything, and check I can
actually get every key before you design around it.

WHILE YOU WORK
Scaffold the repo, then run /app and follow the factory stages in order. Stop for me at the
four gates: the brief, the integrations table, the phone preview, and ship. Open the key form
for me — run it in the FOREGROUND and wait; never ask me to edit a .env. Hand me the Claude
Design brief. Never report anything done without showing me the real command output, and
never a green you did not run.
```

---

## Notes for the session picking this up

- The answers above **pre-fill `/discuss` and `/new-app`'s questions — do not re-ask what is
  already answered.** Still present the integrations table and stop.
- Unanswered brackets mean "ask, or use the documented default and say which you used".
- The flow is: `/new-app-project` scaffolds the repo → open a fresh session **inside that
  folder** → **`/app`** drives `discuss → research-apis → new-app → design-import → preview
  → build → review → ship`. `/app` is the only command he types after the scaffold.

- **ONE APP AT A TIME. Do not bring other projects into this conversation.**
  `C:\Users\Thinkpad\Agents\` contains many unrelated systems. Do not list them, read them,
  compare against them, or mention another app by name unless Basim raises it. If the global
  Brain index tells you to survey `Projects/` notes before acting, that does not apply to
  building an app — the app's own repo is the whole scope. See the scoping rule at the top of
  the app's `CLAUDE.md`.

- **Where cross-app knowledge lives:** `docs/OBTAINABLE-SERVICES.md`, which ships inside every
  app. It records which external services Basim can actually obtain (some are hard-blocked in
  Saudi Arabia, and the wrong choice there kills an app after the schema is written).
  `/research-apis` reads it and verifies against live sources. That file is the *only* channel
  for lessons between apps — never another repo's history.

- **This system has never completed a full idea → phone run.** Treat this as the pilot: when
  something breaks, fix the cause AND append the failure signature to `LESSONS.md` so the
  next app is born without it. That is the point of the exercise.
