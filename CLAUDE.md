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
IBIS_IMPORT_TOKEN=   # opcional — protege /api/ibis/import e /api/face/backfill
```

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
| fotos_extras | text[] | URLs adicionais |
| fonte | text | `"ibis"` ou `"drive"` |
| fonte_id | text | ID único na fonte (evita duplicata) |
| deleted_at | timestamptz | soft delete |
| created_at | timestamptz | |

**`face_embeddings`** — vetores 512d
- `source`, `source_id`, `source_label` — referência ao qualificado
- `photo_url`, `embedding` (vector 512), `bbox`, `det_score`, `face_index`
- Índice HNSW para busca por similaridade
- **UNIQUE INDEX** em `(source, source_id, photo_url, face_index)` — obrigatório para o upsert do backfill funcionar

**`face_skipped`** — registros sem rosto detectado
- `source`, `source_id`, `source_label`, `reason`

**`dev_chat_messages`** — Chat do Dev
- `role` (user/assistant), `content`, `attachments` (jsonb), `read_at`, `created_at`

**Storage buckets**:
- `faces` — fotos em `ibis/`, `drive/`, `manual/` (upload manual pela UI)
- `dev-chat` — anexos do Chat do Dev (criado automaticamente na primeira mensagem)

**RLS**: Desabilitado em todas as tabelas.

## Clientes Supabase

```typescript
// SSR com anon key — usar APENAS em login/middleware
import { createClient } from "@/lib/supabase/server";
const supabase = await createClient();

