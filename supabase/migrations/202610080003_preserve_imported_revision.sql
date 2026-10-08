-- Also upgrades development databases initialized before revision preservation.
create or replace function public.lunchbox_create_household(p_user uuid, p_name text, p_snapshot jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare h households;
begin
  insert into households(name, snapshot, revision)
    values(p_name, p_snapshot, coalesce((p_snapshot->'pilot'->>'revision')::bigint, 0)) returning * into h;
  insert into household_members(household_id, user_id, role) values(h.id, p_user, 'owner');
  return jsonb_build_object('householdId', h.id, 'revision', h.revision, 'state', h.snapshot);
end;
$$;
