# DECISIONS — <app name>

Every "OR" resolved to ONE choice, with the reason. No ambiguity reaches the build
(this is the anti-spaghetti discipline: malaki broke because an unresolved auth OR
let client and server pick different halves).

Write each Choice with NO "or"/"OR": mean "support both" with "+" or "and" (e.g. "Apple +
Google"). `verify.mjs` fails the gate on an empty Choice or one that still reads "X or Y".

| Decision | Choice | Why |
|---|---|---|
| Auth | Email OTP (Supabase) + custom SMTP (Resend) | Factory default; no deep-link fragility. SMTP is **required** — the free built-in email can't deliver codes. |
| Authorization | Postgres RLS + matching `GRANT`s | Client is untrusted; under Supabase's always-revoked default, policies alone don't grant access. |
| Session storage | LargeSecureStore | Ships in the template. |
| Leaked-password protection | **Waived (left disabled)** | The app is OTP-only — there are no user passwords to check against breach lists, so the advisor's WARN doesn't apply. Enable it if you ever add password auth. |
| Delivery | Expo Go (dev) + sideload IPA via Sideloadly (7-day) | Factory default given no Apple Developer account; a PWA is the alternative for push-first apps. Re-decide per app in /new-app. |

## Integrations (approved — only these get keys)
Only services Basim approved in the S1 integrations table get keys. Each maps to entries in
`config/integrations.json` (names only). Add a bullet per approved service; strike any he removes.
- **Supabase** — backend + database + auth (free tier). Keys: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (both `app-env`; in the starter manifest).
- **Resend** — delivers the email OTP code via Supabase SMTP (free tier). Dashboard-set (`supabase-secret`), plus `{{ .Token }}` in both email templates. Add its manifest entry when you wire SMTP.
