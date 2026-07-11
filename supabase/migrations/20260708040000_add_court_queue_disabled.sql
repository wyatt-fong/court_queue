alter table public.courts
add column if not exists queue_disabled boolean not null default false;

create or replace function public.create_queued_party_atomic(
  p_court_id uuid,
  p_user_id uuid,
  p_display_name text
)
returns public.court_parties
language plpgsql
security definer
set search_path = public
as $$
declare
  v_court public.courts%rowtype;
  v_party public.court_parties%rowtype;
  v_position integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('party-user:' || p_user_id::text, 0));

  select *
  into v_court
  from public.courts
  where id = p_court_id
  for update;

  if not found then
    raise exception 'Court not found.';
  end if;

  if v_court.queue_disabled then
    raise exception 'Queueing is disabled for this court.';
  end if;

  if exists (
    select 1
    from public.court_party_members member
    join public.court_parties party on party.id = member.party_id
    where member.user_id = p_user_id
      and party.status in ('queued', 'active')
  ) then
    raise exception 'You are already on a court or in a queue.';
  end if;

  select coalesce(max(position), 0) + 1
  into v_position
  from public.court_parties
  where court_id = p_court_id
    and status = 'queued';

  insert into public.court_parties (
    court_id,
    status,
    position,
    created_by
  )
  values (
    p_court_id,
    'queued',
    v_position,
    p_user_id
  )
  returning * into v_party;

  insert into public.court_party_members (
    party_id,
    user_id,
    display_name,
    joined_order
  )
  values (
    v_party.id,
    p_user_id,
    p_display_name,
    1
  );

  return v_party;
end;
$$;

