begin;

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique,
  full_name text,
  avatar_url text,
  updated_at timestamptz not null default now()
);

create table if not exists public.stock (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  imei text not null,
  harga numeric(14,2) not null,
  status text not null default 'available' check (status in ('available', 'sold')),
  created_at timestamptz not null default now()
);

create table if not exists public.stock_in (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  imei text not null,
  harga numeric(14,2) not null,
  penjual text not null,
  tanggal_masuk date not null,
  created_at timestamptz not null default now()
);

create table if not exists public.stock_out (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  imei text not null,
  pembeli text not null,
  harga_modal numeric(14,2) not null,
  harga_jual numeric(14,2) not null,
  keuntungan numeric(14,2) generated always as (harga_jual - harga_modal) stored,
  tanggal_keluar date not null,
  created_at timestamptz not null default now()
);

create unique index if not exists stock_imei_unique_idx on public.stock (imei);
create index if not exists stock_status_idx on public.stock (status);
create index if not exists stock_created_at_idx on public.stock (created_at desc);
create index if not exists stock_in_created_at_idx on public.stock_in (created_at desc);
create index if not exists stock_out_created_at_idx on public.stock_out (created_at desc);
create index if not exists stock_out_tanggal_keluar_idx on public.stock_out (tanggal_keluar desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_set_updated_at on public.profiles;
create trigger trg_profiles_set_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.stock enable row level security;
alter table public.stock_in enable row level security;
alter table public.stock_out enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
on public.profiles
for select
to authenticated
using (auth.uid() = id);

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own
on public.profiles
for insert
to authenticated
with check (auth.uid() = id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists stock_all_authenticated on public.stock;
create policy stock_all_authenticated
on public.stock
for all
to authenticated
using (true)
with check (true);

drop policy if exists stock_in_all_authenticated on public.stock_in;
create policy stock_in_all_authenticated
on public.stock_in
for all
to authenticated
using (true)
with check (true);

drop policy if exists stock_out_all_authenticated on public.stock_out;
create policy stock_out_all_authenticated
on public.stock_out
for all
to authenticated
using (true)
with check (true);

commit;
