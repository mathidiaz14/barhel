// Barhel Web Client (Vanilla JS - Rich Interactive UI & Command Palette)

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const state = {
  currentSessionId: null,
  ws: null,
  connected: false,
  providers: [],
  authStatus: {},
  currentLogin: null,
  commands: [],
  selectedPaletteIndex: 0,
  activePaletteCategory: 'all',
  filteredCommands: [],
  skills: [],
  workersRecords: [],
  autonomous: false,
  planOnly: false,
  thinking: true,
  promptHistory: [],
  historyIndex: -1,
  tempPrompt: '',
};

// Default fallback commands if API is not loaded yet
const DEFAULT_COMMANDS = [
  { name: '/fix', desc: 'Analiza el código y corrige errores o bugs automáticamente', category: 'agent', categoryLabel: 'Agente', icon: '⚡', placeholder: 'descripción del error (opcional)' },
  { name: '/explain', desc: 'Explica en detalle un archivo, clase, función o símbolo', category: 'agent', categoryLabel: 'Agente', icon: '💡', placeholder: 'símbolo o archivo a explicar', requiresArg: true },
  { name: '/think', desc: 'Alterna entre razonamiento extendido y compacto (+ Thought)', category: 'agent', categoryLabel: 'Agente', icon: '🧠', aliases: ['/thinking'] },
  { name: '/auto', desc: 'Alterna entre modo Autónomo (sin confirmaciones) y Seguro', category: 'agent', categoryLabel: 'Agente', icon: '🤖' },
  { name: '/plan', desc: 'Alterna modo PLAN (simula cambios sin escribir en disco)', category: 'agent', categoryLabel: 'Agente', icon: '📋' },
  { name: '/test', desc: 'Ejecuta o genera pruebas unitarias automatizadas del proyecto', category: 'tools', categoryLabel: 'Testing & Tools', icon: '🧪', placeholder: 'archivo o filtro (opcional)' },
  { name: '/graph', desc: 'Mapa de arquitectura AST y búsqueda de símbolos en memoria', category: 'architecture', categoryLabel: 'Arquitectura', icon: '🌿', aliases: ['/codegraph'], placeholder: 'símbolo o consulta (opcional)' },
  { name: '/skills', desc: 'Lista todas las skills instaladas estilo Claude Code', category: 'tools', categoryLabel: 'Testing & Tools', icon: '✨' },
  { name: '/skill', desc: 'Inspecciona una skill o instala desde URL (/skill install <url>)', category: 'tools', categoryLabel: 'Testing & Tools', icon: '📦', placeholder: 'install <url> o <nombre-skill>', requiresArg: true },
  { name: '/progress', desc: 'Supervisión en vivo, estado de tareas y avance (%) de agentes', category: 'agent', categoryLabel: 'Agente', icon: '📊', aliases: ['/supervise'] },
  { name: '/workers', desc: 'Inspector de análisis y respuestas de agentes secundarios', category: 'agent', categoryLabel: 'Agente', icon: '👥', aliases: ['/analysis', '/inspect'] },
  { name: '/leader', desc: 'Cambia el modelo líder rápidamente (ej: deepseek, chatgpt)', category: 'settings', categoryLabel: 'Configuración', icon: '👑', placeholder: 'nombre del modelo', requiresArg: true },
  { name: '/config', desc: 'Configura modelos Líder y Workers de soporte', category: 'settings', categoryLabel: 'Configuración', icon: '⚙️', aliases: ['/models'] },
  { name: '/commit', desc: 'Realiza un commit git con todos los cambios del workspace', category: 'git', categoryLabel: 'Git', icon: '🐙', placeholder: 'mensaje del commit (opcional)' },
  { name: '/review', desc: 'Muestra git status y el diff detallado del workspace', category: 'git', categoryLabel: 'Git', icon: '🔍' },
  { name: '/new', desc: 'Inicia una nueva sesión limpia con chat nuevo en el LLM', category: 'session', categoryLabel: 'Sesión', icon: '➕', placeholder: 'título de la sesión (opcional)' },
  { name: '/title', desc: 'Cambia el título descriptivo de la sesión activa', category: 'session', categoryLabel: 'Sesión', icon: '🏷️', placeholder: 'nuevo título para la sesión', requiresArg: true },
  { name: '/sessions', desc: 'Lista el historial completo de sesiones guardadas', category: 'session', categoryLabel: 'Sesión', icon: '📜', aliases: ['/list'] },
  { name: '/summarize', desc: 'Genera y muestra el resumen de memoria de la sesión', category: 'session', categoryLabel: 'Sesión', icon: '📝' },
  { name: '/export', desc: 'Exporta la sesión actual a formato Markdown o JSON', category: 'session', categoryLabel: 'Sesión', icon: '💾', placeholder: 'md o json' },
  { name: '/backup', desc: 'Exporta copia de seguridad (.tar.gz) de sesiones e historial', category: 'session', categoryLabel: 'Sesión', icon: '🗄️', placeholder: 'ruta de archivo (opcional)' },
  { name: '/restore', desc: 'Importa sesiones e historial desde un archivo .tar.gz', category: 'session', categoryLabel: 'Sesión', icon: '📥', placeholder: 'ruta del archivo .tar.gz', requiresArg: true },
  { name: '/doctor', desc: 'Diagnóstico profundo de autenticación, Cloudflare y selectores', category: 'diagnosis', categoryLabel: 'Diagnóstico', icon: '🩺', placeholder: 'proveedor (opcional)' },
  { name: '/status', desc: 'Muestra el estado de autenticación y conexión de proveedores', category: 'diagnosis', categoryLabel: 'Diagnóstico', icon: '🔑' },
  { name: '/login', desc: 'Inicia sesión en la interfaz web de un proveedor', category: 'diagnosis', categoryLabel: 'Diagnóstico', icon: '🌐', placeholder: 'proveedor (ej: deepseek, chatgpt)' },
  { name: '/import-sessions', desc: 'Importa sesiones locales de Chrome/Edge a los perfiles de Barhel', category: 'diagnosis', categoryLabel: 'Diagnóstico', icon: '🔄', aliases: ['/import'] },
  { name: '/clear-sessions', desc: 'Borra cookies y sesiones almacenadas de los proveedores', category: 'diagnosis', categoryLabel: 'Diagnóstico', icon: '🗑️', placeholder: 'proveedor o all' },
  { name: '/telegram', desc: 'Configura o inicia el bot de Telegram en segundo plano', category: 'tools', categoryLabel: 'Testing & Tools', icon: '✈️', placeholder: 'token de Telegram (opcional)' },
  { name: '/daemon', desc: 'Inicia, detiene o revisa el estado del daemon (start/stop/status)', category: 'tools', categoryLabel: 'Testing & Tools', icon: '👾', placeholder: 'start | stop | status' },
  { name: '/clear', desc: 'Limpia los mensajes visuales en la pantalla del chat', category: 'tools', categoryLabel: 'Testing & Tools', icon: '🧹' },
  { name: '/help', desc: 'Muestra la guía completa de comandos y ayuda', category: 'tools', categoryLabel: 'Testing & Tools', icon: '❓' },
];

state.commands = [...DEFAULT_COMMANDS];

// ─────── API Helpers ───────
async function api(path, opts = {}) {
  try {
    const res = await fetch(path, {
      headers: { 'Content-Type': 'application/json' },
      ...opts,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  } catch (err) {
    return { status: 500, data: { ok: false, error: err.message } };
  }
}

// ─────── Navigation & Views ───────
function switchView(view) {
  $$('.nav-item').forEach((n) => n.classList.toggle('active', n.dataset.view === view));
  $$('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${view}`));
  if (view === 'sessions') loadSessions();
  if (view === 'skills') loadSkills();
  if (view === 'doctor') loadDoctor();
  if (view === 'workers') loadWorkers();
  if (view === 'auth') loadAuth();
  if (view === 'settings') loadSettings();
}

// ─────── WebSocket & Real-Time Events ───────
function connectWs() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${proto}//${location.host}/ws`);
  state.ws = ws;
  setConnStatus('Conectando...', 'offline');

  ws.onopen = () => {
    state.connected = true;
    setConnStatus('En línea', 'online');
  };

  ws.onclose = () => {
    state.connected = false;
    setConnStatus('Reconectando...', 'offline');
    setTimeout(connectWs, 2500);
  };

  ws.onerror = () => ws.close();

  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      handleEvent(msg);
    } catch {}
  };
}

function setConnStatus(text, cls) {
  const pill = $('#conn-status');
  const txt = $('#conn-status-text');
  if (txt) txt.textContent = text;
  if (pill) {
    pill.className = 'conn-status-pill ' + (cls || '');
  }
}

