# Intel Facial — 42º BPM
Sistema de reconhecimento facial para inteligência policial.

## Estado atual (2026-05-13)
- **MEU DRIVE integrado**: busca textual na página /qualificados mostra resultados do Drive próprio (badge verde)
- **Importação gradual em andamento**: GitHub Actions roda a cada 4h, importando ~2.000 fotos/run da pasta `1XzKRnRfmhQi-wFXgHn2dzG9EOwZdGwAF` (~25.802 fotos, ~2 dias para completar)
- **Busca facial corrigida**: detecção multi-escala no Railway (funciona com fotos grandes de celular); threshold padrão 0.25; mostra "melhores aproximações" quando sem resultado; bbox separado dos resultados
- **Pendente verificar**: se bbox azul está aparecendo após fix de detecção multi-escala (Railway rebuilding)

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
ANTHROPIC_API_KEY=   # OCR de fotos (Claude Haiku) + Chat do Dev. ATENÇÃO: sem créditos = OCR e chat param.
IBIS_IMPORT_TOKEN=   # protege /api/ibis/import, /api/face/backfill e /api/drive/local-import
BANCO_BRUNO_URL=              # URL do MCP do 42º BPM (parceiro Bruno)
BANCO_BRUNO_TOKEN=            # Token Bearer do MCP do 42º BPM
GOOGLE_SERVICE_ACCOUNT_KEY=   # JSON completo da Service Account Google (em uma linha)
```

> **GEMINI_API_KEY**: não é mais usada. OCR migrou para Claude Haiku (Anthropic). Pode ser removida da Vercel.
> **GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI / GOOGLE_REFRESH_TOKEN**: removidas. Autenticação Google Drive migrou para Service Account.

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
| observacoes | text | **contém TODO o texto OCR da foto** — campo principal de busca full-text |
| foto_url | text | URL pública no Storage |
| fotos_extras | jsonb | URLs adicionais |
| fonte | text | `"ibis"`, `"drive"` ou `"local_drive"` |
| fonte_id | text | ID único na fonte (evita duplicata) |
| deleted_at | timestamptz | soft delete |
| created_at | timestamptz | |

> **CRÍTICO — campo `observacoes`**: para registros importados via `local_drive`, este campo contém a transcrição literal de todo o texto visível na foto (nome, GN, DN, vulgo, artigos, etc.). É o campo que torna a busca por qualquer texto da foto possível. NÃO sobrescrever sem preservar o conteúdo OCR.

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

**`drive_sync_folders`** — Pastas do Google Drive configuradas para sync automático
- `folder_id`, `folder_name`, `last_synced_at`, `total_imported`, `active`
- Migration: `008_drive_sync.sql` (já aplicada)

**`drive_import_queue`** — Fila de importação gradual do Drive
- `file_id` (PK), `file_name`, `mime_type`, `done` (boolean)
- Populada pelo script `scripts/drive-import-local.js` na 1ª execução
- Migration: `008_drive_import_queue.sql` (já aplicada)

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
| `GET /api/qualificados/search?q=` | Busca server-side em nome, vulgo, genitora, cpf, nascimento, observacoes |
| `DELETE /api/qualificados/[id]` | Remove qualificado + embeddings + foto do Storage |
| `POST /api/qualificados/[id]/foto` | Upload de foto, atualiza foto_url, limpa embeddings anteriores |
| `POST /api/face/search` | Busca facial — local + Banco 42º BPM em paralelo |
| `GET/POST /api/face/backfill` | Gera embeddings dos registros pendentes (paralelo, batch 5) |
| `POST /api/face/index` | Re-indexa um qualificado específico com retry de threshold |
| `POST /api/drive/local-import` | Importa foto do computador com OCR (Claude Haiku) — multipart `file` + `file_hash` + `file_name` |
| `POST /api/drive/auto-sync` | Sincroniza pastas do Google Drive configuradas (cron diário 4h UTC) |
| `GET/POST/DELETE /api/drive/sync-folders` | Gerencia pastas do Drive para sync automático |
| `GET /api/banco-bruno/search?q=` | Proxy para busca textual no Banco 42º BPM (matches + drive_files) |
| `GET /api/banco-bruno/status` | Stats do Banco 42º BPM (pessoas, faces, drives) |
| `POST /api/mcp/banco` | Servidor MCP do nosso banco — parceiro se conecta aqui para buscar nossos dados |
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

## Importação de fotos locais (fotos de abordagem)

**Componente:** `src/components/DriveImport.tsx` — na página `/indexacao`

**Conceito:** as fotos importadas são "fotos de abordagem" — a foto É a ficha. Os dados do abordado (nome, GN, DN, vulgo) estão escritos na própria imagem como legenda. O OCR transcreve tudo literalmente e guarda em `observacoes`, tornando qualquer palavra da foto pesquisável.

**Como usar:**
1. Selecionar Pasta — abre seletor de pasta do computador (webkitdirectory)
2. Selecionar Fotos — abre seletor de arquivos individuais
3. Drag & drop de arquivos/pastas na zona de drop

**Fluxo de importação (`POST /api/drive/local-import`):**
- Autenticado via header `x-import-token: <IBIS_IMPORT_TOKEN>` (hardcoded no componente)
- Antes do upload: **redimensiona para max 1600px em JPEG 88%** via canvas do browser
- Deduplicação por SHA-256 do buffer já redimensionado
- OCR via **Claude Haiku** (`claude-haiku-4-5-20251001`) — transcreve TODO o texto visível literalmente
- `observacoes` = transcrição completa do texto da foto (pesquisável por qualquer palavra)
- `nome` = extraído pelo Claude do campo sem prefixo; fallback para primeira linha do texto
- **Nunca rejeita** foto com texto visível — se nome não encontrado, usa primeira linha como nome
- Upload para Storage em `faces/drive/local/<hash>/<filename>`
- Insere com `fonte: "local_drive"`, `fonte_id: <hash>`
- Indexa rostos via face-service Railway

**Formulário manual de resgate:**
- Se OCR falhar completamente (sem texto), foto aparece em seção amarela "Fotos sem dados extraídos"
- Usuário preenche nome, vulgo, nascimento, genitora manualmente
- Botão "Importar" envia ao mesmo endpoint com dados manuais no FormData — OCR pulado

**Override manual via FormData:**
- Se `nome` vier no FormData, o endpoint pula OCR e usa os dados fornecidos diretamente
- Campos aceitos: `nome`, `vulgo`, `nascimento`, `genitora`, `rg`, `cpf`, `observacoes`

> **OCR engine**: **Claude Haiku** (`claude-haiku-4-5-20251001`) via `@anthropic-ai/sdk`. Substituiu o Gemini que falhava silenciosamente em fotos de abordagem noturna.

**Google Drive — autenticação via Service Account**
- Lib: `src/lib/google-drive.ts` — usa `GOOGLE_SERVICE_ACCOUNT_KEY` (JSON completo em uma linha)
- Service Account: `intel-facial-42@intel-facial-42.iam.gserviceaccount.com`
- Pasta raiz compartilhada: `1XzKRnRfmhQi-wFXgHn2dzG9EOwZdGwAF` (~25.802 fotos, 45+ subpastas)
- NÃO usar OAuth (GOOGLE_CLIENT_ID etc.) — foi substituído por Service Account

**Sync automático do Google Drive** (`/api/drive/auto-sync`):
- Tabela `drive_sync_folders` armazena IDs de pastas do Drive para sync
- Cron Vercel dispara diariamente às 4h UTC
- Busca recursiva em subpastas via `listAllImages()` — percorre toda a hierarquia

**Importação gradual — GitHub Actions** (`scripts/drive-import-local.js`):
- Workflow: `.github/workflows/drive-import.yml` — roda a cada 4h automaticamente
- Usa fila `drive_import_queue` no Supabase para persistir progresso entre runs
- Batch de 2.000 fotos por run; retoma de onde parou
- Fluxo: scan Drive → fila Supabase → download → OCR Claude Haiku → upload Storage → insert qualificado → embed Railway
- **Status atual**: importação em andamento (~25.802 fotos, ~2 dias para completar)
- Para disparar manualmente via API: `POST https://api.github.com/repos/wilhianmendes-afk/projeto1/actions/workflows/drive-import.yml/dispatches` com `ref: claude/check-github-access-v30TG`

