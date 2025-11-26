import fetch from 'node-fetch';
import express from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';

// ============================================================================
// CONFIGURAÇÃO
// ============================================================================
const app = express();
const PORT = process.env.PORT || 3000;

const CONFIG = {
  GITHUB_TOKEN: process.env.GITHUB_TOKEN,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  REPO_OWNER: 'sonyddr666',
  REPO_NAME: 'teste',
  CHECK_INTERVAL: parseInt(process.env.CHECK_INTERVAL || '300000', 10), // 5 min
  BRANCH: process.env.BRANCH || 'main',
  DRY_RUN: process.env.DRY_RUN === 'true'
};

// Validação
const required = ['GITHUB_TOKEN', 'GEMINI_API_KEY'];
const missing = required.filter(k => !CONFIG[k]);

// ============================================================================
// 🧠 MEMÓRIA DO DASHBOARD
// ============================================================================
let botStatus = {
  lastRun: new Date(),
  status: "Iniciando sistema...",
  logs: [],
  active: true,
  stats: { created: 0, updated: 0, deleted: 0, errors: 0 }
};

function addLog(emoji, message) {
  const time = new Date().toLocaleTimeString('pt-BR');
  console.log(`${emoji} ${message}`);
  
  botStatus.logs.unshift({ time, emoji, message });
  if (botStatus.logs.length > 50) botStatus.logs.pop();
  
  botStatus.lastRun = new Date();
  botStatus.status = message;
}

if (missing.length) {
  addLog('❌', `Faltam variáveis: ${missing.join(', ')}`);
}

// ============================================================================
// 🌐 SERVIDOR WEB (DASHBOARD)
// ============================================================================

app.get('/', (req, res) => {
  const timeAgo = Math.floor((new Date() - botStatus.lastRun) / 1000);
  
  const html = `
  <!DOCTYPE html>
  <html lang="pt-BR">
  <head>
    <meta charset="UTF-8">
    <meta http-equiv="refresh" content="30">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🤖 Bot Dashboard</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { background: linear-gradient(135deg, #0d1117 0%, #161b22 100%); color: #c9d1d9; font-family: 'Segoe UI', system-ui, sans-serif; padding: 20px; min-height: 100vh; }
      .container { max-width: 900px; margin: 0 auto; }
      .card { background: #161b22; border: 1px solid #30363d; border-radius: 12px; padding: 24px; margin-bottom: 20px; box-shadow: 0 8px 24px rgba(0,0,0,0.4); }
      .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #30363d; padding-bottom: 16px; margin-bottom: 20px; }
      h1 { margin: 0; font-size: 26px; color: #58a6ff; display: flex; align-items: center; gap: 10px; }
      .status-badge { background: linear-gradient(135deg, #238636 0%, #2ea043 100%); color: white; padding: 6px 16px; border-radius: 20px; font-size: 11px; font-weight: bold; letter-spacing: 1.5px; box-shadow: 0 2px 8px rgba(35,134,54,0.3); }
      .info-row { display: flex; justify-content: space-between; margin-bottom: 12px; font-size: 14px; padding: 8px 0; }
      .label { color: #8b949e; font-weight: 500; }
      .value { color: #fff; font-weight: bold; }
      .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 12px; margin-top: 20px; }
      .stat-box { background: #0d1117; border: 1px solid #30363d; border-radius: 8px; padding: 16px; text-align: center; }
      .stat-number { font-size: 28px; font-weight: bold; color: #58a6ff; }
      .stat-label { font-size: 12px; color: #8b949e; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.5px; }
      .log-item { display: flex; padding: 10px 0; border-bottom: 1px solid #21262d; font-size: 13px; align-items: center; }
      .log-time { color: #8b949e; min-width: 85px; font-family: 'Courier New', monospace; font-size: 12px; }
      .log-msg { margin-left: 12px; line-height: 1.5; }
      .repo-link { color: #58a6ff; text-decoration: none; font-weight: 500; transition: color 0.2s; }
      .repo-link:hover { color: #79c0ff; }
      h3 { color: #c9d1d9; font-size: 18px; margin-bottom: 16px; }
      .footer { text-align: center; color: #484f58; font-size: 11px; margin-top: 30px; padding: 20px 0; border-top: 1px solid #21262d; }
      .pulse { animation: pulse 2s infinite; }
      @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="card">
        <div class="header">
          <h1><span class="pulse">🤖</span> GitHub AI Automation</h1>
          <span class="status-badge">ONLINE</span>
        </div>
        <div class="info-row">
          <span class="label">Status Atual:</span>
          <span class="value" style="color: #79c0ff">${botStatus.status}</span>
        </div>
        <div class="info-row">
          <span class="label">Última Atividade:</span>
          <span class="value">${timeAgo}s atrás</span>
        </div>
        <div class="info-row">
          <span class="label">Repositório:</span>
          <a href="https://github.com/${CONFIG.REPO_OWNER}/${CONFIG.REPO_NAME}" class="repo-link" target="_blank">${CONFIG.REPO_OWNER}/${CONFIG.REPO_NAME}</a>
        </div>
        <div class="info-row">
          <span class="label">Modelo AI:</span>
          <span class="value" style="color: #22c55e">Gemini 2.5 Flash ⚡</span>
        </div>
        
        <div class="stats-grid">
          <div class="stat-box">
            <div class="stat-number" style="color: #2ea043">${botStatus.stats.created}</div>
            <div class="stat-label">Criados</div>
          </div>
          <div class="stat-box">
            <div class="stat-number" style="color: #58a6ff">${botStatus.stats.updated}</div>
            <div class="stat-label">Editados</div>
          </div>
          <div class="stat-box">
            <div class="stat-number" style="color: #f85149">${botStatus.stats.deleted}</div>
            <div class="stat-label">Deletados</div>
          </div>
          <div class="stat-box">
            <div class="stat-number" style="color: #d29922">${botStatus.stats.errors}</div>
            <div class="stat-label">Erros</div>
          </div>
        </div>
      </div>

      <h3>📜 Log de Atividades</h3>
      <div class="card">
        ${botStatus.logs.map(log => `
          <div class="log-item">
            <div class="log-time">${log.time}</div>
            <div class="log-msg">${log.emoji} ${log.message}</div>
          </div>
        `).join('')}
        ${botStatus.logs.length === 0 ? '<div style="padding:20px; color:#8b949e; text-align:center">Aguardando primeira execução...</div>' : ''}
      </div>
      
      <div class="footer">
        Atualiza automaticamente a cada 30s • Powered by Gemini 2.5 Flash
      </div>
    </div>
  </body>
  </html>
  `;
  res.send(html);
});

