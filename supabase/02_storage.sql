insert into storage.buckets (id, name, public)
values ('insurance-pdfs', 'insurance-pdfs', true)
on conflict (id) do nothing;

drop policy if exists "public can read insurance files" on storage.objects;
create policy "public can read insurance files"
on storage.objects
for select
to anon
using (bucket_id = 'insurance-pdfs');

drop policy if exists "authenticated can read insurance files" on storage.objects;
create policy "authenticated can read insurance files"
on storage.objects
for select
to authenticated
using (bucket_id = 'insurance-pdfs');

drop policy if exists "authenticated can upload insurance files" on storage.objects;
create policy "authenticated can upload insurance files"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'insurance-pdfs');

drop policy if exists "authenticated can update insurance files" on storage.objects;
create policy "authenticated can update insurance files"
on storage.objects
for update
to authenticated
using (bucket_id = 'insurance-pdfs')
with check (bucket_id = 'insurance-pdfs');

drop policy if exists "authenticated can delete insurance files" on storage.objects;
create policy "authenticated can delete insurance files"
on storage.objects
for delete
to authenticated
using (bucket_id = 'insurance-pdfs');
