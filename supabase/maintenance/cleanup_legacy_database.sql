-- Cleanup database lama untuk AR Phone Store
-- Jalankan di Supabase SQL Editor.
-- Disarankan: backup database terlebih dahulu.

begin;

-- 1) Hapus baris tidak valid / kosong di tabel inti.
delete from public.stock where coalesce(trim(type), '') = '' or coalesce(trim(imei), '') = '';
delete from public.stock_in where coalesce(trim(type), '') = '' or coalesce(trim(imei), '') = '';
delete from public.stock_out where coalesce(trim(type), '') = '' or coalesce(trim(imei), '') = '';

-- 2) Normalisasi status stock lama.
update public.stock
set status = case
  when lower(coalesce(status, '')) in ('sold', 'terjual') then 'sold'
  else 'available'
end;

-- 3) Sinkronisasi status sold berdasarkan data stock_out historis.
update public.stock s
set status = 'sold'
where exists (
  select 1
  from public.stock_out so
  where so.imei = s.imei
);

-- 4) Deduplikasi stock per IMEI, simpan data paling baru.
with ranked_stock as (
  select
    id,
    row_number() over (
      partition by imei
      order by created_at desc nulls last, id desc
    ) as rn
  from public.stock
)
delete from public.stock s
using ranked_stock r
where s.id = r.id and r.rn > 1;

-- 5) Hapus duplikat transaksi masuk (imei + tanggal_masuk), simpan paling baru.
with ranked_stock_in as (
  select
    id,
    row_number() over (
      partition by imei, tanggal_masuk
      order by created_at desc nulls last, id desc
    ) as rn
  from public.stock_in
)
delete from public.stock_in si
using ranked_stock_in r
where si.id = r.id and r.rn > 1;

-- 6) Hapus duplikat transaksi keluar (imei + tanggal_keluar), simpan paling baru.
with ranked_stock_out as (
  select
    id,
    row_number() over (
      partition by imei, tanggal_keluar
      order by created_at desc nulls last, id desc
    ) as rn
  from public.stock_out
)
delete from public.stock_out so
using ranked_stock_out r
where so.id = r.id and r.rn > 1;

-- 7) Bersihkan activity logs lebih lama dari 2 bulan.
delete from public.activity_logs
where created_at < now() - interval '2 months';

commit;

-- Verifikasi cepat setelah cleanup.
select 'stock' as table_name, count(*) as total_rows from public.stock
union all
select 'stock_in' as table_name, count(*) as total_rows from public.stock_in
union all
select 'stock_out' as table_name, count(*) as total_rows from public.stock_out
union all
select 'activity_logs' as table_name, count(*) as total_rows from public.activity_logs;
