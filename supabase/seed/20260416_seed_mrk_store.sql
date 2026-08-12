begin;

-- Seed 20 stok baru, otomatis lanjut ke stock_in.
with base_count as (
  select coalesce(count(*), 0) as total from public.stock
),
inserted_stock as (
  insert into public.stock (type, imei, harga, status, created_at)
  select
    case (g % 6)
      when 0 then 'iPhone 11'
      when 1 then 'iPhone 12'
      when 2 then 'iPhone 13'
      when 3 then 'Samsung S22'
      when 4 then 'Samsung S23'
      else 'Xiaomi 13T'
    end as type,
    lpad((base_count.total + g)::text, 15, '0') as imei,
    (3000000 + (g * 175000))::numeric(14,2) as harga,
    'available'::text as status,
    now() - ((22 - g)::text || ' days')::interval as created_at
  from generate_series(1, 20) as g
  cross join base_count
  returning type, imei, harga, created_at
)
insert into public.stock_in (type, imei, harga, penjual, tanggal_masuk, created_at)
select
  type,
  imei,
  harga,
  'Supplier ' || row_number() over (order by created_at) as penjual,
  created_at::date as tanggal_masuk,
  created_at
from inserted_stock;

-- Ambil maksimal 8 stok available, jualkan, lalu ubah status stock menjadi sold.
with candidates as (
  select
    id,
    type,
    imei,
    harga,
    row_number() over (order by created_at asc) as rn
  from public.stock
  where status = 'available'
  order by created_at asc
  limit 8
),
inserted_out as (
  insert into public.stock_out (
    type,
    imei,
    pembeli,
    harga_modal,
    harga_jual,
    tanggal_keluar,
    created_at
  )
  select
    type,
    imei,
    'Pembeli ' || rn as pembeli,
    harga as harga_modal,
    (harga + (300000 + (rn * 50000)))::numeric(14,2) as harga_jual,
    (current_date - ((9 - rn))::int) as tanggal_keluar,
    now() - ((9 - rn)::text || ' days')::interval as created_at
  from candidates
  returning imei
)
update public.stock
set status = 'sold'
where imei in (select imei from inserted_out);

commit;
