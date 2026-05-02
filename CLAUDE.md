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
IBIS_IMPORT_TOKEN=   # opcional — protege o endpoint de import e backfill
```

## Estrutura do banco
- `qualificados` — cadastro de pessoas (nome, vulgo, rg, cpf, nascimento, genitora, foto_url, fonte, fonte_id)
- `face_embeddings` — embeddings vetoriais 512d (InsightFace buffalo_l) com índice HNSW
- `face_skipped` — registros sem rosto detectado
- Storage bucket `faces` — fotos armazenadas em `ibis/` e `drive/`

**RLS**: Desabilitado nas 3 tabelas acima (acesso via service role no backend).

## Endpoints principais
| Rota | Descrição |
|------|-----------|
| `POST /api/ibis/import` | Recebe pessoas do script extrator do IBIS (CORS aberto) |
| `POST /api/face/search` | Busca facial por imagem enviada |
| `GET  /api/face/backfill` | Gera embeddings dos registros ainda não indexados (50 por chamada) |
| `POST /api/face/backfill` | Mesma função via POST — usada pelo cron e script |

## Backfill automático
O backfill de embeddings é totalmente automático:

1. **Vercel Cron** (`vercel.json`): executa `POST /api/face/backfill` a cada 30 minutos
2. **Script extrator**: ao concluir importação, dispara `POST /api/face/backfill` automaticamente
3. **Auth do backfill**: aceita `x-backfill-token: <IBIS_IMPORT_TOKEN>`, `Authorization: Bearer <token>`, ou header Vercel Cron `x-vercel-cron: 1`

Não é mais necessário rodar scripts manuais para indexação.

## Integração IBIS (ibis.app.br)
O sistema IBIS usa JSF/PrimeFaces. A indexação é feita via script de console do navegador.

### Script extrator
Arquivo: `scripts/ibis-extractor.js`

**Estrutura da tabela confirmada:**
- Seletor: `document.querySelectorAll("table")[1]` (tabela sem ID)
- `col[0]` = foto (img), `col[1]` = nome + "Alcunha: xxx", `col[2]` = "Mãe: xxx / Pai: xxx", `col[3]` = vazio
- Não há RG/CPF/nascimento na visão de lista do IBIS

**Observações importantes:**
- `fonte_id` extraído do nome do arquivo da foto (ex: `AbC123--nome.jpg`) — evita duplicatas
- Fotos: máx 1200px, qualidade 92% JPEG (canvas compression para evitar CORS taint)
- Erros 404 nas fotos são normais — muitas não existem no servidor IBIS
- Ao final da extração, o script dispara o backfill automaticamente

**Como usar:**
1. Pesquise manualmente no IBIS (ex: "AD")
2. Cole o script no console — ele lê a página atual + navega todas as páginas
3. Ao concluir, dispara o backfill automaticamente
4. Repita para cada combinação de letras

## Face Service (Railway)
```
face-service/
├── main.py          # FastAPI: GET /health, POST /embed
├── Dockerfile
└── requirements.txt
```
Usa InsightFace `buffalo_l` com `CPUExecutionProvider`.
Retorna lista de faces com `embedding` (512d), `bbox`, `det_score`.

## Página de Qualificados
Grade de fotos estilo prontuário: foto 3:4 + rodapé branco com nome/DN/MÃE/ALC.
- `items-start` no grid (evita cards de altura igual)
- `overflow-hidden` apenas no div da foto, não no Link pai
- Texto do rodapé com `overflowWrap: break-word` (inline styles, não Tailwind)

## Comandos úteis
```bash
# Rodar localmente
npm run dev

# Checar build
npm run build

# Limpar banco e reimportar (SQL no Supabase)
# TRUNCATE face_embeddings, face_skipped, qualificados RESTART IDENTITY CASCADE;
# Depois limpar Storage bucket faces/ibis manualmente

# Ver logs do face-service
# → Railway dashboard → projeto1 → Deployments → View logs
```

## Branch de desenvolvimento
`claude/check-github-access-v30TG`
