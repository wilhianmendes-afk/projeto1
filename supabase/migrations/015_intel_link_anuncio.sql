ALTER TABLE ops_hispy_investigations
  ADD COLUMN IF NOT EXISTS anuncio_plataforma text,
  ADD COLUMN IF NOT EXISTS anuncio_preco      text;