function handleEvent(msg) {
  if (!msg.sessionId) return;
  if (state.currentSessionId && msg.sessionId !== state.currentSessionId) return;

  const { type, payload } = msg;
  switch (type) {
    case 'stream': renderStream(payload); break;
    case 'thought': renderThought(payload); break;
    case 'action': renderAction(payload); break;
    case 'tool_result': renderToolResult(payload); break;
    case 'diff': renderDiff(payload); break;
    case 'todos': renderTodos(payload.todos); break;
    case 'worker': renderWorker(payload); break;
    case 'finish': renderFinish(payload); break;
    case 'interrupt': renderSystem('warn', '⏹ Turno interrumpido por el usuario'); break;
    case 'error': renderSystem('error', '✖ ' + (payload.message || 'Error en ejecución')); break;
    case 'clear': clearTranscript(); break;
    case 'system':
      if (payload.level === 'thinking') renderThinkingState(payload);
      else renderSystem(payload.level || 'info', payload.message || '');
      break;
    case 'turn_start':
      setRunning(true);
      renderUserTurn(payload.message || payload.summary || '');
      break;
    case 'turn_end':
      setRunning(false);
      refreshSessionMeta();
      break;
    case 'model':
    case 'session_meta':
      if (payload.autonomous !== undefined || payload.planOnly !== undefined || payload.thinking !== undefined) {
        updateModeUI(
          payload.autonomous !== undefined ? payload.autonomous : state.autonomous,
          payload.planOnly !== undefined ? payload.planOnly : state.planOnly,
          payload.thinking !== undefined ? payload.thinking : state.thinking
        );
      }
      refreshSessionMeta();
      break;
    case 'progress':
      renderProgress(payload.snapshot);
      break;
    default: break;
  }
}

// ─────── Transcript Rendering ───────
function addEntry(html, className = '') {
  const t = $('#transcript');
  const div = document.createElement('div');
  div.className = `chat-entry ${className}`.trim();
  div.innerHTML = html;
  t.appendChild(div);
  scrollToBottom();
  return div;
}

function scrollToBottom() {
  const t = $('#transcript');
  t.scrollTop = t.scrollHeight;
}

function clearTranscript() {
  $('#transcript').innerHTML = '<div class="empty-state-box"><div class="es-icon">✦</div><div class="es-title">Chat despejado</div><p class="es-desc">Escribe una instrucción para comenzar o usa / para comandos.</p></div>';
}

function renderUserTurn(prompt) {
  const esc = formatMarkdown(prompt);
  addEntry(`
    <div class="user-header">
      <div class="user-avatar">👤</div>
      <span>TÚ</span>
    </div>
    <div class="user-text">${esc}</div>
  `, 'user');
}

function renderSystem(level, message) {
  const icon = level === 'error' ? '✖' : (level === 'warn' ? '⚠' : (level === 'success' ? '✔' : 'ℹ'));
  addEntry(`<span>${icon} ${escapeHtml(message)}</span>`, `system ${level}`);
}

function renderThinkingState(payload) {
  // Estado compacto
}

let lastStreamText = '';
function renderStream(payload) {
  const preview = payload.preview;
  if (!preview || preview === lastStreamText) return;
  lastStreamText = preview;
  const chars = payload.chars || 0;
  const model = payload.modelName || 'Líder';
  
  let streamEl = $('#current-stream-bubble');
  if (!streamEl) {
    streamEl = addEntry('', 'stream-bubble');
    streamEl.id = 'current-stream-bubble';
  }
  streamEl.innerHTML = `<span style="color:var(--yellow)">✻</span> <strong>${escapeHtml(model)}</strong> analizando (${chars} chars) — <em style="color:var(--text-muted)">${escapeHtml(truncate(preview, 180))}</em>`;
}

function renderThought(payload) {
  const streamEl = $('#current-stream-bubble');
  if (streamEl) streamEl.remove();
  lastStreamText = '';

  if (!payload.thought || !payload.thought.trim()) return;
  const ms = payload.durationMs ? `${payload.durationMs}ms` : '';
  const linesCount = payload.thought.trim().split('\n').length;

  const entry = addEntry(`
    <div class="thought-header">
      <div class="thought-title">
        <span class="thought-icon">🧠</span>
        <span>Thought / Razonamiento</span>
        <span class="thought-time">${ms || `${linesCount} líneas`}</span>
      </div>
      <span class="thought-toggle-icon">▼</span>
    </div>
    <div class="thought-body">${escapeHtml(payload.thought)}</div>
  `, 'thought');

  const header = entry.querySelector('.thought-header');
  const body = entry.querySelector('.thought-body');
  const toggleIcon = entry.querySelector('.thought-toggle-icon');

  header.addEventListener('click', () => {
    body.classList.toggle('collapsed');
    toggleIcon.textContent = body.classList.contains('collapsed') ? '▶' : '▼';
  });
}

function renderAction(payload) {
  const streamEl = $('#current-stream-bubble');
  if (streamEl) streamEl.remove();

  const d = payload.details || {};
  const type = payload.type || '';
  let icon = '⚡';
  let label = type;
  let target = '';

  switch (type) {
    case 'read_file':
      icon = '📖'; label = 'Read'; target = d.path || ''; break;
    case 'write_file':
      icon = '✏️'; label = 'Write'; target = `${d.path || ''} (${(d.content || '').length} bytes)`; break;
    case 'list_directory':
      icon = '📂'; label = 'Glob'; target = `"${d.path || '.'}/**/*"`; break;
    case 'run_command':
      icon = '💻'; label = 'Run'; target = `$ ${d.command || ''}`; break;
    case 'delegate_task':
      icon = '👥'; label = `Delegate [${(d.agent || 'worker').toUpperCase()}]`; target = `"${(d.prompt || '').slice(0, 70)}..."`; break;
    case 'delegate_batch':
      icon = '👥'; label = 'Batch Delegation'; target = `${(d.tasks || []).length} workers`; break;
    case 'grep':
      icon = '🔍'; label = 'Grep'; target = d.pattern || ''; break;
    case 'finish':
      icon = '🎉'; label = 'Finish'; target = 'Tarea finalizada'; break;
    default:
      icon = '⚡'; label = type; target = JSON.stringify(d); break;
  }

  addEntry(`
    <span class="action-icon">${icon}</span>
    <span class="action-label">${escapeHtml(label)}</span>
    <span class="action-target">${escapeHtml(target)}</span>
  `, 'action');
}

function renderToolResult(payload) {
  if (!payload.output || !payload.output.trim()) return;
  const lines = payload.output.trim().split('\n');
  const preview = lines.slice(0, 50).join('\n');
  const isTruncated = lines.length > 50;

  const entry = addEntry(`
    <div class="tool-output-header">
      <span>Terminal / Salida (${lines.length} líneas)</span>
      <button class="btn-copy-code" title="Copiar salida">📋 Copiar</button>
    </div>
    <pre>${escapeHtml(preview + (isTruncated ? `\n... (${lines.length - 50} líneas más)` : ''))}</pre>
  `, 'tool-output');

  const copyBtn = entry.querySelector('.btn-copy-code');
  copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(payload.output);
    showToast('Salida copiada al portapapeles', 'success');
  });
}

function renderDiff(payload) {
  const { path, oldContent, newContent } = payload;
  const isNew = oldContent === null;
  const addedLines = isNew ? (newContent || '').split('\n').length : 0;

  let bodyHtml = '';
  if (isNew) {
    bodyHtml = `<div class="diff-line add">+ [Nuevo Archivo] ${addedLines} líneas creadas</div>`;
  } else {
    const a = (oldContent || '').split('\n');
    const b = (newContent || '').split('\n');
    bodyHtml = generateDiffHtml(a, b, 250);
  }

  addEntry(`
    <div class="diff-header">
      <span>Modificación: <code>${escapeHtml(path)}</code></span>
      <span style="font-size:10px;color:var(--text-muted)">Patch</span>
    </div>
    <div class="diff-body">${bodyHtml}</div>
  `, 'diff');
}

function generateDiffHtml(a, b, limit) {
  let out = '';
  let i = 0, j = 0, count = 0;
  while ((i < a.length || j < b.length) && count < limit) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      out += `<div class="diff-line">${escapeHtml(a[i])}</div>`;
      i++; j++;
    } else if (i < a.length && (j >= b.length || a[i] !== b[j]) &&
               (i + 1 >= a.length || j >= b.length || a[i + 1] === b[j])) {
      out += `<div class="diff-line del">- ${escapeHtml(a[i])}</div>`;
      i++; count++;
    } else if (j < b.length) {
      out += `<div class="diff-line add">+ ${escapeHtml(b[j])}</div>`;
      j++; count++;
    } else {
      out += `<div class="diff-line del">- ${escapeHtml(a[i])}</div>`;
      i++;
    }
  }
  if (i < a.length || j < b.length) {
    out += `<div class="diff-line meta">... diff truncado por longitud</div>`;
  }
  return out;
}

function renderWorker(payload) {
  const name = payload.workerName || 'worker';
  const preview = (payload.fullResponse || '').trim().split('\n').slice(0, 10).join('\n');
  addEntry(`
    <div class="worker-header">
      <span>👥 Worker [${escapeHtml(name.toUpperCase())}]</span>
      <span style="font-size:10px;color:var(--text-muted)">Subtarea completada</span>
    </div>
    <div style="font-size:11.5px;color:var(--text-secondary);margin-top:4px;">"${escapeHtml(payload.subtaskPrompt || '')}"</div>
    <div class="worker-body"><pre>${escapeHtml(preview)}</pre></div>
  `, 'worker');
}

function renderFinish(payload) {
  addEntry(`
    <span style="font-size:18px;">🎉</span>
    <div>
      <div style="font-weight:700;">TAREA COMPLETADA</div>
      <div style="font-size:12.5px;font-weight:400;margin-top:2px;">${escapeHtml(payload.summary || 'El agente ha finalizado todas las operaciones requeridas.')}</div>
    </div>
  `, 'finish');
}

