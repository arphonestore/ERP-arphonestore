-- Database hardening for inventory mutations, administrator sessions, and login throttling.
--
-- Legacy rows are never deleted or rewritten merely to satisfy new validation rules.
-- CHECK/FK constraints that could reject historical data are added NOT VALID: PostgreSQL
-- still enforces them for every new or changed row, while existing rows can be repaired and
-- validated in a separate maintenance window.

begin;

-- Avoid waiting indefinitely for DDL locks on a busy production database. The whole
-- migration is transactional, so a lock timeout rolls every change back cleanly.
set local lock_timeout = '10s';

create extension if not exists pgcrypto;

-- activity_logs was historically installed from a seed script. Define it here as well so a
-- fresh database built only from migrations has the exact audit target required by the RPCs.
create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id text,
  actor_name text,
  action text not null,
  module text not null,
  entity_id text,
  entity_label text,
  description text,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create index if not exists activity_logs_created_at_idx on public.activity_logs (created_at desc);
create index if not exists activity_logs_module_idx on public.activity_logs (module);
create index if not exists activity_logs_action_idx on public.activity_logs (action);
create index if not exists activity_logs_actor_id_idx on public.activity_logs (actor_id);
create index if not exists activity_logs_entity_id_idx on public.activity_logs (entity_id);

-- Inventory relationships and soft lifecycle columns. stock_id intentionally remains nullable
-- for legacy orphan/ambiguous rows; all create RPCs below always write a non-null relationship.
alter table public.stock
  add column if not exists archived_at timestamptz;

alter table public.stock_in
  add column if not exists stock_id uuid,
  add column if not exists voided_at timestamptz;

alter table public.stock_out
  add column if not exists stock_id uuid,
  add column if not exists voided_at timestamptz,
  add column if not exists idempotency_key text;

alter table public.admin_profiles
  add column if not exists session_version bigint not null default 1,
  add column if not exists password_changed_at timestamptz;

comment on column public.stock.archived_at is
  'Soft lifecycle marker. Active inventory queries must require archived_at IS NULL.';
comment on column public.stock_in.stock_id is
  'Relationship to stock. Nullable only to preserve unmatched or ambiguous legacy rows.';
comment on column public.stock_in.voided_at is
  'Soft-void marker; active transaction queries must require voided_at IS NULL.';
comment on column public.stock_out.stock_id is
  'Relationship to stock. Nullable only to preserve unmatched or ambiguous legacy rows.';
comment on column public.stock_out.voided_at is
  'Soft-void marker; active transaction queries must require voided_at IS NULL.';
comment on column public.stock_out.idempotency_key is
  'Opaque checkout idempotency key. Required and globally unique for RPC-created rows.';
comment on column public.admin_profiles.session_version is
  'Monotonic session generation; incremented automatically whenever password_hash changes.';
comment on column public.admin_profiles.password_changed_at is
  'Server timestamp of the most recent password_hash change.';

-- Conservative legacy backfill: use exact IMEI equality and do not normalize historical text.
-- This avoids silently attaching malformed values to the wrong device.
update public.stock_in as si
set stock_id = s.id
from public.stock as s
where si.stock_id is null
  and si.imei = s.imei;

-- Voided stock_out rows do not participate in the active-sale uniqueness rule and can always
-- be linked when their exact legacy IMEI has a stock match.
update public.stock_out as so
set stock_id = s.id
from public.stock as s
where so.stock_id is null
  and so.voided_at is not null
  and so.imei = s.imei;

-- For active stock_out rows, backfill only unambiguous one-to-one matches. If legacy data has
-- multiple active sales for one IMEI, all conflicting rows remain NULL instead of arbitrarily
-- declaring one sale authoritative or deleting history.
with active_candidates as (
  select
    so.id as stock_out_id,
    s.id as stock_id,
    count(*) over (partition by s.id) as matching_active_rows
  from public.stock_out as so
  join public.stock as s
    on s.imei = so.imei
  where so.stock_id is null
    and so.voided_at is null
)
update public.stock_out as so
set stock_id = candidate.stock_id
from active_candidates as candidate
where so.id = candidate.stock_out_id
  and candidate.matching_active_rows = 1
  and not exists (
    select 1
    from public.stock_out as already_linked
    where already_linked.stock_id = candidate.stock_id
      and already_linked.voided_at is null
  );

-- Preserve a meaningful initial password timestamp without pretending the migration time was
-- the actual password-change time. updated_at is the best historical timestamp available. The
-- legacy updated_at trigger is temporarily disabled and restored to its prior mode so this
-- metadata-only backfill does not falsely make every profile look freshly edited.
do $password_timestamp_backfill$
declare
  updated_at_trigger_exists boolean := false;
  updated_at_trigger_mode pg_catalog."char";
begin
  select trigger.tgenabled
  into updated_at_trigger_mode
  from pg_catalog.pg_trigger as trigger
  where trigger.tgrelid = 'public.admin_profiles'::pg_catalog.regclass
    and trigger.tgname = 'trg_admin_profiles_set_updated_at'
    and not trigger.tgisinternal;

  updated_at_trigger_exists := found;

  if updated_at_trigger_exists and updated_at_trigger_mode <> 'D' then
    alter table public.admin_profiles disable trigger trg_admin_profiles_set_updated_at;
  end if;

  update public.admin_profiles
  set password_changed_at = updated_at
  where password_hash is not null
    and password_changed_at is null;

  if updated_at_trigger_exists then
    case updated_at_trigger_mode
      when 'O' then
        alter table public.admin_profiles enable trigger trg_admin_profiles_set_updated_at;
      when 'A' then
        alter table public.admin_profiles enable always trigger trg_admin_profiles_set_updated_at;
      when 'R' then
        alter table public.admin_profiles enable replica trigger trg_admin_profiles_set_updated_at;
      else
        -- 'D' means the trigger was already disabled before this migration.
        null;
    end case;
  end if;
end;
$password_timestamp_backfill$;

