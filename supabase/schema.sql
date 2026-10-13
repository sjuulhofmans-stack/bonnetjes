-- =====================================================================
--  Bonnetjes-app — databaseschema voor Supabase
--  Plak dit hele bestand in Supabase → SQL Editor → "Run".
--  Je kunt het veilig vaker draaien (het maakt niets dubbel aan).
-- =====================================================================

-- ---------- Cliënten ----------
create table if not exists public.clients (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name             text not null check (char_length(name) between 1 and 120),
  client_number    text,
  has_guardian     boolean not null default false,   -- staat onder bewind
  guardian_name    text,                             -- naam bewindvoerder / kantoor
  guardian_contact text,                             -- e-mail of telefoon bewindvoerder
  notes            text,
  active           boolean not null default true,    -- false = gearchiveerd
  created_at       timestamptz not null default now()
);

-- ---------- Bonnetjes ----------
create table if not exists public.receipts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  client_id    uuid not null references public.clients(id) on delete restrict,
  receipt_date date not null default current_date,
  amount       numeric(10,2) not null check (amount > 0 and amount < 100000),
  description  text not null check (char_length(description) between 1 and 500),
  photo_path   text,
  created_at   timestamptz not null default now()
);

create index if not exists receipts_user_date_idx on public.receipts (user_id, receipt_date);
create index if not exists receipts_client_idx    on public.receipts (client_id);
create index if not exists clients_user_idx       on public.clients  (user_id);

-- ---------- Beveiliging: iedereen ziet alleen zijn/haar eigen gegevens ----------
alter table public.clients  enable row level security;
alter table public.receipts enable row level security;

drop policy if exists "eigen clienten"  on public.clients;
create policy "eigen clienten" on public.clients
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "eigen bonnetjes" on public.receipts;
create policy "eigen bonnetjes" on public.receipts
  for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.clients c where c.id = client_id and c.user_id = auth.uid())
  );

-- ---------- Opslag voor de foto's (privé, max 10 MB per bestand) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('bonnetjes', 'bonnetjes', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Bestanden staan in een map met je eigen gebruikers-id: <user_id>/<jaar>/<bestand>.jpg
drop policy if exists "eigen fotos lezen"      on storage.objects;
drop policy if exists "eigen fotos uploaden"   on storage.objects;
drop policy if exists "eigen fotos wijzigen"   on storage.objects;
drop policy if exists "eigen fotos verwijderen" on storage.objects;

create policy "eigen fotos lezen" on storage.objects
  for select to authenticated
  using (bucket_id = 'bonnetjes' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "eigen fotos uploaden" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'bonnetjes' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "eigen fotos wijzigen" on storage.objects
  for update to authenticated
  using (bucket_id = 'bonnetjes' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "eigen fotos verwijderen" on storage.objects
  for delete to authenticated
  using (bucket_id = 'bonnetjes' and (storage.foldername(name))[1] = auth.uid()::text);
