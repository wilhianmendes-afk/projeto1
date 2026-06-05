# Intel Facial — 42º BPM
Sistema de reconhecimento facial para inteligência policial.

## Estado atual (2026-06-05)

### Funcionando
- **Banco IBIS**: ~14.493 qualificados únicos; 14.132 indexados (embeddings gerados); 14 skipped (sem rosto detectável)
- **IBIS Auto-Scraper local**: `scripts/ibis-scraper.py` + tarefa `"IBIS Scraper 42BPM"` no Windows; importa em lotes de 15; log em `scripts/ibis-scraper.log`; URL aponta para Netlify
- **Drive Banco Qualificados**: `bancodequalificados@gmail.com` — OAuth2; 16.654 arquivos em 5 subpastas (Alvos 42º BPM, Alvos Banco, Esposas e Parentes - Alvos, Alvos A.D.E, Irmaos Ciganos)
- **Drive BQ — listagem**: duas funções em `src/lib/google-drive.ts`:
  - `listBQFolderFiles` — lista todos os arquivos (BFS 2 níveis); usada por own-search e ingest
  - `listBQFolderPage` — lista **uma página de uma pasta por chamada** com cursor `DriveCursor`; usada por `index-faces` para evitar re-listar 16k arquivos a cada rodada
  - **NÃO usar `in ancestors` — retorna 400 Invalid Value na Drive API**
- **Ingestão Drive BQ → qualificados**: endpoint `/api/drive/ingest-qualificados` + workflow `drive-ingest-qualificados.yml` (a cada 3h)
- **Indexação facial do Drive BQ**: endpoint `/api/drive/index-faces` + workflow `drive-index-faces.yml` (**a cada 12h**); usa cursor paginado — 100 arquivos por página, 5 embeddings por rodada, até 200 rodadas
- **Dashboard**: cards IBIS (server, rápido) + Drive/Total (client async, cache 5min); página carrega imediatamente
- **Página Indexação**: stats Supabase server-side; cobertura/pendentes calculados client-side após fetch `/api/drive/count`
- **Cache compartilhado Drive count**: `src/lib/drive-count-cache.ts` — TTL 5min; reutilizado por `DriveCards` e `IndexacaoStats`
- **MCP `/api/mcp/banco`**: usa `getBQDriveClient()`; `search_face` retorna `foto_url` no objeto `qualificado`
- **MCP consumido pela PCGO**: `search_text` retorna matches do banco + Drive BQ; `search_face` retorna objeto `qualificado: {nome, cpf, vulgo, cidade, uf, foto_url}`
- **Migration 010 aplicada**: `face_embeddings.source_id` é `text` (não uuid); `face_skipped.source_id` ainda é `uuid`
- **RPC `get_pending_qualificados` corrigida**: usa `q.id::text` para comparar com `face_embeddings.source_id` (text) e `q.id` direto para `face_skipped.source_id` (uuid)
- **Face service keep-alive**: workflow `face-keepalive.yml` pinga a cada 5min + auto-redeploy via Railway API (YAML corrigido em 2026-06-03 — bug Python multi-linha quebrava o parser e o cron nunca disparava)
- **Railway Hobby ativo**: plano $5/mês — face service online
- **Perfil viewer (coruja)**: usuário somente leitura; Chat Dev oculto para viewer (`layout.tsx` verifica role)
- **Busca facial**: resultados MEU DRIVE abrem ComparisonModal; badges alinhados; `top_results` agora usa proxy `/api/drive/photo/:id` para registros drive_bq (bug corrigido em 2026-06-03)
- **Deduplicação Drive BQ**: `deduplicate-drive.yml` (todo domingo 03h UTC)
- **OAuth2 BQ escopo completo**: `https://www.googleapis.com/auth/drive`
- **Proxy de fotos do Drive**: `/api/drive/photo/[id]` tenta service account, depois OAuth2 BQ
- **OAuth2 refresh token**: **PERMANENTE** — app Google Cloud `banco-qualificados` publicado em produção em 2026-06-05 (era Testing; tokens expiravam a cada 7 dias). Se precisar renovar manualmente: `node scripts/google-oauth-setup.js <CLIENT_ID> <CLIENT_SECRET>` e atualizar `GOOGLE_OAUTH_REFRESH_TOKEN` no Netlify via `netlify env:set`
- **Dashboard — erro de auth visível**: `DriveCards.tsx` exibe alerta vermelho "Token expirado" quando `/api/drive/count` retorna `error: "auth_expired"` — não mostra 0 silencioso. `fetchDriveCount()` retorna `{ count, error }` (não só `number`)

