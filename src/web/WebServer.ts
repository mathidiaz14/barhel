import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { URL } from 'node:url';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { EventBus, BusMessage } from './EventBus.js';
import { SessionManager } from './SessionManager.js';
import { ConfigManager } from '../utils/config.js';
import { DriverFactory } from '../drivers/DriverFactory.js';
import { HistoryManager } from '../utils/history.js';
import { listSessionsStatus, getSessionBasePath } from '../utils/session.js';
import { logger } from '../utils/logger.js';
import { getBarhelVersion } from '../utils/version.js';
import { MemoryStore } from '../utils/MemoryStore.js';
import { PromptLibrary } from '../utils/PromptLibrary.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const STATIC_DIR = path.join(__dirname, 'public');
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

export class WebServer {
  private server: http.Server;
  private wss: WebSocketServer;
  private sessionManager = new SessionManager();
  private activeLogins: Map<string, { driver: any; provider: string }> = new Map();
  private port: number;
  private workdir: string;

  constructor(options: { port?: number; workdir?: string } = {}) {
    this.port = options.port || 7898;
    this.workdir = options.workdir || process.cwd();
    this.server = http.createServer((req, res) => this.handleRequest(req, res));
    this.wss = new WebSocketServer({ noServer: true });

    this.server.on('upgrade', (req, socket, head) => {
      const url = new URL(req.url || '/', `http://localhost`);
      if (url.pathname === '/ws') {
        this.wss.handleUpgrade(req, socket, head, (ws) => this.handleWs(ws, url));
      } else {
        socket.destroy();
      }
    });

    this.wss.on('connection', (ws) => {
      ws.on('error', () => {});
    });

    EventBus.subscribe((msg) => this.broadcast(msg));
  }

  public async start(): Promise<void> {
    // Crear sesión por defecto para el workspace al arrancar
    try {
      await this.sessionManager.createSession({ workdir: this.workdir });
    } catch (err) {
      logger.warn(`No se pudo pre-cargar sesión por defecto: ${err}`);
    }

    await new Promise<void>((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(this.port, () => {
        this.server.removeListener('error', reject);
        resolve();
      });
    });

    logger.success(`Barhel Web escuchando en http://localhost:${this.port}`);
  }

  public getPort(): number {
    return this.port;
  }

  public async stop(): Promise<void> {
    await this.sessionManager.shutdownAll();
    // Cerrar logins pendientes
    for (const [, entry] of this.activeLogins.entries()) {
      try {
        await entry.driver.close();
      } catch {
        // silencioso
      }
    }
    this.activeLogins.clear();
    await new Promise<void>((resolve) => {
      this.wss.close(() => resolve());
      this.server.close(() => resolve());
    });
  }

