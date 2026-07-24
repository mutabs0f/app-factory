---
name: undo
description: Put the app back the way it was before the last change, safely. Use when Basim says the app got worse, wants the previous version back, or asks to undo/revert/go back ("that broke it", "it was better before", "undo that").
---

# /undo — go back to a working version

Basim will say *"it was better before"*, never *"revert to HEAD~1"*. This turns that into the right
git operation, without losing anything.

## Rule zero: never destroy work to undo work

Do **not** use `git reset --hard`, `git checkout --force`, or delete files to satisfy an undo.
Every step below is recoverable. If you think you need a destructive command, stop and ask.

## 1. Save what's there now, first

Always, before anything else — even if the current state seems broken:

    git stash push -u -m "before-undo"

Now nothing can be lost. Tell him you did this in one clause ("saved your current version first").

## 2. Find the point he means

    git log --oneline -15

Map his words to a commit:
- *"before you changed the colours"* → the commit before that change.
- *"the last one that worked"* → the most recent commit whose message records a green gate, or the
  last stage-boundary commit (`S1:`, `S2:`, …). Prefer a stage boundary — those were verified.
- If it's ambiguous, **show him 2–3 candidates in plain words** ("the version with the login screen
  but no search" / "yesterday evening, before the map") and let him pick. Never guess silently.

## 3. Undo forward, not backward

Revert by adding a new commit — history stays intact and the undo is itself undoable:

    git revert --no-edit <commit>

For several commits in a row: `git revert --no-edit <oldest>^..<newest>`.

If he wants the whole tree back at an older state (not just one change undone):

    git restore --source=<commit> -- .
    git commit -m "Restore the version from <when, in plain words>"

Both keep every prior commit reachable. `git reflog` recovers anything, always.

## 4. Prove it's actually better

An undo is not done because git exited 0 — it's done when the app works:

    node scripts/verify.mjs

Green → say so and stop. **Still red → say so plainly.** Sometimes the old version was broken too,
and pretending otherwise wastes his day. If the undo didn't help, offer to go back one step further
or to fix the actual failure instead.

## 5. Tell him what happened

One short paragraph: what you put back, what he'll notice is different, and that his current
version is saved (`git stash list`) if he wants it again.

## If he decides the undo was wrong

    git stash pop          # bring back exactly what he had before the undo

Say this is available whenever an undo surprises him.
