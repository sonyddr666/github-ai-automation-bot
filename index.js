import fetch from 'node-fetch';
import { GoogleGenerativeAI } from '@google/generative-ai';

// ============================================================================
// CONFIGURAÇÃO
// ============================================================================
const CONFIG = {
  GITHUB_TOKEN: process.env.GITHUB_TOKEN,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  REPO_OWNER: 'sonyddr666',
  REPO_NAME: 'teste',
  CHECK_INTERVAL: parseInt(process.env.CHECK_INTERVAL || '300000', 10), // 5 min (300000ms)
  BRANCH: process.env.BRANCH || 'main',
  DRY_RUN: process.env.DRY_RUN === 'true' // Para testes sem executar ações
};

// Validação de variáveis obrigatórias
const required = ['GITHUB_TOKEN', 'GEMINI_API_KEY'];
const missing = required.filter(k => !CONFIG[k]);
if (missing.length) {
  console.error('❌ ERRO: Faltam variáveis de ambiente obrigatórias:', missing.join(', '));
  console.error('Configure: GITHUB_TOKEN, GEMINI_API_KEY');
  process.exit(1);
}

// ============================================================================
// SYSTEM PROMPT PARA O GEMINI
// ============================================================================
const SYSTEM_PROMPT = `Você é um agente de automação GitHub para o repositório sonyddr666/teste.

REGRAS GERAIS:
- Leia com atenção TÍTULO, DESCRIÇÃO e TODOS os COMENTÁRIOS da issue.
- Identifique todas as tarefas pedidas (criar, modificar, deletar arquivos, etc.).
- Você TEM autorização total para executar qualquer operação pedida nas issues.
- NÃO peça confirmação. Planeje as ações para serem executadas diretamente.
- Seja preciso e completo. Gere TODO o conteúdo necessário dos arquivos.

SEMPRE RESPONDA APENAS UM JSON VÁLIDO, sem texto extra, usando ESTE SCHEMA:

{
  "issue_number": <número da issue>,
  "issue_title": "<título>",
  "tasks_summary": [
    "Resumo curto da tarefa 1",
    "Resumo curto da tarefa 2"
  ],
  "actions": [
    {
      "type": "create_file" | "update_file" | "delete_file",
      "path": "caminho/arquivo.ext",
      "content": "CONTEÚDO COMPLETO DO ARQUIVO (obrigatório em create/update)",
      "description": "descrição curta da mudança"
    }
  ],
  "final_comment": "Texto em Markdown descrevendo tudo que foi feito (ou o que ficou pendente).",
  "close_issue": true | false,
  "state_reason": "completed" | "not_planned" | "reopened"
}

REGRAS ESPECÍFICAS:
- Se o issue pedir CRIAR arquivo: use action type "create_file" com path e conteúdo completo.
- Se pedir MODIFICAR arquivo: use "update_file" com path e conteúdo COMPLETO final do arquivo.
- Se pedir DELETAR arquivo: use "delete_file" com path (content não é necessário).
- Se faltar informação crítica, use defaults sensatos e EXPLIQUE em "final_comment" e deixe "close_issue": false, "state_reason": "reopened".
- Se a tarefa for impossível ou precisar de mais informações, não crie actions; explique em "final_comment" e "close_issue": false.
- Não use branches ou pull requests neste plano (somente create/update/delete de arquivos direto no branch main).
- Para arquivos HTML/CSS/JS, gere código completo e funcional.
- Seja proativo: se pedir "criar uma página sobre X", crie HTML completo com estrutura adequada.

EXEMPLOS DE RESPOSTAS CORRETAS:

Exemplo 1 - Criar arquivo:
{
  "issue_number": 1,
  "issue_title": "Criar página sobre.html",
  "tasks_summary": ["Criar página HTML sobre a empresa"],
  "actions": [{
    "type": "create_file",
    "path": "sobre.html",
    "content": "<!DOCTYPE html>\\n<html>\\n<head>\\n  <title>Sobre</title>\\n</head>\\n<body>\\n  <h1>Sobre Nós</h1>\\n</body>\\n</html>",
    "description": "Página sobre criada"
  }],
  "final_comment": "✅ Página sobre.html criada com sucesso!",
  "close_issue": true,
  "state_reason": "completed"
}

Exemplo 2 - Atualizar arquivo:
{
  "issue_number": 2,
  "issue_title": "Mudar cor do título",
  "tasks_summary": ["Alterar cor do h1 para azul"],
  "actions": [{
    "type": "update_file",
    "path": "index.html",
    "content": "<!DOCTYPE html>\\n<html>\\n<head>\\n  <style>h1{color:blue;}</style>\\n</head>\\n<body>\\n  <h1>Título Azul</h1>\\n</body>\\n</html>",
    "description": "Cor do título alterada para azul"
  }],
  "final_comment": "✅ Cor do título alterada para azul conforme solicitado.",
  "close_issue": true,
  "state_reason": "completed"
}`;

