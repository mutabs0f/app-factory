# LESSONS

Append one line whenever a `/goal` loop needs more than one attempt:
**failure signature → winning fix.** Stable lessons get promoted into `CLAUDE.md`,
into `scripts/verify.mjs` (a new check is the strongest encoding), or into the
template itself — so the next app is born without the bug.

## Environment
- **Supabase CLI subprocesses need `docker` on PATH.** `supabase gen types` and
  `supabase db reset` spawn a container-runtime CLI and fall back to podman
  (which fails) when `docker` isn't found — e.g. in a shell opened before Docker
  Desktop was installed. `scripts/verify.mjs` refreshes PATH from the Windows
  registry to avoid this. Symptom: `PlatformError: ... podman ...`. Fix: open a
  fresh terminal, or ensure `C:\Program Files\Docker\Docker\resources\bin` is on PATH.

## Testing
- **`@testing-library/react-native` v14 `renderHook` is async** — `await` it, or
  destructuring `{ result }` yields `undefined` (tsc catches this).

## Supabase
- **A PAUSED project fakes a perfect security score.** Free-tier projects go
  `INACTIVE` after ~a week idle. `get_advisors` on a paused project returns
  `{"lints":[]}` — byte-identical to "zero findings", which is the exact green the S1
  gate wants. Verified 2026-07-24 against `provider-scout-dev` (INACTIVE): the advisor
  call returned an empty lints array. **Always `list_projects` and require
  `status: ACTIVE_HEALTHY` before believing an advisor result.** This is the
  fabricated-success failure class (principle #1) reappearing from the vendor side
  rather than from our own code — a missing signal that *looks* like a passing one.
- **A `SECURITY DEFINER` function in the `public` schema is exposed as a PostgREST
  RPC** and get_advisors flags it (anon/authenticated can call it — a privilege-
  escalation surface). Trigger functions don't need EXECUTE granted to callers (the
  trigger runs as owner), so end the migration with
  `revoke execute on function public.<fn>() from public, anon, authenticated;`.
  verify.mjs now checks this locally ("definer fn exposure").
- **Email OTP needs `{{ .Token }}` in BOTH the "Confirm signup" (first-time users)
  AND "Magic Link" (returning users) templates** (dashboard → Authentication → Email
  Templates). A new user's first `signInWithOtp` sends the "Confirm signup" email —
  by default a link to the Site URL (localhost:3000), which fails — not the code.
  Also: a first-time signup verifies with `verifyOtp({type:'signup'})`, so
  features/auth/api.ts tries type 'email' then falls back to 'signup'.
- **The free built-in Supabase email service CANNOT deliver OTP codes.** It only
  sends link-based emails, and the template body is READ-ONLY until you connect a
  provider ("Set up custom SMTP to edit the source"). So the email-OTP *code* flow
  REQUIRES custom SMTP (e.g. Resend free tier) configured per project — then set
  both templates to `{{ .Token }}`. `/new-app` must provision SMTP as part of setup.
  Verified on the pilot 2026-07-10: app + auth wiring worked end-to-end (account +
  auto-profile created), but the code never arrived because built-in email sends
  links only. Without SMTP the only built-in path is magic-LINK + deep-linking.
