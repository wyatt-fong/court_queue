create or replace function public.queued_party_counts_for_courts(p_court_ids uuid[])
returns table(court_id uuid, queued_party_count integer)
language sql
stable
security definer
set search_path = public
as $$
  select
    party.court_id,
    count(*)::integer as queued_party_count
  from public.court_parties party
  where party.court_id = any(p_court_ids)
    and party.status = 'queued'
  group by party.court_id;
$$;

revoke all on function public.queued_party_counts_for_courts(uuid[]) from public, anon, authenticated;
grant execute on function public.queued_party_counts_for_courts(uuid[]) to service_role;
