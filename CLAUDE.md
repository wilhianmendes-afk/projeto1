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
| nascimento | text | data como string |
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
// SSR com anon key (respeita sessão do usuário) — usar em pages/routes normais
import { createClient } from "@/lib/supabase/server";
const supabase = await createClient();

// Admin direto com service role (bypassa RLS) — usar em endpoints de importação/backfill
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
function getAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
```

> `createServiceClient` do `@supabase/ssr` **não** bypassa RLS para SELECT — usar o admin direto acima.

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

1. **Vercel Cron** (`vercel.json`): executa `POST /api/face/backfill` a cada 30 minutos
2. **Script extrator**: ao concluir importação, dispara `POST /api/face/backfill` automaticamente
3. **Auth do backfill**: aceita:
   - Header `x-backfill-token: <IBIS_IMPORT_TOKEN>`
   - Header `Authorization: Bearer <token>`
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

**Estrutura da tabela:**
- Seletor: `document.querySelectorAll("table")[1]` (tabela sem ID, usa posição)
- `col[0]` = foto (img), `col[1]` = nome + "Alcunha: xxx", `col[2]` = "Mãe: xxx / Pai: xxx"
- Não há RG/CPF/nascimento na visão de lista do IBIS

**Observações:**
- `fonte_id` = nome do arquivo da foto (ex: `AbC123--nome.jpg`) — chave de deduplicação
- Fotos: máx 1200px, qualidade 92% JPEG via canvas (evita CORS taint)
- Erros 404 nas fotos são normais
- Ao final, dispara backfill automaticamente

**Como usar:**
1. Pesquise no IBIS (ex: "AD")
2. Cole o script no console — navega todas as páginas automaticamente
3. Repita para cada combinação de letras

## Comandos úteis
```bash
npm run dev       # dev local
npm run build     # checar build

# Reimportar do zero (rodar no SQL Editor do Supabase):
TRUNCATE face_embeddings, face_skipped, qualificados RESTART IDENTITY CASCADE;
# Depois: limpar Storage bucket faces/ibis/ manualmente no painel do Supabase

# Ver logs do face-service:
# Railway → projeto1 → Deployments → View logs
```

## Branch de desenvolvimento
`claude/check-github-access-v30TG`