### Pendente — Normal
- **Banco Bruno indisponível**: MCP em `com-br.cloud/api/mcp/banco` retorna 404 — problema no servidor do Bruno
- **IBIS scraper via GitHub Actions**: ibis.app.br bloqueia IPs de datacenter (Azure/AWS); scraper roda só via PC local (tarefa agendada)
- **Backfill IBIS completo**: 14.132/14.480 indexados; 14 em face_skipped; fila vazia (remaining=0 em 2026-06-03)

## Stack
- **Frontend/API**: Next.js 14 (App Router) — deploy no **Netlify** (migrado da Vercel em 2026-06-02)
- **Banco de dados**: Supabase (Postgres + pgvector + Storage + Auth)
- **Face service**: FastAPI + InsightFace buffalo_l — deploy no Railway (Hobby $5/mês)
- **URL produção**: https://intel-facial-42bpm.netlify.app
- **Face service**: https://projeto1-production-b575.up.railway.app

## Deploy (Netlify)
- **Site ID**: `83e68e74-e7fe-4e29-9da5-121f35593e89`
- **Deploy**: GitHub Actions `deploy.yml` — `npm ci` + `npx netlify-cli deploy --build --prod`
- **Trigger**: `workflow_dispatch` **manual** (alterado em 2026-06-05 — deploy por push consumia 15 créditos cada)
- **Como deployar**: GitHub → Actions → "Deploy to Netlify" → "Run workflow"
- **Secrets GitHub**: `NETLIFY_AUTH_TOKEN`, `NETLIFY_SITE_ID`
- **Motivo da migração**: Vercel retornava 402 (billing/Fast Origin Transfer excedido)
- **Plano Netlify free**: 300 créditos/mês — 15 créditos/deploy, 10 créditos/GB-HR de functions
- **Timeout funções**: Netlify free suporta funções de até ~26s na prática (testado: `/api/drive/index-faces` responde em ~12s)
- **`.netlify/state.json`**: criado em 2026-06-05 — vincula projeto ao site ID para o CLI funcionar

## Autenticação
Login por usuário (sem @), convertido internamente para `usuario@42bpm.intel`.
Criar usuários pelo painel do Supabase Auth ou via Admin API (curl com service role key).

## Controle de Acesso (roles)

Role lido de `app_metadata.role` do Supabase via `src/lib/get-role.ts`.
Definido na criação do usuário via Admin API — não editável pelo próprio usuário.

| Role | Comportamento |
|------|--------------|
| `admin` (padrão) | Acesso total |
| `viewer` | Somente leitura — veja abaixo |

**Usuários cadastrados:**
- `mendeswillian` / admin — acesso total
- `coruja` / viewer — somente leitura

**O que o viewer NÃO vê:**
- Botão Excluir na ficha do qualificado (`DeleteButton`)
- Upload e re-indexação de foto (`FotoUpload`, `IndexButton`)
- Botão Excluir no lightbox MEU DRIVE (`QualificadosSearch`)
- Listas "Sem Foto" e "Sem Rosto" na indexação (`SemFotoList`, `SemRostoList`)
- Botões "Rodar agora" e "Atualizar" no `BackfillStatus`)
- **Chat Dev** (`DevChat` — oculto no `layout.tsx` via verificação de role no servidor)