// ─────── Todos & Progress Panels ───────
function renderTodos(todos) {
  if (!todos || !todos.length) {
    $('#todos-body').innerHTML = '<div class="todos-empty">Sin tareas en ejecución.</div>';
    $('#todos-count').textContent = '0/0';
    return;
  }
  const done = todos.filter((t) => ['completed', 'done'].includes((t.status || '').toLowerCase())).length;
  $('#todos-count').textContent = `${done}/${todos.length}`;

  $('#todos-body').innerHTML = todos.map((t) => {
    const status = (t.status || 'pending').toLowerCase();
    const cls = ['completed', 'in_progress', 'failed'].includes(status) ? status : 'pending';
    const icon = status === 'completed' || status === 'done' ? '✔' : (status === 'in_progress' ? '▶' : (status === 'failed' ? '✖' : '○'));
    const assignee = t.assignedTo ? `<span class="todo-assignee">${escapeHtml(String(t.assignedTo).toUpperCase())}</span>` : '';
    return `
      <div class="todo-row ${cls}">
        <span class="todo-icon">${icon}</span>
        <span class="todo-text">${escapeHtml(t.task)}${assignee}</span>
      </div>
    `;
  }).join('');
}

function renderProgress(snapshot) {
  if (!snapshot) return;
  const pct = snapshot.overallPercentage || 0;
  $('#progress-pct').textContent = `${pct}%`;
  $('#progress-fill').style.width = `${pct}%`;

  const agents = snapshot.agents || {};
  const names = Object.keys(agents);
  if (!names.length) {
    $('#agents').innerHTML = '<div class="agent-empty">Esperando ejecución del agente...</div>';
    return;
  }

  $('#agents').innerHTML = names.map((id) => {
    const a = agents[id];
    const badge = a.role === 'leader' ? '👑 Líder' : '👥 Worker';
    return `
      <div class="agent-item">
        <div class="agent-name-row">
          <span>${escapeHtml(a.displayName)}</span>
          <span class="agent-role-pill">${badge} • ${a.percentage}%</span>
        </div>
        <div class="agent-bar-wrap">
          <div class="agent-bar-inner" style="width:${a.percentage}%"></div>
        </div>
        <div class="agent-status-text">${escapeHtml(a.status)} · ${a.durationSec}s · ${escapeHtml(a.currentTask)}</div>
      </div>
    `;
  }).join('');
}

function updateModeUI(autonomous, planOnly, thinking) {
  state.autonomous = Boolean(autonomous);
  state.planOnly = Boolean(planOnly);
  state.thinking = thinking !== false;

  // Modo Auto
  const autoTag = $('#tag-mode-auto');
  const autoVal = $('#btn-auto-val');
  const autoBtn = $('#btn-toggle-auto');
  const sysAuto = $('#sys-mode-auto');

  if (autoTag) {
    autoTag.className = 'tag-pill ' + (state.autonomous ? 'tag-mode-auto' : 'tag-mode-safe');
    autoTag.textContent = state.autonomous ? '⚡ Modo Autónomo' : '🛡️ Modo Seguro';
  }
  if (autoVal) autoVal.textContent = state.autonomous ? 'ON' : 'OFF';
  if (autoBtn) autoBtn.classList.toggle('active-auto', state.autonomous);
  if (sysAuto) {
    sysAuto.textContent = state.autonomous ? '⚡ Autónomo' : '🛡️ Seguro';
    sysAuto.style.color = state.autonomous ? 'var(--green)' : 'var(--yellow)';
  }

  // Modo Plan
  const planTag = $('#tag-mode-plan');
  const planVal = $('#btn-plan-val');
  const planBtn = $('#btn-toggle-plan');
  const sysPlan = $('#sys-mode-plan');

  if (planTag) {
    planTag.className = 'tag-pill ' + (state.planOnly ? 'tag-mode-plan' : 'tag-mode-write');
    planTag.textContent = state.planOnly ? '📋 Solo Plan (Simulación)' : '✏️ Modo Escritura';
  }
  if (planVal) planVal.textContent = state.planOnly ? 'ON' : 'OFF';
  if (planBtn) planBtn.classList.toggle('active-plan', state.planOnly);
  if (sysPlan) {
    sysPlan.textContent = state.planOnly ? '📋 Solo Plan' : '✏️ Escritura';
    sysPlan.style.color = state.planOnly ? 'var(--yellow)' : 'var(--cyan)';
  }

  // Modo Think
  const thinkTag = $('#tag-mode-think');
  const thinkVal = $('#btn-think-val');
  const thinkBtn = $('#btn-toggle-think');
  const sysThink = $('#sys-mode-think');

  if (thinkTag) {
    thinkTag.className = 'tag-pill ' + (state.thinking ? 'tag-mode-think' : 'tag-mode-safe');
    thinkTag.textContent = state.thinking ? '🧠 Razonamiento ON' : '🧠 Razonamiento OFF';
  }
  if (thinkVal) thinkVal.textContent = state.thinking ? 'ON' : 'OFF';
  if (thinkBtn) thinkBtn.classList.toggle('active-think', state.thinking);
  if (sysThink) {
    sysThink.textContent = state.thinking ? '🧠 ON' : '🧠 OFF';
    sysThink.style.color = state.thinking ? 'var(--purple)' : 'var(--text-muted)';
  }
}

// ─────── Session Metadata ───────
async function refreshSessionMeta() {
  if (!state.currentSessionId) return;
  const { data } = await api(`/api/session/${state.currentSessionId}`);
  if (data && data.session) {
    const s = data.session;
    const titleEl = $('#session-title');
    if (titleEl) titleEl.textContent = s.title || 'Sesión sin título';
    const tagId = $('#tag-session-id');
    if (tagId) tagId.textContent = `ID: #${s.id}`;
    const tagLeader = $('#tag-leader-name');
    if (tagLeader) tagLeader.textContent = `👑 ${s.leader || 'DeepSeek'}`;
    const tagWorkers = $('#tag-workers-count');
    if (tagWorkers) tagWorkers.textContent = `👥 ${s.workers ? s.workers.length : 0} Workers`;
    const sysLeader = $('#sys-active-leader');
    if (sysLeader) sysLeader.textContent = s.leader || 'DeepSeek';
    const sysWorkdir = $('#sys-workdir');
    if (sysWorkdir) {
      sysWorkdir.textContent = s.workdir || './';
      sysWorkdir.title = `${s.workdir || './'} (Clic para copiar ruta completa)`;
    }

    updateModeUI(
      s.autonomous !== undefined ? s.autonomous : state.autonomous,
      s.planOnly !== undefined ? s.planOnly : state.planOnly,
      s.thinking !== undefined ? s.thinking : state.thinking
    );

    if (data.snapshot && data.snapshot.todos) {
      renderTodos(data.snapshot.todos);
    } else if (s.todos) {
      renderTodos(s.todos);
    }

    if (s.turns && Array.isArray(s.turns)) {
      for (const t of s.turns) {
        if (t.prompt && !state.promptHistory.includes(t.prompt)) {
          state.promptHistory.push(t.prompt);
        }
      }
      renderTimeline(s.turns);
      renderMetrics(s.turns);
    }
  }
}

function pushPromptHistory(promptStr) {
  const clean = (promptStr || '').trim();
  if (!clean) return;
  if (state.promptHistory.length === 0 || state.promptHistory[state.promptHistory.length - 1] !== clean) {
    state.promptHistory.push(clean);
  }
  state.historyIndex = -1;
  state.tempPrompt = '';
}

function setRunning(running) {
  const btnInterrupt = $('#btn-interrupt');
  const btnSend = $('#btn-send');
  const input = $('#chat-input');

  if (btnInterrupt) btnInterrupt.disabled = !running;
  if (btnSend) btnSend.disabled = running;
  if (input) input.disabled = running;
  if (!running && input) input.focus();
}

// ─────── Sending Turns & Running Commands ───────
async function sendTurn(text) {
  if (!state.currentSessionId) {
    await ensureSession();
    if (!state.currentSessionId) {
      showToast('No se pudo inicializar la sesión', 'error');
      return;
    }
  }

  pushPromptHistory(text);

  // Si es un comando con '/'
  if (text.startsWith('/')) {
    await executeSlashCommand(text);
    return;
  }

  // Turno de usuario normal
  const { status, data } = await api(`/api/session/${state.currentSessionId}/turn`, {
    method: 'POST',
    body: { prompt: text },
  });

  if (status !== 200 && status !== 202) {
    renderSystem('error', data.error || data.message || 'Error al enviar instrucción.');
  }
}

async function executeSlashCommand(fullCommandStr) {
  const parts = fullCommandStr.trim().split(/\s+/);
  const command = parts[0].replace(/^\/+/, '').toLowerCase();
  const arg = parts.slice(1).join(' ');

  // Comandos especiales de interfaz directa
  if (command === 'clear') {
    clearTranscript();
    showToast('Chat limpiado', 'info');
    return;
  }

  if (command === 'export') {
    openModal('export-modal-overlay');
    return;
  }

  if (command === 'skills') {
    switchView('skills');
    return;
  }

  if (command === 'doctor') {
    switchView('doctor');
    runDoctorDiagnostic();
    return;
  }

  if (command === 'workers' || command === 'inspect' || command === 'analysis') {
    switchView('workers');
    return;
  }

  if (command === 'sessions' || command === 'list') {
    switchView('sessions');
    return;
  }

  if (command === 'config' || command === 'models') {
    switchView('settings');
    return;
  }

  if (command === 'login') {
    switchView('auth');
    return;
  }

  // Ejecutar en backend
  renderSystem('info', `Ejecutando: /${command} ${arg}`);

  const { status, data } = await api(`/api/session/${state.currentSessionId}/command`, {
    method: 'POST',
    body: { command, arg },
  });

  if (data && data.output) {
    addEntry(`
      <div class="tool-output-header">
        <span>Resultado de /${escapeHtml(command)}</span>
        <button class="btn-copy-code" title="Copiar">📋 Copiar</button>
      </div>
      <pre>${escapeHtml(data.output)}</pre>
    `, 'tool-output');

    const copyBtn = $('#transcript .btn-copy-code:last-child');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(data.output);
        showToast('Copiado al portapapeles', 'success');
      });
    }
  }

  if (data && data.message && data.message !== data.output) {
    showToast(data.message, data.ok ? 'success' : 'warn');
  }

  if (status !== 200 && !data.ok) {
    renderSystem('error', data.error || data.message || 'Error al ejecutar comando');
  }

  await refreshSessionMeta();
}

