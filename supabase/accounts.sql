-- Run once in the Supabase SQL editor. No service-role key is needed in the app.
create table public.account_kitchens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null check (jsonb_typeof(state) = 'object'),
  updated_at timestamptz not null default now()
);
alter table public.account_kitchens enable row level security;
revoke all on public.account_kitchens from anon;
grant select, insert, update on public.account_kitchens to authenticated;
create policy "Read own kitchen" on public.account_kitchens for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Create own kitchen" on public.account_kitchens for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Update own kitchen" on public.account_kitchens for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
