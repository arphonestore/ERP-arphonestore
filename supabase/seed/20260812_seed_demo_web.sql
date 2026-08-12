begin;

-- Data demo AR Store.
-- Aman dijalankan ulang: hanya data dengan IMEI yang tercantum di bawah
-- dan activity log milik actor_id "demo-seed" yang akan di-reset.
-- Jalankan semua migration sebelum menjalankan seed ini.

create temporary table demo_inventory_data (
  seq integer primary key,
  type text not null,
  imei text not null unique,
  harga numeric(14,2) not null,
  penjual text not null,
  sold boolean not null,
  pembeli text,
  harga_jual numeric(14,2),
  tanggal_masuk date,
  tanggal_keluar date
) on commit drop;

insert into demo_inventory_data (seq, type, imei, harga, penjual, sold, pembeli, harga_jual)
values
  (1,  'iPhone 11 128GB Black',       '359990000000001',  5200000, 'PT Nusantara Gadget', true,  'Andi Saputra',      5850000),
  (2,  'iPhone 12 128GB Blue',        '359990000000002',  6900000, 'PT Nusantara Gadget', true,  'Siti Rahma',        7700000),
  (3,  'Samsung Galaxy S22 128GB',    '359990000000003',  6400000, 'CV Mobile Jaya',       true,  'Budi Santoso',      7150000),
  (4,  'Xiaomi 13T 256GB',            '359990000000004',  5100000, 'CV Mobile Jaya',       true,  'Rina Oktaviani',    5750000),
  (5,  'iPhone 13 128GB Midnight',    '359990000000005',  8100000, 'Apple Partner ID',     true,  'Dimas Pratama',     9050000),
  (6,  'Samsung Galaxy S23 256GB',    '359990000000006',  7900000, 'Samsung Distributor', true,  'Nadia Putri',       8850000),
  (7,  'iPhone 11 64GB White',        '359990000000007',  4450000, 'PT Nusantara Gadget', true,  'Fajar Hidayat',     5050000),
  (8,  'OPPO Reno 11 5G 256GB',       '359990000000008',  4550000, 'OPPO Authorized',      true,  'Lina Marlina',      5200000),
  (9,  'Vivo V30 5G 256GB',           '359990000000009',  4800000, 'Vivo Distributor',     true,  'Rizky Maulana',     5450000),
  (10, 'Samsung Galaxy A55 256GB',    '359990000000010',  4650000, 'Samsung Distributor', true,  'Putri Amelia',      5300000),
  (11, 'iPhone 14 128GB Purple',      '359990000000011',  9800000, 'Apple Partner ID',     true,  'Yoga Firmansyah',  10900000),
  (12, 'Xiaomi Redmi Note 13 Pro',    '359990000000012',  3600000, 'Xiaomi Distributor',  true,  'Dewi Anggraini',    4150000),
  (13, 'Google Pixel 7 128GB',        '359990000000013',  6200000, 'Global Phone Supply', true,  'Arif Nugroho',      7050000),
  (14, 'Realme 12 Pro+ 5G 256GB',     '359990000000014',  4850000, 'Realme Authorized',   true,  'Maya Sari',         5550000),
  (15, 'iPhone 15 128GB Black',       '359990000000015', 11800000, 'Apple Partner ID',     false, null,                null),
  (16, 'Samsung Galaxy S24 256GB',    '359990000000016', 11200000, 'Samsung Distributor', false, null,                null),
  (17, 'Xiaomi 14 512GB',             '359990000000017',  9200000, 'Xiaomi Distributor',  false, null,                null),
  (18, 'OPPO Find N3 Flip 256GB',     '359990000000018', 12400000, 'OPPO Authorized',      false, null,                null),
  (19, 'Vivo X100 512GB',             '359990000000019', 11900000, 'Vivo Distributor',     false, null,                null),
  (20, 'Samsung Galaxy A35 256GB',    '359990000000020',  3850000, 'Samsung Distributor', false, null,                null),
  (21, 'iPhone 13 256GB Starlight',   '359990000000021',  8800000, 'PT Nusantara Gadget', false, null,                null),
  (22, 'Realme GT 6 512GB',           '359990000000022',  7100000, 'Realme Authorized',   false, null,                null),
  (23, 'POCO F6 512GB',               '359990000000023',  5650000, 'Xiaomi Distributor',  false, null,                null),
  (24, 'Google Pixel 8 128GB',        '359990000000024',  8400000, 'Global Phone Supply', false, null,                null);

-- Enam penjualan ditempatkan pada bulan sebelumnya agar perbandingan
-- profit bulanan di dashboard memiliki data pembanding.
update demo_inventory_data
set tanggal_keluar = case
  when seq <= 6 then
    (date_trunc('month', current_date) - interval '1 month')::date + ((seq * 3) - 1)
  else
    greatest(date_trunc('month', current_date)::date, current_date - (15 - seq))
end
where sold;

