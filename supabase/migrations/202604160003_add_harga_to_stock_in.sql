begin;

alter table public.stock_in
add column if not exists harga numeric(14,2) not null default 0;

commit;