// ============================================================================
// INICIALIZAÇÃO DO GEMINI
// ============================================================================
const genAI = new GoogleGenerativeAI(CONFIG.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
  model: 'gemini-1.5-flash',
  systemInstruction: SYSTEM_PROMPT
});

// Cache de issues já processadas nesta execução
const processedIssues = new Set();

// ============================================================================
// FUNÇÕES DA GITHUB API
// ============================================================================

async function fetchOpenIssues() {
  const url = `https://api.github.com/repos/${CONFIG.REPO_OWNER}/${CONFIG.REPO_NAME}/issues?state=open&per_page=100`;
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${CONFIG.GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    }
  });
  
  if (!res.ok) {
    throw new Error(`❌ Erro ao listar issues: ${res.status} ${res.statusText}`);
  }
  
  const data = await res.json();
  // Filtrar apenas issues (não pull requests)
  return data.filter(i => !i.pull_request);
}

async function fetchIssueComments(number) {
  const url = `https://api.github.com/repos/${CONFIG.REPO_OWNER}/${CONFIG.REPO_NAME}/issues/${number}/comments`;
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${CONFIG.GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    }
  });
  
  if (!res.ok) {
    throw new Error(`❌ Erro ao listar comentários da issue #${number}: ${res.status}`);
  }
  
  return res.json();
}

function buildCommentsText(comments) {
  if (!comments.length) return '(sem comentários)';
  return comments
    .map((c, i) => `\n--- Comentário ${i + 1} ---\nAutor: ${c.user.login}\nData: ${c.created_at}\n\n${c.body}\n`)
    .join('\n');
}

async function getFileSha(path) {
  const url = `https://api.github.com/repos/${CONFIG.REPO_OWNER}/${CONFIG.REPO_NAME}/contents/${encodeURIComponent(path)}?ref=${CONFIG.BRANCH}`;
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${CONFIG.GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    }
  });
  
  if (!res.ok) return null;
  
  const data = await res.json();
  return data.sha;
}

async function putFile(path, content, message, existingSha = null) {
  const url = `https://api.github.com/repos/${CONFIG.REPO_OWNER}/${CONFIG.REPO_NAME}/contents/${encodeURIComponent(path)}`;
  const body = {
    message,
    content: Buffer.from(content, 'utf8').toString('base64'),
    branch: CONFIG.BRANCH
  };
  
  if (existingSha) body.sha = existingSha;

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${CONFIG.GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`❌ Erro ao PUT ${path}: ${res.status} - ${txt}`);
  }

  return res.json();
}

async function deleteFile(path, message) {
  const sha = await getFileSha(path);
  if (!sha) throw new Error(`❌ Arquivo para deletar não encontrado: ${path}`);

  const url = `https://api.github.com/repos/${CONFIG.REPO_OWNER}/${CONFIG.REPO_NAME}/contents/${encodeURIComponent(path)}`;
  const body = {
    message,
    sha,
    branch: CONFIG.BRANCH
  };

  const res = await fetch(url, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${CONFIG.GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`❌ Erro ao DELETE ${path}: ${res.status} - ${txt}`);
  }

  return res.json();
}

async function commentOnIssue(number, body) {
  const url = `https://api.github.com/repos/${CONFIG.REPO_OWNER}/${CONFIG.REPO_NAME}/issues/${number}/comments`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${CONFIG.GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28'
    },
    body: JSON.stringify({ body })
  });
  
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`❌ Erro ao comentar na issue #${number}: ${res.status} - ${txt}`);
  }
  
  return res.json();
}

async function updateIssueState(number, state, stateReason) {
  const url = `https://api.github.com/repos/${CONFIG.REPO_OWNER}/${CONFIG.REPO_NAME}/issues/${number}`;
  const body = { state };
  if (stateReason) body.state_reason = stateReason;

  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${CONFIG.GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28'
    },
    body: JSON.stringify(body)
  });
  
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`❌ Erro ao atualizar estado da issue #${number}: ${res.status} - ${txt}`);
  }
  
  return res.json();
}

