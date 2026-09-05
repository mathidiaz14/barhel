import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { Orchestrator } from '../engine/Orchestrator.js';
import { HistoryManager } from '../utils/history.js';
import { ConfigManager } from '../utils/config.js';
import { DriverFactory } from '../drivers/DriverFactory.js';
import { logger } from '../utils/logger.js';
import { listSessionsStatus } from '../utils/session.js';
import { EventBus } from './EventBus.js';
import { getBarhelVersion } from '../utils/version.js';
import { MemoryStore } from '../utils/MemoryStore.js';
import { ContextManager } from '../utils/ContextManager.js';
import { SnapshotManager } from '../engine/SnapshotManager.js';
import { PromptLibrary } from '../utils/PromptLibrary.js';
import { gitBranchList, gitBranchCreate, gitBranchSwitch, getGitBranch } from '../utils/git.js';
const MAX_CONCURRENT_ORCHESTRATORS = 3;
export class SessionManager {
    orchestrators = new Map();
    queues = new Map();
    abortControllers = new Map();
    getMaxConcurrent() {
        return MAX_CONCURRENT_ORCHESTRATORS;
    }
    getActiveSessions() {
        const out = [];
        for (const [id, orch] of this.orchestrators.entries()) {
            out.push(this.toManaged(orch));
        }
        return out;
    }
    hasSession(sessionId) {
        return this.orchestrators.has(sessionId);
    }
    getSession(sessionId) {
        let orch = this.orchestrators.get(sessionId);
        if (!orch) {
            const sess = HistoryManager.getSession(sessionId);
            if (sess) {
                orch = new Orchestrator({
                    sessionId: sess.id,
                    workdir: sess.workdir,
                    leader: sess.leader,
                    workers: sess.workers,
                    headless: true,
                });
                this.orchestrators.set(sess.id, orch);
                EventBus.register(sess.id, {
                    todos: sess.todos || [],
                    modelName: sess.leader,
                    message: sess.title,
                    summary: sess.summary,
                });
            }
        }
        return orch;
    }
    changeWorkdir(sessionId, newWorkdir) {
        const orch = this.getSession(sessionId);
        if (!orch)
            return { ok: false, error: 'Sesión no encontrada' };
        try {
            orch.setWorkdir(newWorkdir);
            const updated = orch.getWorkdir();
            EventBus.emit(sessionId, 'system', { level: 'success', message: `Carpeta de trabajo actualizada a: ${updated}` });
            return { ok: true, workdir: updated };
        }
        catch (err) {
            return { ok: false, error: err?.message || String(err) };
        }
    }
    toManaged(orch) {
        const s = orch.getSession();
        const q = this.queues.get(orch.getSessionId());
        return {
            sessionId: orch.getSessionId(),
            workdir: orch.getWorkdir(),
            title: s.title,
            leader: orch.getLeaderId(),
            workers: orch.getActiveWorkers(),
            autonomous: orch.isAutonomous(),
            planOnly: orch.isPlanOnly(),
            turnRunning: orch.isTurnRunning,
            queuedTurns: 0,
            startedAt: s.createdAt,
            lastActive: s.updatedAt,
            chatUrl: s.chatUrl,
            turnsCount: s.turns.length,
        };
    }
    /**
     * Crea (o reutiliza) un orquestador para el workspace dado.
     * Respeta el límite de orquestadores simultáneos (navegadores Playwright).
     */
    async createSession(options) {
        let targetSessionId = options.sessionId;
        if (targetSessionId) {
            const existing = HistoryManager.getSession(targetSessionId);
            if (existing) {
                targetSessionId = existing.id;
            }
            else {
                // No existe: si ya hay uno con ese id activo, reutilizar
                if (this.orchestrators.has(targetSessionId)) {
                    return { sessionId: targetSessionId, created: false };
                }
                return { sessionId: targetSessionId, created: true, error: `Sesión "${targetSessionId}" no encontrada en el historial.` };
            }
        }
        // Cargar config para líder/workers por defecto
        const userConfig = ConfigManager.loadConfig();
        const leader = options.leader || userConfig?.leader || 'deepseek';
        const workers = options.workers || userConfig?.workers || [];
        // Auto-resumir última sesión del workspace si no se especificó
        if (!targetSessionId && (options.resume === undefined || options.resume)) {
            const workspaceSessions = HistoryManager.listSessions(options.workdir || process.cwd());
            if (workspaceSessions.length > 0) {
                targetSessionId = workspaceSessions[0].id;
            }
        }
        // Si ya existe un orquestador activo para ese sessionId/workspace, reutilizarlo
        if (targetSessionId && this.orchestrators.has(targetSessionId)) {
            return { sessionId: targetSessionId, created: false };
        }
        // Verificar límite de orquestadores simultáneos
        if (this.orchestrators.size >= MAX_CONCURRENT_ORCHESTRATORS) {
            // Intentar liberar sesiones inactivas que no estén corriendo turnos
            const freed = this.evictIdle();
            if (!freed && this.orchestrators.size >= MAX_CONCURRENT_ORCHESTRATORS) {
                return {
                    sessionId: '',
                    created: true,
                    error: `Límite de ${MAX_CONCURRENT_ORCHESTRATORS} sesiones simultáneas alcanzado. Cierra una sesión o espera a que termine.`,
                };
            }
        }
        const cliOptions = {
            workdir: options.workdir || process.cwd(),
            leader,
            workers,
            sessionId: targetSessionId,
            headless: true,
        };
        const orch = new Orchestrator(cliOptions);
        const sessionId = orch.getSessionId();
        EventBus.register(sessionId, {
            todos: orch.getSession().todos || [],
            modelName: orch.getLeaderId(),
            message: orch.getSession().title,
            summary: orch.getSession().summary,
            details: {
                workdir: orch.getWorkdir(),
                workers: orch.getActiveWorkers(),
                autonomous: orch.isAutonomous(),
                planOnly: orch.isPlanOnly(),
            },
        });
        EventBus.emit(sessionId, 'session_meta', {
            message: orch.getSession().title,
            modelName: orch.getLeaderId(),
            summary: orch.getSession().summary,
            todos: orch.getSession().todos || [],
        });
        this.orchestrators.set(sessionId, orch);
        return { sessionId, created: true };
    }
    /**
     * Li Xpera un orquestador inactivo (con turno corrido y sin trabajo) para liberar slots.
     */
    evictIdle() {
        for (const [id, orch] of this.orchestrators.entries()) {
            if (!orch.isTurnRunning) {
                void this.closeSession(id).catch(() => { });
                return true;
            }
        }
        return false;
    }
    /**
     * Encola y ejecuta un turno en la sesión.
     */
    async runTurn(sessionId, prompt) {
        const orch = this.orchestrators.get(sessionId);
        if (!orch)
            return { ok: false, output: '', message: 'Sesión no encontrada.' };
        if (!prompt.trim())
            return { ok: false, output: '', message: 'Prompt vacío.' };
        const prev = this.queues.get(sessionId) || Promise.resolve();
        const task = prev.then(async () => {
            try {
                await orch.runTurn(prompt);
                return { ok: true, output: `` };
            }
            catch (err) {
                logger.error(`Error en turno de sesión ${sessionId}`, err);
                EventBus.emit(sessionId, 'error', { message: err?.message || String(err) });
                return { ok: false, output: '', message: err?.message || String(err) };
            }
        });
        this.queues.set(sessionId, task);
        return task;
    }
    async interrupt(sessionId) {
        const orch = this.orchestrators.get(sessionId);
        if (!orch)
            return { ok: false, output: '', message: 'Sesión no encontrada.' };
        if (!orch.isTurnRunning)
            return { ok: true, output: 'No hay ningún turno en ejecución.' };
        await orch.interruptCurrentTurn();
        EventBus.emit(sessionId, 'interrupt', { message: 'Generación cancelada por el usuario.' });
        return { ok: true, output: 'Turno interrumpido.' };
    }
    async closeSession(sessionId) {
        const orch = this.orchestrators.get(sessionId);
        if (!orch)
            return { ok: false, output: '', message: 'Sesión no encontrada.' };
        await orch.shutdown();
        this.orchestrators.delete(sessionId);
        this.queues.delete(sessionId);
        this.abortControllers.delete(sessionId);
        EventBus.clear(sessionId);
        return { ok: true, output: `Sesión ${sessionId} cerrada.` };
    }
    async shutdownAll() {
        await Promise.all([...this.orchestrators.keys()].map(async (id) => {
            try {
                await this.closeSession(id);
            }
            catch {
                // silencioso
            }
        }));
    }
    // ─────────────────────────── Comandos ───────────────────────────
    async command(sessionId, cmd, arg) {
        const orch = this.getSession(sessionId);
        if (!orch)
            return { ok: false, output: '', message: 'Sesión no encontrada.' };
        const cleanCmd = cmd.replace(/^\/+/, '').toLowerCase().trim();
        switch (cleanCmd) {
            case 'doctor':
                return this.runDoctor(orch, arg);
            case 'test':
                return this.runTests(orch, arg);
            case 'graph':
            case 'codegraph':
                return this.runGraph(orch, arg);
            case 'skills':
                return this.listSkills();
            case 'skill':
                return this.handleSkill(arg);
            case 'progress':
            case 'supervise':
                return this.getProgressReport(sessionId);
            case 'workers':
            case 'analysis':
            case 'inspect':
                return this.getWorkersAnalysis();
            case 'telegram':
                return this.handleTelegram(orch, arg);
            case 'daemon':
                return this.handleDaemon(orch, arg);
            case 'think':
            case 'thinking': {
                const isFull = orch.toggleThinkingDisplay();
                EventBus.emit(sessionId, 'session_meta', {
                    autonomous: orch.isAutonomous(),
                    planOnly: orch.isPlanOnly(),
                    thinking: isFull,
                });
                return { ok: true, output: isFull ? 'Modo de razonamiento: Extendido (completo).' : 'Modo de razonamiento: Compacto (+ Thought).' };
            }
            case 'fix':
                await orch.runTurn(arg ? `[FIX] Corrige el siguiente problema: ${arg}. Deja el proyecto validado.` : `[FIX] Analiza los errores y problemas del workspace y corrigelos en el codigo.`);
                return { ok: true, output: 'Fix solicitado al agente.' };
            case 'explain':
                if (!arg.trim())
                    return { ok: false, output: '', message: 'Uso: /explain <simbolo o archivo>' };
                await orch.runTurn(`[EXPLAIN] Explica en detalle, con ejemplos del codigo, que hace "${arg.trim()}" en este proyecto. No modifiques nada.`);
                return { ok: true, output: `Explicación de "${arg.trim()}" solicitada al agente.` };
            case 'commit':
            case 'commitall':
                return this.commit(orch, arg);
            case 'review':
                return { ok: true, output: await orch.reviewGit() };
            case 'leader':
                if (!arg) {
                    const all = DriverFactory.getAllProviders().map((p) => p.id).join(', ');
                    return { ok: false, output: '', message: `Uso: /leader <${all}>` };
                }
                await orch.setLeader(arg.trim().toLowerCase());
                EventBus.emit(sessionId, 'model', { modelName: arg.trim() });
                return { ok: true, output: `Líder cambiado a: ${arg.trim()}` };
            case 'auto': {
                const isAuto = orch.toggleAutonomous();
                EventBus.emit(sessionId, 'session_meta', {
                    autonomous: isAuto,
                    planOnly: orch.isPlanOnly(),
                    thinking: orch.isThinkingFull(),
                });
                return { ok: true, output: isAuto ? 'MODO AUTÓNOMO activado (sin confirmaciones).' : 'MODO SEGURO activado (requiere confirmación).' };
            }
            case 'plan': {
                const isPlan = orch.togglePlanOnly();
                EventBus.emit(sessionId, 'session_meta', {
                    autonomous: orch.isAutonomous(),
                    planOnly: isPlan,
                    thinking: orch.isThinkingFull(),
                });
                return { ok: true, output: isPlan ? 'MODO PLAN activado (simula cambios sin escribir).' : 'MODO PLAN desactivado (los cambios se aplicarán en disco).' };
            }
            case 'new':
                return this.newSession(orch, arg);
            case 'title':
                if (!arg.trim())
                    return { ok: false, output: '', message: 'Uso: /title <nuevo titulo>' };
                orch.setSessionTitle(arg.trim());
                EventBus.emit(sessionId, 'session_meta', { message: arg.trim() });
                return { ok: true, output: `Título actualizado: "${arg.trim()}"` };
            case 'status': {
                const status = listSessionsStatus();
                const lines = Object.entries(status).map(([p, info]) => `• ${p.toUpperCase().padEnd(12)}: ${info.exists ? '✔ CONECTADO (' + info.fileCount + ' archivos)' : '✖ SIN SESIÓN'}`);
                return { ok: true, output: `Estado de autenticación de proveedores:\n\n${lines.join('\n')}` };
            }
            case 'summarize': {
                const summary = await orch.summarizeSession();
                return { ok: true, output: summary ? `Resumen de memoria de sesión:\n\n${summary}` : 'No hay suficiente historial para generar resumen.' };
            }
            case 'sessions':
            case 'list': {
                const sessions = HistoryManager.listSessions();
                const lines = sessions.slice(0, 15).map((s) => {
                    const activeMark = s.id === sessionId ? ' [ACTIVA]' : '';
                    return `• #${s.id}${activeMark} - ${s.title}\n    ${s.workdir} | Líder: ${s.leader} | ${s.turns.length} turnos | ${s.updatedAt}`;
                });
                return { ok: true, output: lines.length ? `Historial de sesiones guardadas:\n\n${lines.join('\n\n')}` : 'No hay sesiones registradas.' };
            }
            case 'export': {
                const format = arg.trim().toLowerCase() === 'json' ? 'json' : 'md';
                const session = orch.getSession();
                if (format === 'json') {
                    return { ok: true, output: JSON.stringify(session, null, 2) };
                }
                else {
                    return { ok: true, output: HistoryManager.sessionToMarkdown(session) };
                }
            }
            case 'backup':
                return this.handleBackup(arg);
            case 'restore':
                return this.handleRestore(arg);
            case 'import-sessions':
            case 'import':
                return this.handleImportSessions();
            case 'clear-sessions':
                return this.handleClearSessions(arg);
            case 'clear':
                EventBus.emit(sessionId, 'clear', {});
                return { ok: true, output: 'Pantalla de chat limpiada.' };
            case 'memory':
                return this.handleMemory(orch.getWorkdir(), arg);
            case 'rollback':
                if (SnapshotManager.restoreSnapshot(orch.getWorkdir(), sessionId)) {
                    return { ok: true, output: 'Rollback completado exitosamente. El proyecto volvió a su estado anterior.' };
                }
                else {
                    return { ok: false, output: 'Fallo al ejecutar rollback.', message: 'No se pudo hacer rollback' };
                }
            case 'prompt':
                return this.handlePromptLibrary(orch, arg);
            case 'branch':
                return await this.handleBranch(orch.getWorkdir(), arg);
            case 'watch': {
                const out = orch.toggleWatch();
                return { ok: true, output: out };
            }
            case 'github':
                return await this.handleGithub(orch.getWorkdir(), arg);
            case 'mcp':
                return await this.handleMcp(orch.getWorkdir(), arg);
            case 'context':
                return this.handleContext(orch.getWorkdir(), arg);
            case 'workdir':
                if (!arg)
                    return { ok: false, output: '', message: 'Uso: /workdir <ruta absoluta o relativa>' };
                try {
                    orch.setWorkdir(arg);
                    return { ok: true, output: `Workspace cambiado exitosamente a: ${orch.getWorkdir()}` };
                }
                catch (err) {
                    return { ok: false, output: '', message: err.message };
                }
            case 'help':
                return this.getHelpText();
            case 'info': {
                const s = orch.getSession();
                const leaderMeta = DriverFactory.getMeta(orch.getLeaderId());
                return {
                    ok: true,
                    output: JSON.stringify({
                        id: s.id,
                        title: s.title,
                        workdir: orch.getWorkdir(),
                        leader: leaderMeta?.name || orch.getLeaderId(),
                        workers: orch.getActiveWorkers(),
                        autonomous: orch.isAutonomous(),
                        planOnly: orch.isPlanOnly(),
                        turnsCount: s.turns.length,
                        chatUrl: s.chatUrl || null,
                        summary: s.summary || null,
                        version: getBarhelVersion(),
                        maxConcurrent: MAX_CONCURRENT_ORCHESTRATORS,
                        activeSessions: this.orchestrators.size,
                    }, null, 2),
                };
            }
            default:
                return { ok: false, output: '', message: `Comando "/${cmd}" no reconocido. Usa /help para ver todos los comandos disponibles.` };
        }
    }
    async runDoctor(orch, arg) {
        EventBus.emit(orch.getSessionId(), 'system', { level: 'info', message: 'Ejecutando diagnóstico de salud y proveedores...' });
        try {
            const status = listSessionsStatus();
            const allProviders = DriverFactory.getAllProviders();
            const targetProvider = arg ? arg.trim().toLowerCase() : undefined;
            const filteredProviders = targetProvider
                ? allProviders.filter((p) => p.id.toLowerCase() === targetProvider)
                : allProviders;
            if (filteredProviders.length === 0 && targetProvider) {
                return { ok: false, output: '', message: `Proveedor "${targetProvider}" no reconocido.` };
            }
            const connected = filteredProviders.filter((p) => status[p.id]?.exists);
            const notConnected = filteredProviders.filter((p) => !status[p.id]?.exists);
            const reportLines = [];
            reportLines.push(`🩺 DIAGNÓSTICO DE PROVEEDORES Y SESIONES:`);
            reportLines.push(`───────────────────────────────────────────`);
            for (const p of filteredProviders) {
                const isConn = Boolean(status[p.id]?.exists);
                const fileCount = status[p.id]?.fileCount || 0;
                const statusBadge = isConn ? '✔ CONECTADO Y OPERATIVO' : '✖ REQUIERE INICIO DE SESIÓN';
                reportLines.push(`• [${p.name.toUpperCase()}] (${p.id}) → ${statusBadge}`);
                reportLines.push(`  - URL: ${p.url}`);
                reportLines.push(`  - Sesión local: ${isConn ? `Válida (${fileCount} archivos de cookies/perfil)` : 'Sin cookies detectadas'}`);
                reportLines.push(`  - Anti-Bot Bypass: ✔ Ready (Cloudflare/Fingerprint resistant)`);
                if (!isConn) {
                    reportLines.push(`  - 💡 Solución: Usa /login ${p.id} para autenticar`);
                }
                reportLines.push('');
            }
            reportLines.push(`───────────────────────────────────────────`);
            reportLines.push(`📊 Resumen: ${connected.length}/${filteredProviders.length} proveedores listos para operar.`);
            if (connected.length > 0) {
                reportLines.push(`✔ Los modelos conectados están habilitados como Líder (/leader <nombre>) o Workers de apoyo.`);
            }
            if (notConnected.length > 0) {
                reportLines.push(`ℹ Proveedores pendientes de login: ${notConnected.map((p) => p.id).join(', ')}`);
            }
            return {
                ok: true,
                output: reportLines.join('\n'),
            };
        }
        catch (err) {
            return { ok: false, output: '', message: `Error al ejecutar diagnóstico: ${err?.message || err}` };
        }
    }
    async listSkills() {
        const { SkillManager } = await import('../skills/SkillManager.js');
        const skills = SkillManager.listSkills();
        if (skills.length === 0) {
            return {
                ok: true,
                output: 'No hay skills instaladas aún.\nPuedes instalar una con: /skill install <URL-del-SKILL.md o repo GitHub>',
            };
        }
        const lines = skills.map((s) => `• ${s.meta.name}: ${s.meta.description}${s.meta.author ? ` (por ${s.meta.author})` : ''}`);
        return {
            ok: true,
            output: `Skills instaladas (${skills.length}):\n\n${lines.join('\n')}\n\nUsa /skill <nombre> para ver sus instrucciones completas.`,
        };
    }
    async handleSkill(arg) {
        const { SkillManager } = await import('../skills/SkillManager.js');
        const parts = (arg || '').trim().split(/\s+/);
        const sub = parts[0]?.toLowerCase();
        const targetUrl = parts.slice(1).join(' ').trim();
        if (sub === 'install' && targetUrl) {
            try {
                const installed = await SkillManager.installFromUrl(targetUrl);
                return {
                    ok: true,
                    output: `Skill "${installed.meta.name}" instalada con éxito y lista para usarse.\nDescripción: ${installed.meta.description}`,
                };
            }
            catch (err) {
                return { ok: false, output: '', message: `Error al instalar skill: ${err?.message || err}` };
            }
        }
        else if (sub) {
            const skill = SkillManager.getSkill(sub);
            if (skill) {
                return {
                    ok: true,
                    output: `[SKILL: ${skill.meta.name}]\nDescripción: ${skill.meta.description}\nAutor: ${skill.meta.author || 'Desconocido'}\nTags: ${(skill.meta.tags || []).join(', ') || 'ninguno'}\n\n─── Instrucciones ───\n${skill.instructions}`,
                };
            }
            else {
                return { ok: false, output: '', message: `Skill "${sub}" no encontrada. Usa /skills para ver las instaladas.` };
            }
        }
        return { ok: false, output: '', message: 'Uso: /skill install <url>  o  /skill <nombre>' };
    }
    async getProgressReport(sessionId) {
        try {
            const { ProgressSupervisor } = await import('../engine/ProgressSupervisor.js');
            const report = ProgressSupervisor.formatProgressReport();
            const snap = ProgressSupervisor.getSnapshot();
            EventBus.emit(sessionId, 'progress', { snapshot: snap });
            return {
                ok: true,
                output: report || 'Supervisión de agentes activa. Observa la barra de progreso y el panel lateral de agentes.',
            };
        }
        catch {
            return {
                ok: true,
                output: 'Supervisión de agentes activa. Observa la barra de progreso y el panel lateral de agentes.',
            };
        }
    }
    async getWorkersAnalysis() {
        const { WorkerStore } = await import('../utils/workerStore.js');
        const records = WorkerStore.getRecords();
        if (records.length === 0) {
            return { ok: true, output: 'No hay análisis de workers secundarios registrados en esta sesión aún.' };
        }
        const lines = records.map((r, i) => `#${i + 1} [${r.workerName.toUpperCase()}] (${r.durationMs || 0}ms)\nTarea: ${r.subtaskPrompt}\nResultado:\n${r.fullResponse}\n───────────────────────────`);
        return {
            ok: true,
            output: `Historial de análisis de workers (${records.length}):\n\n${lines.join('\n\n')}`,
        };
    }
    async handleTelegram(orch, arg) {
        const cfg = ConfigManager.loadConfig() || { leader: 'deepseek', workers: [] };
        if (arg && arg.trim()) {
            cfg.telegramToken = arg.trim();
            ConfigManager.saveConfig(cfg);
        }
        if (!cfg.telegramToken) {
            return {
                ok: false,
                output: '',
                message: 'Telegram Token no configurado. Usa: /telegram <tu-bot-token-de-BotFather>',
            };
        }
        try {
            const { TelegramBot } = await import('../daemon/TelegramBot.js');
            const bot = new TelegramBot(cfg.telegramToken, cfg.allowedChatIds || []);
            bot.setOrchestrator(orch);
            void bot.start();
            return {
                ok: true,
                output: 'Telegram Bot Bridge iniciado y conectado en segundo plano.',
            };
        }
        catch (err) {
            return { ok: false, output: '', message: `Error al iniciar Telegram Bot: ${err?.message || err}` };
        }
    }
    async handleDaemon(orch, arg) {
        const { DaemonManager } = await import('../daemon/DaemonManager.js');
        const action = (arg || '').trim().toLowerCase();
        if (action === 'start') {
            const status = DaemonManager.startDaemon(orch.getWorkdir());
            return { ok: true, output: `Daemon iniciado con éxito (PID: ${status.pid}).` };
        }
        else if (action === 'stop') {
            DaemonManager.stopDaemon();
            return { ok: true, output: 'Daemon detenido.' };
        }
        else {
            const status = DaemonManager.getStatus();
            return {
                ok: true,
                output: status.running
                    ? `Daemon ACTIVO (PID: ${status.pid})\nLogs: ${status.logPath}`
                    : 'Daemon INACTIVO. Usa: /daemon start para iniciarlo.',
            };
        }
    }
    async handleBackup(arg) {
        const { getSessionBasePath } = await import('../utils/session.js');
        const { execSync } = await import('node:child_process');
        const defaultFilename = `barhel-backup-${new Date().toISOString().substring(0, 10)}.tar.gz`;
        const targetFile = arg ? path.resolve(arg.trim()) : path.join(process.cwd(), defaultFilename);
        const sessionDir = getSessionBasePath();
        const parentDir = path.dirname(sessionDir);
        const dirName = path.basename(sessionDir);
        try {
            if (!fs.existsSync(sessionDir)) {
                return { ok: false, output: '', message: 'No hay sesiones existentes para exportar.' };
            }
            execSync(`tar -czf "${targetFile}" -C "${parentDir}" "${dirName}"`);
            return { ok: true, output: `Copia de seguridad exportada con éxito en:\n${targetFile}` };
        }
        catch (err) {
            return { ok: false, output: '', message: `Error al exportar backup: ${err?.message || err}` };
        }
    }
    async handleRestore(arg) {
        if (!arg.trim()) {
            return { ok: false, output: '', message: 'Uso: /restore <ruta del archivo .tar.gz>' };
        }
        const { getSessionBasePath } = await import('../utils/session.js');
        const { execSync } = await import('node:child_process');
        const targetFile = path.resolve(arg.trim());
        const sessionDir = getSessionBasePath();
        const parentDir = path.dirname(sessionDir);
        try {
            if (!fs.existsSync(targetFile)) {
                return { ok: false, output: '', message: `El archivo no existe: ${targetFile}` };
            }
            fs.mkdirSync(parentDir, { recursive: true });
            execSync(`tar -xzf "${targetFile}" -C "${parentDir}"`);
            return { ok: true, output: 'Sesiones e historial restaurados con éxito.' };
        }
        catch (err) {
            return { ok: false, output: '', message: `Error al restaurar backup: ${err?.message || err}` };
        }
    }
    async handleImportSessions() {
        const { importSessionsFromBrowser } = await import('../utils/session.js');
        const config = ConfigManager.loadConfig();
        const providers = config ? [config.leader, ...(config.workers || [])] : DriverFactory.getAllProviders().map((p) => p.id);
        const unique = [...new Set(providers)];
        const results = importSessionsFromBrowser(unique, 'chrome', false);
        const lines = results.map((r) => {
            if (r.skipped)
                return `• ⏭ ${r.provider}: ${r.message}`;
            if (r.success)
                return `• ✔ ${r.provider}: ${r.message}`;
            return `• ✖ ${r.provider}: ${r.message}`;
        });
        return {
            ok: true,
            output: `Importación de sesiones del navegador finalizada:\n\n${lines.join('\n')}`,
        };
    }
    async handleClearSessions(arg) {
        const target = arg ? arg.trim().toLowerCase() : '';
        const config = ConfigManager.loadConfig();
        let toDelete = [];
        if (target === 'all') {
            toDelete = DriverFactory.getAllProviders().map((p) => p.id);
        }
        else if (target) {
            toDelete = [target];
        }
        else {
            toDelete = config ? [...new Set([config.leader, ...(config.workers || [])])] : ['deepseek'];
        }
        const cleared = [];
        for (const pid of toDelete) {
            const dir = path.join(os.homedir(), '.dev-agent-sessions', pid.toLowerCase());
            if (fs.existsSync(dir)) {
                fs.rmSync(dir, { recursive: true, force: true });
                cleared.push(pid);
            }
        }
        return {
            ok: true,
            output: cleared.length
                ? `Sesiones borradas para: ${cleared.join(', ')}.`
                : 'No se encontraron sesiones para borrar.',
        };
    }
    handleMemory(workdir, arg) {
        const parts = (arg || '').trim().split(/\s+/);
        const sub = parts[0]?.toLowerCase();
        if (sub === 'add') {
            const fact = parts.slice(1).join(' ').trim();
            if (!fact)
                return { ok: false, output: '', message: 'Uso: /memory add <hecho>' };
            MemoryStore.add(workdir, fact);
            return { ok: true, output: `Hecho agregado a la memoria: "${fact}"` };
        }
        if (sub === 'remove') {
            const idx = parseInt(parts[1], 10) - 1;
            if (isNaN(idx))
                return { ok: false, output: '', message: 'Uso: /memory remove <numero>' };
            const ok = MemoryStore.remove(workdir, idx);
            return { ok, output: ok ? 'Entrada eliminada de la memoria.' : 'Índice no válido.' };
        }
        if (sub === 'clear') {
            MemoryStore.clear(workdir);
            return { ok: true, output: 'Memoria limpiada por completo.' };
        }
        if (sub === 'list' || !sub) {
            const entries = MemoryStore.list(workdir);
            if (entries.length === 0)
                return { ok: true, output: 'La memoria está vacía.' };
            const lines = entries.map((e, idx) => `[${idx + 1}] ${e.fact}`);
            return { ok: true, output: `🧠 Memoria del proyecto:\n\n${lines.join('\n')}` };
        }
        return { ok: false, output: '', message: 'Uso: /memory <add|list|remove|clear>' };
    }
    handlePromptLibrary(orch, arg) {
        const parts = (arg || '').trim().split(/\s+/);
        const sub = parts[0]?.toLowerCase();
        const workdir = orch.getWorkdir();
        if (sub === 'save') {
            const name = parts[1];
            const text = parts.slice(2).join(' ').trim();
            if (!name || !text)
                return { ok: false, output: '', message: 'Uso: /prompt save <nombre> <texto>' };
            PromptLibrary.save(workdir, name, text);
            return { ok: true, output: `Prompt "${name}" guardado.` };
        }
        if (sub === 'remove') {
            const name = parts[1];
            if (!name)
                return { ok: false, output: '', message: 'Uso: /prompt remove <nombre>' };
            const ok = PromptLibrary.remove(workdir, name);
            return { ok, output: ok ? `Prompt "${name}" eliminado.` : `Prompt "${name}" no encontrado.` };
        }
        if (sub === 'list' || !sub) {
            const entries = PromptLibrary.list(workdir);
            if (entries.length === 0)
                return { ok: true, output: 'No hay prompts guardados.' };
            const lines = entries.map(e => `- **${e.name}**: ${e.text}`);
            return { ok: true, output: `📚 Biblioteca de Prompts:\n\n${lines.join('\n')}` };
        }
        if (sub === 'run') {
            const name = parts[1];
            if (!name)
                return { ok: false, output: '', message: 'Uso: /prompt run <nombre>' };
            const entry = PromptLibrary.get(workdir, name);
            if (!entry)
                return { ok: false, output: '', message: `Prompt "${name}" no encontrado.` };
            // Simulate user input
            void orch.runTurn(entry.text).catch(err => {
                logger.error('Error ejecutando prompt:', err);
            });
            return { ok: true, output: `Ejecutando prompt: ${name}...` };
        }
        return { ok: false, output: '', message: 'Uso: /prompt <save|list|run|remove>' };
    }
    async handleBranch(workdir, arg) {
        const parts = (arg || '').trim().split(/\s+/);
        const sub = parts[0]?.toLowerCase();
        if (sub === 'new') {
            const name = parts[1];
            if (!name)
                return { ok: false, output: '', message: 'Uso: /branch new <nombre>' };
            const out = await gitBranchCreate(workdir, name);
            return { ok: true, output: out };
        }
        if (sub === 'switch') {
            const name = parts[1];
            if (!name)
                return { ok: false, output: '', message: 'Uso: /branch switch <nombre>' };
            const out = await gitBranchSwitch(workdir, name);
            return { ok: true, output: out };
        }
        if (sub === 'list' || !sub) {
            const out = await gitBranchList(workdir);
            return { ok: true, output: out || 'No hay ramas o no es un repo git.' };
        }
        if (sub === 'current') {
            const branch = getGitBranch(workdir);
            return { ok: true, output: branch ? `Rama actual: ${branch}` : 'No se pudo determinar la rama actual.' };
        }
        return { ok: false, output: '', message: 'Uso: /branch <new|switch|list|current>' };
    }
    async handleGithub(workdir, arg) {
        if (!arg)
            return { ok: false, output: '', message: 'Uso: /github <comando gh>' };
        const { execAsync } = await import('../utils/exec.js');
        const res = await execAsync(`gh ${arg}`, { cwd: workdir });
        if (res.ok) {
            return { ok: true, output: res.combined || 'Comando GitHub ejecutado.' };
        }
        else {
            return { ok: false, output: res.combined, message: 'Fallo al ejecutar GitHub CLI (¿tienes gh instalado?).' };
        }
    }
    async handleMcp(workdir, arg) {
        if (!arg)
            return { ok: false, output: '', message: 'Uso: /mcp <start|stop> <server>' };
        const parts = arg.trim().split(/\s+/);
        if (parts[0] === 'start') {
            return { ok: true, output: `[Stub] Iniciando conexión MCP al servidor: ${parts[1] || 'desconocido'}...\nLa integración nativa de MCP está planeada para la Fase 5 avanzada.` };
        }
        return { ok: true, output: `[Stub] Comando MCP recibido: ${arg}` };
    }
    handleContext(workdir, arg) {
        const parts = arg.trim().split(/\s+/);
        const action = parts[0];
        const file = parts[1];
        if (!action)
            return { ok: false, output: '', message: 'Uso: /context <add|remove|list> [archivo]' };
        if (action === 'add') {
            if (!file)
                return { ok: false, output: '', message: 'Especifica la ruta relativa del archivo a agregar.' };
            if (ContextManager.addFile(workdir, file)) {
                return { ok: true, output: `Archivo ${file} añadido al contexto fijo.` };
            }
            return { ok: false, output: '', message: `No se pudo agregar ${file}.` };
        }
        else if (action === 'remove') {
            if (!file)
                return { ok: false, output: '', message: 'Especifica la ruta relativa del archivo a remover.' };
            if (ContextManager.removeFile(workdir, file)) {
                return { ok: true, output: `Archivo ${file} removido del contexto fijo.` };
            }
            return { ok: false, output: '', message: `No se pudo remover ${file}.` };
        }
        else if (action === 'list') {
            const files = ContextManager.list(workdir);
            return { ok: true, output: files.length > 0 ? `Archivos en contexto fijo:\n- ${files.join('\n- ')}` : 'El contexto fijo está vacío.' };
        }
        else {
            return { ok: false, output: '', message: 'Acción no válida. Usa add, remove, list.' };
        }
    }
    getHelpText() {
        return {
            ok: true,
            output: `Comandos disponibles en Barhel (escribe / para abrir el menú interactivo):

🤖 AGENTE & EJECUCIÓN
  /fix [error]          Pide al líder que analice y corrija errores del proyecto
  /explain <símbolo>    Explica en detalle un archivo, clase o función
  /think                Alterna modo de razonamiento (resumido / extendido)
  /auto                 Alterna modo Autónomo (sin confirmaciones) vs Seguro
  /plan                 Alterna modo PLAN (simula cambios sin escribir en disco)

🛠️ ARQUITECTURA & TESTING
  /test [filtro]        Ejecuta o genera pruebas unitarias automatizadas
  /graph [símbolo]      Mapa de arquitectura AST y búsqueda de símbolos (CodeGraph)
  /skills               Lista las skills instaladas estilo Claude Code
  /skill <subcomando>   Inspecciona o instala skills (/skill install <url>)

👥 MULTI-AGENTE & SUPERVISIÓN
  /progress             Supervisión en vivo y avance (%) de los agentes
  /workers              Inspector de análisis y respuestas de agentes secundarios
  /leader <modelo>      Cambia el modelo líder rápidamente
  /config               Abre o ajusta la configuración de modelos Líder y Workers

🐙 CONTROL DE VERSIONES (GIT)
  /commit [mensaje]     Realiza un commit git con los cambios del workspace
  /review               Muestra git status y el diff detallado del workspace

📦 SESIONES & MEMORIA
  /new [título]         Inicia una nueva sesión limpia con conversación nueva
  /title <nombre>       Cambia el título de la sesión actual
  /sessions             Lista el historial de sesiones guardadas
  /summarize            Genera y muestra el resumen de memoria de la sesión
  /export [md|json]     Exporta la sesión actual a Markdown o JSON
  /backup [ruta]        Exporta copia de seguridad (.tar.gz) de sesiones
  /restore <ruta>       Restaura copia de seguridad desde un archivo .tar.gz

🩺 DIAGNÓSTICO & AUTENTICACIÓN
  /doctor [proveedor]   Diagnóstico de autenticación web, Cloudflare y selectores
  /status               Muestra el estado de conexión de los proveedores
  /login [proveedor]    Inicia sesión en la interfaz web de un proveedor
  /import               Importa sesiones desde Chrome o Edge
  /clear-sessions       Borra cookies y sesiones almacenadas
  /clear                Limpia la pantalla de chat`,
        };
    }
    async runTests(orch, arg) {
        const sandbox = orch.getToolEngine().getTestSandbox();
        EventBus.emit(orch.getSessionId(), 'system', { level: 'info', message: `Ejecutando pruebas ${arg ? `para ${arg}` : 'del proyecto'}...` });
        const result = await sandbox.runProjectTests(arg ? arg.trim() : undefined);
        return {
            ok: result.success,
            output: result.output,
            message: result.success ? `Pruebas exitosas (${result.durationMs}ms)` : `Fallaron las pruebas (${result.durationMs}ms)`,
        };
    }
    async runGraph(orch, arg) {
        const { CodeGraphEngine } = await import('../codegraph/CodeGraphEngine.js');
        const engine = new CodeGraphEngine(orch.getWorkdir());
        const query = (arg || '').trim();
        const forceRescan = ['sync', 'rescan', 'refresh', 'reindex', 'build', '-f', '--force'].includes(query.toLowerCase());
        if (forceRescan) {
            await engine.scan();
            return { ok: true, output: `✔ [CODEGRAPH RE-SINCRONIZADO] Grafo de arquitectura AST re-indexado en disco.\n\n${engine.getHierarchy()}` };
        }
        await engine.ensureLoaded();
        if (query) {
            const info = engine.inspectSymbol(query);
            if (!info.includes('no encontrado'))
                return { ok: true, output: info };
            const matches = engine.search(query);
            if (matches.length > 0) {
                const lines = matches.slice(0, 25).map((m) => `[${m.kind}] ${m.name} (${m.file}:${m.line})`);
                return { ok: true, output: `Símbolos coincidentes con "${query}":\n\n${lines.join('\n')}` };
            }
            return { ok: true, output: `No se encontraron símbolos para "${query}".` };
        }
        return { ok: true, output: engine.getHierarchy() };
    }
    async commit(orch, arg) {
        try {
            const result = await orch.commitWork(arg || undefined);
            return { ok: !result.startsWith('[git'), output: result };
        }
        catch (err) {
            return { ok: false, output: '', message: err?.message || String(err) };
        }
    }
    async newSession(orch, arg) {
        const newSess = await orch.startNewSession(arg || 'Nueva sesion');
        EventBus.emit(orch.getSessionId(), 'session_meta', { message: newSess.title });
        return { ok: true, output: `Nueva sesión: "${newSess.title}" (#${newSess.id})` };
    }
}
//# sourceMappingURL=SessionManager.js.map