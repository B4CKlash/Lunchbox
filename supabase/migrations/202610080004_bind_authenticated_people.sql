-- An authenticated account has one stable person identity in the household.
alter table public.household_members add column member_id text;
with ordered as (
  select household_id, user_id,
    row_number() over(partition by household_id order by case when role = 'owner' then 0 else 1 end, user_id) - 1 as position
  from public.household_members
)
update public.household_members m set member_id = h.snapshot->'pilot'->'members'->(o.position::integer)->>'id'
from ordered o join public.households h on h.id = o.household_id
where m.household_id = o.household_id and m.user_id = o.user_id;
create unique index household_person_account on public.household_members(household_id, member_id) where member_id is not null;

create or replace function public.lunchbox_create_household(p_user uuid, p_name text, p_snapshot jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare h households; person text;
begin
  person := p_snapshot->'pilot'->'members'->0->>'id';
  if person is null then raise exception 'person_required' using errcode = '22004'; end if;
  insert into households(name, snapshot, revision)
    values(p_name, p_snapshot, coalesce((p_snapshot->'pilot'->>'revision')::bigint, 0)) returning * into h;
  insert into household_members(household_id, user_id, role, member_id) values(h.id, p_user, 'owner', person);
  return jsonb_build_object('householdId', h.id, 'revision', h.revision, 'state', h.snapshot, 'currentMemberId', person);
end;
$$;

create or replace function public.lunchbox_accept_invitation(p_token_hash text, p_user uuid)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare invitation household_invitations; user_email text; confirmed timestamptz; h households; person text;
begin
  select email, email_confirmed_at into user_email, confirmed from auth.users where id = p_user;
  select * into invitation from household_invitations where token_hash = p_token_hash for update;
  if not found or confirmed is null or lower(user_email) <> invitation.email or invitation.expires_at <= now() then
    raise exception 'invalid_invitation' using errcode = '42501';
  end if;
  if invitation.accepted_by = p_user then return invitation.household_id; end if;
  if invitation.accepted_by is not null then raise exception 'invalid_invitation' using errcode = '42501'; end if;
  select * into h from households where id = invitation.household_id for update;
  select candidate->>'id' into person from jsonb_array_elements(h.snapshot->'pilot'->'members') candidate
    where not exists(select 1 from household_members m where m.household_id = h.id and m.member_id = candidate->>'id') limit 1;
  if person is null then raise exception 'person_required' using errcode = '22004'; end if;
  insert into household_members(household_id, user_id, role, member_id) values(invitation.household_id, p_user, 'member', person);
  update household_invitations set accepted_by = p_user, accepted_at = now() where token_hash = p_token_hash;
  return invitation.household_id;
end;
$$;

-- Protect stable membership bindings even if a server implementation changes.
create function public.lunchbox_preserve_member_bindings() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if exists(select 1 from household_members m where m.household_id = new.id and m.member_id is not null
    and not exists(select 1 from jsonb_array_elements(new.snapshot->'pilot'->'members') person where person->>'id' = m.member_id)) then
    raise exception 'assigned_person_cannot_be_removed' using errcode = '22004';
  end if;
  return new;
end;
$$;
create trigger preserve_household_member_bindings before update of snapshot on public.households
for each row execute function public.lunchbox_preserve_member_bindings();
revoke all on function public.lunchbox_preserve_member_bindings() from public, anon, authenticated;