-- Constraints are named and installed conditionally so an interrupted/manual rerun is safe.
-- NOT VALID protects legacy rows while immediately enforcing strictness on new writes.
do $migration_constraints$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.stock_in'::pg_catalog.regclass
      and conname = 'stock_in_stock_id_fkey'
  ) then
    alter table public.stock_in
      add constraint stock_in_stock_id_fkey
      foreign key (stock_id) references public.stock (id)
      on update restrict on delete restrict
      not valid;
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.stock_out'::pg_catalog.regclass
      and conname = 'stock_out_stock_id_fkey'
  ) then
    alter table public.stock_out
      add constraint stock_out_stock_id_fkey
      foreign key (stock_id) references public.stock (id)
      on update restrict on delete restrict
      not valid;
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.stock'::pg_catalog.regclass
      and conname = 'stock_type_bounded_check'
  ) then
    alter table public.stock
      add constraint stock_type_bounded_check
      check (
        archived_at is not null
        or (btrim(type) <> '' and char_length(btrim(type)) <= 200)
      )
      not valid;
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.stock'::pg_catalog.regclass
      and conname = 'stock_imei_canonical_check'
  ) then
    alter table public.stock
      add constraint stock_imei_canonical_check
      check (archived_at is not null or imei ~ '^[0-9]{15}$')
      not valid;
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.stock'::pg_catalog.regclass
      and conname = 'stock_harga_positive_finite_check'
  ) then
    alter table public.stock
      add constraint stock_harga_positive_finite_check
      check (
        archived_at is not null
        or (
          harga > 0
          and harga::text not in ('NaN', 'Infinity', '-Infinity')
        )
      )
      not valid;
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.stock_in'::pg_catalog.regclass
      and conname = 'stock_in_type_bounded_check'
  ) then
    alter table public.stock_in
      add constraint stock_in_type_bounded_check
      check (
        voided_at is not null
        or (btrim(type) <> '' and char_length(btrim(type)) <= 200)
      )
      not valid;
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.stock_in'::pg_catalog.regclass
      and conname = 'stock_in_imei_canonical_check'
  ) then
    alter table public.stock_in
      add constraint stock_in_imei_canonical_check
      check (voided_at is not null or imei ~ '^[0-9]{15}$')
      not valid;
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.stock_in'::pg_catalog.regclass
      and conname = 'stock_in_harga_positive_finite_check'
  ) then
    alter table public.stock_in
      add constraint stock_in_harga_positive_finite_check
      check (
        voided_at is not null
        or (
          harga > 0
          and harga::text not in ('NaN', 'Infinity', '-Infinity')
        )
      )
      not valid;
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.stock_in'::pg_catalog.regclass
      and conname = 'stock_in_penjual_bounded_check'
  ) then
    alter table public.stock_in
      add constraint stock_in_penjual_bounded_check
      check (
        voided_at is not null
        or (btrim(penjual) <> '' and char_length(btrim(penjual)) <= 200)
      )
      not valid;
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.stock_out'::pg_catalog.regclass
      and conname = 'stock_out_type_bounded_check'
  ) then
    alter table public.stock_out
      add constraint stock_out_type_bounded_check
      check (
        voided_at is not null
        or (btrim(type) <> '' and char_length(btrim(type)) <= 200)
      )
      not valid;
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.stock_out'::pg_catalog.regclass
      and conname = 'stock_out_imei_canonical_check'
  ) then
    alter table public.stock_out
      add constraint stock_out_imei_canonical_check
      check (voided_at is not null or imei ~ '^[0-9]{15}$')
      not valid;
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.stock_out'::pg_catalog.regclass
      and conname = 'stock_out_pembeli_bounded_check'
  ) then
    alter table public.stock_out
      add constraint stock_out_pembeli_bounded_check
      check (
        voided_at is not null
        or (btrim(pembeli) <> '' and char_length(btrim(pembeli)) <= 200)
      )
      not valid;
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.stock_out'::pg_catalog.regclass
      and conname = 'stock_out_harga_modal_positive_finite_check'
  ) then
    alter table public.stock_out
      add constraint stock_out_harga_modal_positive_finite_check
      check (
        voided_at is not null
        or (
          harga_modal > 0
          and harga_modal::text not in ('NaN', 'Infinity', '-Infinity')
        )
      )
      not valid;
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.stock_out'::pg_catalog.regclass
      and conname = 'stock_out_harga_jual_positive_finite_check'
  ) then
    alter table public.stock_out
      add constraint stock_out_harga_jual_positive_finite_check
      check (
        voided_at is not null
        or (
          harga_jual > 0
          and harga_jual::text not in ('NaN', 'Infinity', '-Infinity')
        )
      )
      not valid;
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.stock_out'::pg_catalog.regclass
      and conname = 'stock_out_idempotency_key_bounded_check'
  ) then
    alter table public.stock_out
      add constraint stock_out_idempotency_key_bounded_check
      check (
        voided_at is not null
        or idempotency_key is null
        or (btrim(idempotency_key) <> '' and char_length(btrim(idempotency_key)) <= 200)
      )
      not valid;
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.admin_profiles'::pg_catalog.regclass
      and conname = 'admin_profiles_session_version_positive_check'
  ) then
    alter table public.admin_profiles
      add constraint admin_profiles_session_version_positive_check
      check (session_version >= 1)
      not valid;
  end if;
end;
$migration_constraints$;

create index if not exists stock_in_stock_id_idx
  on public.stock_in (stock_id);
create index if not exists stock_in_active_stock_id_idx
  on public.stock_in (stock_id)
  where stock_id is not null and voided_at is null;
create index if not exists stock_in_voided_at_idx
  on public.stock_in (voided_at)
  where voided_at is not null;

create index if not exists stock_out_stock_id_idx
  on public.stock_out (stock_id);
create index if not exists stock_out_voided_at_idx
  on public.stock_out (voided_at)
  where voided_at is not null;
create index if not exists stock_archived_at_idx
  on public.stock (archived_at)
  where archived_at is null;

-- Legacy rows with ambiguous duplicate sales were deliberately left stock_id NULL above, so
-- this index can enforce one active sale for every related stock without deleting history.
create unique index if not exists stock_out_one_active_per_stock_idx
  on public.stock_out (stock_id)
  where stock_id is not null and voided_at is null;

-- Keys remain unique after a sale is voided: replaying an old checkout request must return the
-- original transaction rather than create a new sale.
create unique index if not exists stock_out_idempotency_key_unique_idx
  on public.stock_out (idempotency_key)
  where idempotency_key is not null;

-- Password changes automatically invalidate older session generations. Profile-only updates do
-- not alter password_changed_at, and session_version cannot move backwards.
create or replace function public.harden_admin_profile_session_fields()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  if tg_op = 'INSERT' then
    -- Every new administrator starts at generation 1; callers cannot forge a future generation.
    new.session_version := 1;

    if new.password_hash is not null then
      -- Caller-supplied timestamps are not trusted for a newly installed password.
      new.password_changed_at := statement_timestamp();
    else
      new.password_changed_at := null;
    end if;

    return new;
  end if;

  if new.password_hash is distinct from old.password_hash then
    -- Exactly one generation bump per password change; caller-supplied values are ignored.
    new.session_version := old.session_version + 1;
    new.password_changed_at := statement_timestamp();
  else
    if new.session_version is null or new.session_version < old.session_version then
      raise exception using
        errcode = '22023',
        message = 'session_version tidak boleh berkurang.';
    end if;

    -- This timestamp is authoritative and may only change with password_hash.
    new.password_changed_at := old.password_changed_at;
  end if;

  return new;
end;
$function$;

revoke all on function public.harden_admin_profile_session_fields() from public, anon, authenticated;

drop trigger if exists trg_admin_profiles_session_security on public.admin_profiles;
create trigger trg_admin_profiles_session_security
before insert or update on public.admin_profiles
for each row
execute function public.harden_admin_profile_session_fields();

-- Persistent fixed-window login throttling. Raw passwords are never stored. identifier_key is
-- lower-cased and client_key is a normalized IP/client discriminator supplied by the server.
-- Policy: five failures in 15 minutes lock the pair for 15 minutes.
create table if not exists public.login_rate_limits (
  identifier_key text not null,
  client_key text not null,
  attempt_count integer not null default 0,
  window_started_at timestamptz not null default now(),
  last_attempt_at timestamptz,
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint login_rate_limits_pkey primary key (identifier_key, client_key),
  constraint login_rate_limits_identifier_bounded_check
    check (btrim(identifier_key) <> '' and char_length(identifier_key) <= 200),
  constraint login_rate_limits_client_bounded_check
    check (btrim(client_key) <> '' and char_length(client_key) <= 128),
  constraint login_rate_limits_attempt_count_check
    check (attempt_count >= 0)
);

create index if not exists login_rate_limits_updated_at_idx
  on public.login_rate_limits (updated_at);
create index if not exists login_rate_limits_locked_until_idx
  on public.login_rate_limits (locked_until)
  where locked_until is not null;

comment on table public.login_rate_limits is
  'Persistent server-only failed-login counters. Call clear_login_rate_limit after successful authentication.';

