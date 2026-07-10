# App Factory Template (Expo SDK 54 + Supabase)

A self-contained template for building a mobile app with a clean, RLS-first
Supabase backend and email-OTP auth — installable on a physical iPhone with **no
Apple Developer account** (sideloaded IPA) or as a PWA. Read [CLAUDE.md](CLAUDE.md)
for the operating rules; read [LESSONS.md](LESSONS.md) before each stage.

## Prerequisites
- Node ≥ 20, Git, Docker Desktop (for local Supabase), Supabase CLI, GitHub CLI.
- Supabase project (dev). Copy `.env.example` → `.env` and fill in the URL +
  **publishable** key. Never put the secret key here.

## Develop
```bash
npm install
supabase start        # local Postgres + Auth (Docker)
npx expo start --tunnel   # scan the QR with Expo Go on your iPhone (cellular OK)
```

## The gate (run every turn — this is the only "done")
```bash
node scripts/verify.mjs
```
Runs: typecheck · lint · jest · `expo export` · `supabase db reset` + RLS coverage
· secret scan · generated-types freshness. Requires `supabase start` running.

## Structure
```
src/app/          expo-router routes — thin re-exports only
src/features/     screen + api.ts + hooks.ts per feature
src/lib/          supabase.ts, storage.ts (LargeSecureStore), auth.tsx (session gate)
src/types/        database.types.ts (GENERATED — never hand-edit)
supabase/migrations/   the ONLY schema channel (RLS in every table)
scripts/          verify.mjs, secret-scan.mjs, new-migration.mjs, guard-bash.mjs
```

## Add a table
```bash
node scripts/new-migration.mjs add_notes   # RLS pre-filled
supabase db reset
supabase gen types typescript --db-url "postgresql://postgres:postgres@127.0.0.1:54322/postgres" > src/types/database.types.ts
```

## Ship to iPhone (sideload)
Push a `v*` tag (or run the **iOS build** workflow) → GitHub Actions builds an
**unsigned IPA** on a macOS runner → download it → sign & install from Windows
with **Sideloadly** (free Apple ID). Set repo variables `EXPO_PUBLIC_SUPABASE_URL`
and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` first.

- **7-day re-sign:** sideloaded apps stop launching after 7 days until re-signed;
  app data persists. Keep Sideloadly's Wi-Fi auto-refresh running, or re-drag weekly.
- **Max 3 sideloaded apps** at once; no remote push (Apple free-account policy) →
  push-dependent apps go the PWA route.
- **Don't rush iOS updates** — point releases can break sideloading for days; check
  sideloadly.io / altstore.io compatibility first.