**Como criar usuário viewer via API (sem abrir o painel):**
```bash
curl -s -X POST "https://avtbwrkjqaepbawvxyvf.supabase.co/auth/v1/admin/users" \
  -H "apikey: <SERVICE_ROLE_KEY>" \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
  -H "Content-Type: application/json" \
  -H "User-Agent: supabase-cli/1.0" \
  -d '{"email":"usuario@42bpm.intel","password":"senha","email_confirm":true,"app_metadata":{"role":"viewer"}}'
```

## Variáveis de ambiente (Netlify)
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
FACE_SERVICE_URL=https://projeto1-production-b575.up.railway.app
ANTHROPIC_API_KEY=           # Apenas Chat do Dev
IBIS_IMPORT_TOKEN=           # protege /api/ibis/import, /api/face/backfill, /api/drive/index-faces, /api/drive/ingest-qualificados
MCP_BANCO_TOKEN=             # token Bearer para /api/mcp/banco (usado pela PCGO)
BANCO_BRUNO_URL=             # URL do MCP do Bruno — atualmente 404
BANCO_BRUNO_TOKEN=           # Token Bearer do MCP do Bruno
GOOGLE_SERVICE_ACCOUNT_KEY=  # JSON completo da Service Account (em uma linha)
GOOGLE_OAUTH_CLIENT_ID=      # OAuth2 para bancodequalificados@gmail.com
GOOGLE_OAUTH_CLIENT_SECRET=  # OAuth2 para bancodequalificados@gmail.com
GOOGLE_OAUTH_REFRESH_TOKEN=  # OAuth2 para bancodequalificados@gmail.com
DRIVE_BQ_FOLDER_ID=1SJCMYf2DcTgEAFUhIR4edK9TnTY3J2QQ  # pasta do Drive BQ
OCR_SPACE_API_KEY=           # ocr.space API key (25k req/mês free)
NEXT_TELEMETRY_DISABLED=1
```

> **DRIVE_ABORDADOS_FOLDER_ID**: descontinuada. Substituída por DRIVE_BQ_FOLDER_ID.
> **GEMINI_API_KEY**: não usada. Pode ser removida.

## Variáveis de ambiente (Railway — face-service)
```
MIN_DET_SCORE=0.6
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
WORKER_BATCH=10
WORKER_SLEEP=60
```

## Google Drive — autenticação dupla

### Service Account (`getDriveClient`)
- `src/lib/google-drive.ts` — usa `GOOGLE_SERVICE_ACCOUNT_KEY`
- Service Account: `intel-facial-42@intel-facial-42.iam.gserviceaccount.com`
- Usada apenas pelo proxy de fotos como fallback (registros legados `drive_abordados`)

### OAuth2 BQ (`getBQDriveClient`)
- Conta: `bancodequalificados@gmail.com`
- Projeto GCP: `banco-qualificados` (criado em bancodequalificados@gmail.com)
- Vars: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REFRESH_TOKEN`
- Usada por: `own-search`, `index-faces`, `ingest-qualificados`, `DELETE /api/drive/file/[id]`, MCP `search_text`
- Script de setup: `scripts/google-oauth-setup.js`

### Limitações críticas da Google Drive API (descobertas em produção)
> `fullText contains` **NÃO aceita** `orderBy` — retorna "Invalid Value"
> `fullText contains` **NÃO aceita** `mimeType contains 'image/'` — usar `mimeType = 'image/jpeg'` ou omitir
> `fullText contains` **NÃO combina** com `in parents` — não é possível filtrar pasta + texto ao mesmo tempo
> **`in ancestors` NÃO existe** na Drive API — retorna 400 Invalid Value; usar BFS com `in parents` (`listBQFolderFiles` em `google-drive.ts`)

## Drive Banco Qualificados (`drive_bq`)

