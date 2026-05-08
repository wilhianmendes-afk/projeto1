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
| `DELETE /api/qualificados/[id]` | Remove qualificado + embeddings + foto do Storage |
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
- URL `fotocrim/?pfdrid_c=true` (sem filename) = **sem foto no IBIS** → `naturalWidth=0` → ignorado pelo script (normal)
- **URLs do PrimeFaces expiram** — NÃO re-fazer fetch. Capturar via `canvas.drawImage(imgEl)` enquanto o `<img>` está no DOM
- Aguardar imagens carregarem: `Promise.all(imgs.map(img => new Promise(r => { img.onload=r; img.onerror=r; setTimeout(r,4000); })))`
- Ao final, dispara backfill automaticamente (pode dar 401 — cron resolve)
- **nascimento**: endpoint converte automaticamente de `DD/MM/AAAA` para `AAAA-MM-DD`
- Busca requer mínimo 2 letras (ex: "AA", "AB"...)
- **Somente registros com foto são importados** — script filtra `comFoto` antes de enviar, API também rejeita

**Lógica de deduplicação e update (`/api/ibis/import`):**
- Com `fonte_id` → checa por `fonte_id` no banco
- Sem `fonte_id` → checa por `nome` (ilike) + `nascimento`
- Registro já existente → **sempre atualiza `foto_url`** quando nova foto chega (não apenas se vazio)
- Também preenche `vulgo`, `genitora`, `nascimento` se estiverem vazios
- Filename no Storage: `ibis/<fonte_id>.jpg` ou `ibis/<timestamp>_<uuid>.jpg` (sem fonte_id)

**Filtro de importação — regras estritas (sem exceções):**
- `naturalWidth=0` → sem foto no IBIS → não importa, sem aviso
- Erro de canvas (CORS taint, arquivo corrompido, etc.) → não importa, loga `⚠️ Canvas falhou — NOME: motivo`
- Somente registros onde canvas capturou `base64` com sucesso são importados
- API também rejeita qualquer payload sem `foto_base64` como segunda barreira

**Como usar (modo manual — arquivo `ibis-extractor-manual.js`):**
1. Abra o IBIS logado e pesquise qualquer termo
2. Quando os resultados aparecerem, abra o console (`F12`) e cole o conteúdo do arquivo (nunca do chat — pode corromper sintaxe)
3. Ele processa a página atual e navega automaticamente por todas as páginas seguintes

**Saída esperada no console:**
```
📄 Pág 1: 8 registros | 6 com foto | 1 sem foto no IBIS | 1 erro canvas
  ⚠️ Canvas falhou — ISAAC SAMUEL FERREIRA DA SILVA: The operation is insecure.
  ✅ +6 importados | 0 já existiam | fotos: 6 | acumulado: 6
```

**Registros com erro de canvas (CORS taint):**
- Foto existe no IBIS mas o servidor bloqueou leitura via canvas
- Não é possível importar pelo navegador — não há solução automática
- Se o registro já estiver no sistema sem foto: use o botão **Excluir** na página dele
- Ele nunca será re-importado sem foto (filtro garante isso)

**Limpar pasta ibis/ do Storage:**
```bash
node scripts/clear-ibis-storage.js
```
Lê credenciais do `.env.local`, deleta em lotes de 100, exibe progresso.

**Reiniciar banco do zero (SQL Editor do Supabase):**
```sql
TRUNCATE face_embeddings, face_skipped, qualificados RESTART IDENTITY CASCADE;
```
Depois rodar `node scripts/clear-ibis-storage.js` para limpar o Storage.

**Diagnóstico de canvas (se fotos não baixarem):**
```javascript
(function() {
  const tabela = document.querySelectorAll("table")[2];
  if (!tabela) { console.log("❌ Tabela não encontrada"); return; }
  tabela.querySelectorAll("tr").forEach(tr => {
    const col = tr.querySelectorAll("td");
    if (col.length < 2) return;
    const nome = col[1]?.innerText.split(/ALCUNHA:/i)[0].split("\n")[0].trim();
    if (!nome) return;
    const img = col[0]?.querySelector("img");
    if (!img) { console.log(`${nome} — SEM <img>`); return; }
    console.log(`${nome}`);
    console.log(`  src: ${img.src}`);
    console.log(`  complete: ${img.complete} | naturalWidth: ${img.naturalWidth}`);
    if (img.naturalWidth > 0) {
      try {
        const c = document.createElement("canvas");
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        c.getContext("2d").drawImage(img, 0, 0);
        console.log(`  ✅ Canvas OK — base64: ${c.toDataURL("image/jpeg").length} chars`);
      } catch(e) { console.log(`  ❌ Canvas ERRO: ${e.message}`); }
    } else { console.log(`  ⚠️ naturalWidth=0 — sem foto no IBIS`); }
  });
})();
```

