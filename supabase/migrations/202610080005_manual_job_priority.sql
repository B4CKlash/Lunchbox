-- Household-wide priority: an advisory refresh cannot cancel a person's request
-- from another device. Keep the existing household row lock as the ordering point.
create or replace function public.lunchbox_enqueue_job(p_id uuid, p_household uuid, p_user uuid, p_session text, p_revision bigint, p_kind text, p_request jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare h households; j household_ai_jobs; is_refresh boolean;
begin
  if not exists(select 1 from household_members where household_id = p_household and user_id = p_user) then raise exception 'not_authorized' using errcode = '42501'; end if;
  select * into h from households where id = p_household for update;
  select * into j from household_ai_jobs where id = p_id;
  if found then
    if j.household_id <> p_household or j.request <> p_request or j.household_revision <> p_revision or j.session_id <> p_session or j.kind <> p_kind then raise exception 'command_id_reused' using errcode = '22023'; end if;
    return to_jsonb(j);
  end if;
  if h.revision <> p_revision then return jsonb_build_object('conflict', true); end if;
  is_refresh := p_kind = 'planning' and starts_with(coalesce(p_request->>'message', ''), E'[LunchBox context refresh]\n');
  if is_refresh then
    select * into j from household_ai_jobs where household_id = p_household and session_id = p_session and kind = 'planning'
      and status in ('queued', 'running') and not starts_with(coalesce(request->>'message', ''), E'[LunchBox context refresh]\n')
      order by created_at desc limit 1;
    if found then return jsonb_build_object('deferred', true, 'job', to_jsonb(j)); end if;
  end if;
  update household_ai_jobs set status = 'cancelled', error = 'Superseded by a newer request.', updated_at = now()
    where household_id = p_household and session_id = p_session and kind = p_kind and status in ('queued', 'running');
  insert into household_ai_jobs(id, household_id, requested_by, session_id, household_revision, kind, request, context)
    values(p_id, p_household, p_user, p_session, p_revision, p_kind, p_request, h.snapshot) returning * into j;
  return to_jsonb(j);
end;
$$;