-- Barang terjual masuk 6-10 hari sebelum tanggal penjualan.
-- Stok tersedia dibuat pada beberapa hari terakhir bulan berjalan.
update demo_inventory_data
set tanggal_masuk = case
  when sold then tanggal_keluar - ((seq % 5) + 5)
  else greatest(date_trunc('month', current_date)::date, current_date - (25 - seq))
end;

-- Hapus hanya data demo dari eksekusi sebelumnya.
delete from public.activity_logs
where actor_id = 'demo-seed';

delete from public.stock_out
where imei in (select imei from demo_inventory_data);

delete from public.stock_in
where imei in (select imei from demo_inventory_data);

delete from public.stock
where imei in (select imei from demo_inventory_data);

-- Master stock: 14 sold dan 10 available.
insert into public.stock (type, imei, harga, status, created_at)
select
  type,
  imei,
  harga,
  case when sold then 'sold' else 'available' end,
  tanggal_masuk::timestamptz + interval '9 hours'
from demo_inventory_data;

-- Semua unit memiliki riwayat barang masuk.
insert into public.stock_in (type, imei, harga, penjual, tanggal_masuk, created_at)
select
  type,
  imei,
  harga,
  penjual,
  tanggal_masuk,
  tanggal_masuk::timestamptz + interval '9 hours'
from demo_inventory_data;

-- Hanya unit sold yang memiliki riwayat barang keluar.
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
  pembeli,
  harga,
  harga_jual,
  tanggal_keluar,
  tanggal_keluar::timestamptz + interval '14 hours'
from demo_inventory_data
where sold;

-- Activity create untuk transaksi barang masuk.
insert into public.activity_logs (
  actor_id,
  actor_name,
  action,
  module,
  entity_id,
  entity_label,
  description,
  before_data,
  after_data,
  created_at
)
select
  'demo-seed',
  'Admin AR Store',
  'create',
  'stock_in',
  imei,
  type || ' (' || imei || ')',
  'Mencatat barang masuk.',
  null,
  jsonb_build_object(
    'type', type,
    'imei', imei,
    'harga', harga,
    'penjual', penjual,
    'tanggal_masuk', tanggal_masuk
  ),
  tanggal_masuk::timestamptz + interval '9 hours'
from demo_inventory_data;

-- Activity checkout untuk transaksi barang keluar.
insert into public.activity_logs (
  actor_id,
  actor_name,
  action,
  module,
  entity_id,
  entity_label,
  description,
  before_data,
  after_data,
  created_at
)
select
  'demo-seed',
  'Admin AR Store',
  'checkout',
  'stock_out',
  imei,
  type || ' (' || imei || ')',
  'Melakukan checkout barang.',
  jsonb_build_object(
    'type', type,
    'imei', imei,
    'harga', harga,
    'status', 'available'
  ),
  jsonb_build_object(
    'type', type,
    'imei', imei,
    'pembeli', pembeli,
    'harga_modal', harga,
    'harga_jual', harga_jual,
    'keuntungan', harga_jual - harga,
    'tanggal_keluar', tanggal_keluar,
    'status', 'sold'
  ),
  tanggal_keluar::timestamptz + interval '14 hours'
from demo_inventory_data
where sold;

-- Contoh update agar filter dan detail perubahan pada Activity dapat didemokan.
insert into public.activity_logs (
  actor_id,
  actor_name,
  action,
  module,
  entity_id,
  entity_label,
  description,
  before_data,
  after_data,
  created_at
)
select
  'demo-seed',
  'Admin AR Store',
  'update',
  'stock',
  imei,
  type || ' (' || imei || ')',
  'Memperbarui harga stok.',
  jsonb_build_object('type', type, 'imei', imei, 'harga', harga - 100000, 'status', 'available'),
  jsonb_build_object('type', type, 'imei', imei, 'harga', harga, 'status', 'available'),
  now() - interval '2 hours'
from demo_inventory_data
where seq = 20;

-- Contoh delete hanya berupa audit log; tidak menghapus salah satu stok demo aktif.
insert into public.activity_logs (
  actor_id,
  actor_name,
  action,
  module,
  entity_id,
  entity_label,
  description,
  before_data,
  after_data,
  created_at
)
values (
  'demo-seed',
  'Admin AR Store',
  'delete',
  'stock_in',
  '359990000000099',
  'Infinix Note 40 Pro (359990000000099)',
  'Menghapus data barang masuk.',
  jsonb_build_object(
    'type', 'Infinix Note 40 Pro',
    'imei', '359990000000099',
    'harga', 3200000,
    'penjual', 'Demo Supplier',
    'tanggal_masuk', current_date - 1
  ),
  null,
  now() - interval '1 hour'
);

commit;

-- Ringkasan hasil seed untuk ditampilkan di SQL Editor.
select
  (select count(*) from public.stock where imei between '359990000000001' and '359990000000024') as total_stock_demo,
  (select count(*) from public.stock where imei between '359990000000001' and '359990000000024' and status = 'available') as stok_tersedia,
  (select count(*) from public.stock_out where imei between '359990000000001' and '359990000000024') as barang_terjual,
  (select count(*) from public.activity_logs where actor_id = 'demo-seed') as activity_demo;
