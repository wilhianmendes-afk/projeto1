# Intel Facial — 42º BPM
Sistema de reconhecimento facial para inteligência policial.

## Stack
- **Frontend/API**: Next.js 14 (App Router) — deploy na Vercel
- **Banco de dados**: Supabase (Postgres + pgvector + Storage + Auth)
- **Face service**: FastAPI + InsightFace buffalo_l — deploy no Railway
- **URL produção**: https://projeto1-liard-one.vercel.app
- **Face service**: https://projeto1-production-b575.up.railway.app

## Autenticação
Login por usuário (sem @), convertido internamente para `usuario@42bpm.intel`.
Criar usuários pelo painel do Supabase Auth.

## Variáveis de ambiente (Vercel)
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
FACE_SERVICE_URL=https://projeto1-production-b575.up.railway.app
ANTHROPIC_API_KEY=   # Chat do Dev (Claude Haiku). ATENÇÃO: sem créditos = dev-chat para de funcionar
GEMINI_API_KEY=      # OCR de importação de fotos (Gemini 1.5 Flash — gratuito, 1500 req/dia). Já configurado.
IBIS_IMPORT_TOKEN=   # protege /api/ibis/import, /api/face/backfill e /api/drive/local-import
BANCO_BRUNO_URL=     # URL do MCP do Bruno (parceiro)
BANCO_BRUNO_TOKEN=   # Token Bearer do MCP do Bruno
```

## Variáveis de ambiente (Railway — face-service)
```
MIN_DET_SCORE=0.6          # threshold padrão de detecção
SUPABASE_URL=              # https://avtbwrkjqaepbawvxyvf.supabase.co
SUPABASE_SERVICE_KEY=      # service role key do Supabase
WORKER_BATCH=10            # pessoas por lote (default 10)
WORKER_SLEEP=60            # segundos de espera quando fila vazia (default 60)
```

## Supabase — regras críticas

> **max_rows = 1000**: o projeto tem limite de 1000 linhas por query REST. Queries que precisam de todos os registros DEVEM usar funções RPC (SQL server-side), não queries REST com `.limit()`.

> **Admin client**: `createClient()` SSR não retorna dados nem faz INSERT mesmo com RLS desabilitado. Usar `getAdminClient()` em TODAS as páginas e endpoints de dados.

### Funções RPC criadas
```sql
-- Retorna stats completos sem limite de linhas + lista de skipped
get_face_stats() → {
  total_qualificados, total_com_foto, total_sem_foto,
  total_indexados, total_skipped,
  skipped_list: [{source_id, source_label}]  -- só qualificados não deletados
}

