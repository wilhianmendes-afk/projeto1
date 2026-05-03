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

**`face_skipped`** — registros sem rosto detectado
- `source`, `source_id`, `source_label`, `reason`

**Storage bucket `faces`** — fotos em `ibis/` e `drive/`

**RLS**: Desabilitado nas 3 tabelas (`ALTER TABLE x DISABLE ROW LEVEL SECURITY`).

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

> **CRÍTICO**: `createClient()` SSR e `createServiceClient()` do `@supabase/ssr` **não retornam dados nem fazem INSERT** mesmo com RLS desabilitado. Usar `getAdminClient()` (sem await) em TODAS as páginas e em TODOS os endpoints de importação/backfill.

## Cache Next.js / Vercel

Todas as páginas do dashboard devem ter no topo:
```typescript
export const dynamic = "force-dynamic";
export const revalidate = 0;
```
Sem isso, o Vercel Edge Cache serve dados antigos mesmo após truncate do banco.

## Endpoints principais
| Rota | Descrição |
|------|-----------|
| `POST /api/ibis/import` | Recebe pessoas do script extrator do IBIS (CORS aberto) |
| `POST /api/face/search` | Busca facial por imagem enviada (multipart `image`) |
| `GET  /api/face/backfill` | Gera embeddings dos registros pendentes (50 por chamada) |
| `POST /api/face/backfill` | Mesmo — usado pelo cron e pelo script extrator |
| `POST /api/face/index` | Indexa um qualificado específico manualmente |
| `POST /api/drive/import` | Importa fotos do Google Drive |

## Backfill automático
O backfill de embeddings é totalmente automático — nenhum script manual é necessário:

1. **Vercel Cron** (`vercel.json`): executa `POST /api/face/backfill` uma vez por dia às 3h (`0 3 * * *`)
   - Plano Hobby do Vercel só permite 1 execução por dia — não usar `*/30 * * * *`
2. **Script extrator**: ao concluir importação, dispara `POST /api/face/backfill` automaticamente
   - Pode retornar 401 se `IBIS_IMPORT_TOKEN` não configurado — o cron diário supre
3. **Auth do backfill**: aceita:
   - Header `x-backfill-token: <IBIS_IMPORT_TOKEN>`
   - Header Vercel Cron `x-vercel-cron: 1`
   - Usuário logado (sessão SSR)

## Páginas
| Rota | Descrição |
|------|-----------|
| `/` | Dashboard — stats: qualificados, embeddings, sem rosto, cobertura % |
| `/busca` | Busca facial — upload de foto, retorna matches com score |
| `/qualificados` | Grade de fotos (prontuário) com busca por nome, paginação |
| `/qualificados/[id]` | Detalhe do qualificado + embeddings + botão de indexar |
| `/qualificados/novo` | Formulário para cadastrar manualmente |
| `/indexacao` | Status da indexação + importação por Drive |
| `/login` | Login com usuário (sem @) |

## Página de Qualificados (grade)
Fotos estilo prontuário: foto 3:4 + rodapé branco com nome/DN/MÃE/ALC.
- Grid: `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 items-start`
- `overflow-hidden` **apenas** no div da foto, não no Link pai
- Rodapé com **inline styles** (não Tailwind): `overflowWrap: 'break-word', wordBreak: 'break-word'`

## Face Service (Railway)
```
face-service/
├── main.py          # FastAPI: GET /health, POST /embed
├── Dockerfile
└── requirements.txt
```
- InsightFace `buffalo_l` com `CPUExecutionProvider`
- `POST /embed` recebe imagem, retorna `{ faces: [{ embedding: float[512], bbox, det_score }] }`

## Integração IBIS (ibis.app.br)
Script de console do navegador: `scripts/ibis-extractor.js`

**Estrutura da tabela confirmada:**
- Seletor: `document.querySelectorAll("table")[2]` (índice 2 — há tabelas de UI antes)
- `col[0]` = foto (img), `col[1]` = nome + "ALCUNHA: xxx", `col[2]` = genitora (texto direto), `col[3]` = nascimento DD/MM/AAAA
- Nome extraído: `col1.split(/ALCUNHA:/i)[0].trim()`

**Observações:**
- `fonte_id` = nome do arquivo da foto (ex: `AbC123--nome.jpg`) — chave de deduplicação
- Fotos com URL `fotocrim/?pfdrid_c=true` (sem filename) retornam 404 — normal, registro importa sem foto
- Fotos: máx 1200px, qualidade 92% JPEG via canvas (evita CORS taint)
- Ao final, dispara backfill automaticamente (pode dar 401 — cron resolve)

**Como usar:**
1. Pesquise no IBIS (ex: "AD")
2. Cole o script no console — navega todas as páginas automaticamente
3. Repita para cada combinação de letras

## Deploy (Vercel)
- Branch monitorado: `claude/check-github-access-v30TG`
- **GitHub Action** (`.github/workflows/deploy.yml`): dispara deploy automaticamente a cada push
  - Requer secret `VERCEL_DEPLOY_HOOK` no GitHub (Settings → Secrets → Actions)
  - Hook URL: configurada no Vercel → Settings → Git → Deploy Hooks → "manual-trigger"
- O proxy git do Claude Code **não sincroniza de forma confiável** — sempre fazer `git pull` + `git push` no VS Code após mudanças do Claude Code
- Deploy hook manual (PowerShell):
  ```powershell
  Invoke-RestMethod -Uri "<hook-url>" -Method POST
  ```

## Comandos úteis
```bash
npm run dev       # dev local
npm run build     # checar build

# Reimportar do zero (SQL Editor do Supabase):
TRUNCATE face_embeddings, face_skipped, qualificados RESTART IDENTITY CASCADE;
# Depois: limpar Storage bucket faces/ibis/ manualmente no painel do Supabase

# Ver logs do face-service:
# Railway → projeto1 → Deployments → View logs
```

## Branch de desenvolvimento
`claude/check-github-access-v30TG`