app.get('/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

// ============================================================================
// 🧠 SETUP GEMINI & AI
// ============================================================================

const SYSTEM_PROMPT = `Você é um agente de automação GitHub para o repositório ${CONFIG.REPO_OWNER}/${CONFIG.REPO_NAME}.
REGRAS:
- Leia TÍTULO, DESCRIÇÃO e COMENTÁRIOS da issue.
- Identifique tarefas (criar, modificar, deletar arquivos).
- NÃO peça confirmação.
- RESPONDA APENAS JSON VÁLIDO neste schema:
{
  "issue_number": <numero>,
  "tasks_summary": ["resumo1"],
  "actions": [
    {
      "type": "create_file" | "update_file" | "delete_file",
      "path": "caminho/arquivo.ext",
      "content": "CONTEUDO COMPLETO (obrigatório para create/update)",
      "description": "descricao"
    }
  ],
  "final_comment": "Markdown do que foi feito",
  "close_issue": true,
  "state_reason": "completed"
}
Para HTML/CSS/JS, gere código completo e funcional.`;

let model;
try {
  const genAI = new GoogleGenerativeAI(CONFIG.GEMINI_API_KEY);
  model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: SYSTEM_PROMPT
  });
  addLog('🧠', 'Gemini 2.5 Flash carregado com sucesso');
} catch (e) {
  addLog('❌', 'Erro ao iniciar Gemini: ' + e.message);
}

const processedIssues = new Set();

// ============================================================================
// ⚙️ FUNÇÕES GITHUB
// ============================================================================

async function fetchOpenIssues() {
  const url = `https://api.github.com/repos/${CONFIG.REPO_OWNER}/${CONFIG.REPO_NAME}/issues?state=open`;
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${CONFIG.GITHUB_TOKEN}`, 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }
  });
  if (!res.ok) throw new Error(`Github Issues Error: ${res.status}`);
  const data = await res.json();
  return data.filter(i => !i.pull_request);
}

async function fetchIssueComments(number) {
  const url = `https://api.github.com/repos/${CONFIG.REPO_OWNER}/${CONFIG.REPO_NAME}/issues/${number}/comments`;
  const res = await fetch(url, { headers: { 'Authorization': `Bearer ${CONFIG.GITHUB_TOKEN}`, 'Accept': 'application/vnd.github+json' } });
  return res.ok ? res.json() : [];
}

async function getFileSha(path) {
  const url = `https://api.github.com/repos/${CONFIG.REPO_OWNER}/${CONFIG.REPO_NAME}/contents/${encodeURIComponent(path)}?ref=${CONFIG.BRANCH}`;
  const res = await fetch(url, { headers: { 'Authorization': `Bearer ${CONFIG.GITHUB_TOKEN}` } });
  if (!res.ok) return null;
  const data = await res.json();
  return data.sha;
}

async function putFile(path, content, message, sha = null) {
  const url = `https://api.github.com/repos/${CONFIG.REPO_OWNER}/${CONFIG.REPO_NAME}/contents/${encodeURIComponent(path)}`;
  const body = { message, content: Buffer.from(content).toString('base64'), branch: CONFIG.BRANCH };
  if (sha) body.sha = sha;
  
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${CONFIG.GITHUB_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`Erro PUT ${path}: ${res.statusText}`);
  return res.json();
}

