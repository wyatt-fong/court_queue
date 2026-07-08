create or replace function public.toggle_party_court_pause_atomic(p_court_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_paused boolean;
begin
  update public.courts
  set paused = not paused
  where id = p_court_id
  returning paused into v_paused;

  if not found then
    raise exception 'Court not found.';
  end if;

  return v_paused;
end;
$$;

revoke all on function public.toggle_party_court_pause_atomic(uuid)
from public, anon, authenticated;

grant execute on function public.toggle_party_court_pause_atomic(uuid)
to service_role;

alter table public.courts
  drop column if exists current_players,
  drop column if exists queue;