**Script de extração manual — ver arquivo `scripts/ibis-extractor-manual.js`**
Sempre copiar do VS Code, nunca do chat (markdown pode corromper a sintaxe).

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

## Páginas — funcionalidades
| Rota | Funcionalidade extra |
|------|---------------------|
| `/qualificados/[id]` | Botão **Excluir** (DeleteButton) — remove registro + embeddings + foto do Storage |

`src/components/DeleteButton.tsx` — client component com confirmação em dois cliques.

## Comandos úteis
```bash
npm run dev       # dev local
npm run build     # checar build

# Limpar pasta ibis/ do Storage:
node scripts/clear-ibis-storage.js   # lê .env.local automaticamente

# Reimportar do zero (SQL Editor do Supabase):
TRUNCATE face_embeddings, face_skipped, qualificados RESTART IDENTITY CASCADE;
# Depois: node scripts/clear-ibis-storage.js

# Ver logs do face-service:
# Railway → projeto1 → Deployments → View logs
```

## Chat do Dev

Canal interno de desenvolvimento embarcado no dashboard. **Não expor publicamente.**

- Componente: `src/components/DevChat.tsx` (flutuante, canto inferior direito)
- API: `src/app/api/dev-chat/route.ts` (GET histórico / POST envio + resposta automática)
- Marcar como lido: `src/app/api/dev-chat/[id]/read/route.ts`
- Tabela: `dev_chat_messages` (migration `supabase/migrations/006_dev_chat.sql`)
- Storage bucket: `dev-chat` (criado automaticamente na primeira mensagem)
- Requer `ANTHROPIC_API_KEY` nas env vars para respostas automáticas via Claude Haiku

## Branch de desenvolvimento
`claude/check-github-access-v30TG`

## Mudanças Recentes (Sessão Atual)

### 1. Página de Busca Facial (/busca)
- ✅ **Botão "Buscar" explícito**: removido auto-search ao alterar threshold
- ✅ **Detecção automática**: rosto é detectado assim que imagem é inserida
- ✅ **Enquadramento visual**: bbox (linhas azuis) aparece na foto automaticamente
- ✅ **Correção do bbox**: 
  - Conta com o `object-contain` da imagem
  - Usa `getBoundingClientRect()` para precisão
  - Desescala coordenadas do face-service (que redimensiona para 640px)
- ✅ **Modal de comparação**: clique em resultado abre comparação lado a lado
- ✅ **Imagens sem corte**: mudado de `object-cover` para `object-contain`
- ✅ **Mensagens de status**: "Detectando rosto..." e "Buscando..." aparecem sobre a foto

### 2. Página de Qualificados (/qualificados)
- ✅ **Filtro em tempo real**: resultados são atualizados enquanto digita (sem Enter)
- ✅ **Busca por múltiplos campos**:
  - Nome
  - Alcunha (vulgo)
  - CPF
  - Data de nascimento (DD/MM/AAAA ou DDMMAAAA)
  - Nome da mãe (genitora)
- ✅ **Suporte a formatos de data**: 
  - `20/07/1988` (DD/MM/AAAA)
  - `20071988` (DDMMAAAA)
  - Ambos são convertidos para busca no formato YYYY-MM-DD
- ✅ **Imagens sem corte**: cards de resultado com `object-contain`

### 3. Página de Detalhes (/qualificados/[id])
- ✅ **Data de nascimento formatada**: exibida como DD/MM/AAAA
- ✅ **Todos os campos exibidos**:
  - Nome, Vulgo, CPF, RG
  - Data de Nascimento, Nome da Mãe
  - Cidade, UF
  - Fonte de Dados, ID na Fonte
  - Data de Cadastro
- ✅ **Seção de Fotos Adicionais**: exibe `fotos_extras` se disponível
- ✅ **Embeddings faciais**: imagens sem corte com `object-contain`

### 4. Modal de Comparação
- ✅ **Layout amplo**: max-width 6xl para melhor visualização
- ✅ **Imagens grandes**: lado a lado em tamanho quadrado
- ✅ **Dados detalhados**:
  - Foto buscada vs. Foto do qualificado
  - Similaridade em percentual grande
  - Nome, alcunha, data de nascimento, mãe
  - CPF, localização
  - Confiança e det score
- ✅ **Fundo preto**: melhor contraste para imagens

### Componentes Novos
- `src/components/QualificadosSearch.tsx` — filtro client-side com busca em tempo real
- `src/components/ComparisonModal.tsx` — modal de comparação de fotos

### Alterações na API
- `/api/face/search` retorna agora `image_size` para cálculo correto do bbox
- Busca retorna dados adicionais: `nascimento`, `genitora`