async function ensureSession() {
  const { data } = await api('/api/sessions', { method: 'POST', body: {} });
  if (data && data.ok) {
    state.currentSessionId = data.sessionId;
    await refreshSessionMeta();
    const snap = await sessionSnapshot(data.sessionId);
    if (snap && snap.session) renderExistingTranscript(snap.session.turns);
  }
}

async function sessionSnapshot(id) {
  const { data } = await api(`/api/session/${id}`);
  return data;
}

function renderExistingTranscript(turns) {
  $('#transcript').innerHTML = '';
  if (!turns || !turns.length) {
    // Mantener welcome card inicial
    return;
  }
  for (const t of turns) {
    if (t.prompt) renderUserTurn(t.prompt);
    if (t.thought) renderThought({ thought: t.thought });
    if (t.summary) renderFinish({ summary: t.summary });
  }
}

// ══════════════════ INTERACTIVE COMMAND PALETTE ══════════════════
async function loadCommands() {
  const { data } = await api('/api/commands');
  if (data && data.commands && data.commands.length) {
    state.commands = data.commands;
  }
}

function openCommandPalette(initialQuery = '') {
  const overlay = $('#command-palette-overlay');
  const input = $('#palette-search-input');
  overlay.hidden = false;
  input.value = initialQuery;
  state.selectedPaletteIndex = 0;
  state.activePaletteCategory = 'all';

  $$('#palette-categories .cat-pill').forEach((p) => p.classList.toggle('active', p.dataset.cat === 'all'));
  filterAndRenderPalette();

  setTimeout(() => input.focus(), 50);
}

function closeCommandPalette() {
  const overlay = $('#command-palette-overlay');
  overlay.hidden = true;
  $('#chat-input').focus();
}

function filterAndRenderPalette() {
  const query = $('#palette-search-input').value.trim().toLowerCase().replace(/^\/+/, '');
  const cat = state.activePaletteCategory;

  state.filteredCommands = state.commands.filter((cmd) => {
    // Filtro por categoría
    if (cat !== 'all' && cmd.category !== cat) return false;
    if (!query) return true;

    // Filtro por búsqueda de texto
    const nameMatch = cmd.name.toLowerCase().includes(query);
    const descMatch = cmd.desc.toLowerCase().includes(query);
    const aliasMatch = cmd.aliases?.some((a) => a.toLowerCase().includes(query));
    return nameMatch || descMatch || aliasMatch;
  });

  state.selectedPaletteIndex = Math.max(0, Math.min(state.selectedPaletteIndex, state.filteredCommands.length - 1));
  renderPaletteList();
}

