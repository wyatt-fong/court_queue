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
