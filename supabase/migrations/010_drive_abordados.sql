-- source_id era uuid — Drive file IDs são strings, não UUIDs
ALTER TABLE face_embeddings ALTER COLUMN source_id TYPE text USING source_id::text;

-- Recria índice único com source_id agora como text
DROP INDEX IF EXISTS face_embeddings_unique_idx;
CREATE UNIQUE INDEX face_embeddings_unique_idx
  ON face_embeddings (source, source_id, photo_url, face_index);

-- Atualiza face_search RPC: source_id agora é text
CREATE OR REPLACE FUNCTION face_search(
  query_embedding vector(512),
  similarity_threshold float default 0.40,
  match_count int default 15
)
RETURNS TABLE (
  id           uuid,
  source       text,
  source_id    text,
  source_label text,
  photo_url    text,
  bbox         jsonb,
  det_score    real,
  similarity   float
) LANGUAGE sql STABLE AS $$
  SELECT e.id, e.source, e.source_id, e.source_label, e.photo_url, e.bbox, e.det_score,
    1 - (e.embedding <=> query_embedding) AS similarity
  FROM face_embeddings e
  WHERE 1 - (e.embedding <=> query_embedding) >= similarity_threshold
  ORDER BY e.embedding <=> query_embedding
  LIMIT match_count;
$$;
