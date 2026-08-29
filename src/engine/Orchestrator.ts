import { BaseDriver } from '../drivers/BaseDriver.js';
import { DriverFactory } from '../drivers/DriverFactory.js';
import { ToolEngine } from './ToolEngine.js';
import { ResponseParser } from './ResponseParser.js';
import { CLIOptions, WorkerAgentType } from '../types/actions.js';
import { ProviderType } from '../types/providers.js';
import { logger } from '../utils/logger.js';
import { ConfigManager } from '../utils/config.js';
import { HistoryManager, ChatSession, TurnRecord } from '../utils/history.js';
import { getSessionBasePath } from '../utils/session.js';
import { gitCommit, gitDiff, gitStatus } from '../utils/git.js';
import { TUI } from '../cli/tui.js';
import fs from 'node:fs';
import path from 'node:path';
import pc from 'picocolors';

export class Orchestrator {
  private leaderDriver: BaseDriver;
  private leaderId: string;
  private activeWorkers: string[];
  private workerDrivers: Map<string, BaseDriver> = new Map();
  private toolEngine: ToolEngine;
  private options: CLIOptions;
  private currentSession: ChatSession;
  private isShuttingDown = false;
  private isInitialized = false;
  private turnCount = 0;
  private shutdownPromise: Promise<void> | null = null;

  private fallbackOrder: string[] = [];
  private fallbackUsed: Set<string> = new Set();
  private sendFailures = 0;
  private autoSummarize: boolean;
  private autoCommit: boolean;