-- Retorna próximo batch para indexação (sem repetir já indexados/skipped)
get_pending_qualificados(batch_limit int) → TABLE(id, nome, foto_url, fotos_extras)
```

Chamadas via `supabase.rpc("get_face_stats")` e `supabase.rpc("get_pending_qualificados", { batch_limit: N })`.

> **CRÍTICO — divergência de stats**: `total_skipped` e `skipped_list` DEVEM usar o mesmo filtro `source_id IN (SELECT id FROM qualificados WHERE deleted_at IS NULL)`. Se diferirem, stat card e lista ficam inconsistentes. A função `getFaceStats()` em `src/lib/face-stats.ts` retorna `skippedList` — a página de indexação usa esse campo diretamente, nunca query REST separada.

## Estrutura do banco

**`qualificados`** — cadastro de pessoas
| Coluna | Tipo | Obs |
|--------|------|-----|
| id | uuid PK | |
| nome | text | obrigatório |
| vulgo | text | alcunha |
| rg | text | |
| cpf | text | |
| nascimento | text | data como string DD/MM/AAAA |
| genitora | text | nome da mãe |
| cidade | text | |
| uf | text | |
| observacoes | text | |
| foto_url | text | URL pública no Storage |
| fotos_extras | jsonb | URLs adicionais |
| fonte | text | `"ibis"` ou `"drive"` |
| fonte_id | text | ID único na fonte (evita duplicata) |
| deleted_at | timestamptz | soft delete |
| created_at | timestamptz | |

**`face_embeddings`** — vetores 512d
- `source`, `source_id`, `source_label` — referência ao qualificado
- `photo_url`, `embedding` (vector 512), `bbox`, `det_score`, `face_index`
- Índice HNSW para busca por similaridade
- **UNIQUE INDEX** em `(source, source_id, photo_url, face_index)` — obrigatório para o upsert funcionar

**`face_skipped`** — registros sem rosto detectado
- `source`, `source_id`, `source_label`, `reason`
- Um registro por qualificado (upsert com `onConflict: "source,source_id"`)

**`dev_chat_messages`** — Chat do Dev
- `role` (user/assistant), `content`, `attachments` (jsonb), `read_at`, `created_at`

**Storage buckets**:
- `faces` — fotos em `ibis/`, `drive/`, `manual/` (upload manual pela UI)
- `dev-chat` — anexos do Chat do Dev

**RLS**: Desabilitado em todas as tabelas.

## Clientes Supabase

```typescript
// Admin direto com service role — usar em TODAS as páginas e endpoints
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
function getAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// SSR com anon key — usar APENAS em login/middleware para auth
import { createClient } from "@/lib/supabase/server";
const supabase = await createClient();
```

## Cache Next.js / Vercel

Todas as páginas do dashboard devem ter:
```typescript
export const dynamic = "force-dynamic";
export const revalidate = 0;
```

## Endpoints principais
| Rota | Descrição |
|------|-----------|
| `POST /api/ibis/import` | Recebe pessoas do script extrator do IBIS (CORS aberto) |
| `DELETE /api/qualificados/[id]` | Remove qualificado + embeddings + foto do Storage |
| `POST /api/qualificados/[id]/foto` | Upload de foto, atualiza foto_url, limpa embeddings anteriores |
| `POST /api/face/search` | Busca facial — local + Banco Bruno em paralelo |
| `GET/POST /api/face/backfill` | Gera embeddings dos registros pendentes (paralelo, batch 5) |
| `POST /api/face/index` | Re-indexa um qualificado específico com retry de threshold |
| `POST /api/drive/local-import` | Importa foto do computador com OCR (Claude Sonnet) — multipart `file` + `file_hash` + `file_name` |
| `POST /api/drive/auto-sync` | Sincroniza pastas do Google Drive configuradas (cron diário 4h UTC) |
| `GET/POST/DELETE /api/drive/sync-folders` | Gerencia pastas do Drive para sync automático |
| `GET /api/banco-bruno/search?q=` | Proxy para busca textual no Banco Bruno (matches + drive_files) |
| `GET /api/banco-bruno/status` | Stats do Banco Bruno (pessoas, faces, drives) |
| `POST /api/mcp/banco` | Servidor MCP do nosso banco — Bruno se conecta aqui para buscar nossos dados |
| `GET  /api/dev-chat` | Histórico do Chat do Dev |
| `POST /api/dev-chat` | Envia mensagem + gera resposta automática (Claude Haiku) |
| `PATCH /api/dev-chat/[id]/read` | Marca mensagem como lida |

## Face Service (Railway)

```
face-service/
├── main.py          # FastAPI: GET /health, POST /embed, POST /embed-raw + backfill worker
├── Dockerfile       # buffalo_l pré-baixado no build — sem download em runtime
├── railway.json     # watchPatterns: face-service/** — não redeploya em push de frontend
└── requirements.txt # inclui httpx para o worker
```

- **`POST /embed`** — multipart/form-data (browser)
- **`POST /embed-raw`** — binário puro `Content-Type: image/jpeg` (server-to-server)
- Ambos aceitam `?min_score=0.35` para threshold por requisição
- `MIN_DET_SCORE=0.6` padrão no Railway
- **Timeout**: `src/lib/face-service.ts` usa `AbortSignal.timeout(30000)` — 30s para tolerar cold-start do Railway
- **`/api/face/search`** tem `maxDuration = 60` — necessário no Vercel Hobby para evitar corte em 10s

**Worker de backfill contínuo** (`backfill_worker` em `main.py`):
- Inicia junto com o FastAPI via `lifespan`
- Chama `get_pending_qualificados` diretamente no Supabase (sem HTTP round-trip)
- Roda `process_image()` no thread pool (`run_in_executor`) — não bloqueia endpoints HTTP
- Quando fila vazia: dorme `WORKER_SLEEP` segundos e verifica novamente
- Requer `SUPABASE_URL` e `SUPABASE_SERVICE_KEY` no Railway — se ausentes, worker fica desabilitado sem erro
- HTTP calls do worker usam **`urllib.request` (stdlib)** — NÃO usar httpx. httpx adicionado ao requirements.txt causa crash silencioso no Railway (ImportError antes do uvicorn inicializar, sem output nos logs de runtime)

> **CRÍTICO**: chamadas Vercel → Railway **devem usar `/embed-raw`**. FormData/Blob não serializa corretamente no runtime serverless do Vercel (retorna 502).

> **Upscaling removido**: causava segfault no ONNX Runtime. InsightFace redimensiona internamente.

> **Se o Railway cair**: forçar redeploy via API Railway ou pelo dashboard. O `watchPatterns` no railway.json impede auto-redeploy por push de frontend — se o serviço travar, precisa de redeploy manual.

### Redeploy manual Railway (via API)
```bash
# Buscar ID do último deployment SUCCESS e redeployar
curl -s "https://backboard.railway.app/graphql/v2" \
  -H "Authorization: Bearer <RAILWAY_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"query":"mutation { deploymentRedeploy(id: \"<DEPLOY_ID>\") { id status } }"}'
```

## Backfill de embeddings

Usa `get_pending_qualificados(batch_limit)` — RPC que retorna qualificados sem embedding e sem face_skipped, sem limite de linhas.

**Primário — Worker contínuo no Railway** (`face-service/main.py`):
- Processa embeddings em loop contínuo, sem intervalo fixo
- Batch de 10 pessoas por vez; quando fila vazia dorme 60s e tenta de novo
- Sem custo adicional — roda no mesmo container do face-service
- Logs visíveis no dashboard Railway

**Backup — GitHub Actions** (`.github/workflows/backfill.yml`):
- Executa a cada **15 minutos** via cron
- Processa até 20 lotes × 5 registros = **100 embeddings por rodada**
- Para automaticamente quando `remaining = 0`
- Mantido como redundância — se worker Railway cair, GH Actions assume
- Pode ser disparado manualmente em: https://github.com/wilhianmendes-afk/projeto1/actions/workflows/backfill.yml

**Funcionamento do endpoint `/api/face/backfill`:**
- **Paralelo**: todos os registros do batch processados com `Promise.all`
- **Batch padrão**: 5 registros
- **Retry automático**: se `total_detected > 0` mas `count == 0`, tenta com `min_score=0.35`
- **Sem healthCheck**: se o face service falhar, registro fica pendente para próxima rodada
- **Vercel Cron** (`vercel.json`): backup diário às 3h UTC

**Auth do backfill:**
- Header `x-backfill-token: <IBIS_IMPORT_TOKEN>`
- Header `x-vercel-cron: 1`
- Usuário logado (sessão SSR)

**Página /indexacao:**
- Exibe apenas status (stats + listas) — sem loop client-side
- Botão "Rodar agora" para execução manual pontual
- Stats atualizam automaticamente a cada 60s
- Badge: "Contínuo — worker ativo no Railway"

## Estatísticas compartilhadas — `src/lib/face-stats.ts`

Dashboard e indexação usam a mesma função `getFaceStats()` que chama `get_face_stats()` via RPC. Números sempre idênticos entre as duas páginas.


## Página de Indexação (/indexacao)
- **Cobertura**: indexados ÷ qualificados com foto (exclui sem foto do denominador)
- **Sem foto**: lista expansível `SemFotoList` — link para cada qualificado, pode adicionar foto
- **Sem rosto**: lista expansível `SemRostoList` — link para cada qualificado + botão Limpar
- **BackfillStatus**: exibe status + botão "Rodar agora"; indexação real feita pelo worker contínuo no Railway (GH Actions como backup)

## Upload de foto manual
`POST /api/qualificados/[id]/foto` — campo `foto` em multipart.
- Upload para `faces/manual/<id>_<timestamp>.jpg`
- Atualiza `foto_url` no banco
- Remove embeddings e face_skipped anteriores (força re-indexação)

## IBIS Import — sanitização de filename
`fonte_id` do IBIS pode conter espaços, `%20` ou extensão `.jpg` embutida. O import aplica:
```typescript
const safeId = decodeURIComponent(rawId)
  .replace(/[^a-zA-Z0-9._-]/g, "_")
  .replace(/\.(jpe?g|png|gif|webp|bmp)$/i, "");  // remove extensão já existente
const filename = `ibis/${safeId}.jpg`;
```
Evita double-encoding `%2520` e extensão dupla `.jpg.jpg`. Os 27 registros com `%2520` foram corrigidos via:
```sql
UPDATE qualificados SET foto_url = REPLACE(foto_url, '%2520', '%20') WHERE foto_url LIKE '%2520%';
```

## Fotos sem rosto detectado (`face_skipped`)

`total_detected: 0` significa que o InsightFace não encontrou geometria facial. Causas:

| Causa | Solução |
|-------|---------|
| Foto muito comprimida (< 25KB) | Upload de foto de melhor qualidade |
| Rosto muito pequeno na imagem | Upload de foto com rosto maior |
| **Rosto grande demais no frame** (foto 3×3/close-up > 70%) | **Corrigido no `process_image` — padding automático** |
| Ângulo extremo ou iluminação ruim | Upload de foto melhor |

**Fix de close-up implementado em `face-service/main.py`**: quando `total_detected == 0`, o `process_image` adiciona borda branca de tamanho `max(h, w)` ao redor da imagem antes de retentar. Isso reduz o rosto de ~90% do frame para ~33%, dentro do range do detector SCRFD. O bbox é ajustado de volta ao espaço da imagem original.

O retry com `min_score=0.35` só ajuda quando `total_detected > 0` mas `count == 0` (rosto detectado mas abaixo do threshold).

**Solução para casos sem solução automática**: fazer upload de foto de melhor qualidade na página do qualificado. O upload limpa embeddings e face_skipped anteriores, forçando re-indexação.

## Chat do Dev
Canal interno embarcado no dashboard. **Não expor publicamente.**
- Componente: `src/components/DevChat.tsx` (flutuante, canto inferior direito)
- Tabela: `dev_chat_messages` (migration 006 — já aplicada)
- Requer `ANTHROPIC_API_KEY` com créditos para respostas automáticas via Claude Haiku

## Importação de fotos locais

**Componente:** `src/components/DriveImport.tsx` — na página `/indexacao`

**Como usar:**
1. Selecionar Pasta — abre seletor de pasta do computador (webkitdirectory)
2. Selecionar Fotos — abre seletor de arquivos individuais
3. Drag & drop de arquivos/pastas na zona de drop

**Fluxo de importação (`POST /api/drive/local-import`):**
- Autenticado via header `x-import-token: <IBIS_IMPORT_TOKEN>` (hardcoded no componente)
- Antes do upload: **redimensiona para max 1600px em JPEG 88%** via canvas do browser (resolve fotos de 5MB+ que causavam falha no OCR)
- Deduplicação por SHA-256 do buffer já redimensionado
- OCR via **Claude Sonnet 4.6** (modelo: `claude-sonnet-4-6`) — extrai: `nome`, `vulgo`, `cpf`, `rg`, `nascimento`, `genitora`, `cidade`, `uf`, `artigos`, `faccao`, `observacoes`
- Skipa apenas se não encontrar `nome` (`{ status: "sem_dados" }`)
- Upload para Storage em `faces/drive/local/<hash>/<filename>`
- Insere com `fonte: "local_drive"`, `fonte_id: <hash>`
- Indexa rostos via face-service Railway

> **OCR engine**: usa **Gemini 2.0 Flash Exp** (`@google/generative-ai`, modelo `gemini-2.0-flash-exp`) — gratuito. Chave `GEMINI_API_KEY` já configurada no Vercel. NÃO usa mais Anthropic para OCR.
> **Atenção modelo Gemini**: `gemini-1.5-flash` retorna 404 Not Found na v1beta com essa chave. Usar `gemini-2.0-flash-exp`. Se mudar de chave, verificar quais modelos estão disponíveis.

> **OCR troubleshooting**: se retornar "sem dados", abrir DevTools → Console → a linha `[OCR sem_dados]` mostra o erro real (ex: chave inválida, quota excedida). O Anthropic API foi descartado para OCR pois exige créditos pagos — Gemini é a alternativa gratuita.

**Sync automático do Google Drive** (`/api/drive/auto-sync`):
- Tabela `drive_sync_folders` armazena IDs de pastas do Drive para sync
- Cron Vercel dispara diariamente às 4h UTC
- Requer `GOOGLE_REFRESH_TOKEN`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` no Vercel (ainda não configurado)

> **`@anthropic-ai/sdk`** deve estar em `dependencies` do `package.json`. Já corrigido.

## Integração IBIS (ibis.app.br)

Scripts:
- `scripts/ibis-extractor-manual.js` — **uso principal**: cole no console após pesquisar
- `scripts/clear-ibis-storage.js` — limpa pasta `ibis/` do Storage em lote

**Como usar:**
1. Abra o IBIS logado e pesquise qualquer termo
2. Abra o console (`F12`) e cole o conteúdo do arquivo (nunca do chat)
3. Processa a página atual e navega automaticamente pelas seguintes
4. Ao finalizar, dispara o backfill de embeddings automaticamente

> **Token**: o script já inclui `IBIS_IMPORT_TOKEN` no header `X-Ibis-Token`. Se o token mudar, atualizar a constante `IBIS_TOKEN` no topo do script (`scripts/ibis-extractor-manual.js` linha 3).

**Limpar banco do zero:**
```sql
TRUNCATE face_embeddings, face_skipped, qualificados RESTART IDENTITY CASCADE;
```
Depois: `node scripts/clear-ibis-storage.js`

## Deploy (Vercel)
- Branch: `claude/check-github-access-v30TG`
- GitHub Action (`.github/workflows/deploy.yml`): deploy automático a cada push
- Requer secret `VERCEL_DEPLOY_HOOK` no GitHub

## GitHub Actions — workflows
| Arquivo | Trigger | Função |
|---------|---------|--------|
| `.github/workflows/deploy.yml` | push no branch | Deploy na Vercel |
| `.github/workflows/backfill.yml` | a cada 15min + manual | Indexação automática de embeddings |

**Secrets necessários no repositório:**
- `VERCEL_DEPLOY_HOOK` — URL do deploy hook da Vercel
- `IBIS_IMPORT_TOKEN` — token de autenticação do backfill (já configurado)

## Componentes principais
| Componente | Função |
|------------|--------|
| `BackfillStatus.tsx` | Status da indexação + botão "Rodar agora" manual |
| `SemFotoList.tsx` | Lista expansível de qualificados sem foto |
| `SemRostoList.tsx` | Lista expansível de qualificados sem rosto + botão Limpar |
| `FotoUpload.tsx` | Upload de foto na página do qualificado (drag & drop) |
| `IndexButton.tsx` | Re-indexa um qualificado individual |
| `DeleteButton.tsx` | Remove qualificado + embeddings + foto (confirmação dupla) |
| `FaceSearch.tsx` | Busca facial com detecção automática e bbox overlay |
| `ComparisonModal.tsx` | Modal comparação — "Abrir no Drive" para source=drive, "Ver no Banco Bruno" para qualificados Bruno |
| `QualificadosSearch.tsx` | Busca local + Banco Bruno simultânea; Drive Bruno abre lightbox ao clicar |
| `DevChat.tsx` | Chat flutuante de desenvolvimento |
| `DriveImport.tsx` | Import de fotos do computador — pasta/individual/drag-drop, resize canvas, OCR Sonnet |
| `BancoParceiros.tsx` | Dashboard: stats do Banco Bruno (parceiro) — pessoas, faces, drives |
| `TotalQualificados.tsx` | Contador combinado: "X registros + Y bancos parceiros" na página de qualificados |

## Integração Banco Bruno (MCP)

Bruno é um parceiro que tem seu próprio banco de qualificados + Drive com fotos. A integração é **bidirecional** via MCP (HTTP JSON-RPC).

### Nosso sistema → Banco Bruno
- URL do MCP Bruno: `BRUNO_MCP_URL` nas env vars da Vercel
- `/api/banco-bruno/search?q=` — proxy para `search_text` de Bruno; retorna `{ matches, drive_files }`
- `/api/banco-bruno/status` — proxy para `get_banco_status`; retorna stats do banco dele
- `/api/face/search` — chama `search_face` de Bruno em paralelo com nossa busca local
- Página `/qualificados/bruno/[id]` — detalhe de qualificado do banco de Bruno (via `get_qualificado`)
- Resultados Bruno aparecem na busca de qualificados com badge âmbar **BANCO BRUNO**
- Resultados Drive de Bruno aparecem com badge azul **DRIVE BRUNO** — clicar abre lightbox (não navega)

### Banco Bruno → Nosso sistema
- `/api/mcp/banco` — nosso servidor MCP que Bruno acessa
- Ferramentas expostas: `search_text` (Supabase + Google Drive), `get_qualificado`, `search_face`, `get_banco_status`
- Autenticado via `IBIS_IMPORT_TOKEN`

> **Cache Vercel**: todas as chamadas fetch para Bruno DEVEM ter `cache: "no-store"`. O Next.js 14 cacheia fetches server-side mesmo com `force-dynamic`.

## Páginas
| Rota | Descrição |
|------|-----------|
| `/` | Dashboard — stats locais + stats Banco Bruno parceiro |
| `/busca` | Busca facial — local + Bruno em paralelo |
| `/qualificados` | Grade com busca local + Bruno simultânea; lightbox para Drive Bruno |
| `/qualificados/[id]` | Detalhe — foto 300px, upload de foto, re-indexação, excluir |
| `/qualificados/novo` | Formulário para cadastrar manualmente |
| `/qualificados/bruno/[id]` | Detalhe de qualificado do Banco Bruno (via MCP `get_qualificado`) |
| `/indexacao` | Stats + import local de fotos + sync Drive + worker status |
| `/login` | Login com usuário (sem @) |

## Branch de desenvolvimento
`claude/check-github-access-v30TG`