> **`@anthropic-ai/sdk`** deve estar em `dependencies` do `package.json`. Já corrigido.

## Busca textual de qualificados

**Arquitetura**: busca **server-side** via `/api/qualificados/search?q=`, não client-side sobre initialData.

**Por quê**: Supabase tem `max_rows=1000` — filtrar client-side perdia registros além do 1000º alfabético.

**Endpoint `GET /api/qualificados/search?q=`:**
- Usa `.ilike('%term%')` em: `nome`, `vulgo`, `genitora`, `cpf`, `nascimento`, `observacoes`
- `observacoes` contém o texto OCR completo → buscar "08/05/1988" ou "GN:ERONE" funciona
- Retorna até 100 resultados ordenados por nome
- Roda em paralelo com a busca no Banco 42º BPM (debounce 400ms)

**`QualificadosSearch.tsx`:**
- Sem pesquisa → mostra `initialData` (até 1000 registros, display inicial)
- Com pesquisa → chama API server-side (sem limite)
- Busca local, MEU DRIVE e Banco 42º BPM disparam juntas, resultados aparecem conforme chegam
- **MEU DRIVE**: badge verde — busca em `/api/drive/own-search?q=`, thumbnails com lightbox
- `/api/drive/own-search`: usa Service Account, busca `fullText contains` no Drive, retorna `{ files: [{id, name, thumbnailLink}] }`

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
| `FaceSearch.tsx` | Busca facial — detecção automática (bbox) separada da busca (clique manual) |
| `ComparisonModal.tsx` | Modal comparação — "Ver no Banco 42º BPM" para qualificados do parceiro |
| `QualificadosSearch.tsx` | Busca server-side local + Banco 42º BPM simultânea; Drive 42º BPM abre lightbox |
| `DevChat.tsx` | Chat flutuante de desenvolvimento |
| `DriveImport.tsx` | Import de fotos de abordagem — OCR Claude Haiku, texto em observacoes, fallback manual |
| `BancoParceiros.tsx` | Dashboard: stats do Banco 42º BPM (parceiro) — pessoas, faces, drives |
| `TotalQualificados.tsx` | Contador combinado: "X registros + Y bancos parceiros" na página de qualificados |

