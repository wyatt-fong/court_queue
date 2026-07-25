create table if not exists public.app_maintenance_state (
  key text primary key,
  last_ran_at timestamptz not null default 'epoch'::timestamptz,
  updated_at timestamptz not null default now()
);

insert into public.app_maintenance_state (key, last_ran_at)
values ('rotate_due_party_courts', 'epoch'::timestamptz)
on conflict (key) do nothing;

alter table public.app_maintenance_state enable row level security;

create or replace function public.maybe_rotate_due_party_courts_atomic(p_min_interval_seconds integer default 30)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_last_ran_at timestamptz;
  v_rotated_count integer := 0;
begin
  insert into public.app_maintenance_state (key, last_ran_at)
  values ('rotate_due_party_courts', 'epoch'::timestamptz)
  on conflict (key) do nothing;

  select last_ran_at
  into v_last_ran_at
  from public.app_maintenance_state
  where key = 'rotate_due_party_courts'
  for update;

  if v_last_ran_at + make_interval(secs => p_min_interval_seconds) > now() then
    return 0;
  end if;

  update public.app_maintenance_state
  set
    last_ran_at = now(),
    updated_at = now()
  where key = 'rotate_due_party_courts';

  v_rotated_count := public.rotate_due_party_courts_atomic();

  return v_rotated_count;
end;
$$;

revoke all on table public.app_maintenance_state from public, anon, authenticated;
revoke all on function public.maybe_rotate_due_party_courts_atomic(integer) from public, anon, authenticated;
grant execute on function public.maybe_rotate_due_party_courts_atomic(integer) to service_role;
