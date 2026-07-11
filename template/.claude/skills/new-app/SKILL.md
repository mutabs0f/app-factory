---
name: new-app
description: Turn a one-line idea into the app's SPEC, schema migration, and resolved DECISIONS as the first real commit. Use for stage S1 (SPEC) — the very start of a new app, before any screen or design work. Ends only on a green S1 gate.
---

# /new-app — S1 SPEC (idea → spec + schema + decisions)

Turn `/new-app <idea>` into three committed artifacts — a one-page SPEC, the schema migration(s), and every "OR" resolved in DECISIONS — then prove the schema is clean. This is the anti-spaghetti gate: nothing ambiguous reaches DESIGN or BUILD.

## Before you start
- Read `LESSONS.md` (repo root) and `docs/SPEC.md` (the skeleton you'll fill).
- Bring the local stack up: `supabase start` (Docker) — the S1 gate needs it.
- Wire the Supabase MCP: `cp .mcp.json.example .mcp.json`, set your dev project ref + `$SUPABASE_ACCESS_TOKEN` in your env (`get_advisors` and any MCP write need it), and put that **same dev ref in `.dev-branch`** — the push guard blocks MCP writes to anything not listed there.

## 1. Ask AT MOST 5 questions
One batch, then stop asking. Cover only:
1. **Target users** — who opens this app?
2. **Must-have v1 features** — the shortest list that makes it useful.
3. **Remote PUSH?** — does it need to notify users when the app is closed?
4. **Shareable?** — one person's private tool, or used by others together?
5. **Delivery preference** — installed app on the phone, or a link (PWA)?

If Basim gave enough in the idea line, ask fewer. Do not interrogate — infer sane defaults and note them in DECISIONS.

## 2. Write `docs/SPEC.md` (PRD-lite, ONE page)
If it doesn't fit on a page, it's too big for v1 — cut. Fill the skeleton:
- **Problem & users** — one line each.
- **Features (v1)** — the table, each row with **EN + AR** names.
- **Screens** — the explicit SCREEN LIST (this is what DESIGN and BUILD consume).
- **Non-goals** — what v1 explicitly will NOT do. Be concrete; this is where scope creep dies.

## 3. Write the schema migration(s) — single source of truth
Scaffold, don't hand-write: `node scripts/new-migration.mjs <name>` per table/concern. Edit each scaffold — it already includes RLS + per-op policies + policy-column indexes + **matching GRANTs** (policies alone don't grant access under Supabase's always-revoked default). The migration is the ONLY source of truth for the schema. After applying:
- Regenerate `src/types/database.types.ts` from the live schema.
- Run `get_advisors` (security) — see the gate below.

## 4. Write `docs/DECISIONS.md` — resolve every "OR" to ONE choice
No ambiguity survives into BUILD (malaki broke because an unresolved auth OR let client and server pick different halves). Lock these:
- **Auth** → Email OTP + **custom SMTP (Resend)**. Required, not optional.
- **Authorization** → Postgres RLS + matching GRANTs. The client is untrusted.
- **Delivery** → walk this ORDERED list, take the FIRST match, record the reason (the DECISIONS default is sideload IPA):
  1. needs **remote push while the app is closed** → **PWA** (push wins the tiebreak; note the limited iOS PWA-push support) — or a dev-client build if native push is truly mandatory.
  2. else needs **custom native modules** → **dev-client sideload**.
  3. else wants a **real installed app** (the default) → **Expo Go for dev + sideload IPA via Sideloadly**.
  4. else **simplest / link-shareable** → **PWA**.
- **Leaked-password protection** → **waived** (OTP-only; there are no user passwords).

## 5. Integrations — get Basim's approval BEFORE any key work
**No external service, API, or SDK enters the app without Basim's explicit approval.** After the SPEC, present an **integrations table** and STOP for his OK (he can strike or add rows):

| Service | What it does in THIS app | Free tier? | Key(s) needed | Where he gets it |
|---|---|---|---|---|
| Supabase | Backend + database + auth | Yes | `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase dashboard → Project Settings → API |
| Resend | Delivers the email OTP code (the free built-in email can't) | Yes | Resend API key → Supabase SMTP settings | resend.com → API Keys |

"It would be nice to have" is not a reason to add a service. Only **approved** integrations go into:
- `docs/DECISIONS.md` (the "## Integrations (approved)" list), and
- `config/integrations.json` (one entry per key — **names, howToGet, format, destination; NEVER values**). Use `app-env` for public `EXPO_PUBLIC_*` config; `supabase-secret` for anything secret (it never touches `.env`).

**Auth email still needs two dashboard steps** (record them; `verify.mjs` can't catch dashboard config): (1) connect the **Resend SMTP** on the Supabase project; (2) set BOTH email templates ("Confirm signup" + "Magic Link") to contain `{{ .Token }}` so they send the 6-digit code, not a link — the exact bug that cost the pilot. Confirm with a real test-send.

## 6. Collect the keys — the one-page form (Basim never edits `.env`)
Once the integrations are approved and in `config/integrations.json`, run:
```
node scripts/collect-keys.mjs
```
It opens a local page in his browser (127.0.0.1 only, one-time token, sends nothing anywhere): one box per key, a plain "why this app needs it", the exact click-path to get it, and live validation that rejects a wrong-shaped or secret key. On save it writes the public keys to `.env` itself and routes secret keys to the guided dashboard step — **you never hand-edit `.env`, and a secret key is physically refused from the app's files.**

## The S1 gate (do not advance on red)
Both must be green, and you must **show the output**:
1. `node scripts/verify.mjs` exits 0 — replays all migrations from zero AND asserts RLS coverage, definer-fn exposure, **table GRANTs**, generated-types freshness, and **`env complete`** (the required keys from the manifest are present — red before `collect-keys`, green after). The canonical verdict (CLAUDE.md principle #2).
2. `get_advisors` (security) — zero **unresolved** findings (each fixed at its source, or explicitly waived with a written reason in `docs/DECISIONS.md`, e.g. leaked-password for an OTP-only app).

A red verify or an unwaived advisor finding HALTS. Fix the migration at its source (never the dashboard, never `execute_sql` patches) and re-run. Never self-report green — the command output is the verdict.

## 7. Hand Basim the design brief for Claude Design
Generate the brief from the SPEC and give it to him:
```
node scripts/design-brief.mjs
```
This writes `design/DESIGN-BRIEF.md` — a ready-to-paste prompt whose screen list is exactly the SPEC's, with output-format instructions that make the export importable. Tell Basim to: paste it into **Claude Design** (claude.ai → new chat → Design), design every screen, **export the ZIP**, and drop it into `design/input/`. Then S2 (`/design-import`) picks it up.

## Commit
This is the app's **first real commit**: `docs/SPEC.md`, the migration(s), regenerated `database.types.ts`, `docs/DECISIONS.md`, `config/integrations.json`, and `design/DESIGN-BRIEF.md`. (`.env` stays gitignored — never commit it.) Then hand off to **S2 (`/design-import`, `/preview`)**.