create or replace function public.join_party_atomic(
  p_party_id uuid,
  p_user_id uuid,
  p_display_name text,
  p_required_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_court public.courts%rowtype;
  v_court_id uuid;
  v_status text;
  v_member_count integer;
  v_joined_order integer;
begin
  if p_required_status not in ('queued', 'active') then
    raise exception 'Invalid party status.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('party-user:' || p_user_id::text, 0));

  select court_id
  into v_court_id
  from public.court_parties
  where id = p_party_id;

  if not found then
    raise exception 'Party not found.';
  end if;

  select *
  into v_court
  from public.courts
  where id = v_court_id
  for update;

  if v_court.queue_disabled then
    raise exception 'Queueing is disabled for this court.';
  end if;

  select status
  into v_status
  from public.court_parties
  where id = p_party_id
  for update;

  if not found then
    raise exception 'Party not found.';
  end if;

  if v_status <> p_required_status then
    raise exception 'Party is no longer %.', p_required_status;
  end if;

  if exists (
    select 1
    from public.court_party_members member
    join public.court_parties party on party.id = member.party_id
    where member.user_id = p_user_id
      and party.status in ('queued', 'active')
  ) then
    raise exception 'You are already on a court or in a queue.';
  end if;

  select count(*), coalesce(max(joined_order), 0) + 1
  into v_member_count, v_joined_order
  from public.court_party_members
  where party_id = p_party_id;

  if v_member_count >= 4 then
    raise exception 'Party is full.';
  end if;

  insert into public.court_party_members (
    party_id,
    user_id,
    display_name,
    joined_order
  )
  values (
    p_party_id,
    p_user_id,
    p_display_name,
    v_joined_order
  );
end;
$$;

create or replace function public.join_active_court_atomic(
  p_court_id uuid,
  p_user_id uuid,
  p_display_name text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_court public.courts%rowtype;
  v_party_id uuid;
  v_member_count integer;
  v_joined_order integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('party-user:' || p_user_id::text, 0));

  select *
  into v_court
  from public.courts
  where id = p_court_id
  for update;

  if not found then
    raise exception 'Court not found.';
  end if;

  if v_court.queue_disabled then
    raise exception 'Queueing is disabled for this court.';
  end if;

  if exists (
    select 1
    from public.court_party_members member
    join public.court_parties party on party.id = member.party_id
    where member.user_id = p_user_id
      and party.status in ('queued', 'active')
  ) then
    raise exception 'You are already on a court or in a queue.';
  end if;

  select id
  into v_party_id
  from public.court_parties
  where court_id = p_court_id
    and status = 'active'
  for update;

  if not found then
    raise exception 'No active party available for this court.';
  end if;

  select count(*), coalesce(max(joined_order), 0) + 1
  into v_member_count, v_joined_order
  from public.court_party_members
  where party_id = v_party_id;

  if v_member_count >= 4 then
    raise exception 'Active court is full.';
  end if;

  insert into public.court_party_members (
    party_id,
    user_id,
    display_name,
    joined_order
  )
  values (
    v_party_id,
    p_user_id,
    p_display_name,
    v_joined_order
  );
end;
$$;

create or replace function public.switch_queued_party_atomic(
  p_destination_party_id uuid,
  p_user_id uuid,
  p_display_name text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_destination_court public.courts%rowtype;
  v_source_party_id uuid;
  v_source_court_id uuid;
  v_source_status text;
  v_destination_court_id uuid;
  v_destination_status text;
  v_member_count integer;
  v_joined_order integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('party-user:' || p_user_id::text, 0));

  select party.id, party.court_id, party.status
  into v_source_party_id, v_source_court_id, v_source_status
  from public.court_party_members member
  join public.court_parties party on party.id = member.party_id
  where member.user_id = p_user_id
    and party.status in ('queued', 'active');

  if not found then
    raise exception 'You are not currently in a party.';
  end if;

  if v_source_status <> 'queued' then
    raise exception 'You cannot switch while active on a court.';
  end if;

  select court_id
  into v_destination_court_id
  from public.court_parties
  where id = p_destination_party_id;

  if not found then
    raise exception 'Destination party not found.';
  end if;

  if v_source_party_id = p_destination_party_id then
    raise exception 'You are already in this party.';
  end if;

  perform 1
  from public.courts
  where id in (v_source_court_id, v_destination_court_id)
  order by id
  for update;

  select *
  into v_destination_court
  from public.courts
  where id = v_destination_court_id;

  if v_destination_court.queue_disabled then
    raise exception 'Queueing is disabled for this court.';
  end if;

  perform 1
  from public.court_parties
  where id in (v_source_party_id, p_destination_party_id)
  order by id
  for update;

  select status
  into v_destination_status
  from public.court_parties
  where id = p_destination_party_id;

  if not found then
    raise exception 'Destination party not found.';
  end if;

  if v_destination_status <> 'queued' then
    raise exception 'Destination party is no longer queued.';
  end if;

  select count(*), coalesce(max(joined_order), 0) + 1
  into v_member_count, v_joined_order
  from public.court_party_members
  where party_id = p_destination_party_id;

  if v_member_count >= 4 then
    raise exception 'Destination party is full.';
  end if;

  delete from public.court_party_members
  where party_id = v_source_party_id
    and user_id = p_user_id;

  if not found then
    raise exception 'Your membership changed. Please try again.';
  end if;

  if not exists (
    select 1
    from public.court_party_members
    where party_id = v_source_party_id
  ) then
    delete from public.court_parties
    where id = v_source_party_id;

    perform public.compact_queued_parties_locked(v_source_court_id);
  end if;

  insert into public.court_party_members (
    party_id,
    user_id,
    display_name,
    joined_order
  )
  values (
    p_destination_party_id,
    p_user_id,
    p_display_name,
    v_joined_order
  );
end;
$$;

create or replace function public.switch_to_new_queued_party_atomic(
  p_court_id uuid,
  p_user_id uuid,
  p_display_name text
)
returns public.court_parties
language plpgsql
security definer
set search_path = public
as $$
declare
  v_destination_court public.courts%rowtype;
  v_source_party_id uuid;
  v_source_court_id uuid;
  v_source_status text;
  v_position integer;
  v_party public.court_parties%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended('party-user:' || p_user_id::text, 0));

  select party.id, party.court_id, party.status
  into v_source_party_id, v_source_court_id, v_source_status
  from public.court_party_members member
  join public.court_parties party on party.id = member.party_id
  where member.user_id = p_user_id
    and party.status in ('queued', 'active');

  if not found then
    raise exception 'You are not currently in a party.';
  end if;

  if v_source_status <> 'queued' then
    raise exception 'You cannot switch while active on a court.';
  end if;

  perform 1
  from public.courts
  where id in (v_source_court_id, p_court_id)
  order by id
  for update;

  select *
  into v_destination_court
  from public.courts
  where id = p_court_id;

  if not found then
    raise exception 'Destination court not found.';
  end if;

  if v_destination_court.queue_disabled then
    raise exception 'Queueing is disabled for this court.';
  end if;

  perform 1
  from public.court_parties
  where id = v_source_party_id
  for update;

  if not found then
    raise exception 'Your membership changed. Please try again.';
  end if;

  delete from public.court_party_members
  where party_id = v_source_party_id
    and user_id = p_user_id;

  if not found then
    raise exception 'Your membership changed. Please try again.';
  end if;

  if not exists (
    select 1
    from public.court_party_members
    where party_id = v_source_party_id
  ) then
    delete from public.court_parties
    where id = v_source_party_id;

    perform public.compact_queued_parties_locked(v_source_court_id);
  end if;

  select coalesce(max(position), 0) + 1
  into v_position
  from public.court_parties
  where court_id = p_court_id
    and status = 'queued';

  insert into public.court_parties (
    court_id,
    status,
    position,
    created_by
  )
  values (
    p_court_id,
    'queued',
    v_position,
    p_user_id
  )
  returning * into v_party;

  insert into public.court_party_members (
    party_id,
    user_id,
    display_name,
    joined_order
  )
  values (
    v_party.id,
    p_user_id,
    p_display_name,
    1
  );

  return v_party;