-- Remove every policy, including unknown permissive policies added outside the original files.
-- With no policies and FORCE RLS, anon/authenticated cannot regain access through stale grants.
do $drop_application_policies$
declare
  policy_row record;
begin
  for policy_row in
    select schemaname, tablename, policyname
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = any (array[
        'stock',
        'stock_in',
        'stock_out',
        'activity_logs',
        'admin_profiles',
        'login_rate_limits'
      ]::text[])
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      policy_row.policyname,
      policy_row.schemaname,
      policy_row.tablename
    );
  end loop;
end;
$drop_application_policies$;

alter table public.stock enable row level security;
alter table public.stock force row level security;
alter table public.stock_in enable row level security;
alter table public.stock_in force row level security;
alter table public.stock_out enable row level security;
alter table public.stock_out force row level security;
alter table public.activity_logs enable row level security;
alter table public.activity_logs force row level security;
alter table public.admin_profiles enable row level security;
alter table public.admin_profiles force row level security;
alter table public.login_rate_limits enable row level security;
alter table public.login_rate_limits force row level security;

revoke all privileges on table public.stock from public, anon, authenticated;
revoke all privileges on table public.stock_in from public, anon, authenticated;
revoke all privileges on table public.stock_out from public, anon, authenticated;
revoke all privileges on table public.activity_logs from public, anon, authenticated;
revoke all privileges on table public.admin_profiles from public, anon, authenticated;
revoke all privileges on table public.login_rate_limits from public, anon, authenticated;

-- Table-level REVOKE does not remove grants made directly on individual columns. Remove those
-- ACLs as well, including any historical SELECT grant on admin_profiles.password_hash.
do $revoke_application_column_privileges$
declare
  target_table text;
  target_role text;
  target_columns text;
begin
  foreach target_table in array array[
    'stock',
    'stock_in',
    'stock_out',
    'activity_logs',
    'admin_profiles',
    'login_rate_limits'
  ]::text[]
  loop
    select string_agg(format('%I', attribute.attname), ', ' order by attribute.attnum)
    into target_columns
    from pg_catalog.pg_attribute as attribute
    where attribute.attrelid = format('public.%I', target_table)::pg_catalog.regclass
      and attribute.attnum > 0
      and not attribute.attisdropped;

    foreach target_role in array array['public', 'anon', 'authenticated']::text[]
    loop
      execute format(
        'revoke all privileges (%s) on table public.%I from %I',
        target_columns,
        target_table,
        target_role
      );
    end loop;
  end loop;
end;
$revoke_application_column_privileges$;

-- The trusted server currently reads these tables directly. Inventory writes should use the
-- transactional RPCs below; service_role remains the only application role with table access.
grant select, insert, update, delete on table public.stock to service_role;
grant select, insert, update, delete on table public.stock_in to service_role;
grant select, insert, update, delete on table public.stock_out to service_role;
grant select, insert, update, delete on table public.activity_logs to service_role;
grant select, insert, update, delete on table public.admin_profiles to service_role;
grant select, insert, update, delete on table public.login_rate_limits to service_role;

-- Internal strict validators shared by all inventory RPCs. They are deliberately not executable
-- by API roles. IMEI accepts spaces/hyphens as presentation separators, then stores 15 digits.
create or replace function public._canonical_inventory_imei(p_imei text)
returns text
language plpgsql
immutable
set search_path = pg_catalog
as $function$
declare
  canonical_imei text;
begin
  if p_imei is null or octet_length(p_imei) > 128 then
    raise exception using
      errcode = '22023',
      message = 'IMEI wajib diisi dan tidak valid.';
  end if;

  canonical_imei := regexp_replace(p_imei, '([[:space:]]|-)+', '', 'g');

  if canonical_imei !~ '^[0-9]{15}$' then
    raise exception using
      errcode = '22023',
      message = 'IMEI harus berisi tepat 15 digit.';
  end if;

  return canonical_imei;
end;
$function$;

create or replace function public._required_bounded_text(
  p_value text,
  p_field_name text,
  p_max_length integer
)
returns text
language plpgsql
immutable
set search_path = pg_catalog
as $function$
declare
  normalized_value text;
begin
  if p_max_length < 1 then
    raise exception using errcode = '22023', message = 'Batas panjang internal tidak valid.';
  end if;

  if p_value is null or octet_length(p_value) > (p_max_length * 4 + 32) then
    raise exception using
      errcode = '22023',
      message = format('%s wajib diisi dan maksimal %s karakter.', p_field_name, p_max_length);
  end if;

  normalized_value := btrim(p_value);

  if normalized_value = '' or char_length(normalized_value) > p_max_length then
    raise exception using
      errcode = '22023',
      message = format('%s wajib diisi dan maksimal %s karakter.', p_field_name, p_max_length);
  end if;

  if normalized_value ~ '[[:cntrl:]]' then
    raise exception using
      errcode = '22023',
      message = format('%s mengandung karakter kontrol yang tidak diizinkan.', p_field_name);
  end if;

  return normalized_value;
end;
$function$;

create or replace function public._positive_inventory_money(
  p_value numeric,
  p_field_name text
)
returns numeric
language plpgsql
immutable
set search_path = pg_catalog
as $function$
begin
  if p_value is null
     or p_value::text in ('NaN', 'Infinity', '-Infinity')
     or p_value <= 0 then
    raise exception using
      errcode = '22023',
      message = format('%s harus berupa angka finite dan lebih dari nol.', p_field_name);
  end if;

  if p_value > 999999999999.99 then
    raise exception using
      errcode = '22003',
      message = format('%s melebihi batas numeric(14,2).', p_field_name);
  end if;

  if p_value <> round(p_value, 2) then
    raise exception using
      errcode = '22023',
      message = format('%s maksimal memiliki dua angka desimal.', p_field_name);
  end if;

  return p_value;
end;
$function$;

create or replace function public._inventory_date_not_future_wib(
  p_value date,
  p_field_name text
)
returns date
language plpgsql
stable
set search_path = pg_catalog
as $function$
declare
  today_wib date := timezone('Asia/Jakarta', statement_timestamp())::date;
begin
  if p_value is null then
    raise exception using
      errcode = '22023',
      message = format('%s wajib diisi.', p_field_name);
  end if;

  if p_value > today_wib then
    raise exception using
      errcode = '22023',
      message = format('%s tidak boleh berada di masa depan WIB.', p_field_name);
  end if;

  return p_value;
end;
$function$;

revoke all on function public._canonical_inventory_imei(text) from public, anon, authenticated;
revoke all on function public._required_bounded_text(text, text, integer) from public, anon, authenticated;
revoke all on function public._positive_inventory_money(numeric, text) from public, anon, authenticated;
revoke all on function public._inventory_date_not_future_wib(date, text) from public, anon, authenticated;

-- Audit helper. A failure to insert activity_logs raises and rolls back the inventory mutation
-- because it runs in the same RPC transaction.
create or replace function public._insert_inventory_activity(
  p_actor_id text,
  p_actor_name text,
  p_action text,
  p_module text,
  p_entity_id uuid,
  p_entity_label text,
  p_description text,
  p_before_data jsonb,
  p_after_data jsonb
)
returns void
language sql
set search_path = pg_catalog
as $function$
  insert into public.activity_logs (
    actor_id,
    actor_name,
    action,
    module,
    entity_id,
    entity_label,
    description,
    before_data,
    after_data
  )
  values (
    p_actor_id,
    p_actor_name,
    p_action,
    p_module,
    p_entity_id::text,
    p_entity_label,
    p_description,
    p_before_data,
    p_after_data
  );
