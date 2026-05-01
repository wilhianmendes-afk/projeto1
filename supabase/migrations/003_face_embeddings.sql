create table if not exists face_embeddings (
  id           uuid primary key default gen_random_uuid(),
  source       text not null,           -- 'qualificados' | 'drive'
  source_id    uuid not null,
  source_label text,
  photo_url    text not null,
  embedding    vector(512) not null,
  bbox         jsonb,
  det_score    real,
  face_index   integer default 0,
  created_at   timestamptz default now()
);

create index if not exists face_embeddings_hnsw_idx
  on face_embeddings
  using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);
