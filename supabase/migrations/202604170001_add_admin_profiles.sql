begin;

create table if not exists public.admin_profiles (
  id text primary key,
  username text not null unique,
  full_name text,
  avatar_url text,
  password_hash text,
  updated_at timestamptz not null default now()
);

create index if not exists admin_profiles_username_idx on public.admin_profiles (username);

insert into public.admin_profiles (id, username, full_name)
values ('admin-local', 'admin', 'Admin AR Store')
on conflict (id) do nothing;

create or replace function public.set_admin_profiles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_admin_profiles_set_updated_at on public.admin_profiles;
create trigger trg_admin_profiles_set_updated_at
before update on public.admin_profiles
for each row
execute function public.set_admin_profiles_updated_at();

alter table public.admin_profiles enable row level security;

drop policy if exists admin_profiles_select_authenticated on public.admin_profiles;
create policy admin_profiles_select_authenticated
on public.admin_profiles
for select
to authenticated
using (true);

commit;
