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
IBIS_IMPORT_TOKEN=   # opcional — protege o endpoint de import
```

## Estrutura do banco
- `qualificados` — cadastro de pessoas (nome, vulgo, rg, cpf, nascimento, foto_url, fonte, fonte_id)
- `face_embeddings` — embeddings vetoriais 512d (InsightFace buffalo_l) com índice HNSW
- `face_skipped` — registros sem rosto detectado
- Storage bucket `faces` — fotos armazenadas em `ibis/` e `drive/`

## Endpoints principais
| Rota | Descrição |
|------|-----------|
| `POST /api/ibis/import` | Recebe pessoas do script extrator do IBIS (CORS aberto) |
| `POST /api/face/search` | Busca facial por imagem enviada |
| `GET  /api/face/backfill` | Gera embeddings dos registros ainda não indexados (50 por chamada) |
| `POST /api/face/backfill` | Mesma função via POST |

## Integração IBIS (ibis.app.br)
O sistema IBIS usa JSF/PrimeFaces. A indexação é feita via script de console do navegador.

### Script extrator
Arquivo: `scripts/ibis-extractor.js`

**Seletores confirmados:**
- Tabela de resultados: `#formPesquisaPessoa\\:tbPesquisa_data tr`
- Colunas: `col[0]`=foto, `col[1]`=rg/cpf, `col[2]`=nome, `col[3]`=alcunha, `col[4]`=genitora, `col[5]`=nascimento
- Input nome: `[id='formPesquisaPessoa:j_idt100']`
- Botão pesquisar: `[id='formPesquisaPessoa:j_idt118']`

**Observações importantes:**
- Campo nome exige **mínimo 2 caracteres** — script usa combinações AA→ZZ (676 total)
- Erros 404 nas fotos são normais — muitas fotos não existem no servidor IBIS
- `fonte_id` é extraído do nome do arquivo da foto (ex: `AbC123--nome.jpg`) para evitar duplicatas
- A automação do clique no botão JSF pode não funcionar em todas as instalações
- Se `Total: 0` ao final, o JSF não aceitou os cliques automatizados → usar método manual

**Método manual (garantido funcionar):**
1. Pesquise manualmente no IBIS (ex: "AD")
2. Cole o script — ele lê a página atual + navega todas as páginas automaticamente
3. Repita para cada combinação de letras

### Backfill de embeddings
Após importar os registros, acessar logado:
```
https://projeto1-liard-one.vercel.app/api/face/backfill
```
Processa 50 registros por chamada. Repetir (F5) até `remaining: 0`.

## Face Service (Railway)
```
face-service/
├── main.py          # FastAPI: GET /health, POST /embed
├── Dockerfile
└── requirements.txt
```
Usa InsightFace `buffalo_l` com `CPUExecutionProvider`.
Retorna lista de faces com `embedding` (512d), `bbox`, `det_score`.

## Comandos úteis
```bash
# Rodar localmente
npm run dev

# Checar build
npm run build

# Ver logs do face-service
# → Railway dashboard → projeto1 → Deployments → View logs
```

## Branch de desenvolvimento
`claude/check-github-access-v30TG`
