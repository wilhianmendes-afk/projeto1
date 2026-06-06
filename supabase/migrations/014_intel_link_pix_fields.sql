ALTER TABLE ops_hispy_investigations
  ADD COLUMN IF NOT EXISTS pix_banco       text DEFAULT 'mercado_pago',
  ADD COLUMN IF NOT EXISTS pix_valor       text,
  ADD COLUMN IF NOT EXISTS pix_data        text,
  ADD COLUMN IF NOT EXISTS pix_horario     text,
  ADD COLUMN IF NOT EXISTS pix_de_nome     text,
  ADD COLUMN IF NOT EXISTS pix_de_cpf      text,
  ADD COLUMN IF NOT EXISTS pix_de_banco    text,
  ADD COLUMN IF NOT EXISTS pix_para_nome   text,
  ADD COLUMN IF NOT EXISTS pix_para_cpf    text,
  ADD COLUMN IF NOT EXISTS pix_para_banco  text,
  ADD COLUMN IF NOT EXISTS pix_transacao   text,
  ADD COLUMN IF NOT EXISTS pix_id          text;
