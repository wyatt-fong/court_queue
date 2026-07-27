create or replace function public.delete_party_atomic(p_party_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_court_id uuid;
  v_next_party_id uuid;
  v_status text;
begin
  select court_id
  into v_court_id
  from public.court_parties
  where id = p_party_id;

  if not found then
    raise exception 'Party not found.';
  end if;

  perform 1
  from public.courts
  where id = v_court_id
  for update;

  select status
  into v_status
  from public.court_parties
  where id = p_party_id
  for update;

  if not found then
    raise exception 'Party not found.';
  end if;

  delete from public.court_parties
  where id = p_party_id;

  if v_status = 'queued' then
    perform public.compact_queued_parties_locked(v_court_id);
    return;
  end if;

  if v_status = 'active' then
    select id
    into v_next_party_id
    from public.court_parties
    where court_id = v_court_id
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

      perform public.compact_queued_parties_locked(v_court_id);

      update public.courts
      set last_rotated_at = now()
      where id = v_court_id;
    end if;
  end if;
end;
$$;
