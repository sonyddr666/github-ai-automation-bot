# 🤖 GitHub AI Automation Bot (Melhorado)

Bot que processa issues do GitHub usando Gemini e faz mudanças automaticamente no repo `sonyddr666/teste`.

## 🚀 Deploy Rápido

1. Clique em "Deploy to Render" (importe este repo com `render.yaml`)
2. Configure as env vars:
   - `GITHUB_TOKEN` (scope `repo`)
   - `GEMINI_API_KEY`
3. Aplicar. Pronto!

## 🔧 Variáveis de Ambiente

- `GITHUB_TOKEN` (obrigatório) — token GitHub (scope `repo`)
- `GEMINI_API_KEY` (obrigatório)
- `REPO_OWNER` (default: `sonyddr666`)
- `REPO_NAME` (default: `teste`)
- `CHECK_INTERVAL` (ms, default: `300000`)
- `BRANCH` (default: `main`)
- `DRY_RUN` (`true|false`, default: `false`)
- `MAX_ACTIONS` (default: `20`)
- `MAX_FILE_SIZE_BYTES` (default: `200000`)
- `USE_PULL_REQUEST` (`true` abre PR, `false` comita direto no branch)
- `PORT` (Render define automaticamente)

## 🧠 Como Funciona

- A cada intervalo, busca issues abertas (ou via webhook).
- Lê título/descrição/comentários.
- Lê conteúdo dos arquivos mencionados.
- Pede plano ao Gemini (JSON validado por schema).
- Executa plano (criar/editar/deletar).
- Comenta na issue com resumo e links de commits.
- Fecha a issue se indicado.

## 🧪 DRY_RUN

Defina `DRY_RUN=true` para testar sem aplicar alterações:
- Lê issues e gera plano
- NÃO comita, NÃO comenta, NÃO fecha

## 🔗 Webhook (Opcional)

Configure no GitHub um webhook apontando para:
- `POST https://<seu-servico>.onrender.com/webhook`
- Evento: Issues

## 🛡️ Segurança

- Paths seguros (sem `..`, sem absolutos)
- Limite de ações e tamanho de arquivo
- Retry/backoff para APIs
- PR opcional ao invés de commit direto no `main`

## 🖥️ Dashboard

- Acesse `/dashboard` para ver status em tempo real (SSE)
- `/health` para informações técnicas
