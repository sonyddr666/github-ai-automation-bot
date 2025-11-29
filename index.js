import express from 'express';
import fetch from 'node-fetch';
import bodyParser from 'body-parser';
import { GoogleGenerativeAI } from '@google/generative-ai';
import Ajv from 'ajv';
import 'dotenv/config'; // Carrega variáveis do .env localmente

// ------------------------- Config -------------------------
const CONFIG = {
    GITHUB_TOKEN: process.env.GITHUB_TOKEN,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    REPO_OWNER: process.env.REPO_OWNER || 'sonyddr666',
    REPO_NAME: process.env.REPO_NAME || 'teste',
    CHECK_INTERVAL: parseInt(process.env.CHECK_INTERVAL || '300000', 10),
    BRANCH: process.env.BRANCH || 'main',
    DRY_RUN: (process.env.DRY_RUN || 'false') === 'true',
    MAX_ACTIONS: parseInt(process.env.MAX_ACTIONS || '20', 10),
    MAX_FILE_SIZE_BYTES: parseInt(process.env.MAX_FILE_SIZE_BYTES || '200000', 10),
    USE_PULL_REQUEST: (process.env.USE_PULL_REQUEST || 'false') === 'true',
    PORT: parseInt(process.env.PORT || '10000', 10)
};
const REQUIRED = ['GITHUB_TOKEN', 'GEMINI_API_KEY'];
const missing = REQUIRED.filter(k => !CONFIG[k]);
if (missing.length) console.warn('Missing env:', missing.join(', '));

const app = express();
app.use(bodyParser.json());
app.use('/dashboard', express.static('public'));

// ------------------------- State -------------------------
const botState = {
    status: 'Inicializando...',
    lastRun: new Date().toISOString(),
    online: false,
    stats: { created: 0, updated: 0, deleted: 0, errors: 0 },
    logs: []
};
const subscribers = new Set(); // SSE clients
const processedIssues = new Set(); // idempotência por execução
const commitLinks = []; // últimos commits

function nowBR() {
    return new Date().toLocaleTimeString('pt-BR', { hour12: false });
}
function pushLog(emoji, message) {
    console.log(`${emoji} ${message}`);
    botState.logs.unshift({ time: nowBR(), emoji, message });
    while (botState.logs.length > 500) botState.logs.pop();
    broadcast({ type: 'log', time: nowBR(), emoji, message });
}
function tickOnline() {
    botState.lastRun = new Date().toISOString();
    botState.online = true;
    broadcast({ type: 'stats', stats: botState.stats, lastRun: botState.lastRun, online: botState.online });
}
function broadcast(data) {
    const payload = `data: ${JSON.stringify(data)}\n\n`;
    for (const res of subscribers) res.write(payload);
}

// ------------------------- SSE & Endpoints -------------------------
app.get('/events', (req, res) => {
    res.status(200).set({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive'
    });
    res.flushHeaders();
    res.write(`data: ${JSON.stringify({ type: 'stats', stats: botState.stats, lastRun: botState.lastRun, online: botState.online })}\n\n`);
    subscribers.add(res);
    req.on('close', () => subscribers.delete(res));
});

app.get('/meta', (req, res) => {
    res.json({
        repoOwner: CONFIG.REPO_OWNER,
        repoName: CONFIG.REPO_NAME,
        branch: CONFIG.BRANCH,
        aiModel: 'gemini-2.5-flash',
        online: botState.online
    });
});

app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        uptime: process.uptime(),
        lastRun: botState.lastRun,
        stats: botState.stats,
        online: botState.online,
        dryRun: CONFIG.DRY_RUN
    });
});

app.get('/dashboard', (req, res) => {
    res.sendFile(process.cwd() + '/public/dashboard.html');
});

