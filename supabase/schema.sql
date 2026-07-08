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
  last_rotated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.court_parties (
  id uuid primary key default gen_random_uuid(),
  court_id uuid not null references public.courts(id) on delete cascade,
  status text not null default 'queued',
  position integer,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  constraint court_parties_status_check check (status in ('queued', 'active', 'canceled')),
  constraint court_parties_queued_position_check check (
    (status = 'queued' and position is not null and position > 0)
    or (status <> 'queued')
  )
);

create table if not exists public.court_party_members (
  id uuid primary key default gen_random_uuid(),
  party_id uuid not null references public.court_parties(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  display_name text not null,
  joined_at timestamptz not null default now(),
  joined_order integer not null,
  constraint court_party_members_joined_order_check check (joined_order > 0),
  constraint court_party_members_unique_user_per_party unique (party_id, user_id),
  constraint court_party_members_unique_order_per_party unique (party_id, joined_order)
);

create index if not exists court_parties_court_status_position_idx
on public.court_parties (court_id, status, position);

create unique index if not exists court_parties_one_active_per_court_idx
on public.court_parties (court_id)
where status = 'active';

create unique index if not exists court_parties_queued_position_per_court_idx
on public.court_parties (court_id, position)
where status = 'queued';

create index if not exists court_party_members_party_joined_order_idx
on public.court_party_members (party_id, joined_order);

create index if not exists court_party_members_user_idx
on public.court_party_members (user_id);

create or replace function public.enforce_court_party_member_limits()
returns trigger
language plpgsql
as $$
declare
  party_status text;
begin
  select status
  into party_status
  from public.court_parties
  where id = new.party_id;

  if party_status is null then
    raise exception 'Party does not exist.';
  end if;

  if party_status = 'canceled' then
    raise exception 'Cannot add members to a canceled party.';
  end if;

  if (
    select count(*)
    from public.court_party_members
    where party_id = new.party_id
      and (tg_op = 'INSERT' or id <> new.id)
  ) >= 4 then
    raise exception 'A party can have at most 4 members.';
  end if;

  if exists (
    select 1
    from public.court_party_members member
    join public.court_parties party on party.id = member.party_id
    where member.user_id = new.user_id
      and party.status in ('queued', 'active')
      and (tg_op = 'INSERT' or member.id <> new.id)
  ) then
    raise exception 'User is already active or queued in another party.';
  end if;

  return new;
end;
$$;

drop trigger if exists court_party_members_limits_trigger on public.court_party_members;

create trigger court_party_members_limits_trigger
before insert or update of party_id, user_id
on public.court_party_members
for each row
execute function public.enforce_court_party_member_limits();

create or replace function public.enforce_court_party_status_limits()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'active' and new.activated_at is null then
    new.activated_at = now();
  end if;

  if new.status in ('queued', 'active') then
    if (
      select count(*)
      from public.court_party_members
      where party_id = new.id
    ) > 4 then
      raise exception 'A party can have at most 4 members.';
    end if;

    if exists (
      select 1
      from public.court_party_members member
      join public.court_party_members other_member
        on other_member.user_id = member.user_id
       and other_member.party_id <> new.id
      join public.court_parties other_party
        on other_party.id = other_member.party_id
       and other_party.status in ('queued', 'active')
      where member.party_id = new.id
    ) then
      raise exception 'A user can only be active or queued in one party.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists court_parties_status_limits_trigger on public.court_parties;

create trigger court_parties_status_limits_trigger
before insert or update of status
on public.court_parties
for each row
execute function public.enforce_court_party_status_limits();

create or replace function public.remove_party_member_atomic(
  p_party_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_party public.court_parties%rowtype;
  v_queued_party record;
  v_next_position integer := 1;
begin
  select *
  into v_party
  from public.court_parties
  where id = p_party_id
  for update;

  if not found then
    raise exception 'Party not found.';
  end if;

  delete from public.court_party_members
  where party_id = p_party_id
    and user_id = p_user_id;

  if not found then
    raise exception 'Member not found in this party.';
  end if;

  if exists (
    select 1
    from public.court_party_members
    where party_id = p_party_id
  ) then
    return;
  end if;

  delete from public.court_parties
  where id = p_party_id;

  if v_party.status = 'queued' then
    for v_queued_party in
      select id, position
      from public.court_parties
      where court_id = v_party.court_id
        and status = 'queued'
      order by position
      for update
    loop
      if v_queued_party.position <> v_next_position then
        update public.court_parties
        set position = v_next_position
        where id = v_queued_party.id;
      end if;

      v_next_position := v_next_position + 1;
    end loop;
  end if;
end;
$$;

revoke all on function public.remove_party_member_atomic(uuid, uuid) from public;
revoke all on function public.remove_party_member_atomic(uuid, uuid) from anon;
revoke all on function public.remove_party_member_atomic(uuid, uuid) from authenticated;
grant execute on function public.remove_party_member_atomic(uuid, uuid) to service_role;

-- The remaining transactional party mutation functions are versioned in
-- migrations/20260708020000_add_atomic_party_mutations.sql.

insert into public.courts (number)
select number_value
from generate_series(1, 10) as number_value
on conflict (number) do nothing;