Fotos em `bancodequalificados@gmail.com` (pasta `DRIVE_BQ_FOLDER_ID`) alimentam dois pipelines paralelos:

### Pipeline 1 — Ingestão como qualificados (`/api/drive/ingest-qualificados`)
- Objetivo: criar fichas na tabela `qualificados` (fonte=`drive_bq`) para aparecer no `search_text` do MCP
- Fluxo: lista Drive → OCR (extrai nome/CPF/vulgo/genitora/nascimento) → dedup (CPF ou nome+nascimento) → upload Storage → insert `qualificados` → limpa entradas `drive_bq` antigas → Railway worker gera embedding sob `source='qualificados'`
- Dedup: arquivos descartados ficam em `face_skipped(source='drive_bq_ingest', reason='duplicate_cpf'|'duplicate_nome'|'no_ocr')` — não reprocessados
- Workflow `drive-ingest-qualificados.yml` a cada 3h

### Pipeline 2 — Indexação facial direta (`/api/drive/index-faces`)
- Objetivo: gerar embeddings de arquivos Drive que ainda não têm qualificado no banco
- Fonte: `source = "drive_bq"` em `face_embeddings`; aparecem na busca facial com badge **"MEU DRIVE"**
- Batch de **5 fotos por chamada** (Vercel 60s)
- Workflow `drive-index-faces.yml` a cada 2h; python3 com `|| echo` — resiliente a timeout do curl

### Listagem de arquivos
- **Implementação atual**: `listBQFolderFiles(folderId, fields)` em `src/lib/google-drive.ts` — BFS 2 níveis: lista raiz com `in parents`, depois subpastas, depois arquivos de cada subpasta
- **Estrutura do Drive**: raiz + 5 subpastas diretas (sem sub-subpastas); 16.654 arquivos total
- **NÃO usar `in ancestors`** — esse operador não existe na Drive API e retorna 400 silenciosamente

### Busca OCR (own-search)
- Usuário pesquisa nome → `own-search` chama `fullText contains` → retorna thumbnail do Drive
- Clique abre lightbox + botão Excluir (2 cliques): apaga do Drive + remove embeddings

**Registros legados `drive_abordados`**: proxy de foto tenta service account primeiro, depois OAuth2 BQ.

## Supabase — regras críticas

> **max_rows = 1000**: Queries que precisam de todos os registros DEVEM usar funções RPC.

> **Admin client**: usar `getAdminClient()` com service role em TODAS as páginas/endpoints de dados. `createClient()` SSR não retorna dados.

### Funções RPC criadas
```sql
get_face_stats() → {
  total_qualificados, total_com_foto, total_sem_foto,
  total_indexados, total_skipped,
  skipped_list: [{source_id, source_label}]
}
get_pending_qualificados(batch_limit int) → TABLE(id, nome, foto_url, fotos_extras)
```

## Estrutura do banco

**`qualificados`** — cadastro IBIS e Drive BQ
| Coluna | Tipo | Obs |
|--------|------|-----|
| id | uuid PK | |
| nome | text | |
| vulgo | text | |
| rg / cpf | text | |
| nascimento | text | DD/MM/AAAA (string, não date) |
| genitora | text | |
| cidade / uf | text | |
| observacoes | text | texto OCR completo — campo principal de busca |
| foto_url | text | URL pública no Storage |
| fotos_extras | jsonb | |
| fonte | text | `"ibis"` ou `"drive_bq"` |
| fonte_id | text | ID único na fonte (IBIS photo ID ou Drive file ID) |
| deleted_at | timestamptz | soft delete |

> `nascimento` é **string**, não `date`. Nunca incluir em filtros `ilike` — quebra toda busca.

**`face_embeddings`** — vetores 512d
- `source` (`"qualificados"` ou `"drive_bq"`), `source_id` (text), `source_label`
- `photo_url`, `embedding` (vector 512), `bbox`, `det_score`, `face_index`
- **UNIQUE INDEX** em `(source, source_id, photo_url, face_index)`