## Integração Banco 42º BPM — parceiro Bruno (MCP)

Bruno é o operador parceiro que mantém banco próprio + Drive com fotos do 42º BPM. A integração é **bidirecional** via MCP (HTTP JSON-RPC). O Drive é do batalhão (compartilhado).

### Nosso sistema → Banco 42º BPM
- URL do MCP: variável `BANCO_BRUNO_URL` na Vercel
- `/api/banco-bruno/search?q=` — proxy para `search_text`; retorna `{ matches, drive_files }`
- `/api/banco-bruno/status` — proxy para `get_banco_status`; retorna stats
- `/api/face/search` — chama `search_face` em paralelo com nossa busca local
- Página `/qualificados/bruno/[id]` — detalhe de qualificado do banco parceiro
- Resultados aparecem com badge âmbar **BANCO 42º BPM**
- Resultados do Drive aparecem com badge azul **DRIVE 42º BPM** — clicar abre lightbox (não navega)

### Banco 42º BPM → Nosso sistema
- `/api/mcp/banco` — nosso servidor MCP que o parceiro acessa
- Ferramentas expostas: `search_text` (Supabase + Google Drive), `get_qualificado`, `search_face`, `get_banco_status`
- Autenticado via `IBIS_IMPORT_TOKEN`

> **Cache Vercel**: todas as chamadas fetch para o parceiro DEVEM ter `cache: "no-store"`. O Next.js 14 cacheia fetches server-side mesmo com `force-dynamic`.

## Páginas
| Rota | Descrição |
|------|-----------|
| `/` | Dashboard — stats locais + stats Banco 42º BPM parceiro |
| `/busca` | Busca facial — local + 42º BPM em paralelo |
| `/qualificados` | Grade com busca server-side local + 42º BPM simultânea |
| `/qualificados/[id]` | Detalhe — foto 300px, upload de foto, re-indexação, excluir |
| `/qualificados/novo` | Formulário para cadastrar manualmente |
| `/qualificados/bruno/[id]` | Detalhe de qualificado do Banco 42º BPM (via MCP `get_qualificado`) |
| `/indexacao` | Stats + import local de fotos + sync Drive + worker status |
| `/login` | Login com usuário (sem @) |

## Branch de desenvolvimento
`claude/check-github-access-v30TG`
