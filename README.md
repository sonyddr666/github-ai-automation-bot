# 🤖 GitHub AI Automation Bot

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/sonyddr666/github-ai-automation-bot)

Bot de automação que processa issues do GitHub usando Gemini AI para executar mudanças automaticamente no repositório **sonyddr666/teste**.

---

## 🚀 Deploy Rápido (1 Clique)

1. Clique no botão **"Deploy to Render"** acima ⬆️
2. Faça login no Render (ou crie conta gratuita)
3. Configure apenas 2 variáveis:
   - **GITHUB_TOKEN** → [Gerar aqui](https://github.com/settings/tokens) (scope: `repo`)
   - **GEMINI_API_KEY** → [Gerar aqui](https://aistudio.google.com/app/apikey)
4. Clique em **"Apply"**
5. Pronto! 🎉

---

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

---

## 🔑 Como Gerar os Tokens

### GITHUB_TOKEN
1. Acesse: https://github.com/settings/tokens
2. Clique em **"Generate new token (classic)"**
3. Dê um nome (ex: "Bot Automation")
4. Selecione o scope: **`repo`** (acesso completo a repositórios)
5. Clique em **"Generate token"**
6. **Copie o token** (você não verá ele novamente!)

### GEMINI_API_KEY
1. Acesse: https://aistudio.google.com/app/apikey
2. Clique em **"Create API key"**
3. Escolha um projeto ou crie um novo
4. **Copie a chave** gerada

---

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

#### Exemplo 5: Página Criativa 🎭
```
Título: Criar bomdia.html estilo vilão
Descrição: Crie uma página bomdia.html com a cara de vilão de filme
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

---

## 🛠️ Variáveis de Ambiente

| Variável | Obrigatória | Padrão | Descrição |
|----------|-------------|--------|------------|
| `GITHUB_TOKEN` | ✅ Sim | - | Token de acesso do GitHub |
| `GEMINI_API_KEY` | ✅ Sim | - | Chave da API do Gemini |
| `CHECK_INTERVAL` | ❌ Não | `300000` | Intervalo em ms (5 min) |
| `BRANCH` | ❌ Não | `main` | Branch onde fazer commits |
| `DRY_RUN` | ❌ Não | `false` | `true` para testar sem executar |

---

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

---

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

---

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

---

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

---

## 🔗 Links Úteis

- [Repositório GitHub](https://github.com/sonyddr666/github-ai-automation-bot)
- [Repositório Alvo (teste)](https://github.com/sonyddr666/teste)
- [Documentação Render](https://render.com/docs)
- [GitHub API Docs](https://docs.github.com/en/rest)
- [Gemini API Docs](https://ai.google.dev/gemini-api/docs)

---

## 📄 Licença

MIT License - Livre para usar e modificar!

## 🤝 Contribuindo

Sinta-se livre para abrir issues ou pull requests para melhorias!

---

**Desenvolvido com ❤️ usando Node.js + Gemini AI**
