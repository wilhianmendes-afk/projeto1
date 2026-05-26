# Intel Facial — 42º BPM
Sistema de reconhecimento facial para inteligência policial.

## Estado atual (2026-05-26)

### Funcionando
- **Banco IBIS**: 1.322 qualificados importados via extrator IBIS
- **Drive Banco Qualificados**: `bancodequalificados@gmail.com` — autenticação OAuth2; fotos aparecem na busca via OCR do Google Drive (sem criar ficha no banco)
- **Busca de qualificados**: server-side via `/api/qualificados/search`; em paralelo busca no Drive BQ (`own-search`) e Banco Bruno
- **Proxy de fotos do Drive**: `/api/drive/photo/[id]` tenta service account primeiro, depois OAuth2 BQ (compatibilidade)
- **Exclusão de fotos do Drive**: botão no lightbox apaga permanentemente do Google Drive + remove embeddings do banco
- **Indexação facial do Drive BQ**: endpoint `/api/drive/index-faces` + workflow `drive-index-faces.yml` (a cada 6h); fonte `drive_bq`
- **Dashboard**: cards IBIS / Meu Drive / Total + BancoParceiros (Banco Bruno)
- **Cobertura calculada corretamente**: inclui arquivos do Drive BQ no denominador e numerador
- **Migration 010 aplicada**: `face_embeddings.source_id` é `text` (não uuid)
- **Face service keep-alive**: workflow `face-keepalive.yml` pinga a cada 5min + auto-redeploy via Railway API
- **Railway Hobby ativo**: plano $5/mês ativado em 2026-05-25 — face service online

### Pendente — Normal
- **Banco Bruno indisponível**: MCP em `com-br.cloud/api/mcp/banco` retorna 404 — problema no servidor do Bruno
- **IBIS Auto-Scraper**: script de teste criado em `scripts/ibis-scraper-test.py` — login e navegação validados, falta capturar HTML dos resultados para finalizar o extrator

## Stack
- **Frontend/API**: Next.js 14 (App Router) — deploy na Vercel
- **Banco de dados**: Supabase (Postgres + pgvector + Storage + Auth)
- **Face service**: FastAPI + InsightFace buffalo_l — deploy no Railway (Hobby $5/mês)
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
ANTHROPIC_API_KEY=           # Apenas Chat do Dev
IBIS_IMPORT_TOKEN=           # protege /api/ibis/import, /api/face/backfill, /api/drive/index-faces
BANCO_BRUNO_URL=             # URL do MCP do Bruno — atualmente 404
BANCO_BRUNO_TOKEN=           # Token Bearer do MCP do Bruno
GOOGLE_SERVICE_ACCOUNT_KEY=  # JSON completo da Service Account (em uma linha)
GOOGLE_OAUTH_CLIENT_ID=      # OAuth2 para bancodequalificados@gmail.com
GOOGLE_OAUTH_CLIENT_SECRET=  # OAuth2 para bancodequalificados@gmail.com
GOOGLE_OAUTH_REFRESH_TOKEN=  # OAuth2 para bancodequalificados@gmail.com
DRIVE_BQ_FOLDER_ID=1SJCMYf2DcTgEAFUhIR4edK9TnTY3J2QQ  # pasta do Drive BQ
OCR_SPACE_API_KEY=           # ocr.space API key (25k req/mês free)
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
- Usada por: `own-search`, `index-faces`, `DELETE /api/drive/file/[id]`
- Script de setup: `scripts/google-oauth-setup.js`

### Limitações críticas da Google Drive API (descobertas em produção)
> `fullText contains` **NÃO aceita** `orderBy` — retorna "Invalid Value"
> `fullText contains` **NÃO aceita** `mimeType contains 'image/'` — usar `mimeType = 'image/jpeg'` ou omitir
> `fullText contains` **NÃO combina** com `in parents` — não é possível filtrar pasta + texto ao mesmo tempo

## Drive Banco Qualificados (`drive_bq`)

Fotos enviadas para o Drive de `bancodequalificados@gmail.com` (pasta `DRIVE_BQ_FOLDER_ID`) aparecem automaticamente na busca de qualificados via OCR do Google Drive — **sem criar ficha no banco**.

**Fluxo:**
1. Foto é enviada para a pasta do Drive BQ
2. Google Drive OCR indexa automaticamente o texto da imagem
3. Usuário pesquisa nome → `own-search` chama `fullText contains` → retorna thumbnail
4. Clique abre lightbox com foto em tamanho maior + botão **Excluir**
5. Botão Excluir (2 cliques): apaga permanentemente do Drive + remove embeddings do banco

**Indexação facial:**
- Workflow `drive-index-faces.yml` (a cada 6h) varre a pasta e indexa rostos
- Fonte: `source = "drive_bq"` em `face_embeddings`
- Aparecem na busca facial com badge verde "DRIVE 42º BPM"
- Batch de **10 fotos por chamada** (limite Vercel 60s — 30 causava timeout)
- `/api/drive/index-faces` exclui tanto `face_embeddings` quanto `face_skipped` do cálculo de pendentes (arquivos sem rosto não ficam em loop eterno)

**Registros legados `drive_abordados`**: ainda existem no banco; proxy de foto tenta service account primeiro, depois OAuth2 BQ.

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

**`qualificados`** — cadastro IBIS
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
| fonte | text | `"ibis"` |
| fonte_id | text | ID único na fonte |
| deleted_at | timestamptz | soft delete |

> `nascimento` é **string**, não `date`. Nunca incluir em filtros `ilike` — quebra toda busca.

