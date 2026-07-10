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
- **A `SECURITY DEFINER` function in the `public` schema is exposed as a PostgREST
  RPC** and get_advisors flags it (anon/authenticated can call it — a privilege-
  escalation surface). Trigger functions don't need EXECUTE granted to callers (the
  trigger runs as owner), so end the migration with
  `revoke execute on function public.<fn>() from public, anon, authenticated;`.
  verify.mjs now checks this locally ("definer fn exposure").
- **Email OTP needs `{{ .Token }}` in the Magic Link email template** (dashboard →
  Authentication → Email Templates), or the email sends a magic link instead of the
  6-digit code the app's verify-otp screen expects.
