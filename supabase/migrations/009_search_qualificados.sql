-- Busca full-text em qualificados: nome, vulgo, genitora, cpf, nascimento, observacoes
-- Usa SQL puro com ILIKE para evitar problemas com .or() do cliente Supabase JS
CREATE OR REPLACE FUNCTION search_qualificados(q text)
RETURNS TABLE (
  id uuid,
  nome text,
  vulgo text,
  cpf text,
  nascimento text,
  genitora text,
  foto_url text,
  observacoes text,
  fonte text
)
LANGUAGE sql
STABLE
AS $$
  SELECT id, nome, vulgo, cpf, nascimento, genitora, foto_url, observacoes, fonte
  FROM qualificados
  WHERE deleted_at IS NULL
    AND (
      nome       ILIKE '%' || q || '%'
      OR vulgo       ILIKE '%' || q || '%'
      OR genitora    ILIKE '%' || q || '%'
      OR cpf         ILIKE '%' || q || '%'
      OR nascimento  ILIKE '%' || q || '%'
      OR observacoes ILIKE '%' || q || '%'
    )
  ORDER BY nome
  LIMIT 100;
$$;
