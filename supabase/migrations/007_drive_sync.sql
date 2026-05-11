-- Pastas do Google Drive configuradas para escaneamento automático
create table if not exists drive_sync_folders (
  id           uuid primary key default gen_random_uuid(),
  folder_id    text unique not null,
  folder_name  text,
  last_synced_at timestamptz,
  total_imported int default 0,
  active       boolean default true,
  created_at   timestamptz default now()
);