**`face_skipped`** — registros sem rosto ou descartados
- `source`, `source_id`, `source_label`, `reason`
- `source='drive_bq_ingest'`: arquivos Drive avaliados pelo ingest-qualificados e descartados (duplicate_cpf, duplicate_nome, no_ocr) — não reprocessados

**`dev_chat_messages`** — Chat do Dev

**Storage buckets**: `faces` (`ibis/`, `drive/`, `manual/`), `dev-chat`

**`ibis_scraper_progress`** — progresso da varredura IBIS (migration 011)
- `prefix` (PK, AA..ZZ), `status` (pending/done/error), `records_found`, `imported`, `last_run`, `error_msg`
- 676 linhas inicializadas; RLS habilitado (só service role acessa)

**RLS**: Desabilitado em todas as tabelas exceto `ibis_scraper_progress`.

## Endpoints principais
| Rota | Descrição |
|------|-----------|
| `POST /api/ibis/import` | Recebe pessoas do extrator IBIS (CORS aberto); importa em lotes de 15 |
| `GET /api/qualificados/search?q=` | Busca server-side: nome, vulgo, genitora, cpf, observacoes |
| `DELETE /api/qualificados/[id]` | Remove qualificado + embeddings + foto Storage |
| `POST /api/qualificados/[id]/foto` | Upload foto manual, limpa embeddings anteriores |
| `POST /api/face/search` | Busca facial — local + Banco Bruno em paralelo |
| `GET/POST /api/face/backfill` | Gera embeddings dos registros pendentes |
| `GET /api/drive/count` | Contagem de arquivos no Drive BQ (cache 5min HTTP) |
| `GET /api/drive/own-search?q=` | Busca OCR no Drive BQ via OAuth2 |
| `GET /api/drive/photo/[id]` | Proxy de foto: tenta service account, depois OAuth2 |
| `POST /api/drive/index-faces` | Indexa rostos do Drive BQ (fonte drive_bq); batch=5 |
| `POST /api/drive/ingest-qualificados` | Ingere arquivos Drive como qualificados (OCR+dedup+Storage) |
| `DELETE /api/drive/file/[id]` | Apaga arquivo do Drive BQ + remove embeddings |
| `GET /api/banco-bruno/search?q=` | Proxy para busca textual no Banco Bruno |
| `GET /api/banco-bruno/status` | Stats do Banco Bruno |
| `POST /api/mcp/banco` | Servidor MCP — PCGO e Bruno acessam nosso banco aqui |
| `GET/POST /api/dev-chat` | Chat do Dev — histórico e envio |
| `PATCH /api/dev-chat/[id]/read` | Marca mensagem como lida |

## Dashboard (`/`)
- **Card IBIS**: renderizado server-side (Supabase, ~50ms) — aparece instantaneamente
- **Cards Drive + Total**: client-side via `DriveCards.tsx` → fetch `/api/drive/count`; cache 5min (HTTP + módulo)
- **BancoParceiros**: stats do Banco Bruno (badge âmbar "BANCO BRUNO")
- Cache compartilhado em `src/lib/drive-count-cache.ts`: navegando dashboard↔indexação não recalcula

## Página de Indexação (`/indexacao`)
- Server-side: só queries Supabase (rápidas); `countBQDriveFiles` removido do server component
- **`IndexacaoStats.tsx`** (client): busca `/api/drive/count` (cache 5min) e calcula cobertura/pendentes
- **Cobertura**: (IBIS indexados + Drive BQ indexados) ÷ (IBIS com foto + Drive BQ total) × 100
- **BackfillStatus** dentro de `IndexacaoStats` — recebe `pendentes` calculado client-side
- Cadastro de novos qualificados: exclusivamente via IBIS ou Drive BQ — sem formulário manual

