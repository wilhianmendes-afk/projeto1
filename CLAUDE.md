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
ANTHROPIC_API_KEY=   # respostas automáticas do Chat do Dev
IBIS_IMPORT_TOKEN=   # protege /api/ibis/import e /api/face/backfill — usado pelo GitHub Actions
```

## Supabase — regras críticas

> **max_rows = 1000**: o projeto tem limite de 1000 linhas por query REST. Queries que precisam de todos os registros DEVEM usar funções RPC (SQL server-side), não queries REST com `.limit()`.

> **Admin client**: `createClient()` SSR não retorna dados nem faz INSERT mesmo com RLS desabilitado. Usar `getAdminClient()` em TODAS as páginas e endpoints de dados.

### Funções RPC criadas
```sql
-- Retorna stats completos sem limite de linhas
get_face_stats() → { total_qualificados, total_com_foto, total_sem_foto, total_indexados, total_skipped }

-- Retorna próximo batch para indexação (sem repetir já indexados/skipped)
get_pending_qualificados(batch_limit int) → TABLE(id, nome, foto_url, fotos_extras)
```

Chamadas via `supabase.rpc("get_face_stats")` e `supabase.rpc("get_pending_qualificados", { batch_limit: N })`.

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
```

## Endpoints principais
| Rota | Descrição |
|------|-----------|
| `POST /api/ibis/import` | Recebe pessoas do script extrator do IBIS (CORS aberto) |
| `DELETE /api/qualificados/[id]` | Remove qualificado + embeddings + foto do Storage |
| `POST /api/qualificados/[id]/foto` | Upload de foto, atualiza foto_url, limpa embeddings anteriores |
| `POST /api/face/search` | Busca facial por imagem (multipart `file`) |
| `GET/POST /api/face/backfill` | Gera embeddings dos registros pendentes (paralelo, batch 5) |
| `POST /api/face/index` | Re-indexa um qualificado específico com retry de threshold |
| `POST /api/drive/import` | Importa fotos do Google Drive |
| `GET  /api/dev-chat` | Histórico do Chat do Dev |
| `POST /api/dev-chat` | Envia mensagem + gera resposta automática (Claude Haiku) |
| `PATCH /api/dev-chat/[id]/read` | Marca mensagem como lida |

## Face Service (Railway)

```
face-service/
├── main.py          # FastAPI: GET /health, POST /embed, POST /embed-raw
├── Dockerfile       # buffalo_l pré-baixado no build — sem download em runtime
├── railway.json     # watchPatterns: face-service/** — não redeploya em push de frontend
└── requirements.txt
```

- **`POST /embed`** — multipart/form-data (browser)
- **`POST /embed-raw`** — binário puro `Content-Type: image/jpeg` (server-to-server)
- Ambos aceitam `?min_score=0.35` para threshold por requisição
- `MIN_DET_SCORE=0.6` padrão no Railway

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

**Automação — GitHub Actions** (`.github/workflows/backfill.yml`):
- Executa a cada **15 minutos** automaticamente, sem browser aberto
- Processa até 20 lotes × 5 registros = **100 embeddings por rodada**
- Para automaticamente quando `remaining = 0`
- Pode ser disparado manualmente em: https://github.com/wilhianmendes-afk/projeto1/actions/workflows/backfill.yml
- Requer secret `IBIS_IMPORT_TOKEN` no repositório GitHub (já configurado)

**Funcionamento do endpoint:**
- **Paralelo**: todos os registros do batch processados com `Promise.all` (~10s por lote)
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

## Estatísticas compartilhadas — `src/lib/face-stats.ts`

Dashboard e indexação usam a mesma função `getFaceStats()` que chama `get_face_stats()` via RPC. Números sempre idênticos entre as duas páginas.

## Páginas
| Rota | Descrição |
|------|-----------|
| `/` | Dashboard — stats via RPC: qualificados, indexados, sem rosto, cobertura |
| `/busca` | Busca facial — detecção automática, botão "Buscar" só ativo após rosto detectado |
| `/qualificados` | Grade com busca por nome, vulgo, CPF, nascimento, mãe |
| `/qualificados/[id]` | Detalhe — foto 300px, upload de foto, re-indexação, excluir |
| `/qualificados/novo` | Formulário para cadastrar manualmente |
| `/indexacao` | Stats + lista "sem foto" + lista "sem rosto" + botão "Rodar agora" (automático via GH Actions) |
| `/login` | Login com usuário (sem @) |

## Página de Indexação (/indexacao)
- **Cobertura**: indexados ÷ qualificados com foto (exclui sem foto do denominador)
- **Sem foto**: lista expansível `SemFotoList` — link para cada qualificado, pode adicionar foto
- **Sem rosto**: lista expansível `SemRostoList` — link para cada qualificado + botão Limpar
- **BackfillStatus**: exibe status + botão "Rodar agora"; indexação real feita pelo GitHub Actions a cada 15min

## Upload de foto manual
`POST /api/qualificados/[id]/foto` — campo `foto` em multipart.
- Upload para `faces/manual/<id>_<timestamp>.jpg`
- Atualiza `foto_url` no banco
- Remove embeddings e face_skipped anteriores (força re-indexação)

## IBIS Import — sanitização de filename
`fonte_id` do IBIS pode conter espaços ou `%20` no nome. O import aplica:
```typescript
const safeId = decodeURIComponent(rawId).replace(/[^a-zA-Z0-9._-]/g, "_");
```
Evita double-encoding `%2520` na `foto_url`. Os 27 registros afetados foram corrigidos via:
```sql
UPDATE qualificados SET foto_url = REPLACE(foto_url, '%2520', '%20') WHERE foto_url LIKE '%2520%';
```

## Chat do Dev
Canal interno embarcado no dashboard. **Não expor publicamente.**
- Componente: `src/components/DevChat.tsx` (flutuante, canto inferior direito)
- Tabela: `dev_chat_messages` (migration 006 — já aplicada)
- Requer `ANTHROPIC_API_KEY` com créditos para respostas automáticas via Claude Haiku

## Integração IBIS (ibis.app.br)

Scripts:
- `scripts/ibis-extractor-manual.js` — **uso principal**: cole no console após pesquisar
- `scripts/clear-ibis-storage.js` — limpa pasta `ibis/` do Storage em lote

**Como usar:**
1. Abra o IBIS logado e pesquise qualquer termo
2. Abra o console (`F12`) e cole o conteúdo do arquivo (nunca do chat)
3. Processa a página atual e navega automaticamente pelas seguintes

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
| `BackfillButton.tsx` | (legado — substituído por BackfillStatus na página de indexação) |
| `BackfillStatus.tsx` | Status da indexação + botão "Rodar agora" manual |
| `SemFotoList.tsx` | Lista expansível de qualificados sem foto |
| `SemRostoList.tsx` | Lista expansível de qualificados sem rosto + botão Limpar |
| `FotoUpload.tsx` | Upload de foto na página do qualificado (drag & drop) |
| `IndexButton.tsx` | Re-indexa um qualificado individual |
| `DeleteButton.tsx` | Remove qualificado + embeddings + foto (confirmação dupla) |
| `FaceSearch.tsx` | Busca facial com detecção automática e bbox overlay |
| `ComparisonModal.tsx` | Modal de comparação lado a lado |
| `QualificadosSearch.tsx` | Filtro client-side em tempo real na grade |
| `DevChat.tsx` | Chat flutuante de desenvolvimento |

## Branch de desenvolvimento
`claude/check-github-access-v30TG`