// Admin direto com service role — usar em TODAS as páginas e endpoints
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
function getAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
```

> **CRÍTICO**: `createClient()` SSR não retorna dados nem faz INSERT mesmo com RLS desabilitado. Usar `getAdminClient()` em TODAS as páginas e endpoints de dados.

> **CRÍTICO**: Queries Supabase sem `.limit()` explícito retornam no máximo 1000 linhas (padrão do projeto). Sempre usar `.limit(10000)` ou superior para tabelas grandes.

## Cache Next.js / Vercel

Todas as páginas do dashboard devem ter no topo:
```typescript
export const dynamic = "force-dynamic";
```

## Endpoints principais
| Rota | Descrição |
|------|-----------|
| `POST /api/ibis/import` | Recebe pessoas do script extrator do IBIS (CORS aberto) |
| `DELETE /api/qualificados/[id]` | Remove qualificado + embeddings + foto do Storage |
| `POST /api/qualificados/[id]/foto` | Faz upload de foto, atualiza foto_url, limpa embeddings anteriores |
| `POST /api/face/search` | Busca facial por imagem (multipart `file`) |
| `GET  /api/face/backfill` | Gera embeddings dos registros pendentes |
| `POST /api/face/backfill` | Mesmo — usado pelo cron e pelo script extrator |
| `POST /api/face/index` | Re-indexa um qualificado específico com retry de threshold |
| `POST /api/drive/import` | Importa fotos do Google Drive |
| `GET  /api/dev-chat` | Histórico do Chat do Dev |
| `POST /api/dev-chat` | Envia mensagem + gera resposta automática (Claude Haiku) |
| `PATCH /api/dev-chat/[id]/read` | Marca mensagem como lida |

## Face Service (Railway)

```
face-service/
├── main.py          # FastAPI: GET /health, POST /embed, POST /embed-raw
├── Dockerfile       # buffalo_l pré-baixado no build (sem download em runtime)
├── railway.json     # watchPatterns: face-service/** (não redeploya em push de frontend)
└── requirements.txt
```

- InsightFace `buffalo_l` com `CPUExecutionProvider`
- **`POST /embed`** — multipart/form-data (para chamadas do browser)
- **`POST /embed-raw`** — binário puro `Content-Type: image/jpeg` (para chamadas server-to-server do Vercel)
- Ambos aceitam `?min_score=0.35` para threshold por requisição
- `MIN_DET_SCORE=0.6` no ambiente (Railway env var)
- **Upscaling manual removido** — causava crash do ONNX Runtime em imagens pequenas. InsightFace redimensiona internamente.
- **Modelo pré-baked no Docker** — evita download de 281MB a cada restart

> **CRÍTICO**: chamadas server-to-server (Vercel → Railway) **devem usar `/embed-raw`**. O runtime serverless do Vercel não serializa `FormData/Blob` corretamente para Railway (retorna 502).

## Backfill de embeddings

O backfill processa qualificados que têm `foto_url` mas ainda não têm embedding nem estão em `face_skipped`.

**Funcionamento:**
1. **Vercel Cron** (`vercel.json`): `POST /api/face/backfill` às 3h UTC diariamente
2. **BackfillButton** (`/indexacao`): loop automático, chama a cada 1.5s, atualiza a página a cada 5 rodadas
3. **Batch padrão**: 3 registros por chamada (limite de 60s do Vercel Hobby)
4. **Sem healthCheck** — healthCheck com latência variável (4-10s) causava falsos positivos. Se o face service falhar, `serviceError=true` e o registro fica pendente para a próxima rodada.
5. **Retry automático** de threshold: se `total_detected > 0` mas `count == 0`, tenta novamente com `min_score=0.35`
6. **Queries paralelas**: `face_embeddings` + `face_skipped` + `qualificados` em `Promise.all`

**Auth do backfill**: aceita:
- Header `x-vercel-cron: 1`
- Header `x-backfill-token: <IBIS_IMPORT_TOKEN>`
- Usuário logado (sessão SSR)

**Limites de timeout por operação:**
- Download de imagem: 10s
- Chamada `/embed-raw`: 10s
- Função Vercel total: 60s (plano Hobby)

## Páginas
| Rota | Descrição |
|------|-----------|
| `/` | Dashboard — stats: qualificados, embeddings, sem rosto, cobertura % |
| `/busca` | Busca facial — detecção automática ao inserir foto, botão "Buscar" só ativo após detectar rosto |
| `/qualificados` | Grade de fotos com busca por nome, vulgo, CPF, nascimento, mãe |
| `/qualificados/[id]` | Detalhe do qualificado — foto 300px, upload de foto, re-indexação, excluir |
| `/qualificados/novo` | Formulário para cadastrar manualmente |
| `/indexacao` | Status da indexação, lista "sem rosto" (links p/ qualificado), lista "sem foto" expansível |
| `/login` | Login com usuário (sem @) |

## Página de Qualificados (grade)
Fotos estilo prontuário: foto 3:4 + rodapé branco com nome/DN/MÃE/ALC.
- Grid: `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 items-start`
- `overflow-hidden` **apenas** no div da foto, não no Link pai
- Rodapé com **inline styles** (não Tailwind): `overflowWrap: 'break-word', wordBreak: 'break-word'`

## Página de Indexação (/indexacao)
- **Cobertura**: baseada apenas em qualificados com `foto_url` (sem foto = excluído do denominador)
- **Sem foto**: lista expansível com link para cada qualificado — clicar abre a página onde a foto pode ser adicionada
- **Sem rosto**: lista dos 10 mais recentes, cada nome é link para `/qualificados/[id]` para re-indexar
- **BackfillButton**: atualiza contadores e lista "sem rosto" a cada 5 rodadas via `router.refresh()`

## Upload de foto manual
`POST /api/qualificados/[id]/foto` — aceita `multipart/form-data` com campo `foto`.
- Faz upload para `faces/manual/<id>_<timestamp>.jpg`
- Atualiza `foto_url` no banco
- Remove embeddings e `face_skipped` anteriores (força re-indexação)
- Componente: `src/components/FotoUpload.tsx` (drag & drop ou clique)

## Chat do Dev

Canal interno de desenvolvimento embarcado no dashboard. **Não expor publicamente.**

- Componente: `src/components/DevChat.tsx` (flutuante, canto inferior direito)
- API: `src/app/api/dev-chat/route.ts` (GET histórico / POST envio + resposta automática)
- Marcar como lido: `src/app/api/dev-chat/[id]/read/route.ts`
- Tabela: `dev_chat_messages` (migration `supabase/migrations/006_dev_chat.sql` — já aplicada)
- Storage bucket: `dev-chat` (criado automaticamente na primeira mensagem)
- Requer `ANTHROPIC_API_KEY` com créditos para respostas automáticas via Claude Haiku

## Integração IBIS (ibis.app.br)

Scripts disponíveis:
- `scripts/ibis-extractor-manual.js` — **uso principal**: cole no console após pesquisar manualmente
- `scripts/ibis-extractor.js` — versão automática AA→ZZ com localStorage (uso avançado)
- `scripts/clear-ibis-storage.js` — limpa toda a pasta `ibis/` do Supabase Storage em lote

**Estrutura da tabela confirmada:**
- Seletor: `document.querySelectorAll("table")[2]` (índice 2 — há tabelas de UI antes)
- `col[0]` = foto (img), `col[1]` = nome + "ALCUNHA: xxx", `col[2]` = genitora (texto direto), `col[3]` = nascimento DD/MM/AAAA
- Nome extraído: `col1.split(/ALCUNHA:/i)[0].trim()`

**Campos do formulário de pesquisa (PrimeFaces):**
- Input nome: `formPesquisaPessoa:pesquisaPessoaNome`
- Botão pesquisar: `formPesquisaPessoa:j_idt221`

**Observações:**
- `fonte_id` = nome do arquivo da foto (ex: `3b429bce-....jpg`) — chave de deduplicação
- URL `fotocrim/?pfdrid_c=true` (sem filename) = **sem foto no IBIS** → `naturalWidth=0` → ignorado
- **URLs do PrimeFaces expiram** — NÃO re-fazer fetch. Capturar via `canvas.drawImage(imgEl)` enquanto o `<img>` está no DOM
- **Somente registros com foto são importados**

**Lógica de deduplicação (`/api/ibis/import`):**
- Com `fonte_id` → checa por `fonte_id` no banco
- Sem `fonte_id` → checa por `nome` (ilike) + `nascimento`
- Registro existente → atualiza `foto_url` sempre que nova foto chega

**Como usar (modo manual):**
1. Abra o IBIS logado e pesquise qualquer termo
2. Quando os resultados aparecerem, abra o console (`F12`) e cole o conteúdo do arquivo `scripts/ibis-extractor-manual.js` (nunca do chat)
3. Processa a página atual e navega automaticamente pelas seguintes

**Limpar pasta ibis/ do Storage:**
```bash
node scripts/clear-ibis-storage.js
```

**Reiniciar banco do zero (SQL Editor do Supabase):**
```sql
TRUNCATE face_embeddings, face_skipped, qualificados RESTART IDENTITY CASCADE;
```
Depois rodar `node scripts/clear-ibis-storage.js` para limpar o Storage.

## Deploy (Vercel)
- Branch monitorado: `claude/check-github-access-v30TG`
- **GitHub Action** (`.github/workflows/deploy.yml`): dispara deploy automaticamente a cada push
  - Requer secret `VERCEL_DEPLOY_HOOK` no GitHub (Settings → Secrets → Actions)
- Deploy hook manual (PowerShell):
  ```powershell
  Invoke-RestMethod -Uri "<hook-url>" -Method POST
  ```

## Railway (face service)
- Projeto: `adaptable-beauty` → serviço `projeto1`
- `railway.json` com `watchPatterns: ["face-service/**"]` — só redeploya quando arquivos do face service mudam
- Redeploys desnecessários por push de frontend eram a causa do "Face service offline" durante backfill

## Componentes principais
| Componente | Função |
|------------|--------|
| `BackfillButton.tsx` | Loop automático de indexação com contadores e retry |
| `ClearSkippedButton.tsx` | Limpa todos os registros de face_skipped |
| `SemFotoList.tsx` | Lista expansível de qualificados sem foto (indexação) |
| `FotoUpload.tsx` | Upload de foto na página do qualificado (drag & drop) |
| `IndexButton.tsx` | Re-indexa um qualificado individual |
| `DeleteButton.tsx` | Remove qualificado + embeddings + foto (confirmação dupla) |
| `FaceSearch.tsx` | Busca facial com detecção automática e bbox overlay |
| `ComparisonModal.tsx` | Modal de comparação lado a lado do resultado |
| `QualificadosSearch.tsx` | Filtro client-side em tempo real na grade |
| `DevChat.tsx` | Chat flutuante de desenvolvimento |

## Comandos úteis
```bash
npm run dev       # dev local
npm run build     # checar build

# Limpar pasta ibis/ do Storage:
node scripts/clear-ibis-storage.js

# Reiniciar banco do zero:
# SQL Editor Supabase: TRUNCATE face_embeddings, face_skipped, qualificados RESTART IDENTITY CASCADE;
# Depois: node scripts/clear-ibis-storage.js
```

## Branch de desenvolvimento
`claude/check-github-access-v30TG`
