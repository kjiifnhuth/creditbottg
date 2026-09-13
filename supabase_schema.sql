-- Credit Manager: Supabase schema
-- Run in Supabase SQL Editor before deploying the frontend.

create extension if not exists pgcrypto;

do $$ begin
  create type public.credit_type as enum ('annuity','diff');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.interest_policy as enum ('actual','full_term');
exception when duplicate_object then null; end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default 'Користувач',
  theme text not null default 'light' check (theme in ('light','dark')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.credits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  initial_amount numeric(14,2) not null default 0 check (initial_amount >= 0),
  balance numeric(14,2) not null default 0 check (balance >= 0),
  rate numeric(8,4) not null default 0 check (rate >= 0),
  type public.credit_type not null default 'annuity',
  payment numeric(14,2) not null default 0 check (payment >= 0),
  due_day integer not null default 1 check (due_day between 1 and 31),
  term_months integer not null default 12 check (term_months > 0),
  interest_policy public.interest_policy not null default 'actual',
  payments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.credit_limits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  credit_limit numeric(14,2) not null default 0 check (credit_limit >= 0),
  used numeric(14,2) not null default 0 check (used >= 0),
  rate numeric(8,4) not null default 0 check (rate >= 0),
  min_payment numeric(14,2) not null default 0 check (min_payment >= 0),
  grace_payment numeric(14,2) not null default 0 check (grace_payment >= 0),
  due_day integer not null default 1 check (due_day between 1 and 31),
  payments jsonb not null default '[]'::jsonb,
  plan_payment numeric(14,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists credits_user_id_idx on public.credits(user_id);
create index if not exists credit_limits_user_id_idx on public.credit_limits(user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists credits_set_updated_at on public.credits;
create trigger credits_set_updated_at before update on public.credits
for each row execute function public.set_updated_at();

drop trigger if exists credit_limits_set_updated_at on public.credit_limits;
create trigger credit_limits_set_updated_at before update on public.credit_limits
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'name',''), split_part(coalesce(new.email,''),'@',1), 'Користувач')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.credits enable row level security;
alter table public.credit_limits enable row level security;

revoke all on table public.profiles from anon;
revoke all on table public.credits from anon;
revoke all on table public.credit_limits from anon;

grant select, insert, update, delete on table public.profiles to authenticated;
grant select, insert, update, delete on table public.credits to authenticated;
grant select, insert, update, delete on table public.credit_limits to authenticated;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles for select to authenticated
using ((select auth.uid()) = id);

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles for insert to authenticated
with check ((select auth.uid()) = id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

drop policy if exists profiles_delete_own on public.profiles;
create policy profiles_delete_own on public.profiles for delete to authenticated
using ((select auth.uid()) = id);

drop policy if exists credits_select_own on public.credits;
create policy credits_select_own on public.credits for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists credits_insert_own on public.credits;
create policy credits_insert_own on public.credits for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists credits_update_own on public.credits;
create policy credits_update_own on public.credits for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists credits_delete_own on public.credits;
create policy credits_delete_own on public.credits for delete to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists limits_select_own on public.credit_limits;
create policy limits_select_own on public.credit_limits for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists limits_insert_own on public.credit_limits;
create policy limits_insert_own on public.credit_limits for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists limits_update_own on public.credit_limits;
create policy limits_update_own on public.credit_limits for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists limits_delete_own on public.credit_limits;
create policy limits_delete_own on public.credit_limits for delete to authenticated
using ((select auth.uid()) = user_id);

-- Optional: enable realtime later if you want changes to appear instantly on other open devices.
-- alter publication supabase_realtime add table public.profiles, public.credits, public.credit_limits;