  private broadcast(msg: BusMessage): void {
    const data = JSON.stringify(msg);
    for (const client of this.wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(data);
        } catch {
          // silencioso
        }
      }
    }
  }

  private handleWs(ws: WebSocket, url: URL): void {
    ws.send(JSON.stringify({ type: 'hello', sessionId: 'system', payload: { version: getBarhelVersion(), ts: new Date().toISOString() }, ts: new Date().toISOString() } as unknown as BusMessage));
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url || '/', `http://localhost`);
    const pathname = url.pathname;

    // Rutas API
    if (pathname.startsWith('/api/')) {
      await this.handleApi(pathname, url, req, res);
      return;
    }

    // Estáticos (SPA)
    await this.handleStatic(pathname, res);
  }

  private async handleStatic(pathname: string, res: http.ServerResponse): Promise<void> {
    let filePath = pathname === '/' ? path.join(STATIC_DIR, 'index.html') : path.join(STATIC_DIR, pathname);
    if (!filePath.startsWith(STATIC_DIR)) {
      res.writeHead(403).end('Forbidden');
      return;
    }

    let resolved: string = filePath;
    try {
      const stat = fs.statSync(resolved);
      if (stat.isDirectory()) resolved = path.join(resolved, 'index.html');
    } catch {
      // Si el archivo no existe y es una ruta de SPA, devolver index.html
      if (!fs.existsSync(resolved)) {
        resolved = path.join(STATIC_DIR, 'index.html');
      }
    }

    try {
      const content = fs.readFileSync(resolved);
      const ext = path.extname(resolved).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      res.end(content);
    } catch {
      res.writeHead(404).end('Not found');
    }
  }

  private sendJson(res: http.ServerResponse, status: number, data: unknown): void {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(data));
  }

  private readBody(req: http.IncomingMessage): Promise<any> {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
        if (body.length > 10 * 1024 * 1024) {
          reject(new Error('Body demasiado grande'));
        }
      });
      req.on('end', () => {
        if (!body) return resolve({});
        try {
          resolve(JSON.parse(body));
        } catch {
          resolve({});
        }
      });
      req.on('error', reject);
    });
  }

  private async handleApi(pathname: string, url: URL, req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const method = (req.method || 'GET').toUpperCase();

    try {
      // Salud
      if (pathname === '/api/health' && method === 'GET') {
        return this.sendJson(res, 200, { ok: true, version: getBarhelVersion(), time: new Date().toISOString(), memory: process.memoryUsage().rss });
      }

      // Proveedores disponibles
      if (pathname === '/api/providers' && method === 'GET') {
        const providers = DriverFactory.getAllProviders().map((p) => ({ id: p.id, name: p.name, url: p.url, description: p.description }));
        return this.sendJson(res, 200, { providers });
      }

      // Auth status
      if (pathname === '/api/auth-status' && method === 'GET') {
        return this.sendJson(res, 200, { status: listSessionsStatus() });
      }

      // Config
      if (pathname === '/api/config' && method === 'GET') {
        return this.sendJson(res, 200, { config: ConfigManager.loadConfig() });
      }
      if (pathname === '/api/config' && method === 'POST') {
        const body = await this.readBody(req);
        const existing = ConfigManager.loadConfig() || {};
        const merged = { ...existing, ...body };
        ConfigManager.saveConfig(merged);
        return this.sendJson(res, 200, { ok: true, config: merged });
      }

      // Sessions (lista activa + historial)
      if (pathname === '/api/sessions' && method === 'GET') {
        const active = this.sessionManager.getActiveSessions();
        const history = HistoryManager.listSessions().slice(0, 30).map((s) => ({
          id: s.id,
          title: s.title,
          workdir: s.workdir,
          leader: s.leader,
          workers: s.workers,
          turnsCount: s.turns.length,
          updatedAt: s.updatedAt,
          chatUrl: s.chatUrl || null,
        }));
        return this.sendJson(res, 200, { active, history, maxConcurrent: this.sessionManager.getMaxConcurrent() });
      }

      if (pathname === '/api/sessions' && method === 'POST') {
        const body = await this.readBody(req);
        const result = await this.sessionManager.createSession({
          workdir: body.workdir || this.workdir,
          sessionId: body.sessionId,
          leader: body.leader,
          workers: body.workers,
          resume: body.resume,
        });
        if (result.error) {
          return this.sendJson(res, 400, { ok: false, error: result.error, sessionId: result.sessionId });
        }
        return this.sendJson(res, 200, { ok: true, sessionId: result.sessionId, created: result.created });
      }

      // Historial
      if (pathname === '/api/history' && method === 'GET') {
        const history = HistoryManager.listSessions().slice(0, 50).map((s) => ({
          id: s.id,
          title: s.title,
          workdir: s.workdir,
          leader: s.leader,
          workers: s.workers,
          turnsCount: s.turns.length,
          updatedAt: s.updatedAt,
          chatUrl: s.chatUrl || null,
          summary: s.summary || null,
        }));
        return this.sendJson(res, 200, { history });
      }

      // Archivos (F3.1)
      if (pathname === '/api/files' && method === 'GET') {
        const getTree = (dir: string, depth = 0): any[] => {
          if (depth > 5) return []; // limit depth
          try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            const result = [];
            for (const entry of entries) {
              if (entry.name === 'node_modules' || entry.name === '.git' || entry.name.startsWith('.barhel')) continue;
              const fullPath = path.join(dir, entry.name);
              const relPath = path.relative(this.workdir, fullPath).replace(/\\/g, '/');
              if (entry.isDirectory()) {
                result.push({ name: entry.name, path: relPath, type: 'dir', children: getTree(fullPath, depth + 1) });
              } else {
                result.push({ name: entry.name, path: relPath, type: 'file' });
              }
            }
            return result.sort((a, b) => {
              if (a.type === b.type) return a.name.localeCompare(b.name);
              return a.type === 'dir' ? -1 : 1;
            });
          } catch { return []; }
        };
        return this.sendJson(res, 200, { tree: getTree(this.workdir) });
      }

      if (pathname === '/api/files/content' && method === 'GET') {
        const relPath = url.searchParams.get('path');
        if (!relPath) return this.sendJson(res, 400, { error: 'path param is required' });
        const absPath = path.join(this.workdir, relPath);
        // Basic security check
        if (!absPath.startsWith(this.workdir)) return this.sendJson(res, 403, { error: 'Access denied' });
        try {
          const content = fs.readFileSync(absPath, 'utf-8');
          return this.sendJson(res, 200, { content });
        } catch (err: any) {
          return this.sendJson(res, 500, { error: err.message });
        }
      }

      // Memoria
      if (pathname === '/api/memory' && method === 'GET') {
        const entries = MemoryStore.list(this.workdir);
        return this.sendJson(res, 200, { entries });
      }
      if (pathname === '/api/memory' && method === 'POST') {
        const body = await this.readBody(req);
        if (body.action === 'add') {
          MemoryStore.add(this.workdir, body.fact);
        } else if (body.action === 'remove') {
          MemoryStore.remove(this.workdir, body.index);
        } else if (body.action === 'clear') {
          MemoryStore.clear(this.workdir);
        }
        return this.sendJson(res, 200, { ok: true, entries: MemoryStore.list(this.workdir) });
      }

      // Prompts
      if (pathname === '/api/prompts' && method === 'GET') {
        const entries = PromptLibrary.list(this.workdir);
        return this.sendJson(res, 200, { entries });
      }
      if (pathname === '/api/prompts' && method === 'POST') {
        const body = await this.readBody(req);
        if (body.action === 'save') {
          PromptLibrary.save(this.workdir, body.name, body.text);
        } else if (body.action === 'remove') {
          PromptLibrary.remove(this.workdir, body.name);
        }
        return this.sendJson(res, 200, { ok: true, entries: PromptLibrary.list(this.workdir) });
      }

      // Comandos disponibles con metadatos completos para el Command Palette interactivo
      if (pathname === '/api/commands' && method === 'GET') {
        const commands = [
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
          { name: '/memory', desc: 'Gestiona la memoria semántica persistente del proyecto', category: 'session', categoryLabel: 'Sesión', icon: '🧠', placeholder: 'add/list/remove/clear [hecho]' },
          { name: '/context', desc: 'Gestiona archivos anclados al prompt del agente', category: 'session', categoryLabel: 'Sesión', icon: '📌', placeholder: 'add/remove/list [ruta]' },
          { name: '/prompt', desc: 'Guarda o ejecuta prompts personalizados', category: 'session', categoryLabel: 'Sesión', icon: '📝', placeholder: 'save/list/run/remove [nombre]' },
          { name: '/workdir', desc: 'Cambia dinámicamente la ruta del workspace activo', category: 'session', categoryLabel: 'Sesión', icon: '📂', placeholder: 'ruta/del/workspace', requiresArg: true },
          { name: '/branch', desc: 'Gestiona las ramas de Git del proyecto', category: 'git', categoryLabel: 'Git', icon: '🌿', placeholder: 'new/switch/list/current [nombre]' },
          { name: '/github', desc: 'Ejecuta comandos del CLI de GitHub (gh)', category: 'git', categoryLabel: 'Git', icon: '🐙', placeholder: 'comando gh (ej. pr list)', requiresArg: true },
          { name: '/mcp', desc: 'Gestiona conexiones a servidores MCP', category: 'tools', categoryLabel: 'Testing & Tools', icon: '🔌', placeholder: 'start/stop [server]', requiresArg: true },
          { name: '/watch', desc: 'Inicia o detiene el observador de cambios en archivos', category: 'tools', categoryLabel: 'Testing & Tools', icon: '👁️' },
          { name: '/rollback', desc: 'Revierte los cambios de la sesión actual (deshace el trabajo no commiteado)', category: 'session', categoryLabel: 'Sesión', icon: '⏪' },
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

        // Añadir prompts dinámicamente como comandos rápidos
        const prompts = PromptLibrary.list(this.workdir);
        for (const p of prompts) {
          commands.push({
            name: `/prompt run ${p.name}`,
            desc: `Ejecuta el prompt: ${p.text.slice(0, 50)}${p.text.length > 50 ? '...' : ''}`,
            category: 'session',
            categoryLabel: 'Prompts',
            icon: '⚡'
          });
        }

        return this.sendJson(res, 200, { commands });
      }

      // Skills API
      if (pathname === '/api/skills' && method === 'GET') {
        const { SkillManager } = await import('../skills/SkillManager.js');
        return this.sendJson(res, 200, { skills: SkillManager.listSkills() });
      }
      if (pathname === '/api/skills/install' && method === 'POST') {
        const body = await this.readBody(req);
        if (!body.url) return this.sendJson(res, 400, { ok: false, error: 'URL requerida' });
        const { SkillManager } = await import('../skills/SkillManager.js');
        const installed = await SkillManager.installFromUrl(body.url);
        return this.sendJson(res, 200, { ok: true, skill: installed });
      }

      // Workers API
      if (pathname === '/api/workers' && method === 'GET') {
        const { WorkerStore } = await import('../utils/workerStore.js');
        return this.sendJson(res, 200, { records: WorkerStore.getRecords() });
      }

      // Doctor API
      if (pathname === '/api/doctor' && method === 'GET') {
        const providerParam = url.searchParams.get('provider') || undefined;
        const status = listSessionsStatus();
        const allProviders = DriverFactory.getAllProviders();
        const targetProviders = providerParam
          ? allProviders.filter((p) => p.id.toLowerCase() === providerParam.toLowerCase())
          : allProviders;

        const providersList = targetProviders.map((p) => {
          const info = status[p.id];
          const isConn = Boolean(info?.exists);
          return {
            id: p.id,
            name: p.name,
            url: p.url,
            connected: isConn,
            fileCount: info?.fileCount || 0,
            path: info?.path || '',
          };
        });

        const connectedCount = providersList.filter((p) => p.connected).length;
        const hasConnected = connectedCount > 0;
        const allConnected = providersList.length > 0 && connectedCount === providersList.length;

        return this.sendJson(res, 200, {
          ok: hasConnected,
          allConnected,
          hasConnected,
          total: providersList.length,
          connectedCount,
          status,
          providers: providersList,
        });
      }

      // Daemon API
      if (pathname === '/api/daemon' && method === 'GET') {
        const { DaemonManager } = await import('../daemon/DaemonManager.js');
        return this.sendJson(res, 200, { status: DaemonManager.getStatus() });
      }
      if (pathname === '/api/daemon' && method === 'POST') {
        const body = await this.readBody(req);
        const { DaemonManager } = await import('../daemon/DaemonManager.js');
        if (body.action === 'start') {
          const status = DaemonManager.startDaemon(this.workdir);
          return this.sendJson(res, 200, { ok: true, status });
        } else if (body.action === 'stop') {
          DaemonManager.stopDaemon();
          return this.sendJson(res, 200, { ok: true, status: DaemonManager.getStatus() });
        }
        return this.sendJson(res, 200, { ok: true, status: DaemonManager.getStatus() });
      }

      // Sesión individual: info + snapshot + transcript
      const sessionMatch = pathname.match(/^\/api\/session\/([^/]+)(?:\/(.+))?$/);
      if (sessionMatch) {
        const sessionId = decodeURIComponent(sessionMatch[1]);
        const sub = sessionMatch[2] || '';

        if (!sub && method === 'GET') {
          const orch = this.sessionManager.getSession(sessionId);
          const snap = EventBus.getSnapshot(sessionId);
          const sess = orch ? orch.getSession() : HistoryManager.getSession(sessionId);
          if (!sess) return this.sendJson(res, 404, { ok: false, error: 'Sesión no encontrada' });
          return this.sendJson(res, 200, {
            ok: true,
            sessionId,
            session: {
              ...sess,
              autonomous: orch ? orch.isAutonomous() : (sess.autonomous ?? false),
              planOnly: orch ? orch.isPlanOnly() : (sess.planOnly ?? false),
              thinking: orch ? orch.isThinkingFull() : (sess.thinking ?? true),
            },
            snapshot: snap,
            active: !!orch,
          });
        }

        // Exportar sesión como archivo para descarga
        if (sub === 'export' && method === 'GET') {
          const format = url.searchParams.get('format') === 'json' ? 'json' : 'md';
          const orch = this.sessionManager.getSession(sessionId);
          const sess = orch ? orch.getSession() : HistoryManager.getSession(sessionId);
          if (!sess) return this.sendJson(res, 404, { ok: false, error: 'Sesión no encontrada' });

          const filename = `barhel-session-${sessionId}.${format}`;
          const content = format === 'json' ? JSON.stringify(sess, null, 2) : HistoryManager.sessionToMarkdown(sess);
          res.writeHead(200, {
            'Content-Type': format === 'json' ? 'application/json; charset=utf-8' : 'text/markdown; charset=utf-8',
            'Content-Disposition': `attachment; filename="${filename}"`,
          });
          res.end(content);
          return;
        }

        // Turno
        if (sub === 'turn' && method === 'POST') {
          const body = await this.readBody(req);
          if (!body.prompt || !String(body.prompt).trim()) return this.sendJson(res, 400, { ok: false, error: 'prompt requerido' });
          // No-bloqueante: dispara el turno en segundo plano y responde al instante.
          // El progreso/resultados viajan por WebSocket vía el EventBus.
          void this.sessionManager.runTurn(sessionId, String(body.prompt))
            .then((result) => {
              if (!result.ok) {
                EventBus.emit(sessionId, 'error', { message: result.message || 'Error en el turno' });
              }
            })
            .catch((err: any) => {
              EventBus.emit(sessionId, 'error', { message: err?.message || String(err) });
            });
          return this.sendJson(res, 202, { ok: true, accepted: true, message: 'Turno en ejecución (streaming por WebSocket).' });
        }

        // Comando
        if (sub === 'command' && method === 'POST') {
          const body = await this.readBody(req);
          const result = await this.sessionManager.command(sessionId, String(body.command || '').replace(/^\/+/, ''), String(body.arg || ''));
          return this.sendJson(res, result.ok ? 200 : 400, { ok: result.ok, output: result.output, message: result.message || '' });
        }

        // Interrupción
        if (sub === 'interrupt' && method === 'POST') {
          const result = await this.sessionManager.interrupt(sessionId);
          return this.sendJson(res, result.ok ? 200 : 400, { ok: result.ok, output: result.output, message: result.message || '' });
        }

        // Cerrar
        if (sub === 'close' && method === 'POST') {
          const result = await this.sessionManager.closeSession(sessionId);
          return this.sendJson(res, result.ok ? 200 : 400, { ok: result.ok, output: result.output, message: result.message || '' });
        }

        // Cambiar directorio de trabajo (workdir)
        if (sub === 'workdir' && method === 'POST') {
          const body = await this.readBody(req);
          if (!body.workdir || !String(body.workdir).trim()) {
            return this.sendJson(res, 400, { ok: false, error: 'workdir requerido' });
          }
          const result = this.sessionManager.changeWorkdir(sessionId, String(body.workdir).trim());
          return this.sendJson(res, result.ok ? 200 : 400, result);
        }

        // Workers (análisis de delegación) - del snapshot
        if (sub === 'workers' && method === 'GET') {
          const { WorkerStore } = await import('../utils/workerStore.js');
          return this.sendJson(res, 200, { ok: true, workers: WorkerStore.getRecords() });
        }
      }

      // Login
      if (pathname === '/api/login' && method === 'POST') {
        const body = await this.readBody(req);
        const provider = String(body.provider || '').toLowerCase().trim();
        return this.handleLogin(provider, res);
      }


      if (pathname === '/api/login/confirm' && method === 'POST') {
        const body = await this.readBody(req);
        const provider = String(body.provider || '').toLowerCase().trim();
        const entry = this.activeLogins.get(provider);
        if (!entry) return this.sendJson(res, 400, { ok: false, error: `No hay un login activo para "${provider}".` });
        this.activeLogins.delete(provider);
        try {
          await entry.driver.close();
          logger.success(`Sesión guardada para ${provider} (web login).`);
          return this.sendJson(res, 200, { ok: true, message: `Sesión guardada para ${provider}.` });
        } catch (err: any) {
          return this.sendJson(res, 500, { ok: false, error: err?.message || String(err) });
        }
      }

      if (pathname === '/api/login/close' && method === 'POST') {
        const body = await this.readBody(req);
        const provider = String(body.provider || '').toLowerCase().trim();
        const entry = this.activeLogins.get(provider);
        if (entry) {
          this.activeLogins.delete(provider);
          try { await entry.driver.close(); } catch {}
        }
        return this.sendJson(res, 200, { ok: true, message: 'Login cancelado.' });
      }

      // Limpiar sesiones de proveedores
      if (pathname === '/api/clear-sessions' && method === 'POST') {
        const body = await this.readBody(req);
        const provider = String(body.provider || '').toLowerCase().trim();
        const all = boolArg(body.all);
        let toDelete: string[] = [];
        const config = ConfigManager.loadConfig();
        if (all) {
          toDelete = DriverFactory.getAllProviders().map((p) => p.id);
        } else if (provider && provider !== 'all') {
          toDelete = [provider];
        } else {
          toDelete = config ? [...new Set([config.leader, ...(config.workers || [])])] : [];
        }
        const results: Record<string, string> = {};
        for (const pid of toDelete) {
          const dir = path.join(os.homedir(), '.dev-agent-sessions', pid.toLowerCase());
          if (fs.existsSync(dir)) {
            fs.rmSync(dir, { recursive: true, force: true });
            results[pid] = 'eliminada';
          } else {
            results[pid] = 'no existe';
          }
        }
        return this.sendJson(res, 200, { ok: true, results });
      }

      // 404 API
      return this.sendJson(res, 404, { ok: false, error: `API no encontrada: ${pathname}` });
    } catch (err: any) {
      logger.error(`Error en API ${method} ${pathname}`, err);
      return this.sendJson(res, 500, { ok: false, error: err?.message || 'Error interno' });
    }
  }

  private async handleLogin(provider: string, res: http.ServerResponse): Promise<void> {
    // Login "all" no es práctico en web porque abriría varios navegadores; forzar uno.
    if (!provider || provider === 'all') {
      const config = ConfigManager.loadConfig();
      const target = config?.leader || 'deepseek';
      return this.doLogin(target, res);
    }
    return this.doLogin(provider, res);
  }

  private async doLogin(provider: string, res: http.ServerResponse): Promise<void> {
    try {
      const drivers = DriverFactory.getAllProviders();
      const exists = drivers.some((p) => p.id === provider);
      if (!exists) {
        return this.sendJson(res, 400, { ok: false, error: `Proveedor "${provider}" no disponible.` });
      }
      const driver = DriverFactory.createDriver(provider);
      // Abrir navegador visible sin esperar Enter de consola (espera web)
      await driver.login(false);
      this.activeLogins.set(provider, { driver, provider });
      return this.sendJson(res, 200, {
        ok: true,
        message: `Navegador abierto. Inicia sesión en la ventana y luego pulsa "Guardar sesión".`,
        provider,
        loginActive: true,
      });
    } catch (err: any) {
      logger.error(`Error al iniciar login web para ${provider}`, err);
      return this.sendJson(res, 500, { ok: false, error: err?.message || 'Error al iniciar login' });
    }
  }
}

function boolArg(v: unknown): boolean {
  return v === true || v === 'true' || v === 1 || v === '1';
}
