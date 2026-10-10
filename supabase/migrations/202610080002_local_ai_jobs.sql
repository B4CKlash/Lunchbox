create table public.household_ai_workers (
  household_id uuid primary key references public.households(id) on delete cascade,
  last_seen_at timestamptz not null default now()
);
create table public.household_ai_jobs (
  id uuid primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  requested_by uuid not null references auth.users(id),
  session_id text not null,
  household_revision bigint not null,
  kind text not null check (kind in ('planning', 'suggest', 'chat', 'extract')),
  request jsonb not null,
  context jsonb not null,
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'cancelled', 'stale', 'failed')),
  result jsonb,
  error text,
  attempts integer not null default 0,
  lease_token uuid,
  lease_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index household_ai_jobs_queue on public.household_ai_jobs(household_id, status, created_at);
alter table public.household_ai_jobs enable row level security;
alter table public.household_ai_workers enable row level security;
revoke all on public.household_ai_jobs, public.household_ai_workers from anon, authenticated;
grant all on public.household_ai_jobs, public.household_ai_workers to service_role;

create function public.lunchbox_enqueue_job(p_id uuid, p_household uuid, p_user uuid, p_session text, p_revision bigint, p_kind text, p_request jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare h households; j household_ai_jobs;
begin
  if not exists(select 1 from household_members where household_id = p_household and user_id = p_user) then raise exception 'not_authorized' using errcode = '42501'; end if;
  select * into h from households where id = p_household for update;
  select * into j from household_ai_jobs where id = p_id;
  if found then
    if j.household_id <> p_household or j.request <> p_request or j.household_revision <> p_revision or j.session_id <> p_session or j.kind <> p_kind then raise exception 'command_id_reused' using errcode = '22023'; end if;
    return to_jsonb(j);
  end if;
  if h.revision <> p_revision then return jsonb_build_object('conflict', true); end if;
  update household_ai_jobs set status = 'cancelled', error = 'Superseded by a newer request.', updated_at = now()
    where household_id = p_household and session_id = p_session and kind = p_kind and status in ('queued', 'running');
  insert into household_ai_jobs(id, household_id, requested_by, session_id, household_revision, kind, request, context)
    values(p_id, p_household, p_user, p_session, p_revision, p_kind, p_request, h.snapshot) returning * into j;
  return to_jsonb(j);
end;
$$;

create function public.lunchbox_claim_job(p_household uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare j household_ai_jobs;
begin
  insert into household_ai_workers(household_id) values(p_household) on conflict(household_id) do update set last_seen_at = now();
  update household_ai_jobs set status = 'failed', error = 'The local worker stopped repeatedly. Retry when it is available.', updated_at = now()
    where household_id = p_household and status = 'running' and lease_expires_at < now() and attempts >= 3;
  update household_ai_jobs set status = 'stale', error = 'The household changed. Request updated suggestions.', updated_at = now()
    where household_id = p_household and status in ('queued', 'running') and household_revision <> (select revision from households where id = p_household);
  select * into j from household_ai_jobs where household_id = p_household and (status = 'queued' or (status = 'running' and lease_expires_at < now())) order by created_at for update skip locked limit 1;
  if not found then return null; end if;
  update household_ai_jobs set status = 'running', attempts = attempts + 1, lease_token = gen_random_uuid(), lease_expires_at = now() + interval '90 seconds', updated_at = now() where id = j.id returning * into j;
  return to_jsonb(j);
end;
$$;

create function public.lunchbox_heartbeat_job(p_household uuid, p_id uuid, p_lease uuid)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into household_ai_workers(household_id) values(p_household) on conflict(household_id) do update set last_seen_at = now();
  update household_ai_jobs set lease_expires_at = now() + interval '90 seconds', updated_at = now()
    where id = p_id and household_id = p_household and status = 'running' and lease_token = p_lease and lease_expires_at > now()
      and household_revision = (select revision from households where id = p_household);
  return found;
end;
$$;

create function public.lunchbox_finish_job(p_household uuid, p_id uuid, p_lease uuid, p_result jsonb, p_error text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare h households; j household_ai_jobs;
begin
  select * into h from households where id = p_household for update;
  select * into j from household_ai_jobs where id = p_id and household_id = p_household for update;
  if not found then raise exception 'not_authorized' using errcode = '42501'; end if;
  if j.status = 'completed' and j.lease_token = p_lease and j.result = p_result then return to_jsonb(j); end if;
  if j.status <> 'running' or j.lease_token <> p_lease or j.lease_expires_at <= now() then
    return jsonb_build_object('rejected', true, 'status', j.status);
  end if;
  if h.revision <> j.household_revision then
    update household_ai_jobs set status = 'stale', error = 'The household changed. Request updated suggestions.', updated_at = now() where id = p_id returning * into j;
  else
    update household_ai_jobs set status = case when p_error is null then 'completed' else 'failed' end, result = p_result, error = p_error, updated_at = now() where id = p_id returning * into j;
  end if;
  return to_jsonb(j);
end;
$$;

revoke all on function public.lunchbox_enqueue_job(uuid, uuid, uuid, text, bigint, text, jsonb), public.lunchbox_claim_job(uuid), public.lunchbox_heartbeat_job(uuid, uuid, uuid), public.lunchbox_finish_job(uuid, uuid, uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.lunchbox_enqueue_job(uuid, uuid, uuid, text, bigint, text, jsonb), public.lunchbox_claim_job(uuid), public.lunchbox_heartbeat_job(uuid, uuid, uuid), public.lunchbox_finish_job(uuid, uuid, uuid, jsonb, text) to service_role;
