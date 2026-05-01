create table if not exists qualificados (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  vulgo       text,
  cpf         text,
  rg          text,
  nascimento  date,
  foto_url    text,
  fotos_extras jsonb default '[]',
  cidade      text,
  uf          text,
  observacoes text,
  fonte       text default 'manual',   -- 'ibis' | 'drive' | 'manual'
  fonte_id    text,                     -- ID original no sistema de origem
  deleted_at  timestamptz,
  created_at  timestamptz default now()
);

create index if not exists qualificados_nome_idx on qualificados using gin (to_tsvector('portuguese', nome));
