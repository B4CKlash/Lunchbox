-- Apply to a separate development project first. Never run automatically at app startup.
create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 80),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  revision bigint not null default 0 check (revision >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'member')),
  primary key (household_id, user_id)
);
create table public.household_commands (
  household_id uuid not null references public.households(id) on delete cascade,
  command_id uuid not null,
  actor_id uuid not null references auth.users(id),
  command jsonb not null,
  receipt jsonb not null,
  revision bigint not null,
  created_at timestamptz not null default now(),
  primary key (household_id, command_id),
  unique (household_id, revision)
);
create table public.household_invitations (
  token_hash text primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  email text not null,
  invited_by uuid not null references auth.users(id),
  expires_at timestamptz not null,
  accepted_by uuid references auth.users(id),
  accepted_at timestamptz
);

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.household_commands enable row level security;
alter table public.household_invitations enable row level security;
-- All browser access goes through authenticated, validated server endpoints.
-- No anon/authenticated table grants or write policies; service role only.
revoke all on public.households, public.household_members, public.household_commands, public.household_invitations from anon, authenticated;
grant all on public.households, public.household_members, public.household_commands, public.household_invitations to service_role;

create function public.lunchbox_create_household(p_user uuid, p_name text, p_snapshot jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare h households;
begin
  -- The unique user membership makes concurrent initialization safe.
  insert into households(name, snapshot, revision) values(p_name, p_snapshot, coalesce((p_snapshot->'pilot'->>'revision')::bigint, 0)) returning * into h;
  insert into household_members(household_id, user_id, role) values(h.id, p_user, 'owner');
  return jsonb_build_object('householdId', h.id, 'revision', h.revision, 'state', h.snapshot);
end;
$$;

create function public.lunchbox_apply_command(
  p_household uuid, p_user uuid, p_command_id uuid, p_expected_revision bigint,
  p_command jsonb, p_snapshot jsonb, p_receipt jsonb
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare h households; old household_commands;
begin
  if not exists(select 1 from household_members where household_id = p_household and user_id = p_user) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  select * into h from households where id = p_household for update;
  select * into old from household_commands where household_id = p_household and command_id = p_command_id;
  if found then
    if old.command <> p_command then raise exception 'command_id_reused' using errcode = '22023'; end if;
    return jsonb_build_object('householdId', h.id, 'revision', h.revision, 'state', h.snapshot, 'receipt', old.receipt, 'duplicate', true);
  end if;
  if h.revision <> p_expected_revision then
    return jsonb_build_object('conflict', true, 'householdId', h.id, 'revision', h.revision, 'state', h.snapshot);
  end if;
  update households set snapshot = p_snapshot, revision = revision + 1, updated_at = now() where id = h.id returning * into h;
  insert into household_commands(household_id, command_id, actor_id, command, receipt, revision)
    values(h.id, p_command_id, p_user, p_command, p_receipt, h.revision);
  return jsonb_build_object('householdId', h.id, 'revision', h.revision, 'state', h.snapshot, 'receipt', p_receipt, 'duplicate', false);
end;
$$;

create function public.lunchbox_accept_invitation(p_token_hash text, p_user uuid)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare invitation household_invitations; user_email text; confirmed timestamptz;
begin
  select email, email_confirmed_at into user_email, confirmed from auth.users where id = p_user;
  select * into invitation from household_invitations where token_hash = p_token_hash for update;
  if not found or confirmed is null or lower(user_email) <> invitation.email or invitation.expires_at <= now() then
    raise exception 'invalid_invitation' using errcode = '42501';
  end if;
  if invitation.accepted_by = p_user then return invitation.household_id; end if;
  if invitation.accepted_by is not null then raise exception 'invalid_invitation' using errcode = '42501'; end if;
  insert into household_members(household_id, user_id, role) values(invitation.household_id, p_user, 'member');
  update household_invitations set accepted_by = p_user, accepted_at = now() where token_hash = p_token_hash;
  return invitation.household_id;
end;
$$;

revoke all on function public.lunchbox_create_household(uuid, text, jsonb), public.lunchbox_apply_command(uuid, uuid, uuid, bigint, jsonb, jsonb, jsonb), public.lunchbox_accept_invitation(text, uuid) from public, anon, authenticated;
grant execute on function public.lunchbox_create_household(uuid, text, jsonb), public.lunchbox_apply_command(uuid, uuid, uuid, bigint, jsonb, jsonb, jsonb), public.lunchbox_accept_invitation(text, uuid) to service_role;
