-- TripMind — marca quando o processamento de um documento começou.
-- Permite que a Edge Function reprocesse documentos que ficaram presos em
-- "processing" porque uma execução anterior foi interrompida.
-- Necessário só em bancos criados antes desta coluna existir no 01_schema.sql.
-- Rodar no Supabase: SQL Editor > New query > colar > Run (pode rodar mais de uma vez).

alter table public.documents
  add column if not exists processing_started_at timestamptz;