## Busca de qualificados (`/qualificados`)
- Sem botão "Novo" — cadastro somente via IBIS ou Drive
- Busca local (Supabase) + Drive BQ (`own-search`) + Banco Bruno — em paralelo
- **MEU DRIVE**: badge verde — thumbnail + lightbox + botão Excluir (oculto para viewer)
- **BANCO DO BRUNO**: badge âmbar — banco do parceiro
- **DRIVE DO BRUNO**: badge azul — drive do parceiro

## Busca facial (`/busca`)
- Resultados **MEU DRIVE** (`from_drive=true`): abrem `ComparisonModal` com fotos lado a lado
- Resultados **BANCO DO BRUNO** (`from_bruno=true`, `source≠"drive"`): badge âmbar
- Resultados **DRIVE DO BRUNO** (`from_bruno=true`, `source="drive"`): badge azul
- `ComparisonModal`: sem botão "Ver no Banco Bruno" (rota não implementada)

## Face Service (Railway)

```
face-service/
├── main.py       # FastAPI + worker de backfill contínuo
├── Dockerfile    # buffalo_l pré-baixado no build
└── railway.json  # watchPatterns: face-service/**
```

- Chamadas Vercel → Railway usam `/embed-raw` (binário puro) — NÃO multipart
- Worker de backfill roda no mesmo container via `lifespan`
- NÃO usar httpx no requirements.txt — causa crash silencioso no Railway

## GitHub Actions — workflows
| Arquivo | Trigger | Função |
|---------|---------|--------|
| `deploy.yml` | **manual (workflow_dispatch)** | Deploy no Netlify — alterado em 2026-06-05 para economizar créditos |
| `backfill.yml` | **a cada 2h** + manual | Indexação embeddings de qualificados IBIS/Drive (era 15min — alterado em 2026-06-05) |
| `drive-index-faces.yml` | **a cada 12h** + manual | Indexação rostos Drive BQ (batch=5; era 2h — alterado em 2026-06-05) |
| `drive-ingest-qualificados.yml` | **DESABILITADO** + manual | Ingestão Drive BQ → tabela qualificados (OCR+dedup) |
| `face-keepalive.yml` | a cada 5min | Keep-alive + auto-recovery Railway (chama Railway diretamente — não consome Netlify functions) |
| `deduplicate-drive.yml` | todo domingo 03h UTC + manual | Remove fotos byte-idênticas do Drive BQ |
| `ibis-scraper.yml` | desabilitado (ibis.app.br bloqueia IPs de datacenter) | — substituído pela tarefa local |

> **IBIS scraper local**: tarefa `"IBIS Scraper 42BPM"` no Agendador de Tarefas Windows (PC do usuário); `scripts/run-ibis-scraper.bat`; log em `scripts/ibis-scraper.log`; a cada 2h

## MCP `/api/mcp/banco` — consumido por PCGO e Bruno

**Autenticação**: Bearer token via `MCP_BANCO_TOKEN` (env Vercel)

**Tools disponíveis:**
| Tool | O que retorna |
|------|--------------|
| `search_text` | matches em `qualificados` (IBIS + drive_bq) + arquivos do Drive BQ via OCR |
| `get_qualificado` | ficha completa por UUID |
| `search_face` | similaridade facial; `qualificado: {nome, cpf, vulgo, cidade, uf, foto_url}` |
| `get_banco_status` | estatísticas gerais via RPC `get_face_stats` |

**Drive no MCP**: usa `getBQDriveClient()` (OAuth2 BQ); sem `orderBy` e sem `mimeType contains` (limitações da API)

## Integração Banco Bruno (bidirecional)
- Bruno mantém banco próprio + Drive; sistema offline (404 no MCP dele)
- Nosso sistema → Bruno: `/api/banco-bruno/search`, `/api/banco-bruno/status`, `/api/face/search`
- Bruno → Nosso sistema: `/api/mcp/banco` (autenticado via `MCP_BANCO_TOKEN`)
- Todas as chamadas fetch ao Bruno precisam de `cache: "no-store"`