async function deleteFile(path, message) {
  const sha = await getFileSha(path);
  if (!sha) throw new Error(`Arquivo não existe: ${path}`);
  
  const url = `https://api.github.com/repos/${CONFIG.REPO_OWNER}/${CONFIG.REPO_NAME}/contents/${encodeURIComponent(path)}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${CONFIG.GITHUB_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, sha, branch: CONFIG.BRANCH })
  });
  return res.json();
}

async function commentOnIssue(number, body) {
  const url = `https://api.github.com/repos/${CONFIG.REPO_OWNER}/${CONFIG.REPO_NAME}/issues/${number}/comments`;
  await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${CONFIG.GITHUB_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ body })
  });
}

async function updateIssueState(number, state, reason) {
  const url = `https://api.github.com/repos/${CONFIG.REPO_OWNER}/${CONFIG.REPO_NAME}/issues/${number}`;
  await fetch(url, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${CONFIG.GITHUB_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ state, state_reason: reason })
  });
}

// ============================================================================
// 🤖 LÓGICA PRINCIPAL
// ============================================================================

function extractJson(text) {
  try {
    const match = text.match(/```json([\s\S]*?)```/i);
    return JSON.parse(match ? match[1] : text);
  } catch (e) { return null; }
}

async function processIssue(issue) {
  if (processedIssues.has(issue.id)) return;

  addLog('📝', `Analisando Issue #${issue.number}: "${issue.title}"`);
  
  try {
    const comments = await fetchIssueComments(issue.number);
    const commentsText = comments.map(c => `${c.user.login}: ${c.body}`).join('\n');
    
    const prompt = `ISSUE #${issue.number}\nTítulo: ${issue.title}\nDesc: ${issue.body}\nComentários:\n${commentsText}\n\nGere o JSON de ação.`;
    
    const result = await model.generateContent(prompt);
    const plan = extractJson(result.response.text());
    
    if (!plan) throw new Error("Gemini não retornou JSON válido.");
    addLog('🧠', `Plano gerado: ${plan.tasks_summary.join(', ')}`);

    if (CONFIG.DRY_RUN) {
      addLog('🛑', 'DRY RUN: Ações simuladas (nada executado).');
      processedIssues.add(issue.id);
      return;
    }

    let logs = [];
    for (const action of plan.actions || []) {
      if (action.type === 'create_file') {
        await putFile(action.path, action.content, `Criar ${action.path} #${issue.number}`);
        logs.push(`- Criado: \`${action.path}\``);
        addLog('✅', `Arquivo criado: ${action.path}`);
        botStatus.stats.created++;
      } else if (action.type === 'update_file') {
        const sha = await getFileSha(action.path);
        await putFile(action.path, action.content, `Update ${action.path} #${issue.number}`, sha);
        logs.push(`- Editado: \`${action.path}\``);
        addLog('✏️', `Arquivo atualizado: ${action.path}`);
        botStatus.stats.updated++;
      } else if (action.type === 'delete_file') {
        await deleteFile(action.path, `Delete ${action.path} #${issue.number}`);
        logs.push(`- Deletado: \`${action.path}\``);
        addLog('🗑️', `Arquivo deletado: ${action.path}`);
        botStatus.stats.deleted++;
      }
    }

    const finalBody = `## 🤖 Automação Concluída\n\n${plan.final_comment}\n\n### Ações:\n${logs.join('\n')}`;
    await commentOnIssue(issue.number, finalBody);
    
    if (plan.close_issue) {
      await updateIssueState(issue.number, 'closed', 'completed');
      addLog('🔒', `Issue #${issue.number} fechada.`);
    }
    
    processedIssues.add(issue.id);
    
  } catch (e) {
    addLog('❌', `Erro na issue #${issue.number}: ${e.message}`);
    botStatus.stats.errors++;
    await commentOnIssue(issue.number, `⚠️ Erro no processamento: ${e.message}`);
  }
}

async function loop() {
  try {
    addLog('🔄', 'Buscando issues abertas...');
    const issues = await fetchOpenIssues();
    
    if (issues.length === 0) {
      addLog('💤', 'Nenhuma issue pendente.');
    } else {
      addLog('📋', `Encontradas ${issues.length} issue(s).`);
      for (const issue of issues) await processIssue(issue);
    }
  } catch (e) {
    addLog('💥', `Erro no loop: ${e.message}`);
    botStatus.stats.errors++;
  }
}

// ============================================================================
// 🚀 STARTUP
// ============================================================================

app.listen(PORT, () => {
  console.log(`Web server rodando na porta ${PORT}`);
  addLog('🚀', `Sistema iniciado no repositório ${CONFIG.REPO_OWNER}/${CONFIG.REPO_NAME}`);
  
  loop();
  setInterval(loop, CONFIG.CHECK_INTERVAL);
});