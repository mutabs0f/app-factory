#!/usr/bin/env node
// new-migration.mjs — scaffold a timestamped migration with the RLS pattern
// pre-filled, so every new table is born with row-level security.
//   node scripts/new-migration.mjs add_notes
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const name = process.argv[2];
if (!name || !/^[a-z0-9_]+$/.test(name)) {
  console.error('Usage: node scripts/new-migration.mjs <snake_case_name>');
  process.exit(1);
}

const now = new Date();
const stamp =
  now.getUTCFullYear().toString() +
  String(now.getUTCMonth() + 1).padStart(2, '0') +
  String(now.getUTCDate()).padStart(2, '0') +
  String(now.getUTCHours()).padStart(2, '0') +
  String(now.getUTCMinutes()).padStart(2, '0') +
  String(now.getUTCSeconds()).padStart(2, '0');

const dir = join(process.cwd(), 'supabase', 'migrations');
mkdirSync(dir, { recursive: true });
const file = join(dir, `${stamp}_${name}.sql`);
if (existsSync(file)) {
  console.error(`Refusing to overwrite existing ${file}`);
  process.exit(1);
}

const table = name.replace(/^(add|create)_/, '');

const template = `-- ${stamp}_${name}.sql
-- Every new table MUST enable RLS and define per-operation policies, with an
-- index on every policy column. Fill this in (or delete if not adding a table).

create table public.${table} (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.${table} enable row level security;
create index ${table}_user_id_idx on public.${table} (user_id);

create policy "read own"   on public.${table} for select to authenticated using ((select auth.uid()) = user_id);
create policy "insert own" on public.${table} for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "update own" on public.${table} for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "delete own" on public.${table} for delete to authenticated using ((select auth.uid()) = user_id);

-- REQUIRED: policies alone don't grant access under Supabase's always-revoked
-- default — the authenticated role needs matching GRANTs (match your policy ops).
grant select, insert, update, delete on public.${table} to authenticated;
`;

writeFileSync(file, template);
console.log(`Created ${file}`);
console.log('Next: edit the SQL, then `supabase db reset`, regenerate types, and run get_advisors.');