$function$;

revoke all on function public._insert_inventory_activity(
  text, text, text, text, uuid, text, text, jsonb, jsonb
) from public, anon, authenticated;

-- LOGIN RATE LIMIT RPCs -------------------------------------------------------

create or replace function public.check_login_rate_limit(
  p_identifier text,
  p_client_ip text
)
returns table (
  is_allowed boolean,
  attempt_count integer,
  remaining_attempts integer,
  retry_after_seconds integer,
  locked_until timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  max_attempts constant integer := 5;
  rate_window constant interval := interval '15 minutes';
  normalized_identifier text;
  normalized_client text;
  rate_row public.login_rate_limits%rowtype;
  checked_at timestamptz := statement_timestamp();
  effective_until timestamptz;
begin
  normalized_identifier := lower(
    public._required_bounded_text(p_identifier, 'identifier', 200)
  );

  if p_client_ip is null or btrim(p_client_ip) = '' then
    normalized_client := 'unknown';
  else
    normalized_client := lower(
      public._required_bounded_text(p_client_ip, 'client_ip', 128)
    );
  end if;

  select limits.*
  into rate_row
  from public.login_rate_limits as limits
  where limits.identifier_key = normalized_identifier
    and limits.client_key = normalized_client;

  if not found then
    return query select true, 0, max_attempts, 0, null::timestamptz;
    return;
  end if;

  if rate_row.locked_until is not null and rate_row.locked_until > checked_at then
    return query
    select
      false,
      rate_row.attempt_count,
      0,
      greatest(1, ceil(extract(epoch from (rate_row.locked_until - checked_at)))::integer),
      rate_row.locked_until;
    return;
  end if;

  if rate_row.window_started_at + rate_window <= checked_at then
    return query select true, 0, max_attempts, 0, null::timestamptz;
    return;
  end if;

  if rate_row.attempt_count >= max_attempts then
    effective_until := rate_row.window_started_at + rate_window;
    return query
    select
      false,
      rate_row.attempt_count,
      0,
      greatest(1, ceil(extract(epoch from (effective_until - checked_at)))::integer),
      effective_until;
    return;
  end if;

  return query
  select
    true,
    rate_row.attempt_count,
    greatest(0, max_attempts - rate_row.attempt_count),
    0,
    null::timestamptz;
end;
$function$;

create or replace function public.record_login_failure(
  p_identifier text,
  p_client_ip text
)
returns table (
  is_allowed boolean,
  attempt_count integer,
  remaining_attempts integer,
  retry_after_seconds integer,
  locked_until timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  max_attempts constant integer := 5;
  rate_window constant interval := interval '15 minutes';
  lock_duration constant interval := interval '15 minutes';
  normalized_identifier text;
  normalized_client text;
  rate_row public.login_rate_limits%rowtype;
  recorded_at timestamptz := statement_timestamp();
  next_attempt_count integer;
begin
  normalized_identifier := lower(
    public._required_bounded_text(p_identifier, 'identifier', 200)
  );

  if p_client_ip is null or btrim(p_client_ip) = '' then
    normalized_client := 'unknown';
  else
    normalized_client := lower(
      public._required_bounded_text(p_client_ip, 'client_ip', 128)
    );
  end if;

  -- INSERT ... ON CONFLICT plus the following FOR UPDATE makes concurrent failures for the
  -- same identifier/client pair serialize without losing increments.
  insert into public.login_rate_limits as limits (
    identifier_key,
    client_key,
    attempt_count,
    window_started_at,
    last_attempt_at,
    locked_until,
    created_at,
    updated_at
  )
  values (
    normalized_identifier,
    normalized_client,
    1,
    recorded_at,
    recorded_at,
    null,
    recorded_at,
    recorded_at
  )
  on conflict (identifier_key, client_key) do nothing
  returning limits.* into rate_row;

  if not found then
    select limits.*
    into rate_row
    from public.login_rate_limits as limits
    where limits.identifier_key = normalized_identifier
      and limits.client_key = normalized_client
    for update;

    if rate_row.locked_until is not null and rate_row.locked_until > recorded_at then
      update public.login_rate_limits as limits
      set last_attempt_at = recorded_at,
          updated_at = recorded_at
      where limits.identifier_key = normalized_identifier
        and limits.client_key = normalized_client
      returning limits.* into rate_row;
    elsif rate_row.window_started_at + rate_window <= recorded_at then
      update public.login_rate_limits as limits
      set attempt_count = 1,
          window_started_at = recorded_at,
          last_attempt_at = recorded_at,
          locked_until = null,
          updated_at = recorded_at
      where limits.identifier_key = normalized_identifier
        and limits.client_key = normalized_client
      returning limits.* into rate_row;
    else
      next_attempt_count := rate_row.attempt_count + 1;

      update public.login_rate_limits as limits
      set attempt_count = next_attempt_count,
          last_attempt_at = recorded_at,
          locked_until = case
            when next_attempt_count >= max_attempts then recorded_at + lock_duration
            else null
          end,
          updated_at = recorded_at
      where limits.identifier_key = normalized_identifier
        and limits.client_key = normalized_client
      returning limits.* into rate_row;
    end if;
  end if;

  if rate_row.locked_until is not null and rate_row.locked_until > recorded_at then
    return query
    select
      false,
      rate_row.attempt_count,
      0,
      greatest(1, ceil(extract(epoch from (rate_row.locked_until - recorded_at)))::integer),
      rate_row.locked_until;
    return;
  end if;

  return query
  select
    rate_row.attempt_count < max_attempts,
    rate_row.attempt_count,
    greatest(0, max_attempts - rate_row.attempt_count),
    0,
    null::timestamptz;
end;
$function$;

create or replace function public.clear_login_rate_limit(
  p_identifier text,
  p_client_ip text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  normalized_identifier text;
  normalized_client text;
begin
  normalized_identifier := lower(
    public._required_bounded_text(p_identifier, 'identifier', 200)
  );

  if p_client_ip is null or btrim(p_client_ip) = '' then
    normalized_client := 'unknown';
  else
    normalized_client := lower(
      public._required_bounded_text(p_client_ip, 'client_ip', 128)
    );
  end if;

  delete from public.login_rate_limits as limits
  where limits.identifier_key = normalized_identifier
    and limits.client_key = normalized_client;

  return found;
end;
$function$;

comment on function public.check_login_rate_limit(text, text) is
  'Checks a 5-failure/15-minute login bucket without mutating it.';
comment on function public.record_login_failure(text, text) is
  'Atomically records a failed login and applies a 15-minute lock at five failures.';
comment on function public.clear_login_rate_limit(text, text) is
  'Clears the identifier/client bucket after successful authentication.';

revoke all on function public.check_login_rate_limit(text, text) from public, anon, authenticated;
revoke all on function public.record_login_failure(text, text) from public, anon, authenticated;
revoke all on function public.clear_login_rate_limit(text, text) from public, anon, authenticated;
grant execute on function public.check_login_rate_limit(text, text) to service_role;
grant execute on function public.record_login_failure(text, text) to service_role;
grant execute on function public.clear_login_rate_limit(text, text) to service_role;

-- INVENTORY MUTATION RPCs ----------------------------------------------------
-- Every function is one PostgreSQL transaction: row locks, state changes, and its activity log
-- either all commit or all roll back. The API must not write a second activity log.

create or replace function public.create_stock_in(
  p_type text,
  p_imei text,
  p_harga numeric,
  p_penjual text,
  p_tanggal_masuk date,
  p_actor_id text,
  p_actor_name text
)
returns public.stock_in
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  normalized_type text;
  canonical_imei text;
  normalized_harga numeric;
  normalized_penjual text;
  normalized_date date;
  normalized_actor_id text;
  normalized_actor_name text;
  stock_row public.stock%rowtype;
  created_row public.stock_in%rowtype;
  stock_found boolean;
begin
  normalized_type := public._required_bounded_text(p_type, 'type', 200);
  canonical_imei := public._canonical_inventory_imei(p_imei);
  normalized_harga := public._positive_inventory_money(p_harga, 'harga');
  normalized_penjual := public._required_bounded_text(p_penjual, 'penjual', 200);
  normalized_date := public._inventory_date_not_future_wib(p_tanggal_masuk, 'tanggal_masuk');
  normalized_actor_id := public._required_bounded_text(p_actor_id, 'actor_id', 200);
  normalized_actor_name := public._required_bounded_text(p_actor_name, 'actor_name', 200);

  -- A missing row cannot be locked, so the per-IMEI advisory lock serializes concurrent creates;
  -- an existing stock row is additionally locked FOR UPDATE below.
  perform pg_advisory_xact_lock(hashtextextended('inventory-imei:' || canonical_imei, 0));

  select stock.*
  into stock_row
  from public.stock as stock
  where stock.imei = canonical_imei
  for update;
  stock_found := found;

  -- Do not create/reactivate a lifecycle over unresolved active legacy transactions. They remain
  -- nullable for preservation, but must be voided or repaired before this IMEI can be reused.
  perform 1
  from public.stock_in as orphan_stock_in
  where orphan_stock_in.stock_id is null
    and orphan_stock_in.voided_at is null
    and orphan_stock_in.imei = canonical_imei
  for update;
  if found then
    raise exception using
      errcode = '55000',
      message = 'IMEI masih memiliki barang masuk legacy tanpa stock_id.';
  end if;

  perform 1
  from public.stock_out as orphan_stock_out
  where orphan_stock_out.stock_id is null
    and orphan_stock_out.voided_at is null
    and orphan_stock_out.imei = canonical_imei
  for update;
  if found then
    raise exception using
      errcode = '55000',
      message = 'IMEI masih memiliki barang keluar legacy tanpa stock_id.';
  end if;

  if not stock_found then
    insert into public.stock as stock (type, imei, harga, status, archived_at)
    values (normalized_type, canonical_imei, normalized_harga, 'available', null)
    returning stock.* into stock_row;
  else
    if stock_row.archived_at is null then
      raise exception using
        errcode = '23505',
        message = 'IMEI sudah memiliki stock aktif.';
    end if;

    if stock_row.status <> 'available' then
      raise exception using
        errcode = '55000',
        message = 'Stock terarsip tidak berada pada status available.';
    end if;

    perform 1
    from public.stock_in as stock_in
    where stock_in.stock_id = stock_row.id
      and stock_in.voided_at is null
    for update;
    if found then
      raise exception using
        errcode = '55000',
        message = 'Stock terarsip masih memiliki barang masuk aktif.';
    end if;

    perform 1
    from public.stock_out as stock_out
    where stock_out.stock_id = stock_row.id
      and stock_out.voided_at is null
    for update;
    if found then
      raise exception using
        errcode = '55000',
        message = 'Stock terarsip masih memiliki barang keluar aktif.';
    end if;

    update public.stock as stock
    set type = normalized_type,
        imei = canonical_imei,
        harga = normalized_harga,
        status = 'available',
        archived_at = null
    where stock.id = stock_row.id
    returning stock.* into stock_row;
  end if;

  insert into public.stock_in as stock_in (
    stock_id,
    type,
    imei,
    harga,
    penjual,
    tanggal_masuk,
    voided_at
  )
  values (
    stock_row.id,
    normalized_type,
    canonical_imei,
    normalized_harga,
    normalized_penjual,
    normalized_date,
    null
  )
  returning stock_in.* into created_row;

  perform public._insert_inventory_activity(
    normalized_actor_id,
    normalized_actor_name,
    'create',
    'stock_in',
    created_row.id,
    normalized_type || ' (' || canonical_imei || ')',
    'Mencatat barang masuk.',
    null,
    to_jsonb(created_row)
  );

  return created_row;
end;
$function$;

create or replace function public.update_stock_in(
  p_stock_in_id uuid,
  p_type text,
  p_imei text,
  p_harga numeric,
  p_penjual text,
  p_tanggal_masuk date,
  p_actor_id text,
  p_actor_name text
)
returns public.stock_in
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  normalized_type text;
  canonical_imei text;
  normalized_harga numeric;
  normalized_penjual text;
  normalized_date date;
  normalized_actor_id text;
  normalized_actor_name text;
  related_stock_id uuid;
  stock_row public.stock%rowtype;
  before_row public.stock_in%rowtype;
  updated_row public.stock_in%rowtype;
begin
  if p_stock_in_id is null then
    raise exception using errcode = '22023', message = 'stock_in_id wajib diisi.';
  end if;

  normalized_type := public._required_bounded_text(p_type, 'type', 200);
  canonical_imei := public._canonical_inventory_imei(p_imei);
  normalized_harga := public._positive_inventory_money(p_harga, 'harga');
  normalized_penjual := public._required_bounded_text(p_penjual, 'penjual', 200);
  normalized_date := public._inventory_date_not_future_wib(p_tanggal_masuk, 'tanggal_masuk');
  normalized_actor_id := public._required_bounded_text(p_actor_id, 'actor_id', 200);
  normalized_actor_name := public._required_bounded_text(p_actor_name, 'actor_name', 200);

  select stock_in.stock_id
  into related_stock_id
  from public.stock_in as stock_in
  where stock_in.id = p_stock_in_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'Data barang masuk tidak ditemukan.';
  end if;

  if related_stock_id is null then
    raise exception using
      errcode = '55000',
      message = 'Barang masuk legacy belum memiliki relasi stock_id dan tidak dapat diperbarui.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('inventory-imei:' || canonical_imei, 0));

  -- All inventory RPCs lock stock first, then child transaction rows, to avoid lock inversion.
  select stock.*
  into stock_row
  from public.stock as stock
  where stock.id = related_stock_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Stock terkait tidak ditemukan.';
  end if;

  select stock_in.*
  into before_row
  from public.stock_in as stock_in
  where stock_in.id = p_stock_in_id
    and stock_in.stock_id = related_stock_id
  for update;

  if not found then
    raise exception using
      errcode = '40001',
      message = 'Relasi barang masuk berubah secara bersamaan; ulangi permintaan.';
  end if;

  if before_row.voided_at is not null then
    raise exception using errcode = '55000', message = 'Barang masuk yang sudah void tidak dapat diperbarui.';
  end if;

  if stock_row.archived_at is not null or stock_row.status <> 'available' then
    raise exception using
      errcode = '55000',
      message = 'Hanya stock aktif berstatus available yang dapat diperbarui dari barang masuk.';
  end if;

  perform 1
  from public.stock_in as orphan_stock_in
  where orphan_stock_in.stock_id is null
    and orphan_stock_in.voided_at is null
    and orphan_stock_in.imei = canonical_imei
  for update;
  if found then
    raise exception using
      errcode = '55000',
      message = 'IMEI tujuan masih memiliki barang masuk legacy tanpa stock_id.';
  end if;

  perform 1
  from public.stock_out as orphan_stock_out
  where orphan_stock_out.stock_id is null
    and orphan_stock_out.voided_at is null
    and orphan_stock_out.imei = canonical_imei
  for update;
  if found then
    raise exception using
      errcode = '55000',
      message = 'IMEI tujuan masih memiliki barang keluar legacy tanpa stock_id.';
  end if;

  perform 1
  from public.stock_out as stock_out
  where stock_out.voided_at is null
    and (
      stock_out.stock_id = stock_row.id
      or (stock_out.stock_id is null and stock_out.imei = stock_row.imei)
    )
  for update;
  if found then
    raise exception using
      errcode = '55000',
      message = 'Barang masuk tidak dapat diperbarui setelah stock memiliki penjualan aktif.';
  end if;

  perform 1
  from public.stock_in as other_stock_in
  where other_stock_in.stock_id = stock_row.id
    and other_stock_in.voided_at is null
    and other_stock_in.id <> before_row.id
  for update;
  if found then
    raise exception using
      errcode = '55000',
      message = 'Stock memiliki lebih dari satu barang masuk aktif; perbaiki data legacy terlebih dahulu.';
  end if;

  if exists (
    select 1
    from public.stock as other_stock
    where other_stock.imei = canonical_imei
      and other_stock.id <> stock_row.id
  ) then
    raise exception using errcode = '23505', message = 'IMEI sudah digunakan oleh stock lain.';
  end if;

  update public.stock as stock
  set type = normalized_type,
      imei = canonical_imei,
      harga = normalized_harga
  where stock.id = stock_row.id;

  update public.stock_in as stock_in
  set type = normalized_type,
      imei = canonical_imei,
      harga = normalized_harga,
      penjual = normalized_penjual,
      tanggal_masuk = normalized_date
  where stock_in.id = before_row.id
  returning stock_in.* into updated_row;

  perform public._insert_inventory_activity(
    normalized_actor_id,
    normalized_actor_name,
    'update',
    'stock_in',
    updated_row.id,
    normalized_type || ' (' || canonical_imei || ')',
    'Memperbarui data barang masuk.',
    to_jsonb(before_row),
    to_jsonb(updated_row)
  );

  return updated_row;
end;
$function$;

create or replace function public.void_stock_in(
  p_stock_in_id uuid,
  p_actor_id text,
  p_actor_name text
)
returns public.stock_in
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  normalized_actor_id text;
  normalized_actor_name text;
  related_stock_id uuid;
  stock_row public.stock%rowtype;
  before_row public.stock_in%rowtype;
  voided_row public.stock_in%rowtype;
  has_stock boolean := false;
begin
  if p_stock_in_id is null then
    raise exception using errcode = '22023', message = 'stock_in_id wajib diisi.';
  end if;

  normalized_actor_id := public._required_bounded_text(p_actor_id, 'actor_id', 200);
  normalized_actor_name := public._required_bounded_text(p_actor_name, 'actor_name', 200);

  select stock_in.stock_id
  into related_stock_id
  from public.stock_in as stock_in
  where stock_in.id = p_stock_in_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'Data barang masuk tidak ditemukan.';
  end if;

  if related_stock_id is not null then
    select stock.*
    into stock_row
    from public.stock as stock
    where stock.id = related_stock_id
    for update;
    has_stock := found;
  end if;

  select stock_in.*
  into before_row
  from public.stock_in as stock_in
  where stock_in.id = p_stock_in_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Data barang masuk tidak ditemukan.';
  end if;

  -- Idempotent retry: return the original row and do not duplicate the activity log.
  if before_row.voided_at is not null then
    return before_row;
  end if;

  if has_stock then
    if before_row.stock_id is distinct from stock_row.id then
      raise exception using
        errcode = '40001',
        message = 'Relasi barang masuk berubah secara bersamaan; ulangi permintaan.';
    end if;

    if stock_row.status <> 'available' then
      raise exception using
        errcode = '55000',
        message = 'Barang masuk tidak dapat di-void saat stock tidak available.';
    end if;

    perform 1
    from public.stock_out as stock_out
    where stock_out.voided_at is null
      and (
        stock_out.stock_id = stock_row.id
        or (stock_out.stock_id is null and stock_out.imei = stock_row.imei)
      )
    for update;
    if found then
      raise exception using
        errcode = '55000',
        message = 'Void barang keluar aktif terlebih dahulu sebelum void barang masuk.';
    end if;
  end if;

  update public.stock_in as stock_in
  set voided_at = statement_timestamp()
  where stock_in.id = before_row.id
  returning stock_in.* into voided_row;

  if has_stock and not exists (
    select 1
    from public.stock_in as other_stock_in
    where other_stock_in.stock_id = stock_row.id
      and other_stock_in.voided_at is null
  ) then
    update public.stock as stock
    set archived_at = coalesce(stock.archived_at, statement_timestamp())
    where stock.id = stock_row.id;
  end if;

  perform public._insert_inventory_activity(
    normalized_actor_id,
    normalized_actor_name,
    'void',
    'stock_in',
    voided_row.id,
    coalesce(nullif(btrim(voided_row.type), ''), 'Barang Masuk') ||
      ' (' || coalesce(nullif(btrim(voided_row.imei), ''), '-') || ')',
    'Membatalkan data barang masuk tanpa menghapus histori.',
    to_jsonb(before_row),
    to_jsonb(voided_row)
  );

  return voided_row;
end;
$function$;

create or replace function public.checkout_stock_out(
  p_imei text,
  p_pembeli text,
  p_harga_jual numeric,
  p_tanggal_keluar date,
  p_idempotency_key text,
  p_actor_id text,
  p_actor_name text
)
returns public.stock_out
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  canonical_imei text;
  normalized_pembeli text;
  normalized_harga_jual numeric;
  normalized_date date;
  normalized_idempotency_key text;
  normalized_actor_id text;
  normalized_actor_name text;
  existing_stock_id uuid;
  stock_row public.stock%rowtype;
  stock_in_row public.stock_in%rowtype;
  existing_row public.stock_out%rowtype;
  created_row public.stock_out%rowtype;
  active_stock_in_count bigint;
begin
  canonical_imei := public._canonical_inventory_imei(p_imei);
  normalized_pembeli := public._required_bounded_text(p_pembeli, 'pembeli', 200);
  normalized_harga_jual := public._positive_inventory_money(p_harga_jual, 'harga_jual');
  normalized_date := public._inventory_date_not_future_wib(p_tanggal_keluar, 'tanggal_keluar');
  normalized_idempotency_key := public._required_bounded_text(
    p_idempotency_key,
    'idempotency_key',
    200
  );
  normalized_actor_id := public._required_bounded_text(p_actor_id, 'actor_id', 200);
  normalized_actor_name := public._required_bounded_text(p_actor_name, 'actor_name', 200);

  -- Serialize retries before checking the key, then serialize all checkouts for this IMEI.
  perform pg_advisory_xact_lock(
    hashtextextended('stock-out-idempotency:' || normalized_idempotency_key, 0)
  );

  select stock_out.stock_id
  into existing_stock_id
  from public.stock_out as stock_out
  where stock_out.idempotency_key = normalized_idempotency_key;

  if found then
    if existing_stock_id is null then
      raise exception using
        errcode = '23505',
        message = 'Idempotency key sudah dipakai oleh transaksi legacy tanpa stock_id.';
    end if;

    select stock.*
    into stock_row
    from public.stock as stock
    where stock.id = existing_stock_id
    for update;

    if not found then
      raise exception using
        errcode = '55000',
        message = 'Idempotency key merujuk stock yang tidak ditemukan.';
    end if;

    select stock_out.*
    into existing_row
    from public.stock_out as stock_out
    where stock_out.idempotency_key = normalized_idempotency_key
    for update;

    if existing_row.imei <> canonical_imei
       or existing_row.pembeli <> normalized_pembeli
       or existing_row.harga_jual <> normalized_harga_jual
       or existing_row.tanggal_keluar <> normalized_date then
      raise exception using
        errcode = '23505',
        message = 'Idempotency key sudah digunakan dengan payload checkout yang berbeda.';
    end if;

    -- Includes voided rows: an idempotency key permanently identifies its original result.
    return existing_row;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('inventory-imei:' || canonical_imei, 0));

  select stock.*
  into stock_row
  from public.stock as stock
  where stock.imei = canonical_imei
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Stock dengan IMEI tersebut tidak ditemukan.';
  end if;

  if stock_row.archived_at is not null or stock_row.status <> 'available' then
    raise exception using
      errcode = '55000',
      message = 'Stock tidak aktif atau sudah tidak tersedia untuk checkout.';
  end if;

  perform 1
  from public.stock_in as orphan_stock_in
  where orphan_stock_in.stock_id is null
    and orphan_stock_in.voided_at is null
    and orphan_stock_in.imei = stock_row.imei
  for update;
  if found then
    raise exception using
      errcode = '55000',
      message = 'Stock masih memiliki barang masuk legacy tanpa stock_id.';
  end if;

  select count(*)
  into active_stock_in_count
  from public.stock_in as stock_in
  where stock_in.stock_id = stock_row.id
    and stock_in.voided_at is null;

  if active_stock_in_count = 0 then
    raise exception using
      errcode = '55000',
      message = 'Stock tidak memiliki barang masuk aktif.';
  elsif active_stock_in_count > 1 then
    raise exception using
      errcode = '55000',
      message = 'Stock memiliki lebih dari satu barang masuk aktif; perbaiki data legacy terlebih dahulu.';
  end if;

  select stock_in.*
  into stock_in_row
  from public.stock_in as stock_in
  where stock_in.stock_id = stock_row.id
    and stock_in.voided_at is null
  order by stock_in.tanggal_masuk desc, stock_in.created_at desc, stock_in.id desc
  limit 1
  for update;

  if normalized_date < stock_in_row.tanggal_masuk then
    raise exception using
      errcode = '22023',
      message = 'tanggal_keluar tidak boleh sebelum tanggal_masuk barang.';
  end if;

  perform 1
  from public.stock_out as stock_out
  where stock_out.voided_at is null
    and (
      stock_out.stock_id = stock_row.id
      or (stock_out.stock_id is null and stock_out.imei = stock_row.imei)
    )
  for update;
  if found then
    raise exception using
      errcode = '55000',
      message = 'Stock sudah memiliki barang keluar aktif.';
  end if;

  insert into public.stock_out as stock_out (
    stock_id,
    type,
    imei,
    pembeli,
    harga_modal,
    harga_jual,
    tanggal_keluar,
    voided_at,
    idempotency_key
  )
  values (
    stock_row.id,
    stock_row.type,
    stock_row.imei,
    normalized_pembeli,
    stock_row.harga,
    normalized_harga_jual,
    normalized_date,
    null,
    normalized_idempotency_key
  )
  returning stock_out.* into created_row;

  update public.stock as stock
  set status = 'sold'
  where stock.id = stock_row.id
    and stock.status = 'available'
    and stock.archived_at is null;

  if not found then
    raise exception using
      errcode = '40001',
      message = 'Status stock berubah secara bersamaan; ulangi checkout.';
  end if;

  perform public._insert_inventory_activity(
    normalized_actor_id,
    normalized_actor_name,
    'checkout',
    'stock_out',
    created_row.id,
    stock_row.type || ' (' || stock_row.imei || ')',
    'Melakukan checkout barang keluar.',
    to_jsonb(stock_row),
    to_jsonb(created_row) || jsonb_build_object('stock_status', 'sold')
  );

  return created_row;
end;
$function$;

create or replace function public.update_stock_out(
  p_stock_out_id uuid,
  p_pembeli text,
  p_harga_jual numeric,
  p_tanggal_keluar date,
  p_actor_id text,
  p_actor_name text
)
returns public.stock_out
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  normalized_pembeli text;
  normalized_harga_jual numeric;
  normalized_date date;
  normalized_actor_id text;
  normalized_actor_name text;
  related_stock_id uuid;
  stock_row public.stock%rowtype;
  stock_in_row public.stock_in%rowtype;
  before_row public.stock_out%rowtype;
  updated_row public.stock_out%rowtype;
  active_stock_in_count bigint;
begin
  if p_stock_out_id is null then
    raise exception using errcode = '22023', message = 'stock_out_id wajib diisi.';
  end if;

  normalized_pembeli := public._required_bounded_text(p_pembeli, 'pembeli', 200);
  normalized_harga_jual := public._positive_inventory_money(p_harga_jual, 'harga_jual');
  normalized_date := public._inventory_date_not_future_wib(p_tanggal_keluar, 'tanggal_keluar');
  normalized_actor_id := public._required_bounded_text(p_actor_id, 'actor_id', 200);
  normalized_actor_name := public._required_bounded_text(p_actor_name, 'actor_name', 200);

  select stock_out.stock_id
  into related_stock_id
  from public.stock_out as stock_out
  where stock_out.id = p_stock_out_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'Data barang keluar tidak ditemukan.';
  end if;

  if related_stock_id is null then
    raise exception using
      errcode = '55000',
      message = 'Barang keluar legacy belum memiliki relasi stock_id dan tidak dapat diperbarui.';
  end if;

  select stock.*
  into stock_row
  from public.stock as stock
  where stock.id = related_stock_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Stock terkait tidak ditemukan.';
  end if;

  select stock_out.*
  into before_row
  from public.stock_out as stock_out
  where stock_out.id = p_stock_out_id
    and stock_out.stock_id = related_stock_id
  for update;

  if not found then
    raise exception using
      errcode = '40001',
      message = 'Relasi barang keluar berubah secara bersamaan; ulangi permintaan.';
  end if;

  if before_row.voided_at is not null then
    raise exception using errcode = '55000', message = 'Barang keluar yang sudah void tidak dapat diperbarui.';
  end if;

  if stock_row.archived_at is not null or stock_row.status <> 'sold' then
    raise exception using
      errcode = '55000',
      message = 'Stock untuk barang keluar aktif harus berstatus sold dan tidak terarsip.';
  end if;

  if public._canonical_inventory_imei(before_row.imei) <> before_row.imei then
    raise exception using
      errcode = '55000',
      message = 'IMEI barang keluar legacy belum canonical dan harus diperbaiki terlebih dahulu.';
  end if;

  perform 1
  from public.stock_in as orphan_stock_in
  where orphan_stock_in.stock_id is null
    and orphan_stock_in.voided_at is null
    and orphan_stock_in.imei = stock_row.imei
  for update;
  if found then
    raise exception using
      errcode = '55000',
      message = 'Stock masih memiliki barang masuk legacy tanpa stock_id.';
  end if;

  perform 1
  from public.stock_out as other_stock_out
  where other_stock_out.id <> before_row.id
    and other_stock_out.voided_at is null
    and (
      other_stock_out.stock_id = stock_row.id
      or (other_stock_out.stock_id is null and other_stock_out.imei = stock_row.imei)
    )
  for update;
  if found then
    raise exception using
      errcode = '55000',
      message = 'Stock memiliki lebih dari satu barang keluar aktif; perbaiki data legacy terlebih dahulu.';
  end if;

  select count(*)
  into active_stock_in_count
  from public.stock_in as stock_in
  where stock_in.stock_id = stock_row.id
    and stock_in.voided_at is null;

  if active_stock_in_count = 0 then
    raise exception using errcode = '55000', message = 'Stock tidak memiliki barang masuk aktif.';
  elsif active_stock_in_count > 1 then
    raise exception using
      errcode = '55000',
      message = 'Stock memiliki lebih dari satu barang masuk aktif; perbaiki data legacy terlebih dahulu.';
  end if;

  select stock_in.*
  into stock_in_row
  from public.stock_in as stock_in
  where stock_in.stock_id = stock_row.id
    and stock_in.voided_at is null
  for update;

  if normalized_date < stock_in_row.tanggal_masuk then
    raise exception using
      errcode = '22023',
      message = 'tanggal_keluar tidak boleh sebelum tanggal_masuk barang.';
  end if;

  update public.stock_out as stock_out
  set pembeli = normalized_pembeli,
      harga_jual = normalized_harga_jual,
      tanggal_keluar = normalized_date
  where stock_out.id = before_row.id
  returning stock_out.* into updated_row;

  perform public._insert_inventory_activity(
    normalized_actor_id,
    normalized_actor_name,
    'update',
    'stock_out',
    updated_row.id,
    updated_row.type || ' (' || updated_row.imei || ')',
    'Memperbarui data barang keluar.',
    to_jsonb(before_row),
    to_jsonb(updated_row)
  );

  return updated_row;
end;
$function$;

create or replace function public.void_stock_out(
  p_stock_out_id uuid,
  p_actor_id text,
  p_actor_name text
)
returns public.stock_out
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  normalized_actor_id text;
  normalized_actor_name text;
  related_stock_id uuid;
  legacy_imei text;
  stock_row public.stock%rowtype;
  before_row public.stock_out%rowtype;
  voided_row public.stock_out%rowtype;
  has_stock boolean := false;
  stock_restored boolean := false;
begin
  if p_stock_out_id is null then
    raise exception using errcode = '22023', message = 'stock_out_id wajib diisi.';
  end if;

  normalized_actor_id := public._required_bounded_text(p_actor_id, 'actor_id', 200);
  normalized_actor_name := public._required_bounded_text(p_actor_name, 'actor_name', 200);

  select stock_out.stock_id, stock_out.imei
  into related_stock_id, legacy_imei
  from public.stock_out as stock_out
  where stock_out.id = p_stock_out_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'Data barang keluar tidak ditemukan.';
  end if;

  -- A NULL legacy relationship may still be repaired safely during void by exact IMEI match.
  if related_stock_id is null then
    select stock.id
    into related_stock_id
    from public.stock as stock
    where stock.imei = legacy_imei;
  end if;

  if related_stock_id is not null then
    select stock.*
    into stock_row
    from public.stock as stock
    where stock.id = related_stock_id
    for update;
    has_stock := found;
  end if;

  select stock_out.*
  into before_row
  from public.stock_out as stock_out
  where stock_out.id = p_stock_out_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Data barang keluar tidak ditemukan.';
  end if;

  -- Idempotent retry: return the already-voided row without another log or status transition.
  if before_row.voided_at is not null then
    return before_row;
  end if;

  if has_stock and before_row.stock_id is not null and before_row.stock_id <> stock_row.id then
    raise exception using
      errcode = '40001',
      message = 'Relasi barang keluar berubah secara bersamaan; ulangi permintaan.';
  end if;

  if has_stock and (stock_row.archived_at is not null or stock_row.status <> 'sold') then
    raise exception using
      errcode = '55000',
      message = 'Stock untuk barang keluar aktif harus berstatus sold dan tidak terarsip.';
  end if;

  update public.stock_out as stock_out
  set stock_id = case when has_stock then stock_row.id else stock_out.stock_id end,
      voided_at = statement_timestamp()
  where stock_out.id = before_row.id
  returning stock_out.* into voided_row;

  if has_stock and not exists (
    select 1
    from public.stock_out as other_stock_out
    where other_stock_out.id <> voided_row.id
      and other_stock_out.voided_at is null
      and (
        other_stock_out.stock_id = stock_row.id
        or (other_stock_out.stock_id is null and other_stock_out.imei = stock_row.imei)
      )
  ) then
    update public.stock as stock
    set status = 'available'
    where stock.id = stock_row.id
      and stock.status = 'sold'
      and stock.archived_at is null;

    if not found then
      raise exception using
        errcode = '40001',
        message = 'Status stock berubah secara bersamaan; ulangi void.';
    end if;

    stock_restored := true;
  end if;

  perform public._insert_inventory_activity(
    normalized_actor_id,
    normalized_actor_name,
    'void',
    'stock_out',
    voided_row.id,
    coalesce(nullif(btrim(voided_row.type), ''), 'Barang Keluar') ||
      ' (' || coalesce(nullif(btrim(voided_row.imei), ''), '-') || ')',
    case
      when stock_restored then 'Membatalkan barang keluar dan mengembalikan stock menjadi available.'
      else 'Membatalkan barang keluar tanpa menghapus histori.'
    end,
    to_jsonb(before_row),
    to_jsonb(voided_row) || jsonb_build_object(
      'stock_status',
      case
        when stock_restored then 'available'
        when has_stock then stock_row.status
        else null
      end
    )
  );

  return voided_row;
end;
$function$;

comment on function public.create_stock_in(text, text, numeric, text, date, text, text) is
  'Creates/re-activates stock and its stock_in row atomically, with an activity log.';
comment on function public.update_stock_in(uuid, text, text, numeric, text, date, text, text) is
  'Updates an active available stock and stock_in row atomically, with an activity log.';
comment on function public.void_stock_in(uuid, text, text) is
  'Soft-voids stock_in and archives stock when no active inbound remains.';
comment on function public.checkout_stock_out(text, text, numeric, date, text, text, text) is
  'Idempotently checks out one available stock, marks it sold, and writes its activity log.';
comment on function public.update_stock_out(uuid, text, numeric, date, text, text) is
  'Updates mutable fields of an active stock_out row and writes its activity log.';
comment on function public.void_stock_out(uuid, text, text) is
  'Soft-voids stock_out, restores stock availability, and writes its activity log.';

revoke all on function public.create_stock_in(
  text, text, numeric, text, date, text, text
) from public, anon, authenticated;
revoke all on function public.update_stock_in(
  uuid, text, text, numeric, text, date, text, text
) from public, anon, authenticated;
revoke all on function public.void_stock_in(
  uuid, text, text
) from public, anon, authenticated;
revoke all on function public.checkout_stock_out(
  text, text, numeric, date, text, text, text
) from public, anon, authenticated;
revoke all on function public.update_stock_out(
  uuid, text, numeric, date, text, text
) from public, anon, authenticated;
revoke all on function public.void_stock_out(
  uuid, text, text
) from public, anon, authenticated;

grant execute on function public.create_stock_in(
  text, text, numeric, text, date, text, text
) to service_role;
grant execute on function public.update_stock_in(
  uuid, text, text, numeric, text, date, text, text
) to service_role;
grant execute on function public.void_stock_in(
  uuid, text, text
) to service_role;
grant execute on function public.checkout_stock_out(
  text, text, numeric, date, text, text, text
) to service_role;
grant execute on function public.update_stock_out(
  uuid, text, numeric, date, text, text
) to service_role;
grant execute on function public.void_stock_out(
  uuid, text, text
) to service_role;

commit;