**`face_embeddings`** — vetores 512d
- `source` (`"qualificados"` ou `"drive_bq"`), `source_id` (text), `source_label`
- `photo_url`, `embedding` (vector 512), `bbox`, `det_score`, `face_index`
- **UNIQUE INDEX** em `(source, source_id, photo_url, face_index)`

**`face_skipped`** — registros sem rosto
- `source`, `source_id`, `source_label`, `reason`

**`dev_chat_messages`** — Chat do Dev

**Storage buckets**: `faces` (`ibis/`, `drive/`, `manual/`), `dev-chat`

**RLS**: Desabilitado em todas as tabelas.

## Endpoints principais
| Rota | Descrição |
|------|-----------|
| `POST /api/ibis/import` | Recebe pessoas do extrator IBIS (CORS aberto) |
| `GET /api/qualificados/search?q=` | Busca server-side: nome, vulgo, genitora, cpf, observacoes |
| `DELETE /api/qualificados/[id]` | Remove qualificado + embeddings + foto Storage |
| `POST /api/qualificados/[id]/foto` | Upload foto manual, limpa embeddings anteriores |
| `POST /api/face/search` | Busca facial — local + Banco Bruno em paralelo |
| `GET/POST /api/face/backfill` | Gera embeddings dos registros pendentes |
| `GET /api/drive/own-search?q=` | Busca OCR no Drive BQ via OAuth2 |
| `GET /api/drive/photo/[id]` | Proxy de foto: tenta service account, depois OAuth2 |
| `POST /api/drive/index-faces` | Indexa rostos do Drive BQ (fonte drive_bq) |
| `DELETE /api/drive/file/[id]` | Apaga arquivo do Drive BQ + remove embeddings |
| `GET /api/banco-bruno/search?q=` | Proxy para busca textual no Banco Bruno |
| `GET /api/banco-bruno/status` | Stats do Banco Bruno |
| `POST /api/mcp/banco` | Servidor MCP — Bruno acessa nosso banco aqui |
| `GET/POST /api/dev-chat` | Chat do Dev — histórico e envio |
| `PATCH /api/dev-chat/[id]/read` | Marca mensagem como lida |

## Dashboard (`/`)
- **3 cards**: IBIS (qualificados no banco) / Meu Drive (arquivos na pasta BQ) / Total geral
- **BancoParceiros**: stats do Banco Bruno (badge âmbar "BANCO BRUNO")
- Drive BQ é contado em tempo real via API — reflete o número atual de arquivos na pasta

## Página de Indexação (`/indexacao`)
- **Cobertura**: (IBIS indexados + Drive BQ indexados) ÷ (IBIS com foto + Drive BQ total) × 100
- **Pendentes**: inclui IBIS pendentes + Drive BQ pendentes
- **Sem rosto**: inclui IBIS skipped + Drive BQ skipped
- **BackfillStatus**: status do worker Railway + botão "Rodar agora"
- **Painel de contato** (direita): instrução para contactar Adm. do Sistema ou ALI/42º BPM
- Cadastro de novos qualificados é feito exclusivamente via IBIS ou Drive BQ — sem formulário manual

## Busca de qualificados (`/qualificados`)
- Sem botão "Novo" — cadastro somente via IBIS ou Drive
- Busca local (Supabase) + Drive BQ (`own-search`) + Banco Bruno — em paralelo
- **MEU DRIVE**: badge verde — thumbnail da foto + lightbox ao clicar + botão Excluir
- **BANCO BRUNO**: badge âmbar

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
| `deploy.yml` | push no branch | Deploy na Vercel |
| `backfill.yml` | a cada 15min + manual | Indexação embeddings IBIS |
| `drive-index-faces.yml` | a cada 6h + manual | Indexação rostos Drive BQ |
| `face-keepalive.yml` | a cada 5min | Keep-alive + auto-recovery Railway |

## Integração Banco Bruno (MCP bidirecional)
- Bruno mantém banco próprio + Drive; sistema offline (404 no MCP)
- Nosso sistema → Bruno: `/api/banco-bruno/search`, `/api/banco-bruno/status`, `/api/face/search`
- Bruno → Nosso sistema: `/api/mcp/banco` (autenticado via `IBIS_IMPORT_TOKEN`)
- Todas as chamadas fetch ao Bruno precisam de `cache: "no-store"`

## Componentes principais
| Componente | Função |
|------------|--------|
| `BackfillStatus.tsx` | Status indexação + botão "Rodar agora" |
| `SemFotoList.tsx` | Lista qualificados sem foto |
| `SemRostoList.tsx` | Lista qualificados sem rosto + botão Limpar |
| `FotoUpload.tsx` | Upload foto na página do qualificado |
| `FaceSearch.tsx` | Busca facial com detecção automática |
| `QualificadosSearch.tsx` | Busca local + Drive BQ + Bruno simultânea; lightbox com botão Excluir no Drive BQ |
| `BancoParceiros.tsx` | Stats do Banco Bruno (badge "BANCO BRUNO") |
| `TotalQualificados.tsx` | Contador de registros na página de qualificados |
| `DevChat.tsx` | Chat flutuante de desenvolvimento |

## Deploy
- Branch: `claude/check-github-access-v30TG`
- Deploy automático via `deploy.yml` a cada push
- Secrets GitHub: `VERCEL_DEPLOY_HOOK`, `IBIS_IMPORT_TOKEN`, `RAILWAY_TOKEN`, `RAILWAY_SERVICE_ID`
