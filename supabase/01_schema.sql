create extension if not exists pgcrypto;

create table if not exists public.facilities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  area text,
  manager_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities(id) on delete cascade,
  plate_number text not null,
  insurance_end_date date not null,
  insurance_file_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists vehicles_plate_number_key
  on public.vehicles (plate_number);

create index if not exists vehicles_facility_id_idx
  on public.vehicles (facility_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists facilities_set_updated_at on public.facilities;
create trigger facilities_set_updated_at
before update on public.facilities
for each row
execute function public.set_updated_at();

drop trigger if exists vehicles_set_updated_at on public.vehicles;
create trigger vehicles_set_updated_at
before update on public.vehicles
for each row
execute function public.set_updated_at();

alter table public.facilities enable row level security;
alter table public.vehicles enable row level security;

drop policy if exists "public can read facilities" on public.facilities;
create policy "public can read facilities"
on public.facilities
for select
to anon, authenticated
using (true);

drop policy if exists "public can read vehicles" on public.vehicles;
create policy "public can read vehicles"
on public.vehicles
for select
to anon, authenticated
using (true);

drop policy if exists "authenticated can insert facilities" on public.facilities;
create policy "authenticated can insert facilities"
on public.facilities
for insert
to authenticated
with check (true);

drop policy if exists "authenticated can update facilities" on public.facilities;
create policy "authenticated can update facilities"
on public.facilities
for update
to authenticated
using (true)
with check (true);

drop policy if exists "authenticated can delete facilities" on public.facilities;
create policy "authenticated can delete facilities"
on public.facilities
for delete
to authenticated
using (true);

drop policy if exists "authenticated can insert vehicles" on public.vehicles;
create policy "authenticated can insert vehicles"
on public.vehicles
for insert
to authenticated
with check (true);

drop policy if exists "authenticated can update vehicles" on public.vehicles;
create policy "authenticated can update vehicles"
on public.vehicles
for update
to authenticated
using (true)
with check (true);

drop policy if exists "authenticated can delete vehicles" on public.vehicles;
create policy "authenticated can delete vehicles"
on public.vehicles
for delete
to authenticated
using (true);
