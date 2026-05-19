create table if not exists public.ipos_checks (
  id bigserial primary key,
  domain text not null,
  status text not null check (status in ('clear', 'blocked', 'unknown', 'invalid')),
  blocked boolean,
  source text,
  checked_at timestamptz not null default now(),
  cache boolean not null default false,
  raw jsonb,
  client_ip text
);

create index if not exists idx_ipos_checks_domain_checked_at
on public.ipos_checks (domain, checked_at desc);

create index if not exists idx_ipos_checks_status_checked_at
on public.ipos_checks (status, checked_at desc);

alter table public.ipos_checks enable row level security;

drop policy if exists "service_role_only_insert_ipos_checks" on public.ipos_checks;
create policy "service_role_only_insert_ipos_checks"
on public.ipos_checks
for insert
to service_role
with check (true);

drop policy if exists "service_role_only_select_ipos_checks" on public.ipos_checks;
create policy "service_role_only_select_ipos_checks"
on public.ipos_checks
for select
to service_role
using (true);
