begin;

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

alter table public.activity_logs enable row level security;

drop policy if exists activity_logs_select_authenticated on public.activity_logs;
create policy activity_logs_select_authenticated
on public.activity_logs
for select
to authenticated
using (true);

commit;
