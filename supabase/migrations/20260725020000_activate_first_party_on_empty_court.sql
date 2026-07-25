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
  v_has_active_party boolean;
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

  select exists (
    select 1
    from public.court_parties
    where court_id = p_court_id
      and status = 'active'
  )
  into v_has_active_party;

  if v_has_active_party then
    select coalesce(max(position), 0) + 1
    into v_position
    from public.court_parties
    where court_id = p_court_id
      and status = 'queued';
  end if;

  insert into public.court_parties (
    court_id,
    status,
    position,
    created_by,
    activated_at
  )
  values (
    p_court_id,
    case when v_has_active_party then 'queued' else 'active' end,
    case when v_has_active_party then v_position else null end,
    p_user_id,
    case when v_has_active_party then null else now() end
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

  if not v_has_active_party then
    update public.courts
    set last_rotated_at = now()
    where id = p_court_id;
  end if;

  return v_party;
end;
$$;