// Opcional: Webhook do GitHub para issues (configure o webhook no repositório)
app.post('/webhook', async (req, res) => {
    const ev = req.headers['x-github-event'];
    if (ev === 'issues' && (req.body.action === 'opened' || req.body.action === 'edited' || req.body.action === 'reopened')) {
        pushLog('📬', `Webhook recebido: issue #${req.body.issue.number} ${req.body.action}`);
        processSingleIssue(req.body.issue).catch(e => pushLog('❌', `Erro webhook: ${e.message}`));
    }
    res.status(200).end();
});

// ------------------------- Helpers: HTTP com retry -------------------------
async function httpJson(url, opts = {}, retries = 3, backoffMs = 800) {
    for (let attempt = 0; attempt <= retries; attempt++) {
        const res = await fetch(url, opts);
        if (res.ok) return res.json();
        const txt = await res.text();
        if (attempt === retries || ![429, 500, 502, 503, 504].includes(res.status)) {
            throw new Error(`HTTP ${res.status} ${res.statusText} - ${txt.slice(0, 250)}`);
        }
        await new Promise(r => setTimeout(r, backoffMs * (attempt + 1)));
    }
}

const ghHeaders = {
    Authorization: `Bearer ${CONFIG.GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
};

// ------------------------- GitHub APIs -------------------------
async function listOpenIssues() {
    const url = `https://api.github.com/repos/${CONFIG.REPO_OWNER}/${CONFIG.REPO_NAME}/issues?state=open&per_page=50`;
    const data = await httpJson(url, { headers: ghHeaders });
    return data.filter(i => !i.pull_request);
}
async function listIssueComments(number) {
    const url = `https://api.github.com/repos/${CONFIG.REPO_OWNER}/${CONFIG.REPO_NAME}/issues/${number}/comments?per_page=50`;
    return httpJson(url, { headers: ghHeaders }).catch(() => []);
}
async function getFile(path) {
    const url = `https://api.github.com/repos/${CONFIG.REPO_OWNER}/${CONFIG.REPO_NAME}/contents/${encodeURIComponent(path)}?ref=${CONFIG.BRANCH}`;
    const res = await fetch(url, { headers: ghHeaders });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Get file ${path}: ${res.statusText}`);
    const data = await res.json();
    const content = data.content ? Buffer.from(data.content, 'base64').toString('utf-8') : '';
    return { content, sha: data.sha };
}
async function putFile(path, content, message, sha = null) {
    const url = `https://api.github.com/repos/${CONFIG.REPO_OWNER}/${CONFIG.REPO_NAME}/contents/${encodeURIComponent(path)}`;
    const body = { message, content: Buffer.from(content).toString('base64'), branch: CONFIG.BRANCH };
    if (sha) body.sha = sha;
    const data = await httpJson(url, { method: 'PUT', headers: { ...ghHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (data && data.commit && data.commit.html_url) commitLinks.unshift(data.commit.html_url);
    return data;
}
async function deleteFile(path, message) {
    const f = await getFile(path);
    if (!f?.sha) throw new Error(`Arquivo não encontrado: ${path}`);
    const url = `https://api.github.com/repos/${CONFIG.REPO_OWNER}/${CONFIG.REPO_NAME}/contents/${encodeURIComponent(path)}`;
    const body = { message, sha: f.sha, branch: CONFIG.BRANCH };
    const data = await httpJson(url, { method: 'DELETE', headers: { ...ghHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (data && data.commit && data.commit.html_url) commitLinks.unshift(data.commit.html_url);
    return data;
}
async function createBranchIfNeeded(branch) {
    const base = CONFIG.BRANCH;
    if (branch === base) return;
    // pega SHA do base
    const refBase = await httpJson(`https://api.github.com/repos/${CONFIG.REPO_OWNER}/${CONFIG.REPO_NAME}/git/ref/heads/${base}`, { headers: ghHeaders });
    // tenta criar ref
    await httpJson(
        `https://api.github.com/repos/${CONFIG.REPO_OWNER}/${CONFIG.REPO_NAME}/git/refs`,
        { method: 'POST', headers: { ...ghHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: refBase.object.sha }) }
    ).catch(() => { }); // se já existir, ok
}
async function openPullRequest(headBranch, title, body) {
    const url = `https://api.github.com/repos/${CONFIG.REPO_OWNER}/${CONFIG.REPO_NAME}/pulls`;
    return httpJson(url, {
        method: 'POST',
        headers: { ...ghHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, body, head: headBranch, base: CONFIG.BRANCH })
    });
}
async function commentOnIssue(number, body) {
    const url = `https://api.github.com/repos/${CONFIG.REPO_OWNER}/${CONFIG.REPO_NAME}/issues/${number}/comments`;
    await httpJson(url, { method: 'POST', headers: { ...ghHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ body }) });
}
async function closeIssue(number, reason = 'completed') {
    const url = `https://api.github.com/repos/${CONFIG.REPO_OWNER}/${CONFIG.REPO_NAME}/issues/${number}`;
    await httpJson(url, { method: 'PATCH', headers: { ...ghHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ state: 'closed', state_reason: reason }) });
}

// ------------------------- AI (Gemini) -------------------------
const SYSTEM_PROMPT = (owner, repo) => `
Você é um agente de automação GitHub para o repositório ${owner}/${repo}.
Regras:
- Leia TÍTULO, DESCRIÇÃO e COMENTÁRIOS.
- Para update_file, sempre forneça o CONTEÚDO COMPLETO resultante (não diff).
- Responda apenas JSON válido no schema abaixo.
Schema:
{
  "issue_number": number,
  "tasks_summary": string[],
  "actions": [
    {
      "type": "create_file" | "update_file" | "delete_file",
      "path": "string",
      "content": "string (obrigatório p/ create/update)",
      "description": "string"
    }
  ],
  "final_comment": "string (markdown)",
  "close_issue": boolean,
  "state_reason": "completed" | "not_planned"
}
Limites:
- No máximo 20 ações.
- Evite tocar fora do projeto (paths relativos sob o repo).
- Para HTML/CSS/JS, gere arquivos funcionais e autocontidos quando possível.
`;

const genAI = new GoogleGenerativeAI(CONFIG.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash', systemInstruction: SYSTEM_PROMPT(CONFIG.REPO_OWNER, CONFIG.REPO_NAME) });

// ------------------------- Validation -------------------------
const planSchema = {
    type: 'object',
    required: ['issue_number', 'tasks_summary', 'actions', 'final_comment', 'close_issue', 'state_reason'],
    properties: {
        issue_number: { type: 'number' },
        tasks_summary: { type: 'array', items: { type: 'string' }, maxItems: CONFIG.MAX_ACTIONS },
        actions: {
            type: 'array',
            maxItems: CONFIG.MAX_ACTIONS,
            items: {
                type: 'object',
                required: ['type', 'path'],
                properties: {
                    type: { type: 'string', enum: ['create_file', 'update_file', 'delete_file'] },
                    path: { type: 'string', minLength: 1 },
                    content: { type: 'string' },
                    description: { type: 'string' }
                }
            }
        },
        final_comment: { type: 'string' },
        close_issue: { type: 'boolean' },
        state_reason: { type: 'string', enum: ['completed', 'not_planned'] }
    }
};
const ajv = new Ajv({ allErrors: true, strict: false });
const validatePlan = ajv.compile(planSchema);

function safePath(p) {
    // bloqueia diretórios pai e caminhos absolutos
    return p && !p.includes('..') && !p.startsWith('/') && !p.startsWith('\\');
}

// ------------------------- Contexto Inteligente -------------------------
function extractMentionedFiles(text) {
    const fileRegex = /([\w\-./]+?\.(html|css|js|json|md|txt|py|java|cpp|c|h|php|rb|go|rs|ts|jsx|tsx|vue|xml|yaml|yml))/gi;
    return Array.from(new Set((text.match(fileRegex) || [])));
}
async function buildIssueContext(issue, comments) {
    const body = issue.body || '';
    const ctext = (comments || []).map(c => `${c.user?.login || 'user'}: ${c.body}`).join('\n');
    const mentioned = extractMentionedFiles(`${issue.title}\n${body}\n${ctext}`).slice(0, 15);
    let context = `ISSUE #${issue.number}\nTÍTULO: ${issue.title}\nDESCRIÇÃO:\n${body}\n\nCOMENTÁRIOS:\n${ctext}\n`;

    if (mentioned.length) {
        context += `\nARQUIVOS MENCIONADOS (${mentioned.length}):\n`;
        for (const path of mentioned) {
            const f = await getFile(path).catch(() => null);
            if (f?.content) {
                const truncated = f.content.slice(0, CONFIG.MAX_FILE_SIZE_BYTES);
                context += `\n--- INÍCIO ${path} ---\n${truncated}\n--- FIM ${path} ---\n`;
            }
        }
    }
    return context;
}
function parseJsonResponse(txt) {
    try {
        const fenced = txt.match(/```json([\s\S]*?)```/i);
        const raw = fenced ? fenced[1] : txt;
        return JSON.parse(raw);
    } catch { return null; }
}

// ------------------------- Execução de Plano -------------------------
async function executePlan(plan, issue) {
    const results = [];
    let headBranch = CONFIG.BRANCH;

    if (CONFIG.USE_PULL_REQUEST) {
        headBranch = `ai-bot/issue-${issue.number}-${Date.now()}`;
        await createBranchIfNeeded(headBranch);
    }

    for (const action of plan.actions || []) {
        if (!safePath(action.path)) {
            pushLog('⛔', `Path inseguro ignorado: ${action.path}`);
            continue;
        }
        if (['create_file', 'update_file'].includes(action.type)) {
            if (!action.content) {
                pushLog('⚠️', `Sem conteúdo para ${action.type} em ${action.path}, ignorando`);
                continue;
            }
            if (Buffer.byteLength(action.content, 'utf8') > CONFIG.MAX_FILE_SIZE_BYTES) {
                pushLog('⚠️', `Arquivo grande demais (${action.path}), ignorando`);
                continue;
            }
        }

        try {
            if (CONFIG.DRY_RUN) {
                results.push(`(DRY_RUN) ${action.type} ${action.path}`);
                continue;
            }
            const msg = `🤖 ${action.type} ${action.path} via issue #${issue.number}`;
            if (action.type === 'create_file') {
                const exists = await getFile(action.path);
                await putFile(action.path, action.content, exists ? `Update ${action.path} (existia) - ${msg}` : `Create ${action.path} - ${msg}`, exists?.sha || null);
                results.push(`Criado: \`${action.path}\``);
                botState.stats.created++;
            } else if (action.type === 'update_file') {
                const exists = await getFile(action.path);
                await putFile(action.path, action.content, `Update ${action.path} - ${msg}`, exists?.sha || null);
                results.push(`Editado: \`${action.path}\``);
                botState.stats.updated++;
            } else if (action.type === 'delete_file') {
                await deleteFile(action.path, `Delete ${action.path} - ${msg}`);
                results.push(`Deletado: \`${action.path}\``);
                botState.stats.deleted++;
            }
            tickOnline();
            await new Promise(r => setTimeout(r, 1000)); // rate limit friendly
        } catch (e) {
            botState.stats.errors++;
            results.push(`Erro em ${action.type} ${action.path}: ${e.message}`);
            pushLog('❌', `Falha ${action.type} ${action.path}: ${e.message}`);
        }
    }

    let prUrl = '';
    if (CONFIG.USE_PULL_REQUEST && !CONFIG.DRY_RUN) {
        try {
            const pr = await openPullRequest(headBranch, `🤖 Changes for #${issue.number}`, `Automação executada para a issue #${issue.number}.`);
            prUrl = pr.html_url || '';
            results.push(`PR aberto: ${prUrl}`);
        } catch (e) {
            pushLog('⚠️', `Não foi possível abrir PR: ${e.message}`);
        }
    }

    return { results, prUrl, commits: commitLinks.slice(0, 5) };
}

// ------------------------- Pipeline por Issue -------------------------
async function processSingleIssue(issue) {
    const uniqueKey = `${issue.id}`;
    if (processedIssues.has(uniqueKey)) return;
    processedIssues.add(uniqueKey);

    pushLog('📝', `Processando issue #${issue.number}: ${issue.title}`);
    botState.status = `Issue #${issue.number}`;
    tickOnline();

    try {
        const comments = await listIssueComments(issue.number);
        const context = await buildIssueContext(issue, comments);

        const prompt = `${context}\n\nGere o JSON do plano de ação conforme o schema.`;
        const ai = await model.generateContent(prompt);
        const text = ai.response.text();
        const plan = parseJsonResponse(text);
        if (!plan || !validatePlan(plan)) {
            const errMsg = ajv.errorsText(validatePlan.errors || []);
            throw new Error(`Plano inválido: ${errMsg || 'JSON parse error'}`);
        }

        // hard cap de ações
        if ((plan.actions || []).length > CONFIG.MAX_ACTIONS) {
            plan.actions = plan.actions.slice(0, CONFIG.MAX_ACTIONS);
            pushLog('⚠️', `Ações truncadas para ${CONFIG.MAX_ACTIONS}`);
        }

        pushLog('🤖', `Plano: ${(plan.tasks_summary || []).join('; ') || 'sem resumo'}`);
        const { results, prUrl, commits } = await executePlan(plan, issue);

        if (!CONFIG.DRY_RUN) {
            const summary = [
                '## 🤖 Automação Executada',
                '',
                plan.final_comment || '',
                '',
                '### Ações',
                ...results.map(r => `- ${r}`),
                '',
                commits.length ? '### Commits' : '',
                ...commits.map((c, i) => `${i + 1}. ${c}`),
                prUrl ? `\n🔗 PR: ${prUrl}` : ''
            ].join('\n');

            await commentOnIssue(issue.number, summary);
            if (plan.close_issue) {
                await closeIssue(issue.number, plan.state_reason || 'completed');
                pushLog('🔒', `Issue #${issue.number} fechada (${plan.state_reason || 'completed'})`);
            }
        } else {
            pushLog('🛑', `DRY_RUN ativo: nenhuma alteração realizada na issue #${issue.number}`);
        }
    } catch (e) {
        botState.stats.errors++;
        pushLog('💥', `Erro na issue #${issue.number}: ${e.message}`);
        if (!CONFIG.DRY_RUN) {
            await commentOnIssue(issue.number, `⚠️ Falha ao processar: ${e.message}`);
        }
    } finally {
        tickOnline();
    }
}

async function mainLoop() {
    try {
        pushLog('🔄', 'Verificando issues abertas...');
        const issues = await listOpenIssues();
        if (!issues.length) {
            pushLog('💤', 'Sem issues abertas.');
            tickOnline();
            return;
        }
        pushLog('📋', `Encontradas ${issues.length} issue(s).`);
        for (const issue of issues) {
            await processSingleIssue(issue);
        }
    } catch (e) {
        botState.stats.errors++;
        pushLog('💣', `Erro no loop: ${e.message}`);
    } finally {
        tickOnline();
    }
}

// ------------------------- Boot -------------------------
app.listen(CONFIG.PORT, () => {
    pushLog('🚀', `Servidor iniciado na porta ${CONFIG.PORT} — Repo ${CONFIG.REPO_OWNER}/${CONFIG.REPO_NAME} (branch ${CONFIG.BRANCH})`);
    botState.status = 'Rodando';
    tickOnline();
    // start loop
    mainLoop();
    setInterval(mainLoop, CONFIG.CHECK_INTERVAL);
});