  constructor(options: CLIOptions = {}) {
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
      } else {
        this.currentSession = HistoryManager.createSession({
          workdir: this.options.workdir,
          leader: this.leaderId,
          workers: this.activeWorkers,
        });
      }
    } else {
      this.currentSession = HistoryManager.createSession({
        workdir: this.options.workdir,
        leader: this.leaderId,
        workers: this.activeWorkers,
      });
    }

    this.turnCount = this.currentSession.turns.length;
    this.leaderDriver = DriverFactory.createDriver(this.leaderId);

    if (this.currentSession.chatUrl) {
      this.leaderDriver.setChatUrl(this.currentSession.chatUrl);
    }

    this.setupProcessSignals();
  }

  public getSession(): ChatSession {
    return this.currentSession;
  }

  public getSessionId(): string {
    return this.currentSession.id;
  }

  public getSessionTitle(): string {
    return this.currentSession.title;
  }

  public setSessionTitle(newTitle: string): void {
    this.currentSession.title = newTitle.trim();
    HistoryManager.saveSession(this.currentSession);
  }

  public getLeaderId(): string {
    return this.leaderId;
  }

  public getActiveWorkers(): string[] {
    return this.activeWorkers;
  }

  public getWorkdir(): string {
    return this.toolEngine.getWorkdir();
  }

  public isAutonomous(): boolean {
    return this.options.autonomous ?? false;
  }

  public toggleAutonomous(): boolean {
    this.options.autonomous = !this.options.autonomous;
    this.toolEngine.setAutonomous(this.options.autonomous);
    return this.options.autonomous;
  }

  /**
   * Cambia dinámicamente el modelo líder o los workers
   */
  public async switchModels(newLeaderId: string, newWorkers: string[]): Promise<void> {
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
  }

  public isPlanOnly(): boolean {
    return this.options.planOnly ?? false;
  }

  public togglePlanOnly(): boolean {
    this.options.planOnly = !this.options.planOnly;
    this.toolEngine.setPlanOnly(this.options.planOnly ?? false);
    return this.options.planOnly ?? false;
  }

  public getFallbackOrder(): string[] {
    return this.fallbackOrder;
  }

  public async setLeader(leaderId: string): Promise<void> {
    await this.switchModels(leaderId, this.activeWorkers);
  }

  public async setPlanOnly(planOnly: boolean): Promise<void> {
    this.options.planOnly = planOnly;
    this.toolEngine.setPlanOnly(planOnly);
  }

  /**
   * Genera (o regenera) el resumen de memoria de la sesión usando el líder
   */
  public async summarizeSession(): Promise<string | null> {
    if (this.currentSession.turns.length === 0) {
      logger.warn('No hay turnos para resumir.');
      return this.currentSession.summary ?? null;
    }
    return this.summarizeSessionInternal();
  }

  /**
   * Prepara un commit git con los cambios del workspace
   */
  public async commitWork(message?: string): Promise<string> {
    const cleanMsg = (message || '').trim() || 'Barhel: tarea completada';
    return await gitCommit(this.toolEngine.getWorkdir(), cleanMsg);
  }

  /**
   * Repositorio: estado y diff actual
   */
  public async reviewGit(): Promise<string> {
    const status = await gitStatus(this.toolEngine.getWorkdir());
    const diff = await gitDiff(this.toolEngine.getWorkdir());
    return `[GIT STATUS]\n${status}\n\n[GIT DIFF]\n${diff}`;
  }

  /**
   * Cambia a una sesión guardada previa, cargando su hilo web exacto
   */
  public async switchSession(sessionId: string): Promise<ChatSession> {
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
  public async startNewSession(title?: string): Promise<ChatSession> {
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
  private setupProcessSignals(): void {
    const cleanup = async () => {
      if (this.isShuttingDown) return;
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
  public async initSession(): Promise<void> {
    if (this.isInitialized) return;
    const leaderMeta = DriverFactory.getMeta(this.leaderId);
    const leaderName = leaderMeta?.name || this.leaderId;

    logger.startSpinner(`Iniciando sesión de Barhel con ${leaderName}...`);
    try {
      await this.leaderDriver.init(this.options.headless, this.currentSession.chatUrl);
      this.isInitialized = true;
      logger.stopSpinner();
      logger.success(`Barhel está listo con Agente Líder [${leaderName}].`);
    } catch (err) {
      logger.stopSpinner();
      logger.error(`Error al inicializar sesión de ${leaderName}`, err);
      throw err;
    }
  }

  /**
   * Obtiene o inicializa perezosamente un driver de worker
   */
  private async getWorkerDriver(agentType: WorkerAgentType): Promise<BaseDriver> {
    const key = String(agentType).toLowerCase().trim();
    if (this.workerDrivers.has(key)) {
      return this.workerDrivers.get(key)!;
    }

    const driver = DriverFactory.createDriver(key);
    const meta = DriverFactory.getMeta(key);
    const displayName = meta?.name || key.toUpperCase();

    logger.info(`Inicializando worker secundario [${displayName}]...`);
    await driver.init(this.options.headless);
    this.workerDrivers.set(key, driver);
    return driver;
  }

  public isTurnRunning = false;
  private isInterrupted = false;

  /**
   * Cancela o interrumpe en caliente la generación y razonamiento actual del LLM
   */
  public async interruptCurrentTurn(): Promise<void> {
    this.isInterrupted = true;
    TUI.stopThinking();
    logger.stopSpinner();
    try {
      await this.leaderDriver.stopGeneration();
      for (const [, driver] of this.workerDrivers.entries()) {
        await driver.stopGeneration();
      }
    } catch {
      // Ignorar errores de cancelación
    }
  }

  /**
   * Ejecuta un turno de conversación (ReAct Loop) sin cerrar el navegador al terminar
   */
  public async runTurn(userGoal: string): Promise<void> {
    this.isTurnRunning = true;
    this.isInterrupted = false;

    if (!this.isInitialized) {
      await this.initSession();
    }

    // Auto-generar título si es la primera instrucción de la sesión
    if (
      this.currentSession.turns.length === 0 ||
      this.currentSession.title === 'Nueva sesión de trabajo' ||
      this.currentSession.title === 'Nueva sesión'
    ) {
      this.currentSession.title = HistoryManager.generateTitle(userGoal);
    }

    this.turnCount++;
    const isFirstTurn = this.turnCount === 1;
    let nextPrompt = isFirstTurn ? this.buildSystemPrompt(userGoal) : this.buildTurnPrompt(userGoal);

    let iteration = 0;
    const maxIterations = this.options.maxIterations ?? 25;
    const iteratorState = { fallbackRetries: 0 };
    const currentTurnRecord: TurnRecord = {
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

        let responseRaw: string;
        try {
          responseRaw = await this.leaderDriver.sendMessage(nextPrompt);
          this.sendFailures = 0;
        } catch (err) {
          TUI.stopThinking();
          if (this.isInterrupted) {
            break;
          }
          this.sendFailures++;
        logger.error(`Error de comunicación con ${this.leaderDriver.displayName}`, err);

        const fallback = this.getNextFallback();
        if (fallback) {
          logger.warn(`Proveedor primario falló (${this.sendFailures}x) → usando respaldo [${fallback}]`);
          await this.applyFallbackLeader(fallback);
          if (!this.isInitialized) {
            try {
              await this.initSession();
            } catch (initErr) {
              logger.error('Fallo al inicializar el líder de respaldo', initErr);
              break;
            }
          }
          iteratorState.fallbackRetries++;
          continue;
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
          const retryRaw = await this.leaderDriver.sendMessage(parseResult.correctionPrompt!);
          TUI.stopThinking();
          parseResult = ResponseParser.parse(retryRaw);
        } catch (retryErr) {
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

      // Mostrar acción a ejecutar
      TUI.renderAction(action.type, {
        path: action.path,
        command: action.command,
        agent: action.agent,
        prompt: action.prompt,
        tasks: action.tasks,
        pattern: action.pattern,
        summary: action.summary,
      });

      // Manejar finalización de la tarea
      if (action.type === 'finish') {
        logger.success(`\n🎉 TAREA COMPLETADA:\n${pc.cyan(action.summary || 'Fin del trabajo.')}\n`);
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
        } catch (workerErr) {
          TUI.stopThinking();
          const errMsg = workerErr instanceof Error ? workerErr.message : String(workerErr);
          logger.error(`Error en worker ${targetAgent}`, workerErr);
          nextPrompt = `[OBSERVATION ERROR WORKER ${targetAgent.toUpperCase()}]: ${errMsg}\nPor favor resuelve la tarea con tus herramientas locales.`;
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

        const batchResults: { agent: string; ok: boolean; response?: string; error?: string; ms: number }[] = [];

        await Promise.all(
          tasks.map(async (task) => {
            const target = String(task.agent).toLowerCase();
            const workerStart = performance.now();
            try {
              const workerDriver = await this.getWorkerDriver(target);
              const workerResponse = await workerDriver.sendMessage(task.prompt);
              const ms = Math.round(performance.now() - workerStart);
              batchResults.push({ agent: target, ok: true, response: workerResponse, ms });
              TUI.renderWorkerDelegation(target, task.prompt, workerResponse, ms);
            } catch (batchErr) {
              const ms = Math.round(performance.now() - workerStart);
              const errMsg = batchErr instanceof Error ? batchErr.message : String(batchErr);
              batchResults.push({ agent: target, ok: false, error: errMsg, ms });
              logger.error(`Error en worker ${target} (batch)`, batchErr);
            }
          })
        );

        const summaryParts = batchResults.map((r) =>
          r.ok
            ? `[WORKER ${r.agent.toUpperCase()}] (${r.ms}ms):\n${r.response}`
            : `[WORKER ${r.agent.toUpperCase()}] FALLÓ (${r.ms}ms): ${r.error}`
        );

        nextPrompt = `[OBSERVATION DELEGATE_BATCH]:\n${summaryParts.join('\n\n')}\n\nSintetiza los resultados de los workers y continúa tu razonamiento en formato JSON.`;
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
      } else {
        nextPrompt = `[OBSERVATION FAILED]:\n${toolResult.output || toolResult.error}\n\nAnaliza la causa del error, ajusta tu plan y responde en formato JSON.`;
      }
      if (iteration - iteratorState.fallbackRetries >= maxIterations) {
        logger.warn(`Se alcanzó el límite de pasos ReAct (${maxIterations}).`);
      }
    }
  } finally {
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

      if (this.isInterrupted) {
        console.log(pc.yellow('\n[interrupted] Generación cancelada por el usuario.\n'));
      }
    }
  }

  /**
   * Devuelve el próximo proveedor de respaldo disponible (no el actual, no usado aún)
   */
  private getNextFallback(): string | null {
    for (const id of this.fallbackOrder) {
      const key = String(id).toLowerCase().trim();
      if (key !== this.leaderId && !this.fallbackUsed.has(key) && DriverFactory.getMeta(key)) {
        return key;
      }
    }
    return null;
  }

  /**
   * Cambia el líder actual a un proveedor de respaldo (nuevo hilo web para ese proveedor)
   */
  private async applyFallbackLeader(fallbackId: string): Promise<void> {
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
  private dumpRawResponse(raw: string, reason: string): void {
    try {
      const debugDir = path.join(getSessionBasePath(), 'debug');
      fs.mkdirSync(debugDir, { recursive: true });
      const filePath = path.join(debugDir, `${this.currentSession.id}-${Date.now()}.txt`);
      fs.writeFileSync(filePath, `# ${reason}\n# ${new Date().toISOString()}\n\n${raw}`, 'utf-8');
      logger.info(`Respuesta cruda guardada en ${filePath}`);
    } catch {
      // Silencioso: el diagnóstico es best-effort
    }
  }

  /**
   * Resume los turnos nuevos de la sesión y persiste el resumen en memoria
   */
  private async summarizeSessionInternal(): Promise<string | null> {
    const since = this.currentSession.lastSummarizedTurnIndex ?? 0;
    const newTurns = this.currentSession.turns.slice(since);
    if (newTurns.length === 0) {
      return this.currentSession.summary ?? null;
    }

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
    } catch (err) {
      TUI.stopThinking();
      logger.warn(`No se pudo generar el resumen automático: ${err}`);
      return this.currentSession.summary ?? null;
    }
  }

  /**
   * Auto-commit al concluir la tarea si autoCommit está activo en modo autónomo
   */
  private async tryAutoCommit(summary?: string): Promise<void> {
    const firstLine = (summary || '').split('\n')[0].replace(/^[#*\-–\s]+/, '');
    const message = (firstLine && firstLine.length > 3 && firstLine.length <= 72 ? firstLine : 'Barhel: tarea completada').trim();
    logger.info(`autoCommit activo → commit "${message}"`);
    const result = await gitCommit(this.toolEngine.getWorkdir(), message);
    if (result.startsWith('[git')) {
      logger.warn(result);
    } else {
      logger.success('Auto-commit realizado.');
      console.log(pc.dim(result));
    }
  }

  /**
   * Cierra ordenadamente todas las instancias de navegadores y persiste la sesión
   */
  public async shutdown(): Promise<void> {
    if (this.shutdownPromise) return this.shutdownPromise;
    this.isShuttingDown = true;
    this.shutdownPromise = this.doShutdown();
    return this.shutdownPromise;
  }

  private async doShutdown(): Promise<void> {
    try {
      const finalChatUrl = this.leaderDriver.getChatUrl();
      if (finalChatUrl) {
        this.currentSession.chatUrl = finalChatUrl;
      }
      HistoryManager.saveSession(this.currentSession);

      // Memoria a largo plazo: resumir automáticamente los turnos nuevos antes de cerrar
      if (this.autoSummarize && this.isInitialized && this.currentSession.turns.length > 0) {
        await this.summarizeSessionInternal();
      }

      await this.leaderDriver.close();
      for (const [, driver] of this.workerDrivers.entries()) {
        await driver.close();
      }
      this.workerDrivers.clear();
      this.isInitialized = false;
    } catch (err) {
      logger.warn(`Error durante el apagado: ${err}`);
    }
  }

  /**
   * Genera el System Prompt inicial
   */
  private buildSystemPrompt(userGoal: string): string {
    const workersListStr =
      this.activeWorkers.length > 0
        ? this.activeWorkers.join(' | ')
        : 'chatgpt | gemini | claude | qwen | mistral | perplexity';

    const leaderMeta = DriverFactory.getMeta(this.leaderId);
    const leaderName = leaderMeta?.name || this.leaderId;

    const planOnlyNote = this.options.planOnly
      ? `\nMODO PLAN ONLY ACTIVADO: NO ejecutes write_file ni run_command de verdad. Solo devuelve el plan que ejecutarías (el sistema simula la escritura/ejecución y NO aplica cambios). Termina con finish + summary describiendo el plan completo.`
      : '';

    const summaryNote = this.currentSession.summary
      ? `\nCONTEXTO DE MEMORIA DE SESIONES ANTERIORES:\n${this.currentSession.summary}\n`
      : '';

    return `ERES BARHEL (${leaderName}), UN ASISTENTE DE CODIFICACIÓN CLI AUTÓNOMO Y AVANZADO (ESTILO OPENCODE / CLAUDE CODE).
Tu objetivo es resolver la siguiente instrucción del usuario en su proyecto local:
"${userGoal}"

DIRECTORIO DE TRABAJO: ${this.toolEngine.getWorkdir()}
${planOnlyNote}${summaryNote}
PROTOCOLO DE ACCIÓN REACT OBLIGATORIO:
Debes responder SIEMPRE Y EXCLUSIVAMENTE con un único bloque JSON válido:

\`\`\`json
{
  "thought": "Explicación detallada de tu razonamiento, análisis de código y próximos pasos a seguir.",
  "action": {
    "type": "read_file" | "write_file" | "run_command" | "list_directory" | "grep" | "glob" | "check" | "delegate_task" | "delegate_batch" | "finish",
    "path": "ruta/relativa/archivo",
    "content": "contenido completo del archivo en UTF-8",
    "command": "comando terminal a ejecutar",
    "pattern": "patrón regex (grep) o glob (glob)",
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

HERRAMIENTAS DISPONIBLES:
1. "list_directory": Explora la estructura de archivos del proyecto.
2. "read_file": Lee archivos de código fuente existentes.
3. "write_file": Crea o sobrescribe archivos de código completos y funcionales (sin "// TODO").
4. "run_command": Ejecuta comandos de terminal (pruebas, npm, git, compiladores).
5. "grep": Busca coincidencias de un patrón regex en los archivos (usa "pattern"; "path" opcional).
6. "glob": Lista archivos/entradas por patrón glob (usa "pattern"; "path" opcional).
7. "check": Ejecuta el chequeo del proyecto (typecheck → lint → build, el primero disponible).
8. "delegate_task": Delega UNA tarea secundaria a un worker (${workersListStr}).
9. "delegate_batch": Delega VARIAS tareas a varios workers EN PARALELO con "tasks": [{ "agent": "...", "prompt": "..." }].
10. "finish": Concluye cuando el objetivo del usuario esté 100% completado y verificado.

Consejos:
- Usa grep/glob para encontrar código antes de leer archivos grandes.
- Ejecuta "check" tras escribir código para validar tipos/lint.
- Prefiere "write_file" sobre "read_file"+modificaciones manuales grandes.
- En "delegate_batch", si un worker falla igual debes continuar con el resto.

Comienza analizando el proyecto y decidiendo la primera acción en JSON.`;
  }

  /**
   * Genera prompt para turnos de conversación sucesivos
   */
  private buildTurnPrompt(userGoal: string): string {
    const planNote = this.options.planOnly
      ? '\n[MODO PLAN ONLY: simula write_file/run_command sin aplicarlos; termina con finish + plan].'
      : '';
    return `NUEVA INSTRUCCIÓN DEL USUARIO EN LA SESIÓN DE BARHEL:
"${userGoal}"
${planNote}
Continúa en este mismo contexto del workspace (${this.toolEngine.getWorkdir()}).
Recuerda responder ESTRICTAMENTE en formato JSON con tu "thought" y tu "action" (read_file, write_file, run_command, list_directory, grep, glob, check, delegate_task, delegate_batch, finish).`;
  }
}
