create extension if not exists pgcrypto;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  google_sub text not null unique,
  display_name text not null,
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.courts (
  id uuid primary key default gen_random_uuid(),
  number integer not null unique,
  rotation_minutes integer not null default 15,
  paused boolean not null default false,
  current_players jsonb not null default '[]'::jsonb,
  queue jsonb not null default '[]'::jsonb,
  last_rotated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- TODO(party-slots): Replace the courts.current_players/courts.queue jsonb model with:
-- - public.court_parties:
--   id uuid primary key
--   court_id uuid references public.courts(id) on delete cascade
--   status text check (status in ('queued', 'active', 'canceled'))
--   position integer nullable for active/canceled parties
--   created_by uuid references public.users(id)
--   created_at timestamptz default now()
--   activated_at timestamptz nullable
-- - public.court_party_members:
--   id uuid primary key
--   party_id uuid references public.court_parties(id) on delete cascade
--   user_id uuid references public.users(id)
--   display_name text not null
--   joined_at timestamptz default now()
--   joined_order integer not null
-- Add indexes/constraints after the exact migration path is decided:
-- - max 4 members per non-canceled party
-- - one active/queued membership per user across all courts
-- - one active party per court
-- - ordered queued parties per court

insert into public.courts (number)
select number_value
from generate_series(1, 10) as number_value
on conflict (number) do nothing;
