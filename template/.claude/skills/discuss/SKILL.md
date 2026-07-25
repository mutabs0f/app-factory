---
name: discuss
description: Talk the app idea through with Basim until it is sharp enough to build — proposing a concrete version and reacting to his corrections, not interrogating him. Use at the very start of a new app, before any research, spec, schema or code. Ends with an agreed docs/BRIEF.md.
---

# /discuss — think the idea through WITH him

The old flow asked five questions and started building. Basim asked for the opposite: *"it will
analyze and discuss with me."* This is that stage. There is **no question limit** — but there is a
hard rule about the shape of the conversation.

## The one rule: propose, don't interrogate

A wall of questions is homework. A concrete proposal he can react to is progress. **Never open with
a questionnaire.** Open with the app you think he means, described as if it already existed.

> "Here's what I think you want: an app where you type a job like *'fix a door'*, pick your area in
> Riyadh, and get five carpenters ranked by how trustworthy their reviews actually look — with a
> call button. Four screens. It wouldn't book anything or take payments; it just tells you who to
> call. Is that it, or have I got it wrong?"

He corrects one thing. You re-propose. Two or three rounds and the idea is sharper than twenty
questions would have made it. Ask a direct question only when **you genuinely cannot proceed** and
no sensible default exists.

## What you are doing while you talk

1. **Restate the idea in one paragraph, in his words.** If you can't, you don't understand it yet —
   say so and ask for the missing piece.
2. **Propose a concrete v1**: the screen list, what each screen shows, and the single thing the app
   is *for*. Concrete beats complete.
3. **Propose what's NOT in v1**, out loud. This is where scope creep dies, and it is much easier for
   him to say "no, I do want that" than to invent a cut list.
4. **Raise what he hasn't thought of** — the 2-3 things that will actually bite:
   - Where does the data come from? (Is there even a source? Does he have to type it all in?)
   - What happens the *second* time he opens it — is there anything there?
   - Does it need to work offline / on cellular / in Arabic RTL?
   - Is he the only user, or do other people see each other's data? (This decides the whole
     security model — see below.)
   - Does anything need to happen while the app is closed? (That single answer decides PWA vs
     sideloaded IPA — sideloaded apps cannot receive remote push at all.)
5. **Name the risky part early.** If the idea depends on data or a service that may not exist or may
   not be obtainable, say so NOW — do not let him fall in love with a design that dies at the key
   form. `/research-apis` will confirm it; your job here is to flag it.

## Security is part of the conversation, not a later chore

You must settle **who can see what** during this stage, in plain words, and write it into the brief.
Ask it as a scenario, never as jargon:

> "If your brother installed this too — should he see your entries, or only his own?"

Then translate his answer yourself into the data rules (`docs/BRIEF.md` → "Who sees what"), because
that is what the schema's RLS policies get generated from. **Never ask him about RLS, policies,
roles or tokens.** If the app stores anything personal — health, money, location, names, anything
about other real people — say plainly that it will be private to his account by default, and that
this is not optional.

## Keep it phone-sized

He usually reads this on his iPhone. Each message: a short paragraph, then at most one question.
No tables, no checklists, no stage numbers, no file paths. If you need to show the screen list, a
short bullet list is fine — nothing wider than a phone.

Write in his language: if the app is Arabic-first, use Arabic names for the screens in the brief.

## Converge — don't discuss forever

When he stops correcting you, or says some version of "yes, that's it", **stop**. Write
`docs/BRIEF.md`:

```markdown
# <App> — what we agreed
## In one paragraph
## Screens            (name + one line each, EN + AR)
## Not in v1          (explicitly cut)
## Who sees what      (plain words — becomes the RLS policy)
## Where the data comes from
## Open questions     (things research must answer — e.g. "is there an obtainable API for X?")
## Delivery           (installed app / link — and WHY, from the push + native answers)
```

Read it back to him in three or four lines and get a "yes" before moving on. Then hand off to
**`/research-apis`**, which turns "Open questions" and "Where the data comes from" into a real,
obtainability-checked integrations table.

## Never

- Never start writing a SPEC, schema, or code from this stage. Discussion produces a brief, nothing else.
- Never present a service, API or vendor as decided here — that is `/research-apis`'s job, and it
  must check he can actually obtain it before it is proposed.
- Never let a "sounds nice" feature into v1 without him choosing it against something else.
- Never fill a gap by inventing what he meant. Ask, or state the assumption plainly in the brief.