end;
$$;

create or replace function public.rotate_party_court_atomic(
  p_court_id uuid,
  p_only_if_due boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_court public.courts%rowtype;
  v_next_party_id uuid;
begin
  select *
  into v_court
  from public.courts
  where id = p_court_id
  for update;

  if not found then
    raise exception 'Court not found.';
  end if;

  if v_court.paused or v_court.queue_disabled then
    return false;
  end if;

  if p_only_if_due and
     v_court.last_rotated_at + make_interval(mins => v_court.rotation_minutes) > now() then
    return false;
  end if;

  delete from public.court_parties
  where court_id = p_court_id
    and status = 'active';

  select id
  into v_next_party_id
  from public.court_parties
  where court_id = p_court_id
    and status = 'queued'
  order by position
  limit 1
  for update;

  if v_next_party_id is not null then
    update public.court_parties
    set
      status = 'active',
      position = null,
      activated_at = now()
    where id = v_next_party_id;

    perform public.compact_queued_parties_locked(p_court_id);
  end if;

  update public.courts
  set last_rotated_at = now()
  where id = p_court_id;

  return true;
end;
$$;

create or replace function public.rotate_due_party_courts_atomic()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_court_id uuid;
  v_rotated_count integer := 0;
begin
  for v_court_id in
    select id
    from public.courts
    where paused = false
      and queue_disabled = false
      and last_rotated_at + make_interval(mins => rotation_minutes) <= now()
    order by number
  loop
    if public.rotate_party_court_atomic(v_court_id, true) then
      v_rotated_count := v_rotated_count + 1;
    end if;
  end loop;

  return v_rotated_count;
end;
$$;

create or replace function public.toggle_court_queue_disabled_atomic(p_court_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_queue_disabled boolean;
begin
  update public.courts
  set queue_disabled = not queue_disabled
  where id = p_court_id
  returning queue_disabled into v_queue_disabled;

  if not found then
    raise exception 'Court not found.';
  end if;

  return v_queue_disabled;
end;
$$;

revoke all on function public.toggle_court_queue_disabled_atomic(uuid) from public, anon, authenticated;
grant execute on function public.toggle_court_queue_disabled_atomic(uuid) to service_role;
