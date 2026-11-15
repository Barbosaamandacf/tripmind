-- =====================================================================
-- TripMind — schema inicial (Supabase / Postgres)
-- Rodar no Supabase: SQL Editor > New query > colar tudo > Run
--
-- Modelo:
--   trips        viagem do usuário
--   documents    arquivo enviado (PDF/imagem) + status do processamento por IA
--   trip_items   itens extraídos dos documentos (voo, hotel, evento...)
--   itineraries  roteiros gerados pela IA (histórico; o mais recente é o atual)
--
-- Segurança: RLS em todas as tabelas — cada usuário só enxerga o que é dele.
-- As edge functions usam a service role (ignora RLS) para gravar resultados.
-- =====================================================================

-- ---------- TABELAS ----------

create table public.trips (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 120),
  destination text,
  start_date  date,
  end_date    date,
  created_at  timestamptz not null default now(),
  constraint trips_datas_validas check (start_date is null or end_date is null or end_date >= start_date)
);

create table public.documents (
  id             uuid primary key default gen_random_uuid(),
  trip_id        uuid not null references public.trips(id) on delete cascade,
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  storage_path   text not null unique,          -- formato: {user_id}/{trip_id}/{arquivo}
  file_name      text not null,
  mime_type      text not null,
  status         text not null default 'pending'
                 check (status in ('pending', 'processing', 'done', 'error')),
  error_message  text,
  processing_started_at timestamptz,             -- início do processamento (detecta execução interrompida)
  raw_extraction jsonb,                          -- resposta bruta da IA (auditoria/debug)
  created_at     timestamptz not null default now()
);

create table public.trip_items (
  id                uuid primary key default gen_random_uuid(),
  trip_id           uuid not null references public.trips(id) on delete cascade,
  user_id           uuid not null default auth.uid() references auth.users(id) on delete cascade,
  document_id       uuid references public.documents(id) on delete set null,
  kind              text not null
                    check (kind in ('flight', 'lodging', 'train', 'bus', 'car_rental', 'event', 'restaurant', 'other')),
  title             text not null,
  starts_at         timestamp,                   -- horário LOCAL do evento (sem fuso, como aparece no bilhete)
  ends_at           timestamp,
  location          text,
  confirmation_code text,
  details           jsonb not null default '{}'::jsonb,  -- ex.: voo {airline, flight_number, from, to}
  created_at        timestamptz not null default now()
);

create table public.itineraries (
  id         uuid primary key default gen_random_uuid(),
  trip_id    uuid not null references public.trips(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  content    jsonb not null,                     -- {summary, days:[...], tips:[...]}
  model      text,                               -- qual LLM gerou
  created_at timestamptz not null default now()
);

-- ---------- ÍNDICES ----------

create index trips_user_idx          on public.trips (user_id);
create index documents_trip_idx      on public.documents (trip_id);
create index trip_items_trip_idx     on public.trip_items (trip_id, starts_at);
create index itineraries_trip_idx    on public.itineraries (trip_id, created_at desc);

-- ---------- RLS ----------

alter table public.trips       enable row level security;
alter table public.documents   enable row level security;
alter table public.trip_items  enable row level security;
alter table public.itineraries enable row level security;

-- trips: dono faz tudo
create policy trips_select_own on public.trips for select to authenticated
  using (user_id = (select auth.uid()));
create policy trips_insert_own on public.trips for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy trips_update_own on public.trips for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy trips_delete_own on public.trips for delete to authenticated
  using (user_id = (select auth.uid()));

-- documents: cliente cria, lê e apaga; o status só é alterado pela edge function
create policy documents_select_own on public.documents for select to authenticated
  using (user_id = (select auth.uid()));
create policy documents_insert_own on public.documents for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.trips t where t.id = trip_id and t.user_id = (select auth.uid()))
  );
create policy documents_delete_own on public.documents for delete to authenticated
  using (user_id = (select auth.uid()));

-- trip_items: usuário pode corrigir/adicionar/remover itens da própria viagem
create policy trip_items_select_own on public.trip_items for select to authenticated
  using (user_id = (select auth.uid()));
create policy trip_items_insert_own on public.trip_items for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.trips t where t.id = trip_id and t.user_id = (select auth.uid()))
  );
create policy trip_items_update_own on public.trip_items for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.trips t where t.id = trip_id and t.user_id = (select auth.uid()))
  );
create policy trip_items_delete_own on public.trip_items for delete to authenticated
  using (user_id = (select auth.uid()));

-- itineraries: cliente só lê e apaga; quem cria é a edge function
create policy itineraries_select_own on public.itineraries for select to authenticated
  using (user_id = (select auth.uid()));
create policy itineraries_delete_own on public.itineraries for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------- STORAGE ----------
-- Bucket privado, 10 MB por arquivo, só PDF e imagens.
-- Cada usuário só acessa a pasta com o próprio id: {user_id}/...

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('travel-docs', 'travel-docs', false, 10485760,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy travel_docs_select_own on storage.objects for select to authenticated
  using (bucket_id = 'travel-docs' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy travel_docs_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'travel-docs' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy travel_docs_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'travel-docs' and (storage.foldername(name))[1] = (select auth.uid())::text);