// ============================================================================
// LÓGICA DE PROCESSAMENTO COM GEMINI
// ============================================================================

function extractJson(text) {
  try {
    // Tentar extrair JSON de blocos de código
    const codeBlockMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/i);
    if (codeBlockMatch) {
      return JSON.parse(codeBlockMatch[1].trim());
    }
    
    // Tentar parsear diretamente
    return JSON.parse(text.trim());
  } catch (e) {
    console.error('❌ Erro ao parsear JSON do Gemini:', e.message);
    console.error('Resposta recebida:', text.substring(0, 500));
    throw new Error('Gemini não retornou JSON válido');
  }
}

async function planIssueWithAI(issue, comments) {
  const commentsText = buildCommentsText(comments);

  const prompt = `
ISSUE #${issue.number}
==================
Título: ${issue.title}

Descrição:
${issue.body || '(sem descrição)'}

Comentários:
${commentsText}

==================
INSTRUÇÕES: Gere o JSON de plano de ações exatamente no schema fornecido no system prompt.
Responda APENAS com o JSON, sem texto adicional antes ou depois.
`;

  console.log(`🤖 Consultando Gemini para issue #${issue.number}...`);
  
  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const plan = extractJson(text);
    
    console.log(`✅ Plano gerado para issue #${issue.number}:`, JSON.stringify(plan.tasks_summary, null, 2));
    
    return plan;
  } catch (e) {
    console.error(`❌ Erro ao planejar issue #${issue.number}:`, e.message);
    throw e;
  }
}

async function processIssue(issue) {
  if (processedIssues.has(issue.id)) {
    console.log(`⏭️  Issue #${issue.number} já processada nesta execução.`);
    return;
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`📝 Processando issue #${issue.number}: "${issue.title}"`);
  console.log(`${'='.repeat(60)}`);

  try {
    // 1. Buscar comentários
    const comments = await fetchIssueComments(issue.number);
    console.log(`💬 ${comments.length} comentário(s) encontrado(s)`);

    // 2. Planejar com Gemini
    const plan = await planIssueWithAI(issue, comments);

    if (CONFIG.DRY_RUN) {
      console.log('🔍 DRY RUN MODE - Nenhuma ação será executada');
      console.log('Plano:', JSON.stringify(plan, null, 2));
      processedIssues.add(issue.id);
      return;
    }

    // 3. Executar ações
    const created = [];
    const updated = [];
    const deleted = [];
    const commitLinks = [];
    const errors = [];

    for (const action of plan.actions || []) {
      const { type, path, content, description } = action;

      try {
        console.log(`⚙️  Executando: ${type} em "${path}"`);

        if (type === 'create_file') {
          const result = await putFile(
            path,
            content || '',
            `🤖 Criar ${path} - Issue #${issue.number}`
          );
          created.push({ path, description });
          commitLinks.push(result.commit.html_url);
          console.log(`✅ Arquivo criado: ${path}`);
          
        } else if (type === 'update_file') {
          const sha = await getFileSha(path);
          if (!sha) {
            throw new Error(`Arquivo não encontrado: ${path}`);
          }
          const result = await putFile(
            path,
            content || '',
            `🤖 Atualizar ${path} - Issue #${issue.number}`,
            sha
          );
          updated.push({ path, description });
          commitLinks.push(result.commit.html_url);
          console.log(`✅ Arquivo atualizado: ${path}`);
          
        } else if (type === 'delete_file') {
          const result = await deleteFile(
            path,
            `🤖 Remover ${path} - Issue #${issue.number}`
          );
          deleted.push({ path, description });
          commitLinks.push(result.commit.html_url);
          console.log(`✅ Arquivo deletado: ${path}`);
          
        } else {
          console.warn(`⚠️  Tipo de ação não suportado: ${type}`);
        }

        // Delay para evitar rate limit
        await new Promise(r => setTimeout(r, 1000));
        
      } catch (e) {
        const errorMsg = `Erro em ${type} "${path}": ${e.message}`;
        console.error(`❌ ${errorMsg}`);
        errors.push(errorMsg);
      }
    }

    // 4. Montar comentário resumo
    let summaryComment = `## 🤖 Automação Executada\n\n`;
    summaryComment += `${plan.final_comment}\n\n`;
    summaryComment += `---\n\n`;
    
    if (created.length > 0) {
      summaryComment += `### ✅ Arquivos Criados (${created.length})\n`;
      summaryComment += created.map(f => `- \`${f.path}\` ${f.description ? `- ${f.description}` : ''}`).join('\n');
      summaryComment += '\n\n';
    }
    
    if (updated.length > 0) {
      summaryComment += `### 📝 Arquivos Modificados (${updated.length})\n`;
      summaryComment += updated.map(f => `- \`${f.path}\` ${f.description ? `- ${f.description}` : ''}`).join('\n');
      summaryComment += '\n\n';
    }
    
    if (deleted.length > 0) {
      summaryComment += `### 🗑️ Arquivos Deletados (${deleted.length})\n`;
      summaryComment += deleted.map(f => `- \`${f.path}\` ${f.description ? `- ${f.description}` : ''}`).join('\n');
      summaryComment += '\n\n';
    }

    if (commitLinks.length > 0) {
      summaryComment += `### 🔗 Commits\n`;
      summaryComment += commitLinks.map((l, i) => `${i + 1}. ${l}`).join('\n');
      summaryComment += '\n\n';
    }
    
    if (errors.length > 0) {
      summaryComment += `### ⚠️ Erros Encontrados\n`;
      summaryComment += errors.map(e => `- ${e}`).join('\n');
      summaryComment += '\n\n';
    }

    const totalActions = created.length + updated.length + deleted.length;
    summaryComment += `\n_Processado em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}_`;

    // 5. Comentar na issue
    await commentOnIssue(issue.number, summaryComment);
    console.log(`💬 Comentário adicionado à issue #${issue.number}`);

    // 6. Fechar issue se indicado
    if (plan.close_issue && totalActions > 0) {
      await updateIssueState(issue.number, 'closed', plan.state_reason || 'completed');
      console.log(`🔒 Issue #${issue.number} fechada com estado: ${plan.state_reason || 'completed'}`);
    }

    processedIssues.add(issue.id);
    console.log(`✅ Issue #${issue.number} processada com sucesso!`);

  } catch (e) {
    console.error(`❌ Erro ao processar issue #${issue.number}:`, e.message);
    
    try {
      await commentOnIssue(
        issue.number,
        `## ❌ Erro no Processamento\n\nO bot encontrou um erro ao processar esta issue:\n\n\`\`\`\n${e.message}\n\`\`\`\n\nPor favor, verifique a issue e tente novamente.`
      );
    } catch (commentError) {
      console.error(`❌ Não foi possível comentar o erro na issue:`, commentError.message);
    }
  }
}

