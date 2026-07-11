---
name: review
description: Fresh-context review of the build diff — spawn the code-reviewer + db-guard subagents, run a second /code-review pass and the executed security gate, then triage findings. Use for stage S4 (REVIEW) after /build is green, before /ship.
---

# /review — S4 REVIEW (fresh context)

Fresh eyes on the build before it ships. Zero Basim time until a decision actually needs him. Two independent review passes + the executed security gate, every finding triaged and logged to disk.

## Before you start
- Read `docs/SPEC.md` and `LESSONS.md`.
- Confirm the tree is green: `node scripts/verify.mjs` exited 0 **this session** — reviewing a red tree wastes both passes.
- Establish the diff range: since the last release tag (`v*`), or the build's first commit if none yet. Everything below reviews THAT diff.

## 1. Fresh-context reviewer
Spawn the **code-reviewer** subagent on the diff range + `docs/SPEC.md`. It did not write the code — don't defend the code, read its findings. It returns structured findings: `file:line`, severity, one-line why-real (a concrete failure scenario).

## 2. DB guard (only if migrations changed)
If the diff touched `supabase/migrations/`, spawn the **db-guard** subagent on those files. It returns a PASS/FAIL per table against the canonical RLS + GRANT pattern (and semantic catches a query can't make — wrong owner column, `user_metadata`, definer exposure).

## 3. Second independent pass
Run the bundled `/code-review` at **medium** effort. Two independent reviewers, not one — treat findings both passes raise as high-confidence.

## 4. Triage every finding (log to disk, max 2 rounds each)
Record each finding in `docs/REVIEW-LOG.md` (Findings table) — **on disk, not in memory**, so nothing is silently forgotten. Classify each:
- **agent_fixable** → fix it through the `/build` goal loop, then re-run `node scripts/verify.mjs` to green. The fix isn't real until verify exits 0.
- **human_only** → surface to Basim as **MACHINE EVIDENCE**, never a generated checklist: the failing test output, the `get_advisors` finding, the diff stat, the reviewer's `file:line`. He decides; you don't editorialize the verdict.
- Each finding gets **at most 2 fix rounds** (tracked in the log's Rounds column). Still red after 2 → stop and escalate the real output to Basim; never a third silent attempt, never papered over.
- Encode any multi-attempt fix as one line in `LESSONS.md`.

## 5. The executed security gate (doc 04 §7)
Beyond `verify.mjs`, run these against the live project and record results in `REVIEW-LOG.md` — all must be clean (or each explicitly waived with a written reason, e.g. leaked-password in `DECISIONS.md`):
- **`get_advisors`** (security AND performance): zero unresolved.
- **RLS coverage + secret scan**: green — `verify.mjs` asserts these; confirm, don't assume.
- **No policy references `user_metadata`** (user-editable → privilege escalation).
- **Storage buckets private** with their own `storage.objects` policies (only if the app uses storage).
- **Supabase auth settings**: email confirmations ON, OTP expiry ≤ 3600s.

## The exit — nothing reaches /ship until both hold
1. `node scripts/verify.mjs` exits 0 on the FINAL tree this session — show the output.
2. Every finding is either resolved (re-verified green) or explicitly accepted by Basim on the evidence — recorded in `docs/REVIEW-LOG.md`.

A finding that is neither fixed nor accepted HALTS review. Never self-report the review clean — the on-disk log plus the green gate are the only record.
