---
name: new-app-project
description: Scaffold a brand-new app repo from the app-factory template. Use when Basim starts a new app idea (e.g. "/new-app-project rafeeq-habits an Arabic-first habit tracker"). Clones the template, renames it, git-inits, then hands off to /new-app.
---

# /new-app-project <slug> "<idea>"

Bootstraps a fresh app repo cloned from the app-factory template, then hands off to the per-app `/new-app` (S1) skill. The **system** is the product — every app is a fresh, self-contained clone of the audited template.

## 1. Run the deterministic scaffolder
```
node C:\Users\Thinkpad\.claude\skills\new-app-project\scaffold.mjs <slug>
```
`<slug>` = lowercase letters/digits/hyphens (e.g. `rafeeq-habits`). It copies `Agents/app-factory/template` → `Agents/<slug>` (excluding node_modules/.expo/dist/.git/.agents/.env), renames app.json (name/slug/scheme + bundle id) and package.json, and `git init`s on `main` with a first commit. Show its output.

## 2. Guide Basim through the steps that need input or are slow
1. `cd C:\Users\Thinkpad\Agents\<slug>` then `npm install`.
2. `npx skills add supabase/agent-skills` — install the Supabase agent guardrails.
3. **GitHub remote** (required for the iOS CI build in `/ship`): `gh repo create <slug> --source . --push`. Ask Basim: **public** (free unlimited macOS CI minutes, but the code is public) or **private** (~200 free macOS min/month). Do NOT push without his choice.
4. Create/choose a dev Supabase project; copy `.env.example` → `.env` and fill in the project URL + **publishable** key; set the same two as GitHub Actions repo **Variables** (for CI). Never put the secret key anywhere.
5. **Connect Resend SMTP** on the Supabase project — email OTP cannot deliver codes on the free built-in email (see the app's `docs/DECISIONS.md`). Then set both "Confirm signup" and "Magic Link" templates to `{{ .Token }}`.
6. `supabase start`, then in Claude Code run **`/new-app "<idea>"`** to produce SPEC + schema + decisions.

## Honesty
Each step's success is shown by its real output — never report a step done without it. A missing result is a halt, not something to paper over.