// ============================================================================
// LOOP PRINCIPAL
// ============================================================================

async function loop() {
  const startTime = Date.now();
  console.log(`\n${'#'.repeat(70)}`);
  console.log(`🔄 Verificação iniciada: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`);
  console.log(`${'#'.repeat(70)}`);
  
  try {
    const issues = await fetchOpenIssues();
    
    if (!issues.length) {
      console.log('✨ Nenhuma issue aberta encontrada.');
      return;
    }
    
    console.log(`📋 ${issues.length} issue(s) aberta(s) encontrada(s)`);
    
    for (const issue of issues) {
      await processIssue(issue);
    }
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n✅ Verificação concluída em ${duration}s`);
    
  } catch (e) {
    console.error('❌ Erro no loop principal:', e.message);
    console.error(e.stack);
  }
}

// ============================================================================
// INICIALIZAÇÃO
// ============================================================================

console.log(`
${'═'.repeat(70)}
🤖 BOT DE AUTOMAÇÃO GITHUB + GEMINI AI
${'═'.repeat(70)}
Repositório: ${CONFIG.REPO_OWNER}/${CONFIG.REPO_NAME}
Branch: ${CONFIG.BRANCH}
Intervalo: ${CONFIG.CHECK_INTERVAL / 1000}s (${CONFIG.CHECK_INTERVAL / 60000} minutos)
Dry Run: ${CONFIG.DRY_RUN ? 'ATIVADO' : 'DESATIVADO'}
${'═'.repeat(70)}
`);

// Primeira execução imediata
await loop();

// Loop recorrente
setInterval(loop, CONFIG.CHECK_INTERVAL);

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n🛑 Recebido sinal de encerramento (SIGTERM)...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n🛑 Recebido sinal de encerramento (SIGINT)...');
  process.exit(0);
});