function renderPaletteList() {
  const container = $('#palette-list');
  const countEl = $('#palette-count');

  if (countEl) countEl.textContent = `${state.filteredCommands.length} comando${state.filteredCommands.length === 1 ? '' : 's'}`;

  if (state.filteredCommands.length === 0) {
    container.innerHTML = `
      <div class="empty-state-box" style="padding:30px 10px;">
        <div class="es-icon">🔍</div>
        <div class="es-title">No se encontraron comandos</div>
        <p class="es-desc">Prueba escribiendo otra palabra clave o presiona Esc para cerrar.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = state.filteredCommands.map((cmd, idx) => {
    const isSelected = idx === state.selectedPaletteIndex;
    const aliases = cmd.aliases?.length ? `<span class="pi-aliases">Alias: ${cmd.aliases.join(', ')}</span>` : '';
    const placeholder = cmd.placeholder ? `<span class="pi-placeholder">&lt;${escapeHtml(cmd.placeholder)}&gt;</span>` : '';

    return `
      <div class="palette-item ${isSelected ? 'selected' : ''}" data-index="${idx}">
        <div class="pi-icon">${cmd.icon || '✦'}</div>
        <div class="pi-content">
          <div class="pi-header">
            <span class="pi-name">${escapeHtml(cmd.name)}</span>
            ${placeholder}
            <span class="pi-badge">${escapeHtml(cmd.categoryLabel || cmd.category)}</span>
          </div>
          <div class="pi-desc">${escapeHtml(cmd.desc)}</div>
          ${aliases}
        </div>
      </div>
    `;
  }).join('');

  // Auto-scroll al elemento seleccionado
  const selectedEl = container.querySelector('.palette-item.selected');
  if (selectedEl) {
    selectedEl.scrollIntoView({ block: 'nearest' });
  }
}

function selectCommandByIndex(index) {
  const cmd = state.filteredCommands[index];
  if (!cmd) return;

  closeCommandPalette();
  const chatInput = $('#chat-input');

  if (cmd.requiresArg || cmd.placeholder) {
    chatInput.value = `${cmd.name} `;
    chatInput.focus();
  } else {
    // Si no requiere argumentos, ejecutarlo inmediatamente
    sendTurn(cmd.name);
  }
}

// ══════════════════ OTHER VIEWS HANDLERS ══════════════════
// 1. Sessions View
async function loadSessions() {
  const panel = $('#sessions-list');
  panel.innerHTML = '<div class="loading-spinner">Cargando sesiones...</div>';
  const { data } = await api('/api/sessions');
  const active = data.active || [];
  const history = data.history || [];

  $('#badge-sessions-count').textContent = (active.length + history.length).toString();

  let html = '';
  html += '<div class="section-badge-title">Sesiones Activas en Memoria</div>';
  if (!active.length) html += '<div class="empty-state-box"><p class="es-desc">No hay sesiones activas en este momento.</p></div>';
  for (const s of active) {
    html += `
      <div class="session-card active">
        <div>
          <div class="sc-title">${escapeHtml(s.title || 'Sesión sin título')}</div>
          <div class="sc-meta">ID: #${s.sessionId} · ${escapeHtml(s.workdir)} · ${s.turnsCount} turnos · Líder: ${s.leader}</div>
        </div>
        <div class="sc-actions">
          <button class="btn primary" data-act="open" data-id="${s.sessionId}">Abrir Chat</button>
          <button class="btn ghost" data-act="close" data-id="${s.sessionId}">Cerrar</button>
        </div>
      </div>
    `;
  }

  html += '<div class="section-badge-title" style="margin-top:24px;">Historial Guardado en Disco</div>';
  if (!history.length) html += '<div class="empty-state-box"><p class="es-desc">No hay sesiones en el historial de este workspace.</p></div>';
  for (const s of history.slice(0, 30)) {
    const isActive = active.some((a) => a.sessionId === s.id);
    html += `
      <div class="session-card ${isActive ? 'active' : ''}">
        <div>
          <div class="sc-title">${escapeHtml(s.title || 'Sesión')}</div>
          <div class="sc-meta">#${s.id} · ${s.turnsCount} turnos · Líder: ${s.leader} · ${s.updatedAt ? s.updatedAt.substring(0, 10) : ''}</div>
        </div>
        <div class="sc-actions">
          <button class="btn" data-act="open" data-id="${s.id}">Reanudar</button>
          <button class="btn ghost" data-act="export-md" data-id="${s.id}">Exportar</button>
        </div>
      </div>
    `;
  }
  panel.innerHTML = html;
}

// 2. Skills View
async function loadSkills() {
  const grid = $('#skills-list');
  grid.innerHTML = '<div class="loading-spinner">Cargando skills...</div>';
  const { data } = await api('/api/skills');
  const skills = data.skills || [];
  state.skills = skills;

  if (!skills.length) {
    grid.innerHTML = `
      <div class="empty-state-box" style="grid-column:1/-1;">
        <div class="es-icon">✨</div>
        <div class="es-title">No hay skills instaladas</div>
        <p class="es-desc">Haz clic en "Instalar Skill" o usa <code>/skill install &lt;url&gt;</code> para añadir habilidades estilo Claude Code.</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = skills.map((s, idx) => `
    <div class="skill-card">
      <div class="sk-name">✨ ${escapeHtml(s.meta.name)}</div>
      <div class="sk-desc">${escapeHtml(s.meta.description || 'Sin descripción')}</div>
      <div class="sk-tags">
        ${(s.meta.tags || []).map((t) => `<span class="tag-pill">${escapeHtml(t)}</span>`).join('')}
      </div>
      <div style="margin-top:auto;display:flex;gap:6px;">
        <button class="btn" data-skill-view="${idx}">Ver Instrucciones</button>
      </div>
    </div>
  `).join('');
}

// 3. Doctor View
async function loadDoctor() {
  runDoctorDiagnostic();
}

window.startLoginForProvider = async function(provider) {
  switchView('auth');
  const { data } = await api('/api/login', { method: 'POST', body: { provider } });
  if (data && data.loginActive) {
    state.currentLogin = provider;
    $('#login-confirm-area').hidden = false;
    $('#login-result').textContent = data.message || `Navegador abierto para iniciar sesión en ${provider}.`;
    showToast(`Iniciando login para ${provider}`, 'info');
  }
};

async function runDoctorDiagnostic() {
  const container = $('#doctor-results');
  if (!container) return;
  container.innerHTML = '<div class="loading-spinner">Inspeccionando estado de proveedores y sesiones web...</div>';

  const { data } = await api('/api/doctor');
  const status = data.status || {};
  const providers = data.providers || [];
  const connectedCount = data.connectedCount || 0;
  const total = data.total || Object.keys(status).length || providers.length;
  const hasConnected = data.hasConnected || connectedCount > 0;
  const allConnected = data.allConnected || (total > 0 && connectedCount === total);

  let cardsHtml = '';
  if (providers.length > 0) {
    for (const p of providers) {
      const ok = p.connected;
      cardsHtml += `
        <div class="doctor-card ${ok ? 'ok' : 'err'}">
          <div class="doctor-header">
            <span class="doctor-name">${escapeHtml(p.name)} <code style="font-size:12px;font-weight:400;color:var(--text-muted)">[${escapeHtml(p.id)}]</code></span>
            <span class="tag-pill ${ok ? 'tag-mode-auto' : 'tag-mode-plan'}">${ok ? '✔ Conectado y Operativo' : '✖ Requiere Login'}</span>
          </div>
          <div class="doctor-grid">
            <div>Sesión Web: <strong>${ok ? '✔ Sesión activa lista' : '✖ Sin sesión guardada'}</strong></div>
            <div>Archivos de estado: <strong>${p.fileCount || 0} archivos</strong></div>
            <div>Ruta perfil: <code style="font-size:10.5px;">${escapeHtml(p.path || '')}</code></div>
            <div>Protección Anti-Bot: <strong style="color:var(--green)">✔ Bypass Ready</strong></div>
          </div>
          ${!ok ? `
            <div style="margin-top:10px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.06);display:flex;justify-content:space-between;align-items:center;">
              <span style="font-size:11.5px;color:var(--text-muted)">Inicia sesión para habilitar este proveedor como Líder o Worker.</span>
              <button class="btn-tool highlight" style="font-size:11px;padding:4px 10px;" onclick="window.startLoginForProvider('${escapeHtml(p.id)}')">Iniciar Sesión</button>
            </div>
          ` : ''}
        </div>
      `;
    }
  } else {
    for (const [provider, info] of Object.entries(status)) {
      const ok = info.exists && info.fileCount > 0;
      cardsHtml += `
        <div class="doctor-card ${ok ? 'ok' : 'err'}">
          <div class="doctor-header">
            <span class="doctor-name">${escapeHtml(provider.toUpperCase())}</span>
            <span class="tag-pill ${ok ? 'tag-mode-auto' : 'tag-mode-plan'}">${ok ? '✔ Conectado' : '✖ Requiere Login'}</span>
          </div>
          <div class="doctor-grid">
            <div>Sesión Web: <strong>${ok ? '✔ Válida' : '✖ No detectada'}</strong></div>
            <div>Archivos de estado: <strong>${info.fileCount || 0} archivos</strong></div>
            <div>Ruta perfil: <code style="font-size:11px;">${escapeHtml(info.path || '')}</code></div>
            <div>Protección Anti-Bot: <strong style="color:var(--green)">✔ Bypass Ready</strong></div>
          </div>
        </div>
      `;
    }
  }

  const bannerColor = allConnected ? 'var(--green)' : (hasConnected ? 'var(--cyan)' : 'var(--red)');
  const bannerBg = allConnected ? 'rgba(16,185,129,0.1)' : (hasConnected ? 'rgba(56,189,248,0.1)' : 'rgba(244,63,94,0.1)');
  const bannerText = allConnected
    ? `✔ Todos los proveedores (${connectedCount}/${total}) están 100% operativos.`
    : (hasConnected
        ? `✔ ${connectedCount} de ${total} proveedores conectados y listos para operar. Los modelos conectados están disponibles como Líder o Workers.`
        : `⚠ Ningún proveedor tiene sesión activa. Inicia sesión en al menos un proveedor con /login para comenzar.`);

  container.innerHTML = `
    <div class="doctor-summary-banner" style="padding:14px 18px;background:${bannerBg};border:1px solid ${bannerColor};border-radius:var(--radius-md);margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;">
      <div>
        <strong style="color:${bannerColor}">${bannerText}</strong>
      </div>
      <button id="btn-re-doctor" class="btn-tool" style="font-size:11px;padding:4px 10px;">🔄 Re-escanear</button>
    </div>
    ${cardsHtml}
  `;

  $('#btn-re-doctor')?.addEventListener('click', runDoctorDiagnostic);
}

// 4. Workers View
async function loadWorkers() {
  const container = $('#workers-list');
  const { data } = await api('/api/workers');
  const records = data.records || [];

  if (!records.length) {
    container.innerHTML = `
      <div class="empty-state-box" style="grid-column:1/-1;">
        <div class="es-icon">👥</div>
        <div class="es-title">Sin análisis de workers todavía</div>
        <p class="es-desc">Cuando el agente Líder delegue sub-tareas a workers (ChatGPT, Gemini, DeepSeek), aquí verás el detalle de sus respuestas.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = records.map((r, i) => `
    <div class="worker-card">
      <div class="worker-header">
        <span>#${i + 1} • Agent ${escapeHtml(r.workerName.toUpperCase())}</span>
        <span class="tag-pill">${r.durationMs || 0}ms</span>
      </div>
      <div style="font-size:12px;color:var(--text-muted);font-weight:600;">Tarea:</div>
      <div style="font-size:12px;color:var(--text-secondary);">${escapeHtml(r.subtaskPrompt)}</div>
      <div class="worker-body"><pre>${escapeHtml(r.fullResponse)}</pre></div>
    </div>
  `).join('');
}

// 5. Auth View
async function loadAuth() {
  const [{ data: prov }, { data: auth }] = await Promise.all([
    api('/api/providers'),
    api('/api/auth-status'),
  ]);
  state.providers = prov.providers || [];
  state.authStatus = auth.status || {};

  const grid = $('#auth-status');
  grid.innerHTML = Object.keys(state.authStatus).map((p) => {
    const info = state.authStatus[p];
    const ok = info.exists && info.fileCount > 0;
    return `
      <div class="auth-card">
        <div class="ac-name">${escapeHtml(p)}</div>
        <div class="ac-status"><span class="dot ${ok ? 'ok' : 'no'}"></span>${ok ? '✔ CONECTADO' : '✖ SIN SESIÓN'}</div>
        <div style="font-size:11px;color:var(--text-faint)">${info.fileCount} archivos de cookies/storage</div>
      </div>
    `;
  }).join('') || '<div class="empty-state-box">Sin datos de autenticación</div>';

  const loginGrid = $('#login-providers');
  loginGrid.innerHTML = state.providers.map((p) => {
    if (p.id === 'openrouter' || p.id === 'freellmapi') {
      const hasKey = Boolean(state.authStatus[p.id]?.exists);
      return `
        <div class="auth-card">
          <div class="ac-name">${escapeHtml(p.name)}</div>
          <div style="font-size:11px;color:var(--text-muted)">ID: ${escapeHtml(p.id)} · Autenticación por Gateway / API</div>
          <div style="display:flex;gap:6px;margin-top:auto;">
            <button class="btn primary" onclick="switchView('settings')">⚙️ Configurar</button>
          </div>
        </div>
      `;
    }
    return `
      <div class="auth-card">
        <div class="ac-name">${escapeHtml(p.name)}</div>
        <div style="font-size:11px;color:var(--text-muted)">ID: ${escapeHtml(p.id)}</div>
        <div style="display:flex;gap:6px;margin-top:auto;">
          <button class="btn primary" data-login="${escapeHtml(p.id)}">Iniciar Sesión</button>
          <button class="btn ghost" data-clear="${escapeHtml(p.id)}">Borrar</button>
        </div>
      </div>
    `;
  }).join('');
}

// 6. Settings View
async function loadSettings() {
  const [{ data: pd }, { data: cd }] = await Promise.all([
    api('/api/providers'),
    api('/api/config'),
  ]);
  const providers = pd.providers || [];
  const cfg = cd.config || { leader: 'deepseek', workers: [], autonomousDefault: false, maxIterations: 25 };

  const FREE_MODELS = [
    { id: 'deepseek/deepseek-r1:free', name: 'DeepSeek R1 (Free - Razonamiento)' },
    { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B (Free)' },
    { id: 'qwen/qwen-2.5-coder-32b-instruct:free', name: 'Qwen 2.5 Coder 32B (Free - Código)' },
    { id: 'google/gemini-2.0-flash-exp:free', name: 'Gemini 2.0 Flash Exp (Free)' },
    { id: 'google/gemini-2.0-pro-exp-02-05:free', name: 'Gemini 2.0 Pro Exp (Free)' },
    { id: 'mistralai/mistral-small-24b-instruct-2501:free', name: 'Mistral Small 24B (Free)' },
    { id: 'deepseek/deepseek-chat:free', name: 'DeepSeek V3 Chat (Free)' },
  ];

  const currentModel = cfg.openrouterModel || 'deepseek/deepseek-r1:free';

  const form = $('#settings-form');
  form.innerHTML = `
    <div class="settings-field">
      <label>Modelo Líder Principal (Orquestador ReAct)</label>
      <select id="cfg-leader">
        ${providers.map((p) => `<option value="${p.id}" ${p.id === cfg.leader ? 'selected' : ''}>${escapeHtml(p.name)} (${p.id})</option>`).join('')}
      </select>
    </div>

    <!-- FreeLLMAPI Settings Box -->
    <div class="settings-field" style="background:rgba(168,85,247,0.04);border:1px solid rgba(168,85,247,0.25);border-radius:var(--radius-md);padding:14px;margin:4px 0;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <label style="font-weight:700;color:var(--purple);display:flex;align-items:center;gap:6px;">
          <span>⚡</span> Configuración FreeLLMAPI (Self-Hosted / Gateway Gratuito)
        </label>
        <a href="https://github.com/tashfeenahmed/freellmapi" target="_blank" style="font-size:11px;color:var(--purple);text-decoration:none;font-weight:600;">Ver en GitHub ↗</a>
      </div>
      <div style="font-size:11.5px;color:var(--text-muted);margin-bottom:10px;">
        Conecta un gateway FreeLLMAPI local o remoto (OpenAI-compatible) con auto-failover y rotación entre Google, Groq, Cerebras, Mistral, etc.
      </div>
      <div style="display:flex;flex-direction:column;gap:10px;">
        <div>
          <label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:4px;">Endpoint Base URL:</label>
          <input type="text" id="cfg-freellmapi-url" placeholder="http://localhost:3001/v1" value="${escapeHtml(cfg.freellmapiBaseUrl || 'http://localhost:3001/v1')}" style="font-family:var(--font-mono);font-size:12px;" />
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <div>
            <label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:4px;">API Key (opcional):</label>
            <input type="password" id="cfg-freellmapi-key" placeholder="free o tu token..." value="${escapeHtml(cfg.freellmapiApiKey || '')}" style="font-family:var(--font-mono);font-size:12px;" />
          </div>
          <div>
            <label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:4px;">Modelo / Alias:</label>
            <input type="text" id="cfg-freellmapi-model" placeholder="auto, gemini-2.0-flash, llama-3.3-70b..." value="${escapeHtml(cfg.freellmapiModel || 'auto')}" style="font-family:var(--font-mono);font-size:12px;" />
          </div>
        </div>
      </div>
    </div>

    <!-- OpenRouter API Settings Box -->
    <div class="settings-field" style="background:rgba(56,189,248,0.04);border:1px solid rgba(56,189,248,0.2);border-radius:var(--radius-md);padding:14px;margin:4px 0;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <label style="font-weight:700;color:var(--accent);display:flex;align-items:center;gap:6px;">
          <span>🌐</span> Configuración OpenRouter (Modelos Gratuitos / API)
        </label>
        <a href="https://openrouter.ai/keys" target="_blank" style="font-size:11px;color:var(--cyan);text-decoration:none;font-weight:600;">Obtener API Key gratis ↗</a>
      </div>
      <div style="font-size:11.5px;color:var(--text-muted);margin-bottom:10px;">
        Permite usar DeepSeek R1, Llama 3.3, Qwen 2.5 Coder o Gemini gratis mediante API directa, sin requerir navegador Playwright.
      </div>
      <div style="display:flex;flex-direction:column;gap:10px;">
        <div>
          <label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:4px;">OpenRouter API Key:</label>
          <input type="password" id="cfg-openrouter-key" placeholder="sk-or-v1-xxxxxxxx..." value="${escapeHtml(cfg.openrouterApiKey || '')}" style="font-family:var(--font-mono);font-size:12px;" />
        </div>
        <div>
          <label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:4px;">Modelo de OpenRouter seleccionado:</label>
          <select id="cfg-openrouter-model">
            ${FREE_MODELS.map((m) => `<option value="${m.id}" ${m.id === currentModel ? 'selected' : ''}>${m.name} [${m.id}]</option>`).join('')}
            ${!FREE_MODELS.some(m => m.id === currentModel) && currentModel ? `<option value="${escapeHtml(currentModel)}" selected>${escapeHtml(currentModel)} (Personalizado)</option>` : ''}
          </select>
        </div>
      </div>
    </div>

    <div class="settings-field">
      <label>Workers de Soporte Multi-Agente</label>
      <div style="display:flex;flex-direction:column;gap:6px;margin-top:4px;">
        ${providers.filter((p) => p.id !== cfg.leader).map((p) => `
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;">
            <input type="checkbox" class="cfg-worker-check" value="${p.id}" ${(cfg.workers || []).includes(p.id) ? 'checked' : ''} />
            <span>${escapeHtml(p.name)}</span>
          </label>
        `).join('')}
      </div>
    </div>

    <div class="settings-field">
      <label>Máximo de Iteraciones ReAct por Turno</label>
      <input type="number" id="cfg-max" value="${cfg.maxIterations || 25}" min="1" max="100" />
    </div>

    <div class="settings-field">
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
        <input type="checkbox" id="cfg-auto" ${cfg.autonomousDefault ? 'checked' : ''} />
        <span>Modo Autónomo por defecto (sin pedir confirmación para cada cambio)</span>
      </label>
    </div>

    <div style="display:flex;align-items:center;gap:12px;margin-top:10px;">
      <button id="cfg-save-btn" class="btn primary">Guardar Configuración</button>
      <span id="cfg-save-msg" style="font-size:12px;font-weight:600;"></span>
    </div>
  `;

  $('#cfg-leader').addEventListener('change', () => loadSettings());
  $('#cfg-save-btn').addEventListener('click', async () => {
    const leader = $('#cfg-leader').value;
    const workers = $$('.cfg-worker-check:checked').map((c) => c.value);
    const maxIterations = parseInt($('#cfg-max').value, 10) || 25;
    const autonomousDefault = $('#cfg-auto').checked;
    const openrouterApiKey = $('#cfg-openrouter-key')?.value.trim() || undefined;
    const openrouterModel = $('#cfg-openrouter-model')?.value.trim() || undefined;
    const freellmapiBaseUrl = $('#cfg-freellmapi-url')?.value.trim() || undefined;
    const freellmapiApiKey = $('#cfg-freellmapi-key')?.value.trim() || undefined;
    const freellmapiModel = $('#cfg-freellmapi-model')?.value.trim() || undefined;

    const { data } = await api('/api/config', {
      method: 'POST',
      body: { leader, workers, maxIterations, autonomousDefault, openrouterApiKey, openrouterModel, freellmapiBaseUrl, freellmapiApiKey, freellmapiModel },
    });

    if (data && data.ok) {
      showToast('Configuración guardada con éxito', 'success');
      $('#cfg-save-msg').textContent = '✔ Guardado';
      $('#cfg-save-msg').style.color = 'var(--green)';
      refreshSessionMeta();
    } else {
      showToast('Error al guardar configuración', 'error');
    }
  });
}

// ══════════════════ UTILITIES & MODAL HELPERS ══════════════════
function openModal(id) {
  const modal = $(`#${id}`);
  if (modal) modal.hidden = false;
}

function closeModal(id) {
  const modal = $(`#${id}`);
  if (modal) modal.hidden = true;
}

function showToast(message, type = 'info') {
  const container = $('#toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  const icon = type === 'success' ? '✔' : (type === 'warn' ? '⚠' : (type === 'error' ? '✖' : 'ℹ'));
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span style="font-size:15px;line-height:1;margin-right:2px;">${icon}</span> <span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px) scale(0.95)';
    toast.style.transition = 'all 0.25s ease';
    setTimeout(() => toast.remove(), 250);
  }, 4000);
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatMarkdown(text) {
  let esc = escapeHtml(text);
  // Code blocks ```code```
  esc = esc.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
  // Inline code `code`
  esc = esc.replace(/`([^`]+)`/g, '<code>$1</code>');
  // Bold **text**
  esc = esc.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  return esc;
}

function truncate(str, n) {
  return str.length > n ? str.slice(0, n) + '…' : str;
}

// ══════════════════ EVENT LISTENERS & INIT ══════════════════
function init() {
  loadCommands();

  // Navigation tabs
  $$('.nav-item').forEach((n) => n.addEventListener('click', () => switchView(n.dataset.view)));

  // Input & Command Palette Triggering
  const chatInput = $('#chat-input');
  const sendBtn = $('#btn-send');

  sendBtn.addEventListener('click', () => {
    const text = chatInput.value.trim();
    if (!text) return;
    chatInput.value = '';
    chatInput.style.height = 'auto';
    sendTurn(text);
  });

  chatInput.addEventListener('keydown', (e) => {
    // Si presiona Enter sin Shift
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const text = chatInput.value.trim();
      if (!text) return;
      chatInput.value = '';
      chatInput.style.height = 'auto';
      sendTurn(text);
      return;
    }

    // Si escribe '/' en un input vacío, abrir automáticamente el command palette modal interactivo
    if (e.key === '/' && chatInput.value === '') {
      e.preventDefault();
      openCommandPalette('/');
      return;
    }

    // Navegación con Flecha Arriba (ArrowUp) en el historial de prompts
    if (e.key === 'ArrowUp') {
      const isSingleLine = !chatInput.value.includes('\n');
      const atStart = chatInput.selectionStart === 0 && chatInput.selectionEnd === 0;

      if ((isSingleLine || atStart) && state.promptHistory.length > 0) {
        e.preventDefault();
        if (state.historyIndex === -1) {
          state.tempPrompt = chatInput.value;
        }
        if (state.historyIndex < state.promptHistory.length - 1) {
          state.historyIndex++;
          const targetPrompt = state.promptHistory[state.promptHistory.length - 1 - state.historyIndex];
          chatInput.value = targetPrompt;
          chatInput.style.height = 'auto';
          chatInput.style.height = `${chatInput.scrollHeight}px`;
          chatInput.setSelectionRange(targetPrompt.length, targetPrompt.length);
        }
        return;
      }
    }

    // Navegación con Flecha Abajo (ArrowDown) en el historial de prompts
    if (e.key === 'ArrowDown') {
      const isSingleLine = !chatInput.value.includes('\n');
      const atEnd = chatInput.selectionStart === chatInput.value.length;

      if ((isSingleLine || atEnd) && state.historyIndex >= 0) {
        e.preventDefault();
        state.historyIndex--;
        if (state.historyIndex === -1) {
          chatInput.value = state.tempPrompt;
        } else {
          const targetPrompt = state.promptHistory[state.promptHistory.length - 1 - state.historyIndex];
          chatInput.value = targetPrompt;
        }
        chatInput.style.height = 'auto';
        chatInput.style.height = `${chatInput.scrollHeight}px`;
        chatInput.setSelectionRange(chatInput.value.length, chatInput.value.length);
        return;
      }
    }
  });

  chatInput.addEventListener('input', () => {
    const val = chatInput.value;
    $('#char-counter').textContent = `${val.length} chars`;
    const clearBtn = $('#btn-clear-input');
    if (clearBtn) clearBtn.hidden = !val;

    // Si el usuario escribe '/' al inicio, abrir command palette
    if (val === '/') {
      chatInput.value = '';
      openCommandPalette('/');
    }
  });

  $('#btn-clear-input')?.addEventListener('click', () => {
    chatInput.value = '';
    chatInput.focus();
  });

  // Botón '/' al lado del input
  $('#btn-trigger-slash')?.addEventListener('click', () => openCommandPalette('/'));

  // Botón palette en header y sidebar
  $('#btn-open-palette')?.addEventListener('click', () => openCommandPalette());
  $('#btn-open-palette-side')?.addEventListener('click', () => openCommandPalette());
  $('#btn-chip-palette')?.addEventListener('click', () => openCommandPalette());

  // Global Keyboard Shortcuts (Ctrl+K o Cmd+K para Command Palette)
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      openCommandPalette();
    }
    if (e.key === 'Escape') {
      closeCommandPalette();
      $$('.modal-backdrop').forEach((m) => m.hidden = true);
    }
  });

  // Command Palette Search & Navigation
  const paletteInput = $('#palette-search-input');
  paletteInput.addEventListener('input', () => {
    state.selectedPaletteIndex = 0;
    filterAndRenderPalette();
  });

  paletteInput.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      state.selectedPaletteIndex = Math.min(state.filteredCommands.length - 1, state.selectedPaletteIndex + 1);
      renderPaletteList();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      state.selectedPaletteIndex = Math.max(0, state.selectedPaletteIndex - 1);
      renderPaletteList();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      selectCommandByIndex(state.selectedPaletteIndex);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const cmd = state.filteredCommands[state.selectedPaletteIndex];
      if (cmd) {
        closeCommandPalette();
        chatInput.value = `${cmd.name} `;
        chatInput.focus();
      }
    }
  });

  $('#btn-palette-close')?.addEventListener('click', closeCommandPalette);

  // Category filter chips en Command Palette
  $('#palette-categories')?.addEventListener('click', (e) => {
    const pill = e.target.closest('.cat-pill');
    if (!pill) return;
    $$('#palette-categories .cat-pill').forEach((p) => p.classList.remove('active'));
    pill.classList.add('active');
    state.activePaletteCategory = pill.dataset.cat;
    state.selectedPaletteIndex = 0;
    filterAndRenderPalette();
  });

  // Click en item de Command Palette
  $('#palette-list')?.addEventListener('click', (e) => {
    const item = e.target.closest('.palette-item');
    if (!item) return;
    const index = parseInt(item.dataset.index, 10);
    selectCommandByIndex(index);
  });

  // Quick command chips bar
  $$('.command-chips-bar .chip-btn[data-insert]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const ins = btn.dataset.insert;
      if (ins.endsWith(' ')) {
        chatInput.value = ins;
        chatInput.focus();
      } else {
        sendTurn(ins);
      }
    });
  });

  // Quick cards en welcome card
  $$('.quick-card[data-cmd]').forEach((card) => {
    card.addEventListener('click', () => {
      const cmd = card.dataset.cmd;
      sendTurn(cmd);
    });
  });

  // Quick Action Launcher en Dashboard
  $$('.qa-btn[data-run]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const cmd = btn.dataset.run;
      sendTurn(cmd);
    });
  });

  // Interrupt button
  $('#btn-interrupt')?.addEventListener('click', async () => {
    if (!state.currentSessionId) return;
    await api(`/api/session/${state.currentSessionId}/interrupt`, { method: 'POST' });
    showToast('Turno interrumpido', 'warn');
  });

  // New session buttons
  $('#btn-new-session')?.addEventListener('click', async () => {
    const { data } = await api('/api/sessions', { method: 'POST', body: {} });
    if (data && data.ok) {
      state.currentSessionId = data.sessionId;
      $('#transcript').innerHTML = '';
      await refreshSessionMeta();
      showToast('Nueva sesión iniciada', 'success');
    }
  });

  $('#btn-create-session-alt')?.addEventListener('click', async () => {
    const { data } = await api('/api/sessions', { method: 'POST', body: {} });
    if (data && data.ok) {
      state.currentSessionId = data.sessionId;
      switchView('chat');
      $('#transcript').innerHTML = '';
      await refreshSessionMeta();
      showToast('Nueva sesión creada', 'success');
    }
  });

  // Toggle Autonomous / Safe Mode
  $('#btn-toggle-auto')?.addEventListener('click', async (e) => {
    e.preventDefault();
    if (!state.currentSessionId) await ensureSession();
    const targetAuto = !state.autonomous;
    updateModeUI(targetAuto, state.planOnly, state.thinking);
    if (!state.currentSessionId) return;
    const { data } = await api(`/api/session/${state.currentSessionId}/command`, {
      method: 'POST',
      body: { command: 'auto', arg: '' },
    });
    const msg = data?.output || data?.message || (targetAuto ? 'Modo Autónomo ACTIVADO (sin confirmaciones)' : 'Modo Seguro ACTIVADO (con confirmación)');
    showToast(msg, data?.ok !== false ? 'success' : 'warn');
  });

  // Toggle Plan Mode
  $('#btn-toggle-plan')?.addEventListener('click', async (e) => {
    e.preventDefault();
    if (!state.currentSessionId) await ensureSession();
    const targetPlan = !state.planOnly;
    updateModeUI(state.autonomous, targetPlan, state.thinking);
    if (!state.currentSessionId) return;
    const { data } = await api(`/api/session/${state.currentSessionId}/command`, {
      method: 'POST',
      body: { command: 'plan', arg: '' },
    });
    const msg = data?.output || data?.message || (targetPlan ? 'Modo Plan ACTIVADO (simulación)' : 'Modo Escritura ACTIVADO (cambios en disco)');
    showToast(msg, data?.ok !== false ? 'success' : 'warn');
  });

  // Toggle Think Mode
  $('#btn-toggle-think')?.addEventListener('click', async (e) => {
    e.preventDefault();
    if (!state.currentSessionId) await ensureSession();
    const targetThink = !state.thinking;
    updateModeUI(state.autonomous, state.planOnly, targetThink);
    if (!state.currentSessionId) return;
    const { data } = await api(`/api/session/${state.currentSessionId}/command`, {
      method: 'POST',
      body: { command: 'think', arg: '' },
    });
    const msg = data?.output || data?.message || (targetThink ? 'Razonamiento Extendido (+ Thought) ACTIVADO' : 'Razonamiento Compacto ACTIVADO');
    showToast(msg, data?.ok !== false ? 'success' : 'warn');
  });

  // Rename Session Title
  $('#btn-edit-title')?.addEventListener('click', async () => {
    if (!state.currentSessionId) return;
    const current = $('#session-title').textContent;
    const newTitle = prompt('Nuevo título para la sesión:', current);
    if (newTitle && newTitle.trim()) {
      await api(`/api/session/${state.currentSessionId}/command`, {
        method: 'POST',
        body: { command: 'title', arg: newTitle.trim() },
      });
      refreshSessionMeta();
    }
  });

  // Change Workdir Modal & Click handlers
  const openWorkdirModal = () => {
    const currentPath = $('#sys-workdir')?.textContent || '';
    if ($('#workdir-path-input')) {
      $('#workdir-path-input').value = currentPath;
    }
    const statusBox = $('#workdir-status');
    if (statusBox) statusBox.hidden = true;
    openModal('workdir-modal-overlay');
  };

  $('#sys-workdir')?.addEventListener('click', openWorkdirModal);
  $('#btn-change-workdir')?.addEventListener('click', (e) => {
    e.stopPropagation();
    openWorkdirModal();
  });

  const submitChangeWorkdir = async () => {
    if (!state.currentSessionId) return;
    const newPath = $('#workdir-path-input').value.trim();
    if (!newPath) return;

    const statusBox = $('#workdir-status');
    statusBox.hidden = false;
    statusBox.textContent = 'Actualizando carpeta de trabajo...';
    statusBox.style.color = 'var(--text-muted)';

    const { data } = await api(`/api/session/${state.currentSessionId}/workdir`, {
      method: 'POST',
      body: { workdir: newPath },
    });

    if (data && data.ok) {
      statusBox.textContent = `✔ Carpeta de trabajo cambiada a: ${data.workdir}`;
      statusBox.style.color = 'var(--green)';
      showToast(`Carpeta de trabajo cambiada a: ${data.workdir}`, 'success');
      setTimeout(() => {
        closeModal('workdir-modal-overlay');
        refreshSessionMeta();
      }, 1000);
    } else {
      statusBox.textContent = `✖ Error: ${data?.error || 'No se pudo cambiar la carpeta'}`;
      statusBox.style.color = 'var(--red)';
    }
  };

  $('#btn-submit-change-workdir')?.addEventListener('click', submitChangeWorkdir);
  $('#workdir-path-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submitChangeWorkdir();
    }
  });

  // Export Session Modal
  $('#btn-export-session')?.addEventListener('click', () => openModal('export-modal-overlay'));
  $('#btn-export-md')?.addEventListener('click', () => {
    if (!state.currentSessionId) return;
    window.open(`/api/session/${state.currentSessionId}/export?format=md`, '_blank');
    closeModal('export-modal-overlay');
  });
  $('#btn-export-json')?.addEventListener('click', () => {
    if (!state.currentSessionId) return;
    window.open(`/api/session/${state.currentSessionId}/export?format=json`, '_blank');
    closeModal('export-modal-overlay');
  });

  // Modal close buttons
  $$('.modal-close').forEach((btn) => {
    btn.addEventListener('click', () => {
      const modalId = btn.dataset.modal;
      if (modalId) closeModal(modalId);
    });
  });

  // Skills Install modal
  $('#btn-install-skill-modal')?.addEventListener('click', () => openModal('install-skill-overlay'));
  $('#btn-submit-install-skill')?.addEventListener('click', async () => {
    const url = $('#skill-url-input').value.trim();
    if (!url) return;
    const statusBox = $('#skill-install-status');
    statusBox.hidden = false;
    statusBox.textContent = 'Descargando e instalando skill...';

    const { data } = await api('/api/skills/install', { method: 'POST', body: { url } });
    if (data && data.ok) {
      statusBox.textContent = `✔ Skill "${data.skill.meta.name}" instalada con éxito.`;
      statusBox.style.color = 'var(--green)';
      setTimeout(() => {
        closeModal('install-skill-overlay');
        loadSkills();
      }, 1500);
    } else {
      statusBox.textContent = `✖ Error: ${data.error || 'No se pudo instalar'}`;
      statusBox.style.color = 'var(--red)';
    }
  });

  // View Skill instructions modal
  $('#skills-list')?.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-skill-view]');
    if (!btn) return;
    const idx = parseInt(btn.dataset.skillView, 10);
    const skill = state.skills[idx];
    if (!skill) return;

    $('#modal-skill-title').textContent = `Skill: ${skill.meta.name}`;
    $('#modal-skill-meta').innerHTML = `
      <div><strong>Descripción:</strong> ${escapeHtml(skill.meta.description)}</div>
      <div><strong>Autor:</strong> ${escapeHtml(skill.meta.author || 'Desconocido')}</div>
    `;
    $('#modal-skill-instructions').textContent = skill.instructions;
    openModal('view-skill-overlay');
  });

  // Sessions list actions
  $('#sessions-list')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const { act, id } = btn.dataset;
    if (act === 'open') {
      state.currentSessionId = id;
      switchView('chat');
      const snap = await sessionSnapshot(id);
      if (snap && snap.session) renderExistingTranscript(snap.session.turns);
      await refreshSessionMeta();
      showToast(`Sesión #${id} cargada`, 'success');
    } else if (act === 'close') {
      await api(`/api/session/${id}/close`, { method: 'POST' });
      loadSessions();
      showToast(`Sesión #${id} cerrada`, 'info');
    } else if (act === 'export-md') {
      window.open(`/api/session/${id}/export?format=md`, '_blank');
    }
  });

  $('#btn-refresh-sessions')?.addEventListener('click', loadSessions);
  $('#btn-refresh-skills')?.addEventListener('click', loadSkills);
  $('#btn-run-doctor')?.addEventListener('click', runDoctorDiagnostic);
  $('#btn-refresh-workers')?.addEventListener('click', loadWorkers);

  // Auth / Login handlers
  $('#login-providers')?.addEventListener('click', async (e) => {
    const loginBtn = e.target.closest('button[data-login]');
    const clearBtn = e.target.closest('button[data-clear]');
    if (loginBtn) {
      const provider = loginBtn.dataset.login;
      const { data } = await api('/api/login', { method: 'POST', body: { provider } });
      if (data && data.loginActive) {
        state.currentLogin = provider;
        $('#login-confirm-area').hidden = false;
        $('#login-result').textContent = data.message || 'Navegador abierto para login.';
      }
    } else if (clearBtn) {
      const provider = clearBtn.dataset.clear;
      await api('/api/clear-sessions', { method: 'POST', body: { provider } });
      showToast(`Sesión de ${provider} borrada`, 'info');
      loadAuth();
    }
  });

  $('#login-save')?.addEventListener('click', async () => {
    if (!state.currentLogin) return;
    const { data } = await api('/api/login/confirm', { method: 'POST', body: { provider: state.currentLogin } });
    $('#login-result').textContent = data.message || (data.ok ? 'Sesión guardada' : data.error);
    $('#login-confirm-area').hidden = true;
    state.currentLogin = null;
    loadAuth();
    showToast('Sesión guardada con éxito', 'success');
  });

  $('#login-cancel')?.addEventListener('click', async () => {
    if (!state.currentLogin) return;
    await api('/api/login/close', { method: 'POST', body: { provider: state.currentLogin } });
    $('#login-confirm-area').hidden = true;
    state.currentLogin = null;
    loadAuth();
  });

  // Import browser cookies from Chrome
  $('#btn-import-browser-sessions')?.addEventListener('click', async () => {
    const { data } = await api(`/api/session/${state.currentSessionId || 'default'}/command`, {
      method: 'POST',
      body: { command: 'import-sessions', arg: '' },
    });
    showToast('Importación ejecutada', 'info');
    loadAuth();
  });

  // Connect WebSocket & Ensure default session
  connectWs();
  ensureSession().then(() => {
    chatInput.focus();
    if (typeof refreshFileTree === 'function') refreshFileTree();
  });
}

