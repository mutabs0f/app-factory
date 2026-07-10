# DECISIONS — <app name>

Every "OR" resolved to ONE choice, with the reason. No ambiguity reaches the build
(this is the anti-spaghetti discipline: malaki broke because an unresolved auth OR
let client and server pick different halves).

| Decision | Choice | Why |
|---|---|---|
| Auth | Email OTP (Supabase) | Factory default; no deep-link fragility |
| Authorization | Postgres RLS | Client is untrusted |
| Session storage | LargeSecureStore | Ships in template |
| Delivery |  |  |
