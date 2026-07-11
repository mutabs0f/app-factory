# DECISIONS — <app name>

Every "OR" resolved to ONE choice, with the reason. No ambiguity reaches the build
(this is the anti-spaghetti discipline: malaki broke because an unresolved auth OR
let client and server pick different halves).

| Decision | Choice | Why |
|---|---|---|
| Auth | Email OTP (Supabase) + custom SMTP (Resend) | Factory default; no deep-link fragility. SMTP is **required** — the free built-in email can't deliver codes (doc 04 §1). |
| Authorization | Postgres RLS + matching `GRANT`s | Client is untrusted; under Supabase's always-revoked default, policies alone don't grant access. |
| Session storage | LargeSecureStore | Ships in the template. |
| Leaked-password protection | **Waived (left disabled)** | The app is OTP-only — there are no user passwords to check against breach lists, so the advisor's WARN doesn't apply. Enable it if you ever add password auth. |
| Delivery |  | doc 03 decision tree — sideload IPA (native) or PWA. Fill in per app. |
