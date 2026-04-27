create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.grant_crm_records (
  id uuid primary key default gen_random_uuid(),
  acquirer text,
  acquired_date date,
  negotiator text,
  company_name text not null,
  contact_person text,
  url text,
  email text,
  phone text,
  mobile text,
  first_meeting_date date,
  reschedule_count text,
  na_status text,
  accuracy text,
  ng_reason text,
  order_amount numeric(12, 0) not null default 0,
  initial_cost numeric(12, 0) not null default 0,
  sr_deposit numeric(12, 0) not null default 0,
  sr_advance numeric(12, 0) not null default 0,
  revenue numeric(12, 0) not null default 0,
  gross_profit numeric(12, 0) not null default 0,
  application_date date,
  expected_payment_date date,
  payment_date date,
  negotiation_result text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.teleapo_records (
  id uuid primary key default gen_random_uuid(),
  added_date date,
  ta_staff text,
  company_name text not null,
  company_name_kana text,
  last_name text,
  last_name_kana text,
  phone text,
  mobile text,
  call_date_1 date,
  call_date_2 date,
  call_date_3 date,
  call_count text,
  call_content text,
  call_result text,
  apo_form_done boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_settings (
  id text primary key default 'global',
  acquirers jsonb not null default '[]'::jsonb,
  negotiators jsonb not null default '[]'::jsonb,
  ta_staffs jsonb not null default '[]'::jsonb,
  allowed_guest_emails jsonb not null default '[]'::jsonb,
  guest_password_hash text not null default '',
  guest_password_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.guest_email_is_allowed()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.app_settings s
    where s.id = 'global'
      and coalesce(s.allowed_guest_emails, '[]'::jsonb) ? lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

create index if not exists grant_crm_records_company_name_idx
  on public.grant_crm_records (company_name);

create index if not exists grant_crm_records_acquired_date_idx
  on public.grant_crm_records (acquired_date desc);

create index if not exists grant_crm_records_application_date_idx
  on public.grant_crm_records (application_date desc);

create index if not exists teleapo_records_company_name_idx
  on public.teleapo_records (company_name);

create index if not exists teleapo_records_added_date_idx
  on public.teleapo_records (added_date desc);

create index if not exists teleapo_records_ta_staff_idx
  on public.teleapo_records (ta_staff);

drop trigger if exists grant_crm_records_set_updated_at on public.grant_crm_records;
create trigger grant_crm_records_set_updated_at
before update on public.grant_crm_records
for each row
execute function public.set_updated_at();

drop trigger if exists teleapo_records_set_updated_at on public.teleapo_records;
create trigger teleapo_records_set_updated_at
before update on public.teleapo_records
for each row
execute function public.set_updated_at();

drop trigger if exists app_settings_set_updated_at on public.app_settings;
create trigger app_settings_set_updated_at
before update on public.app_settings
for each row
execute function public.set_updated_at();

alter table public.grant_crm_records enable row level security;
alter table public.teleapo_records enable row level security;
alter table public.app_settings enable row level security;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.grant_crm_records to authenticated;
grant select, insert, update, delete on public.teleapo_records to authenticated;
grant select on public.app_settings to anon, authenticated;
grant insert, update, delete on public.app_settings to authenticated;

insert into public.app_settings (
  id,
  acquirers,
  negotiators,
  ta_staffs,
  allowed_guest_emails,
  guest_password_hash
)
values (
  'global',
  '["テレアポ","奥村","樋口","櫻井"]'::jsonb,
  '["奥村","樋口","櫻井"]'::jsonb,
  '["奥村","樋口","櫻井"]'::jsonb,
  '[]'::jsonb,
  ''
)
on conflict (id) do nothing;

drop policy if exists "public can read grant crm records" on public.grant_crm_records;
create policy "authenticated can read grant crm records"
on public.grant_crm_records
for select
to authenticated
using (public.guest_email_is_allowed());

drop policy if exists "public can insert grant crm records" on public.grant_crm_records;
create policy "authenticated can insert grant crm records"
on public.grant_crm_records
for insert
to authenticated
with check (public.guest_email_is_allowed());

drop policy if exists "public can update grant crm records" on public.grant_crm_records;
create policy "authenticated can update grant crm records"
on public.grant_crm_records
for update
to authenticated
using (public.guest_email_is_allowed())
with check (public.guest_email_is_allowed());

drop policy if exists "public can delete grant crm records" on public.grant_crm_records;
create policy "authenticated can delete grant crm records"
on public.grant_crm_records
for delete
to authenticated
using (public.guest_email_is_allowed());

drop policy if exists "public can read teleapo records" on public.teleapo_records;
create policy "authenticated can read teleapo records"
on public.teleapo_records
for select
to authenticated
using (public.guest_email_is_allowed());

drop policy if exists "public can insert teleapo records" on public.teleapo_records;
create policy "authenticated can insert teleapo records"
on public.teleapo_records
for insert
to authenticated
with check (public.guest_email_is_allowed());

drop policy if exists "public can update teleapo records" on public.teleapo_records;
create policy "authenticated can update teleapo records"
on public.teleapo_records
for update
to authenticated
using (public.guest_email_is_allowed())
with check (public.guest_email_is_allowed());

drop policy if exists "public can delete teleapo records" on public.teleapo_records;
create policy "authenticated can delete teleapo records"
on public.teleapo_records
for delete
to authenticated
using (public.guest_email_is_allowed());

drop policy if exists "public can read app settings" on public.app_settings;
create policy "public can read app settings"
on public.app_settings
for select
to anon, authenticated
using (id = 'global');

drop policy if exists "authenticated can update app settings" on public.app_settings;
create policy "authenticated can update app settings"
on public.app_settings
for update
to authenticated
using (id = 'global')
with check (id = 'global');

drop policy if exists "authenticated can insert app settings" on public.app_settings;
create policy "authenticated can insert app settings"
on public.app_settings
for insert
to authenticated
with check (id = 'global');
