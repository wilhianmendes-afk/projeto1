create or replace function face_search(
  query_embedding vector(512),
  similarity_threshold float default 0.40,
  match_count int default 15
)
returns table (
  id           uuid,
  source       text,
  source_id    uuid,
  source_label text,
  photo_url    text,
  bbox         jsonb,
  det_score    real,
  similarity   float
) language sql stable as $$
  select
    e.id, e.source, e.source_id, e.source_label, e.photo_url, e.bbox, e.det_score,
    1 - (e.embedding <=> query_embedding) as similarity
  from face_embeddings e
  where 1 - (e.embedding <=> query_embedding) >= similarity_threshold
  order by e.embedding <=> query_embedding
  limit match_count;
$$;
