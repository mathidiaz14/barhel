import { BaseDriver } from '../drivers/BaseDriver.js';
import { DriverFactory } from '../drivers/DriverFactory.js';
import { ToolEngine } from './ToolEngine.js';
import { ResponseParser } from './ResponseParser.js';
import { CLIOptions, WorkerAgentType } from '../types/actions.js';
import { ProviderType } from '../types/providers.js';
import { logger } from '../utils/logger.js';
import { ConfigManager } from '../utils/config.js';
import { HistoryManager, ChatSession, TurnRecord } from '../utils/history.js';
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
    };

    this.leaderId = String(leader);
    this.activeWorkers = workers.map(String);
    this.toolEngine = new ToolEngine(this.options.workdir, this.options.autonomous);

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
    });
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

  /**
   * Ejecuta un turno de conversación (ReAct Loop) sin cerrar el navegador al terminar
   */
  public async runTurn(userGoal: string): Promise<void> {
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
    const currentTurnRecord: TurnRecord = {
      prompt: userGoal,
      timestamp: new Date().toISOString(),
    };

    while (iteration < maxIterations && !this.isShuttingDown) {
      iteration++;
      logger.info(`Paso ReAct ${iteration}/${maxIterations}...`);

      let responseRaw: string;
      try {
        responseRaw = await this.leaderDriver.sendMessage(nextPrompt);
      } catch (err) {
        logger.error(`Error de comunicación con ${this.leaderDriver.displayName}`, err);
        break;
      }

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
          const retryRaw = await this.leaderDriver.sendMessage(parseResult.correctionPrompt!);
          parseResult = ResponseParser.parse(retryRaw);
        } catch (retryErr) {
          logger.error('Fallo en la reintentación de formato JSON', retryErr);
        }
      }

      if (!parseResult.success || !parseResult.data) {
        logger.error(`Imposible obtener JSON estructurado tras autocorrección. Respuesta recibida:\n${responseRaw}`);
        break;
      }

      const { thought, action } = parseResult.data;
      currentTurnRecord.thought = thought;
      currentTurnRecord.actionType = action.type;
      currentTurnRecord.summary = action.summary;

      // Mostrar razonamiento del modelo
      logger.thought(thought);

      // Mostrar acción
      logger.action(action.type, {
        path: action.path,
        command: action.command,
        agent: action.agent,
        prompt: action.prompt,
        summary: action.summary,
      });

      // Manejar finalización de la tarea
      if (action.type === 'finish') {
        logger.success(`\n🎉 TAREA COMPLETADA:\n${pc.cyan(action.summary || 'Fin del trabajo.')}\n`);
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
        logger.worker(targetAgent, `Delegando subtarea:\n${pc.dim(action.prompt)}`);
        try {
          const workerDriver = await this.getWorkerDriver(targetAgent);
          const workerResponse = await workerDriver.sendMessage(action.prompt);
          logger.worker(targetAgent, `Respuesta recibida (${workerResponse.length} caracteres).`);

          logger.toolResult(`delegate_task (${targetAgent})`, true, workerResponse);
          nextPrompt = `[OBSERVATION DELEGATE_TASK (${targetAgent.toUpperCase()})]:\n${workerResponse}\n\nContinúa con tu razonamiento y el siguiente paso en formato JSON.`;
        } catch (workerErr) {
          const errMsg = workerErr instanceof Error ? workerErr.message : String(workerErr);
          logger.error(`Error en worker ${targetAgent}`, workerErr);
          nextPrompt = `[OBSERVATION ERROR WORKER ${targetAgent.toUpperCase()}]: ${errMsg}\nPor favor resuelve la tarea con tus herramientas locales.`;
        }
        continue;
      }

      // Ejecutar herramientas locales del sistema
      const toolResult = await this.toolEngine.execute(action);
      logger.toolResult(action.type, toolResult.success, toolResult.output);

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
    }

    // Persistir registro de turno y sesión en disco
    this.currentSession.turns.push(currentTurnRecord);
    const finalChatUrl = this.leaderDriver.getChatUrl();
    if (finalChatUrl) {
      this.currentSession.chatUrl = finalChatUrl;
    }
    HistoryManager.saveSession(this.currentSession);

    if (iteration >= maxIterations) {
      logger.warn(`Se alcanzó el límite de pasos ReAct (${maxIterations}).`);
    }
  }

  /**
   * Cierra ordenadamente todas las instancias de navegadores y persiste la sesión
   */
  public async shutdown(): Promise<void> {
    try {
      const finalChatUrl = this.leaderDriver.getChatUrl();
      if (finalChatUrl) {
        this.currentSession.chatUrl = finalChatUrl;
      }
      HistoryManager.saveSession(this.currentSession);

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

    return `ERES BARHEL (${leaderName}), UN ASISTENTE DE CODIFICACIÓN CLI AUTÓNOMO Y AVANZADO (ESTILO OPENCODE / CLAUDE CODE).
Tu objetivo es resolver la siguiente instrucción del usuario en su proyecto local:
"${userGoal}"

DIRECTORIO DE TRABAJO: ${this.toolEngine.getWorkdir()}

PROTOCOLO DE ACCIÓN REACT OBLIGATORIO:
Debes responder SIEMPRE Y EXCLUSIVAMENTE con un único bloque JSON válido:

\`\`\`json
{
  "thought": "Explicación detallada de tu razonamiento, análisis de código y próximos pasos a seguir.",
  "action": {
    "type": "read_file" | "write_file" | "run_command" | "list_directory" | "delegate_task" | "finish",
    "path": "ruta/relativa/archivo",
    "content": "contenido completo del archivo en UTF-8",
    "command": "comando terminal a ejecutar",
    "agent": "${workersListStr}",
    "prompt": "instrucción para el worker secundario",
    "summary": "resumen exhaustivo de los cambios realizados al terminar"
  }
}
\`\`\`

HERRAMIENTAS DISPONIBLES:
1. "list_directory": Explora la estructura de archivos del proyecto.
2. "read_file": Lee archivos de código fuente existentes.
3. "write_file": Crea o sobrescribe archivos de código completos y funcionales (sin "// TODO").
4. "run_command": Ejecuta comandos de terminal (pruebas, npm, git, compiladores).
5. "delegate_task": Delega tareas secundarias a los workers disponibles (${workersListStr}).
6. "finish": Concluye cuando el objetivo del usuario esté 100% completado y verificado.

Comienza analizando el proyecto y decidiendo la primera acción en JSON.`;
  }

  /**
   * Genera prompt para turnos de conversación sucesivos
   */
  private buildTurnPrompt(userGoal: string): string {
    return `NUEVA INSTRUCCIÓN DEL USUARIO EN LA SESIÓN DE BARHEL:
"${userGoal}"

Continúa en este mismo contexto del workspace (${this.toolEngine.getWorkdir()}).
Recuerda responder ESTRICTAMENTE en formato JSON con tu "thought" y tu "action" (read_file, write_file, run_command, list_directory, delegate_task, finish).`;
  }
}
