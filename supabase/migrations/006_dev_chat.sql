CREATE TABLE IF NOT EXISTS dev_chat_messages (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  role       text        NOT NULL CHECK (role IN ('user', 'assistant')),
  content    text        NOT NULL,
  attachments jsonb      NOT NULL DEFAULT '[]',
  read_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE dev_chat_messages DISABLE ROW LEVEL SECURITY;

GRANT ALL ON dev_chat_messages TO anon, authenticated, service_role;
