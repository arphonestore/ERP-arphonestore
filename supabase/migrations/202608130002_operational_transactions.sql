-- Operational transactions added after the core database hardening migration.
-- This migration keeps multi-item checkout and administrator profile updates atomic.

begin;

set local lock_timeout = '10s';

-- A batch is all-or-nothing. Stable per-item idempotency keys make a retry safe even
-- when the client did not receive the first committed response.
create or replace function public.checkout_stock_out_batch(
  p_items jsonb,
  p_actor_id text,
  p_actor_name text
)
returns setof public.stock_out
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  item jsonb;
  item_count integer;
  result_row public.stock_out%rowtype;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception using
      errcode = '22023',
      message = 'items wajib berupa array JSON.';
  end if;

  item_count := jsonb_array_length(p_items);
  if item_count < 1 or item_count > 100 then
    raise exception using
      errcode = '22023',
      message = 'Batch checkout wajib berisi 1 sampai 100 item.';
  end if;

  -- Lock order is deterministic by canonical IMEI to avoid deadlocks between batches.
  for item in
    select value
    from jsonb_array_elements(p_items)
    order by public._canonical_inventory_imei(value ->> 'imei')
  loop
    if jsonb_typeof(item) <> 'object' then
      raise exception using errcode = '22023', message = 'Setiap item checkout harus berupa object.';
    end if;

    result_row := public.checkout_stock_out(
      item ->> 'imei',
      item ->> 'pembeli',
      case
        when jsonb_typeof(item -> 'harga_jual') = 'number' then (item ->> 'harga_jual')::numeric
        else null
      end,
      case
        when coalesce(item ->> 'tanggal_keluar', '') ~ '^\d{4}-\d{2}-\d{2}$'
          then (item ->> 'tanggal_keluar')::date
        else null
      end,
      item ->> 'idempotency_key',
      p_actor_id,
      p_actor_name
    );

    return next result_row;
  end loop;

  return;
exception
  when invalid_text_representation or datetime_field_overflow then
    raise exception using errcode = '22023', message = 'Payload batch checkout tidak valid.';
end;
$function$;

comment on function public.checkout_stock_out_batch(jsonb, text, text) is
  'Atomically checks out 1-100 items. Every item uses the existing idempotent single-item lifecycle.';

revoke all on function public.checkout_stock_out_batch(jsonb, text, text)
  from public, anon, authenticated;
grant execute on function public.checkout_stock_out_batch(jsonb, text, text)
  to service_role;

-- Profile fields and the audit entry commit together. Password hashes are intentionally
-- excluded from before_data/after_data and from the returned record.
create or replace function public.update_admin_profile(
  p_profile_id text,
  p_username text,
  p_full_name text,
  p_avatar_url text,
  p_new_password_hash text,
  p_expected_password_hash text,
  p_actor_id text,
  p_actor_name text
)
returns table (
  id text,
  username text,
  full_name text,
  avatar_url text,
  updated_at timestamptz,
  session_version bigint
)
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  profile_before public.admin_profiles%rowtype;
  profile_after public.admin_profiles%rowtype;
  normalized_username text;
  normalized_full_name text;
  normalized_actor_id text;
  normalized_actor_name text;
  changing_password boolean := p_new_password_hash is not null;
begin
  normalized_username := public._required_bounded_text(p_username, 'username', 30);
  normalized_full_name := public._required_bounded_text(p_full_name, 'full_name', 200);
  normalized_actor_id := public._required_bounded_text(p_actor_id, 'actor_id', 200);
  normalized_actor_name := public._required_bounded_text(p_actor_name, 'actor_name', 200);

  if normalized_username !~ '^[A-Za-z0-9_.-]+$' then
    raise exception using errcode = '22023', message = 'Format username tidak valid.';
  end if;

  if p_profile_id is null or btrim(p_profile_id) = '' or p_profile_id <> normalized_actor_id then
    raise exception using errcode = '42501', message = 'Profil tidak diizinkan.';
  end if;

  if p_avatar_url is not null and (
    char_length(p_avatar_url) > 2048
    or p_avatar_url !~ '^https://'
  ) then
    raise exception using errcode = '22023', message = 'URL avatar tidak valid.';
  end if;

  select profile.*
  into profile_before
  from public.admin_profiles as profile
  where profile.id = p_profile_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Profil administrator tidak ditemukan.';
  end if;

  if changing_password then
    if p_expected_password_hash is null
       or profile_before.password_hash is distinct from p_expected_password_hash then
      raise exception using errcode = '40001', message = 'Password profil berubah secara bersamaan.';
    end if;

    if char_length(p_new_password_hash) < 32 or char_length(p_new_password_hash) > 512 then
      raise exception using errcode = '22023', message = 'Hash password baru tidak valid.';
    end if;
  end if;

  update public.admin_profiles as profile
  set username = normalized_username,
      full_name = normalized_full_name,
      avatar_url = p_avatar_url,
      password_hash = case
        when changing_password then p_new_password_hash
        else profile.password_hash
      end
  where profile.id = p_profile_id
  returning profile.* into profile_after;

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
  ) values (
    normalized_actor_id,
    normalized_actor_name,
    case when changing_password then 'security_update' else 'update' end,
    'profile',
    profile_after.id,
    profile_after.username,
    case
      when changing_password then 'Memperbarui profil dan password administrator.'
      else 'Memperbarui profil administrator.'
    end,
    jsonb_build_object(
      'username', profile_before.username,
      'full_name', profile_before.full_name,
      'avatar_url', profile_before.avatar_url
    ),
    jsonb_build_object(
      'username', profile_after.username,
      'full_name', profile_after.full_name,
      'avatar_url', profile_after.avatar_url,
      'password_changed', changing_password
    )
  );

  return query
  select
    profile_after.id,
    profile_after.username,
    profile_after.full_name,
    profile_after.avatar_url,
    profile_after.updated_at,
    profile_after.session_version;
end;
$function$;

comment on function public.update_admin_profile(text, text, text, text, text, text, text, text) is
  'Updates one administrator profile and its non-sensitive activity log atomically.';

revoke all on function public.update_admin_profile(text, text, text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.update_admin_profile(text, text, text, text, text, text, text, text)
  to service_role;

commit;