// ─────── F3.1: Explorador de Archivos ───────
async function refreshFileTree() {
  const container = $('#file-tree');
  if (!container) return;
  
  const { data } = await api('/api/files');
  if (data && data.tree) {
    container.innerHTML = renderTreeNodes(data.tree);
  } else {
    container.innerHTML = '<div class="agent-empty">No se pudo cargar el árbol</div>';
  }
}

function renderTreeNodes(nodes) {
  if (!nodes || !nodes.length) return '';
  return nodes.map(n => {
    if (n.type === 'dir') {
      return `
        <div class="tree-dir open">
          <div class="tree-node" onclick="this.parentElement.classList.toggle('open')">
            <span class="tree-icon">📁</span> ${escapeHtml(n.name)}
          </div>
          <div class="tree-children">
            ${renderTreeNodes(n.children)}
          </div>
        </div>
      `;
    } else {
      return `
        <div class="tree-file">
          <div class="tree-node" onclick="openFileViewer('${escapeHtml(n.path)}')">
            <span class="tree-icon">📄</span> ${escapeHtml(n.name)}
          </div>
        </div>
      `;
    }
  }).join('');
}

async function openFileViewer(path) {
  const { data } = await api('/api/files/content?path=' + encodeURIComponent(path));
  if (data && data.content !== undefined) {
    addEntry(`
      <div class="tool-output-header">
        <span>Archivo: ${escapeHtml(path)}</span>
        <button class="btn-copy-code" title="Copiar">📋 Copiar</button>
      </div>
      <pre><code>${escapeHtml(data.content)}</code></pre>
    `, 'tool-output');
    
    const copyBtn = $('#transcript .btn-copy-code:last-child');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(data.content);
        showToast('Copiado al portapapeles', 'success');
      });
    }
  }
}

