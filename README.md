# 🤖 GitHub AI Automation Bot

Bot de automação que processa issues do GitHub usando Gemini AI para executar mudanças automaticamente no repositório **sonyddr666/teste**.

## 🎯 O Que Ele Faz

1. **Verifica issues abertas** a cada 5 minutos no repositório `sonyddr666/teste`
2. **Lê título, descrição e comentários** de cada issue
3. **Consulta o Gemini AI** para gerar um plano de ações em JSON
4. **Executa automaticamente:**
   - Criar arquivos novos
   - Modificar arquivos existentes
   - Deletar arquivos
   - Fazer commits direto no branch main
5. **Comenta na issue** com resumo das ações executadas
6. **Fecha a issue** automaticamente quando completo

## 🚀 Deploy no Render

### Passo 1: Configure as Variáveis de Ambiente

Você precisa de 2 variáveis obrigatórias:

#### 🔑 GITHUB_TOKEN
1. Acesse: https://github.com/settings/tokens
2. Clique em **"Generate new token (classic)"**
3. Dê um nome (ex: "Bot Automation")
4. Selecione o scope: **`repo`** (acesso completo a repositórios)
5. Clique em **"Generate token"**
6. **Copie o token** (você não verá ele novamente!)

#### 🤖 GEMINI_API_KEY
1. Acesse: https://aistudio.google.com/app/apikey
2. Clique em **"Create API key"**
3. Escolha um projeto ou crie um novo
4. **Copie a chave** gerada

### Passo 2: Deploy no Render

1. Acesse: https://render.com
2. Clique em **"New +"** → **"Web Service"** ou **"Background Worker"**
3. Conecte este repositório: `sonyddr666/github-ai-automation-bot`
4. Configure:
   - **Name:** `github-ai-bot` (ou qualquer nome)
   - **Region:** Escolha a mais próxima
   - **Branch:** `main`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
5. Adicione as **Environment Variables:**
   ```
   GITHUB_TOKEN=ghp_seu_token_aqui
   GEMINI_API_KEY=sua_chave_aqui
   ```
6. (Opcional) Adicione mais variáveis:
   ```
   CHECK_INTERVAL=300000    # 5 minutos em ms (padrão)
   BRANCH=main              # branch alvo (padrão)
   DRY_RUN=false            # true para testar sem executar
   ```
7. Clique em **"Create Web Service"**

### Passo 3: Verificar se Está Funcionando

1. Vá em **Logs** no painel do Render
2. Você verá:
   ```
   🤖 BOT DE AUTOMAÇÃO GITHUB + GEMINI AI
   Repositório: sonyddr666/teste
   Branch: main
   Intervalo: 300s (5 minutos)
   ```
3. A cada 5 minutos verá: `🔄 Verificação iniciada...`

## 📝 Como Usar

### Criar Issues no Repositório `sonyddr666/teste`

O bot processa **qualquer issue aberta** automaticamente. Exemplos:

#### Exemplo 1: Criar um Arquivo
```
Título: Criar página sobre
Descrição: Criar um arquivo sobre.html com informações sobre a empresa
```

#### Exemplo 2: Modificar um Arquivo
```
Título: Mudar cor do título
Descrição: No index.html, mudar a cor do h1 para azul
```

#### Exemplo 3: Deletar um Arquivo
```
Título: Remover arquivo teste
Descrição: Deletar o arquivo teste.txt que não é mais necessário
```

#### Exemplo 4: Múltiplas Ações
```
Título: Reestruturar site
Descrição: 
1. Criar styles.css com fundo azul
2. Atualizar index.html para usar o CSS
3. Deletar old-styles.css
```

### O Que Acontece Depois

1. ✅ Bot detecta a issue (em até 5 minutos)
2. 🤖 Gemini analisa e cria plano
3. ⚙️ Bot executa as ações
4. 💬 Bot comenta com resumo:
   ```markdown
   ## 🤖 Automação Executada
   
   ✅ Página sobre.html criada com sucesso!
   
   ### ✅ Arquivos Criados (1)
   - `sobre.html` - Página sobre criada
   
   ### 🔗 Commits
   1. https://github.com/sonyddr666/teste/commit/abc123
   ```
5. 🔒 Issue é fechada automaticamente

## 🛠️ Variáveis de Ambiente

| Variável | Obrigatória | Padrão | Descrição |
|----------|-------------|--------|------------|
| `GITHUB_TOKEN` | ✅ Sim | - | Token de acesso do GitHub |
| `GEMINI_API_KEY` | ✅ Sim | - | Chave da API do Gemini |
| `CHECK_INTERVAL` | ❌ Não | `300000` | Intervalo em ms (5 min) |
| `BRANCH` | ❌ Não | `main` | Branch onde fazer commits |
| `DRY_RUN` | ❌ Não | `false` | `true` para testar sem executar |

## 📊 Logs e Monitoramento

O bot exibe logs detalhados:

```
🔄 Verificação iniciada: 25/11/2025 22:10:00
📋 2 issue(s) aberta(s) encontrada(s)

📝 Processando issue #1: "Criar página sobre"
💬 0 comentário(s) encontrado(s)
🤖 Consultando Gemini para issue #1...
✅ Plano gerado para issue #1
⚙️ Executando: create_file em "sobre.html"
✅ Arquivo criado: sobre.html
💬 Comentário adicionado à issue #1
🔒 Issue #1 fechada com estado: completed
✅ Issue #1 processada com sucesso!

✅ Verificação concluída em 8.43s
```

## 🔧 Modo de Teste (DRY_RUN)

Para testar sem executar ações reais:

```bash
DRY_RUN=true
```

O bot irá:
- ✅ Ler issues
- ✅ Consultar Gemini
- ✅ Gerar planos
- ❌ NÃO executar ações
- ❌ NÃO comentar
- ❌ NÃO fechar issues

## ⚠️ Troubleshooting

### Bot não inicia
- ✅ Verifique se `GITHUB_TOKEN` e `GEMINI_API_KEY` estão configurados
- ✅ Verifique os logs no Render

### Issues não são processadas
- ✅ Verifique se as issues estão **abertas** (não fechadas)
- ✅ Aguarde até 5 minutos para o próximo ciclo
- ✅ Verifique os logs para erros

### Erro "404 Not Found"
- ✅ Verifique se o token tem scope `repo`
- ✅ Verifique se o repositório é `sonyddr666/teste`

### Erro "Rate Limit"
- ✅ O bot tem delay de 1s entre ações
- ✅ Se persistir, aumente `CHECK_INTERVAL` para 600000 (10 min)

## 🎨 Arquitetura

```
┌─────────────────┐
│   Render Host   │
│                 │
│  ┌───────────┐  │
│  │  Node.js  │  │
│  │   Bot     │  │
│  └─────┬─────┘  │
└────────┼────────┘
         │
    (cada 5 min)
         │
         ▼
┌─────────────────────────────┐
│   GitHub API                │
│   sonyddr666/teste          │
│                             │
│  - Buscar issues abertas    │
│  - Ler comentários          │
│  - Criar/editar/deletar     │
│  - Comentar                 │
│  - Fechar issues            │
└──────────┬──────────────────┘
           │
           ▼
    ┌─────────────┐
    │  Gemini AI  │
    │             │
    │  Analisa e  │
    │  gera plano │
    └─────────────┘
```

## 📄 Licença

MIT License - Livre para usar e modificar!

## 🤝 Contribuindo

Sinta-se livre para abrir issues ou pull requests para melhorias!

---

**Desenvolvido com ❤️ usando Node.js + Gemini AI**
