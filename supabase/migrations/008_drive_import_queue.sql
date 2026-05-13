-- Fila de importação do Google Drive
create table if not exists drive_import_queue (
  file_id   text primary key,
  file_name text not null,
  mime_type text not null default 'image/jpeg',
  done      boolean default false,
  created_at timestamptz default now()
);