## Componentes principais
| Componente | Função |
|------------|--------|
| `DriveCards.tsx` | Cards "Meu Drive" e "Total" — client, fetch `/api/drive/count`, cache 5min |
| `IndexacaoStats.tsx` | Cards de cobertura/pendentes + BackfillStatus — client, mesma cache de Drive |
| `BackfillStatus.tsx` | Status indexação + botão "Rodar agora" (oculto para viewer) |
| `SemFotoList.tsx` | Lista qualificados sem foto (oculto para viewer) |
| `SemRostoList.tsx` | Lista qualificados sem rosto + botão Limpar (oculto para viewer) |
| `FotoUpload.tsx` | Upload foto na página do qualificado (oculto para viewer) |
| `FaceSearch.tsx` | Busca facial — badges MEU DRIVE / BANCO DO BRUNO / DRIVE DO BRUNO |
| `ComparisonModal.tsx` | Modal lado a lado — suporta drive_bq, banco Bruno e drive Bruno |
| `QualificadosSearch.tsx` | Busca local + Drive BQ + Bruno; botão Excluir oculto para viewer |
| `BancoParceiros.tsx` | Stats do Banco Bruno |
| `TotalQualificados.tsx` | Contador de registros na página de qualificados |
| `DevChat.tsx` | Chat flutuante de desenvolvimento |

## Deploy
- Branch: `claude/check-github-access-v30TG`
- Deploy **manual** via `deploy.yml` (workflow_dispatch) — desde 2026-06-05
- Secrets GitHub: `NETLIFY_AUTH_TOKEN`, `NETLIFY_SITE_ID`, `IBIS_IMPORT_TOKEN`, `RAILWAY_TOKEN`, `RAILWAY_SERVICE_ID`, `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REFRESH_TOKEN`, `DRIVE_BQ_FOLDER_ID`, `IBIS_USER`, `IBIS_PASS`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`

## IBIS Auto-Scraper

Varredura sistemática do IBIS — roda via Agendador de Tarefas Windows (PC local).
**Motivo local**: ibis.app.br bloqueia IPs de datacenter (AWS/Azure do GitHub Actions).

**Arquivos:**
- `scripts/ibis-scraper.py` — scraper de produção (headless, Playwright)
- `scripts/run-ibis-scraper.bat` — wrapper com encoding UTF-8; log em `scripts/ibis-scraper.log`
- `scripts/ibis-scraper-test.py` — script de diagnóstico (headless=False)
- Tarefa Windows: `"IBIS Scraper 42BPM"` — a cada 2h, PC deve estar ligado e logado

**Estrutura de colunas do IBIS** (pessoaConsulta.xhtml):
```
FOTO | RG|CPF | NOME | ALCUNHA | GENITORA | DN
```

**Comportamento:**
1. Busca próximos 15 prefixos pendentes em `ibis_scraper_progress`
2. Para cada prefixo: login → pesquisa → extrai TRs → baixa fotos → POST `/api/ibis/import` em **lotes de 15** (evita timeout de 30s do Vercel)
3. Marca prefixo como `done`; ao terminar todos os 676, reseta para `pending` (novo ciclo)
4. **30s entre buscas** para não sobrecarregar o IBIS (OOM confirmado com termos genéricos)
5. Trata paginação PrimeFaces (`.ui-paginator-next`)

**Atenção IBIS:**
- Termos genéricos causam `OutOfMemoryError` — scraper usa prefixos de 2 letras
- Payload grande (>25 fotos) estourava timeout Vercel — corrigido com lotes de 15
- OOM retorna `<partial-response><error>OutOfMemoryError</error></partial-response>` — prefixo marcado como `error` e scraper continua

**Ciclo de atualização contínua:**
- Ciclo completo (676 prefixos × 15 prefixos/rodada × 2h) ≈ 5 dias
- Ao finalizar, reseta automaticamente
- Deduplicação por `fonte_id` no `/api/ibis/import`
