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
