-- Rastreia progresso da varredura sistemática do IBIS por prefixos de 2 letras.
-- Cada prefixo (AA..ZZ) representa uma busca independente.
CREATE TABLE IF NOT EXISTS ibis_scraper_progress (
  prefix          text PRIMARY KEY,
  status          text NOT NULL DEFAULT 'pending', -- pending | done | error
  records_found   int  NOT NULL DEFAULT 0,
  imported        int  NOT NULL DEFAULT 0,
  last_run        timestamptz,
  error_msg       text
);

-- Popula com todas as 676 combinações AA..ZZ
INSERT INTO ibis_scraper_progress (prefix)
SELECT a.l || b.l
FROM (VALUES ('A'),('B'),('C'),('D'),('E'),('F'),('G'),('H'),('I'),('J'),
             ('K'),('L'),('M'),('N'),('O'),('P'),('Q'),('R'),('S'),('T'),
             ('U'),('V'),('W'),('X'),('Y'),('Z')) AS a(l)
CROSS JOIN
     (VALUES ('A'),('B'),('C'),('D'),('E'),('F'),('G'),('H'),('I'),('J'),
             ('K'),('L'),('M'),('N'),('O'),('P'),('Q'),('R'),('S'),('T'),
             ('U'),('V'),('W'),('X'),('Y'),('Z')) AS b(l)
ON CONFLICT (prefix) DO NOTHING;
