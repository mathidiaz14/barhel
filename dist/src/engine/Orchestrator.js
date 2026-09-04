import { DriverFactory } from '../drivers/DriverFactory.js';
import { ToolEngine } from './ToolEngine.js';
import { ResponseParser } from './ResponseParser.js';
import { ProviderType } from '../types/providers.js';
import { logger } from '../utils/logger.js';
import { ConfigManager } from '../utils/config.js';
import { HistoryManager } from '../utils/history.js';
import { getSessionBasePath, listSessionsStatus } from '../utils/session.js';
import { gitCommit, gitDiff, gitStatus } from '../utils/git.js';
import { TUI } from '../cli/tui.js';
import { ProgressSupervisor } from './ProgressSupervisor.js';
import { SkillManager } from '../skills/SkillManager.js';
import { EventBus } from '../web/EventBus.js';
import { SessionContext } from '../web/SessionContext.js';
import fs from 'node:fs';
import path from 'node:path';
import pc from 'picocolors';
export class Orchestrator {
    leaderDriver;
    leaderId;
    activeWorkers;
    workerDrivers = new Map();
    toolEngine;
    options;
    currentSession;
    currentTodos = [];
    isShuttingDown = false;
    isInitialized = false;
    turnCount = 0;
    shutdownPromise = null;
    fallbackOrder = [];
    fallbackUsed = new Set();
    sendFailures = 0;
    autoSummarize;
    autoCommit;
    constructor(options = {}) {
        const savedConfig = ConfigManager.loadConfig();
        const leader = options.leader || savedConfig?.leader || ProviderType.DEEPSEEK;
        const workers = options.workers || savedConfig?.workers || [ProviderType.CHATGPT, ProviderType.GEMINI];
        this.options = {
            autonomous: options.autonomous ?? savedConfig?.autonomousDefault ?? false,
            maxIterations: options.maxIterations ?? savedConfig?.maxIterations ?? 25,
            headless: options.headless ?? true,
            workdir: options.workdir ?? process.cwd(),
            leader,
            workers,
            sessionId: options.sessionId,
            planOnly: options.planOnly ?? false,
            watchNotify: options.watchNotify ?? false,
        };
        this.leaderId = String(leader);
        this.activeWorkers = workers.map(String);
        this.fallbackOrder = (savedConfig?.fallbackOrder ?? []).map(String);
        this.autoSummarize = savedConfig?.autoSummarize ?? true;
        this.autoCommit = savedConfig?.autoCommit ?? false;
        this.toolEngine = new ToolEngine(this.options.workdir, this.options.autonomous, savedConfig?.commandPolicies ? { deny: savedConfig.commandPolicies.deny ?? [], allow: savedConfig.commandPolicies.allow ?? [] } : undefined);
        this.toolEngine.setPlanOnly(this.options.planOnly ?? false);
        // Cargar sesión existente o crear una nueva
        if (this.options.sessionId) {
            const existing = HistoryManager.getSession(this.options.sessionId);
            if (existing) {
                this.currentSession = existing;
                this.leaderId = existing.leader;
                this.activeWorkers = existing.workers;
                this.currentSession.updatedAt = new Date().toISOString();
                if (this.currentSession.todos) {
                    this.currentTodos = this.currentSession.todos;
                }
            }
            else {
                this.currentSession = HistoryManager.createSession({
                    workdir: this.options.workdir,
                    leader: this.leaderId,
                    workers: this.activeWorkers,
                });
            }
        }
        else {
            this.currentSession = HistoryManager.createSession({
                workdir: this.options.workdir,
                leader: this.leaderId,
                workers: this.activeWorkers,
            });
        }
        if (this.currentSession.autonomous !== undefined) {
            this.options.autonomous = this.currentSession.autonomous;
            this.toolEngine.setAutonomous(this.options.autonomous);
        }
        if (this.currentSession.planOnly !== undefined) {
            this.options.planOnly = this.currentSession.planOnly;
            this.toolEngine.setPlanOnly(this.options.planOnly);
        }
        if (this.currentSession.thinking !== undefined) {
            this.thinkingDisplayFull = this.currentSession.thinking;
        }
        this.turnCount = this.currentSession.turns.length;
        this.leaderDriver = DriverFactory.createDriver(this.leaderId);
        if (this.currentSession.chatUrl) {
            this.leaderDriver.setChatUrl(this.currentSession.chatUrl);
        }
        this.setupProcessSignals();
    }
    get isClosing() {
        return this.isShuttingDown;
    }
    getSession() {
        return this.currentSession;
    }
    getSessionId() {
        return this.currentSession.id;
    }
    getSessionTitle() {
        return this.currentSession.title;
    }
    setSessionTitle(newTitle) {
        this.currentSession.title = newTitle.trim();
        HistoryManager.saveSession(this.currentSession);
    }
    getLeaderId() {
        return this.leaderId;
    }
    getActiveWorkers() {
        return this.activeWorkers;
    }
    getWorkdir() {
        return this.toolEngine.getWorkdir();
    }
    setWorkdir(newWorkdir) {
        this.toolEngine.setWorkdir(newWorkdir);
        this.currentSession.workdir = this.toolEngine.getWorkdir();
        HistoryManager.saveSession(this.currentSession);
        EventBus.emit(this.getSessionId(), 'session_meta', { workdir: this.currentSession.workdir });
    }
    getToolEngine() {
        return this.toolEngine;
    }
    isAutonomous() {
        return this.options.autonomous ?? false;
    }
    toggleAutonomous() {
        this.options.autonomous = !this.options.autonomous;
        this.currentSession.autonomous = this.options.autonomous;
        this.toolEngine.setAutonomous(this.options.autonomous);
        HistoryManager.saveSession(this.currentSession);
        EventBus.emit(this.getSessionId(), 'session_meta', { autonomous: this.options.autonomous, planOnly: this.options.planOnly, thinking: this.thinkingDisplayFull });
        return this.options.autonomous;
    }
    /**
     * Cambia dinámicamente el modelo líder o los workers
     */
    async switchModels(newLeaderId, newWorkers) {
        if (newLeaderId !== this.leaderId) {
            logger.info(`Cambiando modelo líder de [${this.leaderId}] a [${newLeaderId}]...`);
            await this.leaderDriver.close();
            this.leaderId = newLeaderId;
            this.leaderDriver = DriverFactory.createDriver(newLeaderId);
            this.isInitialized = false;
        }
        this.activeWorkers = newWorkers;
        // Actualizar sesión actual y configuración
        this.currentSession.leader = this.leaderId;
        this.currentSession.workers = this.activeWorkers;
        HistoryManager.saveSession(this.currentSession);
        ConfigManager.saveConfig({
            leader: this.leaderId,
            workers: this.activeWorkers,
            autonomousDefault: this.options.autonomous,
            maxIterations: this.options.maxIterations,
            fallbackOrder: this.fallbackOrder,
            autoSummarize: this.autoSummarize,
            autoCommit: this.autoCommit,
        });
        EventBus.emit(this.getSessionId(), 'model', { modelName: this.leaderId, details: { workers: this.activeWorkers, mode: 'switch' } });
    }
    isPlanOnly() {
        return this.options.planOnly ?? false;
    }
    togglePlanOnly() {
        this.options.planOnly = !this.options.planOnly;
        this.currentSession.planOnly = this.options.planOnly;
        this.toolEngine.setPlanOnly(this.options.planOnly ?? false);
        HistoryManager.saveSession(this.currentSession);
        EventBus.emit(this.getSessionId(), 'session_meta', { autonomous: this.options.autonomous, planOnly: this.options.planOnly, thinking: this.thinkingDisplayFull });
        return this.options.planOnly ?? false;
    }
    getFallbackOrder() {
        return this.fallbackOrder;
    }
    async setLeader(leaderId) {
        await this.switchModels(leaderId, this.activeWorkers);
    }
    async setPlanOnly(planOnly) {
        this.options.planOnly = planOnly;
        this.toolEngine.setPlanOnly(planOnly);
    }
    /**
     * Genera (o regenera) el resumen de memoria de la sesión usando el líder
     */
    async summarizeSession() {
        if (this.currentSession.turns.length === 0) {
            logger.warn('No hay turnos para resumir.');
            return this.currentSession.summary ?? null;
        }
        return this.summarizeSessionInternal(true);
    }
    /**
     * Prepara un commit git con los cambios del workspace
     */
    async commitWork(message) {
        const cleanMsg = (message || '').trim() || 'Barhel: tarea completada';
        return await gitCommit(this.toolEngine.getWorkdir(), cleanMsg);
    }
    /**
     * Repositorio: estado y diff actual
     */
    async reviewGit() {
        const status = await gitStatus(this.toolEngine.getWorkdir());
        const diff = await gitDiff(this.toolEngine.getWorkdir());
        return `[GIT STATUS]\n${status}\n\n[GIT DIFF]\n${diff}`;
    }
    thinkingDisplayFull = true;
    isThinkingFull() {
        return this.thinkingDisplayFull;
    }
    toggleThinkingDisplay() {
        this.thinkingDisplayFull = !this.thinkingDisplayFull;
        this.currentSession.thinking = this.thinkingDisplayFull;
        HistoryManager.saveSession(this.currentSession);
        EventBus.emit(this.getSessionId(), 'session_meta', { autonomous: this.options.autonomous, planOnly: this.options.planOnly, thinking: this.thinkingDisplayFull });
        return this.thinkingDisplayFull;
    }
    /**
     * Cambia a una sesión guardada previa, cargando su hilo web exacto
     */
    async switchSession(sessionId) {
        const targetSession = HistoryManager.getSession(sessionId);
        if (!targetSession) {
            throw new Error(`Sesión ${sessionId} no encontrada en el historial.`);
        }
        logger.info(`Cargando sesión [${targetSession.id}] "${targetSession.title}"...`);
        // Si el modelo líder es diferente, recrear el driver
        if (targetSession.leader !== this.leaderId) {
            await this.leaderDriver.close();
            this.leaderId = targetSession.leader;
            this.leaderDriver = DriverFactory.createDriver(this.leaderId);
            this.isInitialized = false;
        }
        this.currentSession = targetSession;
        this.turnCount = targetSession.turns.length;
        this.activeWorkers = targetSession.workers;
        if (targetSession.chatUrl) {
            this.leaderDriver.setChatUrl(targetSession.chatUrl);
            if (this.isInitialized) {
                await this.leaderDriver.ensureChatPage(targetSession.chatUrl);
            }
        }
        return this.currentSession;
    }
    /**
     * Inicia una nueva sesión limpia con un nuevo chat en el LLM
     */
    async startNewSession(title) {
        logger.info('Creando nueva sesión limpia de Barhel...');
        const newSession = HistoryManager.createSession({
            workdir: this.toolEngine.getWorkdir(),
            leader: this.leaderId,
            workers: this.activeWorkers,
            title: title || 'Nueva sesión',
        });
        this.currentSession = newSession;
        this.turnCount = 0;
        this.leaderDriver.setChatUrl(undefined);
        if (this.isInitialized) {
            // Navegar a URL base para abrir nuevo chat limpio
            await this.leaderDriver.ensureChatPage();
        }
        return this.currentSession;
    }
    /**
     * Captura señales de interrupción para cerrar navegadores ordenadamente
     */
    setupProcessSignals() {
        const cleanup = async () => {
            if (this.isShuttingDown)
                return;
            this.isShuttingDown = true;
            logger.warn('\nCerrando Barhel y guardando sesión...');
            await this.shutdown();
            process.exit(0);
        };
        process.on('SIGINT', cleanup);
        process.on('SIGTERM', cleanup);
    }
    /**
     * Inicializa la sesión del Agente Líder una sola vez para conversación continua
     */
    async initSession() {
        if (this.isInitialized)
            return;
        const leaderMeta = DriverFactory.getMeta(this.leaderId);
        const leaderName = leaderMeta?.name || this.leaderId;
        logger.startSpinner(`Iniciando sesión de Barhel con ${leaderName}...`);
        try {
            await this.leaderDriver.init(this.options.headless, this.currentSession.chatUrl);
            this.isInitialized = true;
            ProgressSupervisor.registerAgent(this.leaderId, leaderName, 'leader');
            logger.stopSpinner();
            logger.success(`Barhel está listo con Agente Líder [${leaderName}].`);
        }
        catch (err) {
            logger.stopSpinner();
            logger.error(`Error al inicializar sesión de ${leaderName}`, err);
            throw err;
        }
    }
    /**
     * Obtiene o inicializa perezosamente un driver de worker
     */
    async getWorkerDriver(agentType) {
        const key = String(agentType).toLowerCase().trim();
        if (this.workerDrivers.has(key)) {
            return this.workerDrivers.get(key);
        }
        const sessionStatus = listSessionsStatus();
        if (!sessionStatus[key]?.exists || sessionStatus[key]?.fileCount === 0) {
            throw new Error(`El worker "${key}" no tiene sesión iniciada. Inicia sesión con: barhel login ${key}`);
        }
        const driver = DriverFactory.createDriver(key);
        const meta = DriverFactory.getMeta(key);
        const displayName = meta?.name || key.toUpperCase();
        logger.info(`Inicializando worker secundario [${displayName}]...`);
        await driver.init(this.options.headless);
        this.workerDrivers.set(key, driver);
        ProgressSupervisor.registerAgent(key, displayName, 'worker');
        return driver;
    }
    isTurnRunning = false;
    isInterrupted = false;
    /**
     * Cancela o interrumpe en caliente la generación y razonamiento actual del LLM
     */
    async interruptCurrentTurn() {
        this.isInterrupted = true;
        TUI.stopThinking();
        logger.stopSpinner();
        try {
            await this.leaderDriver.stopGeneration();
            for (const [, driver] of this.workerDrivers.entries()) {
                await driver.stopGeneration();
            }
        }
        catch {
            // Ignorar errores de cancelación
        }
    }
    /**
     * Ejecuta un turno de conversación (ReAct Loop) sin cerrar el navegador al terminar.
     * Envuelve la ejecución en el contexto de sesión para que los eventos en vivo
     * (TUI/logger/Progress) se asocien a esta sesión, incluso en concurrencia.
     */
    async runTurn(userGoal) {
        await SessionContext.run(this.getSessionId(), () => this.runTurnInternal(userGoal));
    }
    async runTurnInternal(userGoal) {
        this.isTurnRunning = true;
        this.isInterrupted = false;
        EventBus.emit(this.getSessionId(), 'turn_start', { message: userGoal, summary: userGoal });
        if (!this.isInitialized) {
            await this.initSession();
        }
        // Auto-generar título si es la primera instrucción de la sesión
        if (this.currentSession.turns.length === 0 ||
            this.currentSession.title === 'Nueva sesión de trabajo' ||
            this.currentSession.title === 'Nueva sesión') {
            this.currentSession.title = HistoryManager.generateTitle(userGoal);
        }
        this.turnCount++;
        const isFirstTurn = this.turnCount === 1;
        let nextPrompt = isFirstTurn ? this.buildSystemPrompt(userGoal) : this.buildTurnPrompt(userGoal);
        let iteration = 0;
        const maxIterations = this.options.maxIterations ?? 25;
        const iteratorState = { fallbackRetries: 0 };
        const currentTurnRecord = {
            prompt: userGoal,
            timestamp: new Date().toISOString(),
        };
        try {
            while (iteration - iteratorState.fallbackRetries < maxIterations && !this.isShuttingDown && !this.isInterrupted) {
                iteration++;
                // Iniciar temporizador en vivo de pensamiento
                const leaderName = this.leaderDriver.displayName;
                TUI.startThinking(leaderName);
                const thinkStart = performance.now();
                let responseRaw;
                try {
                    let streamedChars = 0;
                    let fullStreamedText = '';
                    const onStreamChunk = (chunk) => {
                        streamedChars += chunk.length;
                        fullStreamedText += chunk;
                        const preview = ResponseParser.extractStreamingPreview(fullStreamedText);
                        TUI.updateThinkingChunk(streamedChars, leaderName, preview || undefined);
                    };
                    responseRaw = await this.leaderDriver.sendMessage(nextPrompt, onStreamChunk);
                    this.sendFailures = 0;
                }
                catch (err) {
                    TUI.stopThinking();
                    if (this.isInterrupted || this.isShuttingDown) {
                        break;
                    }
                    this.sendFailures++;
                    const errMsg = err instanceof Error ? err.message : String(err);
                    const isRateLimit = errMsg.toLowerCase().includes('rate limit') || errMsg.toLowerCase().includes('too many requests') || errMsg.toLowerCase().includes('429');
                    const fallback = this.getNextFallback();
                    if (fallback) {
                        const fallbackMeta = DriverFactory.getMeta(fallback);
                        const fallbackName = fallbackMeta?.name || fallback.toUpperCase();
                        logger.warn(`⚠ ${this.leaderDriver.displayName} ${isRateLimit ? 'alcanzó límite de peticiones (Rate Limit)' : 'no disponible'} → Conmutando automáticamente al líder de respaldo [${fallbackName}]...`);
                        await this.applyFallbackLeader(fallback);
                        if (!this.isInitialized) {
                            try {
                                await this.initSession();
                            }
                            catch (initErr) {
                                logger.warn(`No se pudo inicializar el líder de respaldo [${fallbackName}]`);
                                continue;
                            }
                        }
                        iteratorState.fallbackRetries++;
                        continue;
                    }
                    if (isRateLimit && this.sendFailures <= 2) {
                        logger.warn(`Rate limit en ${this.leaderDriver.displayName}. Pausando 12s antes de reintentar (intento ${this.sendFailures}/2)...`);
                        await new Promise((r) => setTimeout(r, 12000));
                        continue;
                    }
                    logger.warn(`Error en ${this.leaderDriver.displayName}: ${errMsg}`);
                    if (isRateLimit) {
                        console.log(pc.yellow(`\n💡 Tip: ${this.leaderDriver.displayName} está temporalmente saturado. Puedes cambiar de modelo con: `) + pc.bold(pc.cyan('/leader chatgpt')) + pc.yellow(' o ') + pc.bold(pc.cyan('/leader gemini\n')));
                    }
                    break;
                }
                const thinkDurationMs = Math.round(performance.now() - thinkStart);
                TUI.stopThinking();
                // Capturar la URL actual del chat web para mantener persistencia 1-a-1
                const currentChatUrl = this.leaderDriver.getChatUrl();
                if (currentChatUrl) {
                    this.currentSession.chatUrl = currentChatUrl;
                }
                // Parsear respuesta con tolerancia a fallos
                let parseResult = ResponseParser.parse(responseRaw);
                // Si falló el parseo, intentar autocorrección
                if (!parseResult.success) {
                    logger.warn(`Respuesta no parseable: ${parseResult.error}`);
                    logger.info('Solicitando autocorrección en formato JSON...');
                    try {
                        TUI.startThinking(leaderName, `${leaderName} está autocorrigiendo JSON`);
                        const retryRaw = await this.leaderDriver.sendMessage(parseResult.correctionPrompt);
                        TUI.stopThinking();
                        parseResult = ResponseParser.parse(retryRaw);
                    }
                    catch (retryErr) {
                        TUI.stopThinking();
                        logger.error('Fallo en la reintentación de formato JSON', retryErr);
                    }
                }
                if (!parseResult.success || !parseResult.data) {
                    this.dumpRawResponse(responseRaw, `parse_fail_${parseResult.error}`);
                    logger.error(`Imposible obtener JSON estructurado tras autocorrección. Respuesta recibida:\n${responseRaw}`);
                    break;
                }
                const { thought, action } = parseResult.data;
                currentTurnRecord.thought = thought;
                currentTurnRecord.actionType = action.type;
                currentTurnRecord.summary = action.summary;
                currentTurnRecord.actions = currentTurnRecord.actions || [];
                currentTurnRecord.actions.push({
                    type: action.type,
                    details: {
                        path: action.path,
                        command: action.command,
                        agent: action.agent,
                        prompt: action.prompt,
                        summary: action.summary,
                    },
                });
                // Mostrar razonamiento del modelo estilo Claude Code
                TUI.renderThought(thought, thinkDurationMs);
                // Si el modelo emitió un plan de tareas (todos), renderizarlo en pantalla y persistirlo
                if (parseResult.data.todos && parseResult.data.todos.length > 0) {
                    this.currentTodos = parseResult.data.todos;
                    currentTurnRecord.todos = this.currentTodos;
                    this.currentSession.todos = this.currentTodos;
                    ProgressSupervisor.setTodos(this.currentTodos);
                    TUI.renderTodoList(this.currentTodos);
                }
                // Mostrar acción a ejecutar con diff coloreado si es modificación de código
                if (action.type === 'write_file' && action.path) {
                    const fullPath = path.resolve(this.toolEngine.getWorkdir(), action.path);
                    const oldContent = fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf-8') : null;
                    TUI.renderDiff(action.path, oldContent, action.content || '');
                }
                else {
                    TUI.renderAction(action.type, {
                        path: action.path,
                        command: action.command,
                        agent: action.agent,
                        prompt: action.prompt,
                        tasks: action.tasks,
                        pattern: action.pattern,
                        summary: action.summary,
                    });
                }
                // Manejar finalización de la tarea
                if (action.type === 'finish') {
                    console.log(`\n${pc.green('✓')} ${pc.bold(pc.green('TAREA COMPLETADA:'))}\n${pc.white(action.summary || 'Fin del trabajo.')}\n`);
                    EventBus.emit(this.getSessionId(), 'finish', { summary: action.summary || 'Fin del trabajo.' });
                    if (this.autoCommit && (this.options.autonomous ?? false)) {
                        await this.tryAutoCommit(action.summary);
                    }
                    break;
                }
                // Manejar delegación a workers
                if (action.type === 'delegate_task') {
                    if (!action.agent || !action.prompt) {
                        const validWorkers = this.activeWorkers.join(' | ') || 'chatgpt | gemini | claude';
                        nextPrompt = `[OBSERVATION ERROR]: Para 'delegate_task' debes especificar 'agent' (${validWorkers}) y 'prompt'.`;
                        continue;
                    }
                    const targetAgent = String(action.agent).toLowerCase();
                    TUI.startThinking(targetAgent, `Consultando al worker [${targetAgent.toUpperCase()}]`);
                    const workerStart = performance.now();
                    try {
                        const workerDriver = await this.getWorkerDriver(targetAgent);
                        const workerResponse = await workerDriver.sendMessage(action.prompt);
                        const workerDurationMs = Math.round(performance.now() - workerStart);
                        TUI.stopThinking();
                        // Renderizar tarjeta del Worker y almacenar análisis para inspección
                        TUI.renderWorkerDelegation(targetAgent, action.prompt, workerResponse, workerDurationMs);
                        nextPrompt = `[OBSERVATION DELEGATE_TASK (${targetAgent.toUpperCase()})]:\n${workerResponse}\n\nContinúa con tu razonamiento y el siguiente paso en formato JSON.`;
                    }
                    catch (workerErr) {
                        TUI.stopThinking();
                        const errMsg = workerErr instanceof Error ? workerErr.message : String(workerErr);
                        logger.warn(`Worker ${targetAgent.toUpperCase()} no disponible (${errMsg})`);
                        nextPrompt = `[OBSERVATION WARNING WORKER ${targetAgent.toUpperCase()}]: ${errMsg}\nEl worker no estuvo disponible. Resuelve la tarea con tus herramientas locales (read_file, write_file, run_command, check, eval_code).`;
                    }
                    continue;
                }
                // Manejar delegación paralela a múltiples workers
                if (action.type === 'delegate_batch') {
                    const tasks = (action.tasks ?? []);
                    if (tasks.length === 0) {
                        nextPrompt = `[OBSERVATION ERROR]: Para 'delegate_batch' debes especificar 'tasks' con al menos una tarea.`;
                        continue;
                    }
                    const batchResults = [];
                    await Promise.all(tasks.map(async (task) => {
                        const target = String(task.agent).toLowerCase();
                        const workerStart = performance.now();
                        try {
                            const workerDriver = await this.getWorkerDriver(target);
                            const workerResponse = await workerDriver.sendMessage(task.prompt);
                            const ms = Math.round(performance.now() - workerStart);
                            batchResults.push({ agent: target, ok: true, response: workerResponse, ms });
                            TUI.renderWorkerDelegation(target, task.prompt, workerResponse, ms);
                        }
                        catch (batchErr) {
                            const ms = Math.round(performance.now() - workerStart);
                            const errMsg = batchErr instanceof Error ? batchErr.message : String(batchErr);
                            batchResults.push({ agent: target, ok: false, error: errMsg, ms });
                            logger.warn(`Worker ${target.toUpperCase()} no disponible (${errMsg})`);
                        }
                    }));
                    const successful = batchResults.filter((r) => r.ok);
                    const failed = batchResults.filter((r) => !r.ok);
                    let observation = '';
                    if (successful.length > 0) {
                        observation += `[OBSERVATION DELEGATE_BATCH EXITOSOS]:\n` +
                            successful.map((r) => `[WORKER ${r.agent.toUpperCase()}] (${r.ms}ms):\n${r.response}`).join('\n\n');
                    }
                    if (failed.length > 0) {
                        observation += (observation ? '\n\n' : '') +
                            `[OBSERVATION WORKERS NO DISPONIBLES]:\n` +
                            failed.map((r) => `• ${r.agent.toUpperCase()}: ${r.error}`).join('\n') +
                            `\nContinúa ejecutando la tarea con tus herramientas locales (write_file, run_command, eval_code, etc.).`;
                    }
                    nextPrompt = observation || `[OBSERVATION]: No se recibieron respuestas de los workers. Continúa con tus herramientas locales.`;
                    continue;
                }
                // Ejecutar herramientas locales del sistema
                const toolResult = await this.toolEngine.execute(action);
                TUI.renderToolResult(action.type, toolResult.success, toolResult.output);
                if (toolResult.isFinish) {
                    logger.success(toolResult.output);
                    break;
                }
                // Preparar la observación para la siguiente iteración
                if (toolResult.success) {
                    nextPrompt = `[OBSERVATION RESULT]:\n${toolResult.output}\n\nAnaliza la salida anterior, razona tu siguiente movimiento y responde en formato JSON.`;
                }
                else {
                    nextPrompt = `[OBSERVATION FAILED]:\n${toolResult.output || toolResult.error}\n\nAnaliza la causa del error, ajusta tu plan y responde en formato JSON.`;
                }
                if (iteration - iteratorState.fallbackRetries >= maxIterations) {
                    logger.warn(`Se alcanzó el límite de pasos ReAct (${maxIterations}).`);
                }
            }
        }
        finally {
            this.isTurnRunning = false;
            TUI.stopThinking();
            // Persistir registro de turno y sesión en disco
            if (currentTurnRecord.thought || currentTurnRecord.actionType) {
                this.currentSession.turns.push(currentTurnRecord);
            }
            const finalChatUrl = this.leaderDriver.getChatUrl();
            if (finalChatUrl) {
                this.currentSession.chatUrl = finalChatUrl;
            }
            HistoryManager.saveSession(this.currentSession);
            this.currentSession.todos = this.currentTodos;
            EventBus.emit(this.getSessionId(), 'turn_end', {
                summary: currentTurnRecord.summary,
                output: currentTurnRecord.summary,
            });
            if (this.isInterrupted) {
                console.log(pc.yellow('\n[interrupted] Generación cancelada por el usuario.\n'));
                EventBus.emit(this.getSessionId(), 'interrupt', {});
            }
        }
    }
    /**
     * Devuelve el próximo proveedor de respaldo disponible con sesión iniciada
     */
    getNextFallback() {
        const sessionStatus = listSessionsStatus();
        // 1. Prioridad: Proveedores en fallbackOrder explícito que tengan sesión
        for (const id of this.fallbackOrder) {
            const key = String(id).toLowerCase().trim();
            if (key !== this.leaderId && !this.fallbackUsed.has(key) && DriverFactory.getMeta(key)) {
                if (sessionStatus[key]?.exists && sessionStatus[key]?.fileCount > 0) {
                    return key;
                }
            }
        }
        // 2. Segunda prioridad: Workers activos configurados con sesión
        for (const id of this.activeWorkers) {
            const key = String(id).toLowerCase().trim();
            if (key !== this.leaderId && !this.fallbackUsed.has(key) && DriverFactory.getMeta(key)) {
                if (sessionStatus[key]?.exists && sessionStatus[key]?.fileCount > 0) {
                    return key;
                }
            }
        }
        // 3. Tercera prioridad: Cualquier otro proveedor con sesión iniciada
        for (const meta of DriverFactory.getAllProviders()) {
            const key = meta.id;
            if (key !== this.leaderId && !this.fallbackUsed.has(key)) {
                if (sessionStatus[key]?.exists && sessionStatus[key]?.fileCount > 0) {
                    return key;
                }
            }
        }
        return null;
    }
    /**
     * Cambia el líder actual a un proveedor de respaldo (nuevo hilo web para ese proveedor)
     */
    async applyFallbackLeader(fallbackId) {
        this.fallbackUsed.add(fallbackId);
        const old = this.leaderId;
        await this.leaderDriver.close();
        this.workerDrivers.clear();
        this.leaderId = fallbackId;
        this.leaderDriver = DriverFactory.createDriver(fallbackId);
        this.isInitialized = false;
        this.currentSession.leader = fallbackId;
        this.currentSession.chatUrl = undefined;
        HistoryManager.saveSession(this.currentSession);
        logger.info(`Líder cambiado por fallback: [${old}] → [${fallbackId}]. El hilo de chat web es nuevo para este proveedor.`);
    }
    /**
     * Guarda la respuesta cruda del modelo en ~/.dev-agent-sessions/debug para diagnóstico
     */
    dumpRawResponse(raw, reason) {
        try {
            const debugDir = path.join(getSessionBasePath(), 'debug');
            fs.mkdirSync(debugDir, { recursive: true });
            const filePath = path.join(debugDir, `${this.currentSession.id}-${Date.now()}.txt`);
            fs.writeFileSync(filePath, `# ${reason}\n# ${new Date().toISOString()}\n\n${raw}`, 'utf-8');
            logger.info(`Respuesta cruda guardada en ${filePath}`);
        }
        catch {
            // Silencioso: el diagnóstico es best-effort
        }
    }
    /**
     * Resume los turnos nuevos de la sesión y persiste el resumen en memoria
     */
    async summarizeSessionInternal(useLLM = false) {
        const since = this.currentSession.lastSummarizedTurnIndex ?? 0;
        const newTurns = this.currentSession.turns.slice(since);
        if (newTurns.length === 0) {
            return this.currentSession.summary ?? null;
        }
        if (useLLM && !this.isShuttingDown && this.isInitialized) {
            logger.info(`Generando resumen de memoria de ${newTurns.length} turno(s) con ${this.leaderDriver.displayName}...`);
            const content = newTurns
                .map((t) => `USUARIO: ${t.prompt}\nACCIÓN: ${t.actionType || ''}\nRESULTADO: ${t.summary || ''}`)
                .join('\n---\n');
            try {
                TUI.startThinking(this.leaderDriver.displayName, 'Resumiendo sesión para memoria a largo plazo');
                const promptText = `Genera un resumen en español de 3-5 líneas de lo que se hizo y decidió en esta sesión de trabajo. Solo texto plano, sin JSON ni bloques de código:\n\n${content}`;
                const raw = await this.leaderDriver.sendMessage(promptText);
                TUI.stopThinking();
                const clean = raw.replace(/```/g, '').trim();
                const previous = this.currentSession.summary;
                this.currentSession.summary = [previous, clean].filter(Boolean).join('\n').slice(0, 4000);
                this.currentSession.lastSummarizedTurnIndex = this.currentSession.turns.length;
                HistoryManager.saveSession(this.currentSession);
                logger.success('Resumen de memoria generado y guardado.');
                return this.currentSession.summary;
            }
            catch (err) {
                TUI.stopThinking();
                logger.warn(`No se pudo generar el resumen automático con LLM: ${err}`);
            }
        }
        // Resumen local instantáneo y confiable (sin llamadas web durante shutdown)
        const summaryLines = newTurns.map((t) => {
            const p = t.prompt.slice(0, 80);
            const s = t.summary ? ` → ${t.summary}` : (t.actionType ? ` (${t.actionType})` : '');
            return `• ${p}${s}`;
        });
        const localSummary = summaryLines.join('\n');
        const previous = this.currentSession.summary;
        this.currentSession.summary = [previous, localSummary].filter(Boolean).join('\n').slice(0, 4000);
        this.currentSession.lastSummarizedTurnIndex = this.currentSession.turns.length;
        HistoryManager.saveSession(this.currentSession);
        return this.currentSession.summary;
    }
    /**
     * Auto-commit al concluir la tarea si autoCommit está activo en modo autónomo
     */
    async tryAutoCommit(summary) {
        const firstLine = (summary || '').split('\n')[0].replace(/^[#*\-–\s]+/, '');
        const message = (firstLine && firstLine.length > 3 && firstLine.length <= 72 ? firstLine : 'Barhel: tarea completada').trim();
        logger.info(`autoCommit activo → commit "${message}"`);
        const result = await gitCommit(this.toolEngine.getWorkdir(), message);
        if (result.startsWith('[git')) {
            logger.warn(result);
        }
        else {
            logger.success('Auto-commit realizado.');
            console.log(pc.dim(result));
        }
    }
    /**
     * Cierra ordenadamente todas las instancias de navegadores y persiste la sesión
     */
    async shutdown() {
        if (this.shutdownPromise)
            return this.shutdownPromise;
        this.isShuttingDown = true;
        this.shutdownPromise = this.doShutdown();
        return this.shutdownPromise;
    }
    async doShutdown() {
        try {
            const finalChatUrl = this.leaderDriver.getChatUrl();
            if (finalChatUrl) {
                this.currentSession.chatUrl = finalChatUrl;
            }
            HistoryManager.saveSession(this.currentSession);
            // Memoria a largo plazo: resumir localmente sin bloquear el cierre del proceso
            if (this.autoSummarize && this.currentSession.turns.length > 0) {
                await this.summarizeSessionInternal(false);
            }
            await this.leaderDriver.close();
            for (const [, driver] of this.workerDrivers.entries()) {
                await driver.close();
            }
            this.workerDrivers.clear();
            this.isInitialized = false;
        }
        catch (err) {
            logger.warn(`Error durante el apagado: ${err}`);
        }
    }
    /**
     * Genera el System Prompt inicial
     */
    /**
     * Genera el contexto de tareas pendientes existentes para asegurar la ejecución secuencial estricta
     */
    buildTodosContextPrompt() {
        if (!this.currentTodos || this.currentTodos.length === 0)
            return '';
        const firstPendingIdx = this.currentTodos.findIndex((t) => t.status === 'pending' || t.status === 'in_progress');
        const lines = this.currentTodos.map((t, idx) => {
            const icon = t.status === 'completed' ? '[✓]' : (t.status === 'in_progress' ? '[▶]' : '[ ]');
            const agent = t.assignedTo ? ` [${t.assignedTo.toUpperCase()}]` : '';
            const flag = idx === firstPendingIdx ? ' <--- ¡ESTA ES LA SIGUIENTE TAREA A REALIZAR OBLIGATORIAMENTE!' : '';
            return `  ${icon} ${idx + 1}. ${t.task}${agent} (${t.status})${flag}`;
        });
        const targetDirective = firstPendingIdx !== -1
            ? `\n🎯 TAREA OBLIGATORIA INMEDIATA: Debes ejecutar la tarea #${firstPendingIdx + 1}: "${this.currentTodos[firstPendingIdx].task}".`
            : '';
        return `\n📋 ESTADO ACTUAL DEL PLAN DE TAREAS (TODOS):\n${lines.join('\n')}\n${targetDirective}
REGLA ESTRICTA DE EJECUCIÓN SECUENCIAL DE TAREAS:
1. NUNCA te saltes tareas pendientes para saltar a las del final.
2. Debes abordar obligatoriamente la primera tarea pendiente de la lista (#${firstPendingIdx !== -1 ? firstPendingIdx + 1 : 1}).
3. Si una tarea está asignada a un worker (como Claude o ChatGPT) que no está disponible o falla, reasígnala a "leader" y resuélvela tú mismo usando tus herramientas locales, pero NO la ignores.
4. Mantén en tu JSON el array "todos" reflejando todas las tareas existentes, marcando como "in_progress" la que estás ejecutando y "completed" las que ya terminaron.\n`;
    }
    /**
     * Genera el System Prompt inicial
     */
    buildSystemPrompt(userGoal) {
        const sessionStatus = listSessionsStatus();
        const readyWorkers = this.activeWorkers.filter((w) => sessionStatus[w]?.exists && sessionStatus[w]?.fileCount > 0);
        const workersListStr = readyWorkers.length > 0
            ? readyWorkers.join(' | ')
            : (this.activeWorkers.length > 0 ? this.activeWorkers.join(' | ') : 'chatgpt | gemini | claude | qwen | mistral | perplexity');
        const leaderMeta = DriverFactory.getMeta(this.leaderId);
        const leaderName = leaderMeta?.name || this.leaderId;
        const planOnlyNote = this.options.planOnly
            ? `\nMODO PLAN ONLY ACTIVADO: NO ejecutes write_file ni run_command de verdad. Solo devuelve el plan que ejecutarías (el sistema simula la escritura/ejecución y NO aplica cambios). Termina con finish + summary describiendo el plan completo.`
            : '';
        const summaryNote = this.currentSession.summary
            ? `\nCONTEXTO DE MEMORIA DE SESIONES ANTERIORES:\n${this.currentSession.summary}\n`
            : '';
        const skillsPrompt = SkillManager.buildSkillsSystemPrompt();
        const todosPrompt = this.buildTodosContextPrompt();
        return `ERES BARHEL (${leaderName}), UN ASISTENTE DE CODIFICACIÓN CLI AUTÓNOMO Y AVANZADO (ESTILO OPENCODE / CLAUDE CODE).
Tu objetivo es resolver la siguiente instrucción del usuario en su proyecto local:
"${userGoal}"

DIRECTORIO DE TRABAJO: ${this.toolEngine.getWorkdir()}
${planOnlyNote}${summaryNote}${skillsPrompt}${todosPrompt}
PROTOCOLO DE ACCIÓN REACT OBLIGATORIO:
Debes responder SIEMPRE Y EXCLUSIVAMENTE con un único bloque JSON válido:

\`\`\`json
{
  "thought": "Explicación detallada de tu razonamiento, análisis de código y próximos pasos a seguir.",
  "todos": [
    { "task": "Explorar y analizar la estructura del proyecto", "status": "completed", "assignedTo": "leader" },
    { "task": "Modificar controladores y modelos", "status": "in_progress", "assignedTo": "leader" },
    { "task": "Delegar análisis de seguridad a Claude", "status": "pending", "assignedTo": "claude" },
    { "task": "Ejecutar pruebas y validar compilación", "status": "pending", "assignedTo": "leader" }
  ],
  "action": {
    "type": "read_file" | "write_file" | "run_command" | "list_directory" | "grep" | "glob" | "check" | "eval_code" | "auto_test" | "codegraph" | "use_skill" | "delegate_task" | "delegate_batch" | "finish",
    "path": "ruta/relativa/archivo",
    "content": "contenido completo del archivo en UTF-8",
    "command": "comando terminal a ejecutar",
    "pattern": "patrón regex (grep) o glob (glob)",
    "code": "código ejecutable con assertions para probar en sandbox (eval_code)",
    "language": "typescript | javascript | python | php",
    "targetFile": "ruta del archivo de prueba específico (para auto_test)",
    "symbol": "nombre_simbolo (para codegraph)",
    "query": "termino de busqueda (para codegraph)",
    "skill": "nombre_skill (para use_skill)",
    "agent": "${workersListStr}",
    "prompt": "instrucción para el worker secundario",
    "tasks": [
      { "agent": "chatgpt | gemini | claude", "prompt": "instrucción para un worker" },
      { "agent": "gemini", "prompt": "instrucción para otro worker" }
    ],
    "summary": "resumen exhaustivo de los cambios realizados al terminar"
  }
}
\`\`\`

PLAN DE TAREAS DINÁMICO (TODO LIST):
- Cuando la tarea requiera varios pasos o delegación a subagentes, incluye SIEMPRE el array "todos".
- Estados válidos de cada subtarea: "pending" | "in_progress" | "completed" | "failed".
- Agentes asignados ("assignedTo"): "leader" o el worker correspondiente ("claude", "chatgpt", "gemini", etc.).
- Actualiza este listado en cada respuesta marcando "completed" lo terminado y "in_progress" lo que estás ejecutando.
- NUNCA te saltes tareas pendientes para saltar a las del final. Aborda las tareas pendientes estrictamente en orden.

HERRAMIENTAS DISPONIBLES:
1. "eval_code": 🧪 EJECUCIÓN DE PRUEBAS EN SANDBOX: Ejecuta un script de prueba con assertions (en TypeScript/tsx, Python, etc.) en un entorno temporal aislado importando tu código recién programado para verificar que funciona exactamente como se espera.
2. "auto_test": 🏃 RUNNER DE PRUEBAS DEL PROYECTO: Ejecuta las pruebas unitarias del repositorio (Vitest, Jest, PyTest, Node Test Runner, PHPUnit) de todo el proyecto o de un archivo específico ("targetFile").
3. "codegraph": Consulta instantáneamente el grafo de símbolos AST (clases, funciones, quién llama a quién). Usa "symbol" para inspeccionar un símbolo, "query" para buscar, o sin parámetros para ver la jerarquía completa sin gastar tokens abriendo archivos.
4. "use_skill": Activa una metodología o habilidad especializada instalada (usa "skill": "nombre").
5. "list_directory": Explora la estructura de archivos del proyecto.
6. "read_file": Lee archivos de código fuente existentes.
7. "write_file": Crea o sobrescribe archivos de código completos y funcionales (sin "// TODO").
8. "run_command": Ejecuta comandos de terminal (pruebas, npm, git, compiladores).
9. "grep": Busca coincidencias de un patrón regex en los archivos (usa "pattern"; "path" opcional).
10. "glob": Lista archivos/entradas por patrón glob (usa "pattern"; "path" opcional).
11. "check": Ejecuta el chequeo del proyecto (typecheck → lint → build, el primero disponible).
12. "delegate_task": Delega UNA tarea secundaria a un worker (${workersListStr}).
13. "delegate_batch": Delega VARIAS tareas a varios workers EN PARALELO con "tasks": [{ "agent": "...", "prompt": "..." }].
14. "finish": Concluye cuando el objetivo del usuario esté 100% completado y verificado.

REGLA DE AUTO-VERIFICACIÓN OBLIGATORIA (PROBAR ANTES DE FINALIZAR):
- ¡NUNCA des una tarea por finalizada sin haber comprobado tu código en ejecución!
- Después de escribir o modificar código con "write_file", DEBES usar "eval_code" (para probar funciones con asserts), "auto_test" o "run_command" (npm test).
- Si la prueba falla, analiza el error o stack trace, re-escribe el código con "write_file" y vuelve a probar hasta que pase al 100%. Solo cuando la prueba sea exitosa puedes llamar a "finish".

DELEGACIÓN AUTÓNOMA INTELIGENTE:
- Si la instrucción es compleja o requiere múltiples análisis, DELEGA DE FORMA AUTÓNOMA en paralelo sin esperar a que el usuario te lo pida:
  • Claude: Refactorización profunda, arquitectura limpia y auditoría de bugs.
  • DeepSeek: Lógica matemática, algoritmos y orquestación principal.
  • ChatGPT: Suites de pruebas unitarias (Vitest, Jest), documentación y scripts.
  • Gemini: Búsqueda rápida de contexto y análisis de múltiples dependencias.

Consejos:
- Usa "codegraph" primero para entender la arquitectura del proyecto en 1 paso antes de leer archivos.
- Usa grep/glob para encontrar código antes de leer archivos grandes.
- Ejecuta "check" tras escribir código para validar tipos/lint.
- En "delegate_batch", si un worker falla igual debes continuar con el resto.

Comienza analizando el proyecto y decidiendo la primera acción en JSON.`;
    }
    /**
     * Genera prompt para turnos de conversación sucesivos
     */
    buildTurnPrompt(userGoal) {
        const planNote = this.options.planOnly
            ? '\n[MODO PLAN ONLY: simula write_file/run_command sin aplicarlos; termina con finish + plan].'
            : '';
        const todosPrompt = this.buildTodosContextPrompt();
        return `NUEVA INSTRUCCIÓN DEL USUARIO EN LA SESIÓN DE BARHEL:
"${userGoal}"
${planNote}${todosPrompt}
Continúa en este mismo contexto del workspace (${this.toolEngine.getWorkdir()}).
Recuerda responder ESTRICTAMENTE en formato JSON con tu "thought", tu lista "todos" actualizada y tu "action" (read_file, write_file, run_command, list_directory, grep, glob, check, eval_code, auto_test, delegate_task, delegate_batch, finish).
Aborda la siguiente tarea pendiente en orden secuencial sin saltarte pasos.`;
    }
}
//# sourceMappingURL=Orchestrator.js.map