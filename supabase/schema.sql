create extension if not exists pgcrypto;

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

insert into public.courts (number)
select number_value
from generate_series(1, 10) as number_value
on conflict (number) do nothing;