// ─────── F3.2: Timeline ───────
function renderTimeline(turns) {
  const container = $('#session-timeline');
  if (!container) return;
  if (!turns || !turns.length) {
    container.innerHTML = 'Sin eventos.';
    return;
  }
  container.innerHTML = turns.map((t, i) => `
    <div style="font-size: 0.85em; margin-bottom: 8px; border-left: 2px solid var(--blue); padding-left: 8px;">
      <div style="color: var(--text-muted)">Turno ${i + 1}</div>
      <div style="font-weight: 500">${escapeHtml(t.prompt || 'Autónomo')}</div>
    </div>
  `).join('');
}

// ─────── F3.3: Metrics ───────
function renderMetrics(turns) {
  if (!turns) return;
  let fileEdits = 0; 
  let tokens = turns.length * 1500; 
  
  turns.forEach(t => {
    if (t.thought && t.thought.toolCalls) {
      t.thought.toolCalls.forEach(tc => {
        if (tc.name === 'replace_file_content' || tc.name === 'write_to_file' || tc.name === 'multi_replace_file_content') fileEdits++;
      });
    }
  });

  const mTurns = $('#met-turns');
  const mTokens = $('#met-tokens');
  const mFiles = $('#met-cmds');
  
  if (mTurns) mTurns.textContent = turns.length;
  if (mTokens) mTokens.textContent = '~' + (tokens / 1000).toFixed(1) + 'k';
  if (mFiles) mFiles.textContent = fileEdits;
}

document.addEventListener('DOMContentLoaded', init);
