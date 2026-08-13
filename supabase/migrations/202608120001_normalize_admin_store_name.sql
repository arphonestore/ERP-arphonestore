begin;

update public.admin_profiles
set full_name = 'Admin AR Store'
where lower(btrim(full_name)) in ('admin mkr store', 'admin mrk store');

commit;
