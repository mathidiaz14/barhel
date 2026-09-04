import readline from 'node:readline';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import pc from 'picocolors';
import { search, input as promptInput } from '@inquirer/prompts';
import { Orchestrator } from '../engine/Orchestrator.js';
import { logger } from '../utils/logger.js';
import { listSessionsStatus, getSessionBasePath } from '../utils/session.js';
import { DriverFactory } from '../drivers/DriverFactory.js';
import { ConfigManager } from '../utils/config.js';
import { HistoryManager } from '../utils/history.js';
import { TUI } from './tui.js';
import { execSync } from 'node:child_process';
import { CodeGraphEngine } from '../codegraph/CodeGraphEngine.js';
import { SkillManager } from '../skills/SkillManager.js';
import { ProgressSupervisor } from '../engine/ProgressSupervisor.js';
import { TelegramBot } from '../daemon/TelegramBot.js';
import { DaemonManager } from '../daemon/DaemonManager.js';
import { runDoctorDiagnostic } from './doctor.js';
function openInBrowser(url) {
    try {
        const platform = process.platform;
        if (platform === 'win32') {
            execSync(`start "" "${url}"`);
        }
        else if (platform === 'darwin') {
            execSync(`open "${url}"`);
        }
        else {
            execSync(`xdg-open "${url}"`);
        }
    }
    catch {
        // Silencioso si no se abre el navegador
    }
}
const AVAILABLE_SLASH_COMMANDS = [
    { name: '/web', desc: 'Inicia, detiene o abre el servidor web de Barhel (start/stop/status/open)', aliases: ['/server', '/dashboard'], needsArg: 'Acción o puerto (start/stop/status/open [puerto]):', optionalArg: true },
    { name: '/doctor', desc: 'Diagnóstico profundo de autenticación de sesión, Cloudflare y selectores UI', needsArg: 'Proveedor (opcional):', optionalArg: true },
    { name: '/test', desc: 'Ejecuta o genera pruebas unitarias automáticas para el proyecto', needsArg: 'Archivo o filtro (opcional):', optionalArg: true },
    { name: '/graph', desc: 'Mapa de arquitectura AST y búsqueda de símbolos en memoria', aliases: ['/codegraph'], needsArg: 'Símbolo o consulta (opcional):', optionalArg: true },
    { name: '/skills', desc: 'Lista las skills instaladas estilo Claude Code' },
    { name: '/skill', desc: 'Instala o inspecciona una skill (ej: /skill install <url>)', needsArg: 'Comando o URL de la skill:' },
    { name: '/progress', desc: 'Supervisión en vivo y avance (%) de los agentes', aliases: ['/supervise'] },
    { name: '/telegram', desc: 'Configura o inicia el bot de Telegram en segundo plano', needsArg: 'Token de Telegram (opcional):', optionalArg: true },
    { name: '/daemon', desc: 'Inicia, detiene o revisa el estado del daemon (start/stop/status)', needsArg: 'Acción (start/stop/status):', optionalArg: true },
    { name: '/workers', desc: 'Inspector de analisis de agentes secundarios (Claude, ChatGPT, etc.)', aliases: ['/analysis', '/inspect'] },
    { name: '/think', desc: 'Alterna modo de razonamiento (resumido / extendido)', aliases: ['/thinking'] },
    { name: '/resume', desc: 'Reanuda una sesion anterior con todo su contexto', aliases: ['/history'] },
    { name: '/new', desc: 'Inicia una nueva sesion limpia con chat nuevo en el LLM' },
    { name: '/title', desc: 'Cambia el titulo descriptivo de la sesion actual', needsArg: 'Nuevo titulo:' },
    { name: '/sessions', desc: 'Lista el historial de sesiones guardadas', aliases: ['/list'] },
    { name: '/config', desc: 'Configura modelo Lider y Workers', aliases: ['/models'] },
    { name: '/auto', desc: 'Alterna entre modo Autonomo y Seguro [y/N]' },
    { name: '/status', desc: 'Muestra estado de autenticacion de proveedores' },
    { name: '/plan', desc: 'Alterna modo PLAN ONLY (simula cambios sin aplicarlos)' },
    { name: '/commit', desc: 'Commit git de los cambios del workspace', needsArg: 'Mensaje de commit (opcional):', optionalArg: true },
    { name: '/review', desc: 'Muestra git status y diff detallado del workspace' },
    { name: '/explain', desc: 'Pide al lider que explique un simbolo o archivo', needsArg: 'Simbolo o archivo a explicar:' },
    { name: '/fix', desc: 'Pide al lider que analice y corrija errores del proyecto', needsArg: 'Descripcion del error (opcional):', optionalArg: true },
    { name: '/export', desc: 'Exporta la sesion actual a Markdown o JSON', needsArg: 'Formato (md/json) o ruta:', optionalArg: true },
    { name: '/backup', desc: 'Exporta todas las sesiones de autenticación e historial a un archivo (.tar.gz)', needsArg: 'Ruta del archivo (opcional):', optionalArg: true },
    { name: '/restore', desc: 'Importa sesiones de autenticación e historial desde un archivo (.tar.gz)', needsArg: 'Ruta del archivo:' },
    { name: '/summarize', desc: 'Genera y muestra el resumen de memoria de la sesion' },
    { name: '/leader', desc: 'Cambia el modelo lider rapidamente', needsArg: 'Nombre del modelo:' },
    { name: '/login', desc: 'Inicia sesion en la interfaz web de un proveedor' },
    { name: '/import-sessions', desc: 'Importa sesiones de Chrome/Edge a los perfiles de barhel', aliases: ['/import'] },
    { name: '/clear-sessions', desc: 'Borra las sesiones de autenticación de los proveedores', aliases: ['/clear-sessions'] },
    { name: '/clear', desc: 'Limpia la pantalla de la terminal' },
    { name: '/help', desc: 'Muestra la lista de todos los comandos y ayuda' },
    { name: '/exit', desc: 'Cierra Barhel y guarda la sesion', aliases: ['/quit'] },
];
export async function startInteractiveChat(options = {}) {
    let targetSessionId = options.sessionId;
    if (targetSessionId) {
        const existing = HistoryManager.getSession(targetSessionId);
        if (existing) {
            targetSessionId = existing.id;
        }
        else {
            logger.warn(`No se encontró la sesión "${targetSessionId}". Se iniciará una nueva sesión.`);
            targetSessionId = undefined;
        }
    }
    else if (options.resume) {
        const selected = await HistoryManager.promptSelectSession(options.workdir || process.cwd());
        if (selected) {
            targetSessionId = selected.id;
        }
    }
    else if (!options.isNewSession) {
        // Si hay una sesión previa en este workspace, cargarla automáticamente para no perder memoria ni chat
        const workspaceSessions = HistoryManager.listSessions(options.workdir || process.cwd());
        if (workspaceSessions.length > 0) {
            targetSessionId = workspaceSessions[0].id;
        }
    }
    const userConfig = await ConfigManager.getOrPromptConfig();
    const mergedOptions = {
        ...options,
        sessionId: targetSessionId,
        leader: options.leader || userConfig.leader,
        workers: options.workers || userConfig.workers,
    };
    const orchestrator = new Orchestrator(mergedOptions);
    const workdir = orchestrator.getWorkdir();
    let activeWebServer = null;
    const stopActiveWebServer = async () => {
        if (activeWebServer) {
            try {
                await activeWebServer.stop();
            }
            catch {
                // silencioso
            }
            activeWebServer = null;
        }
    };
    const printExitMessage = () => {
        const sess = orchestrator.getSession();
        console.log(`\n${pc.bold('Sesión guardada:')} ${pc.cyan(sess.title)} ${pc.dim(`(#${sess.id})`)}`);
        console.log(`Para reanudar esta sesión, ejecuta:`);
        console.log(`  ${pc.bold(pc.green(`barhel -s ${sess.id}`))}\n`);
    };
    const printCurrentBanner = () => {
        const leaderMeta = DriverFactory.getMeta(orchestrator.getLeaderId());
        const leaderName = leaderMeta?.name || orchestrator.getLeaderId();
        const workersNames = orchestrator.getActiveWorkers().join(', ');
        TUI.renderBanner(workdir, orchestrator.isAutonomous(), leaderName, workersNames, orchestrator.getSessionTitle(), orchestrator.getSessionId(), orchestrator.getSession().todos, orchestrator.getSession());
    };
    try {
        await orchestrator.initSession();
    }
    catch (err) {
        const leaderId = orchestrator.getLeaderId();
        logger.error(`No se pudo inicializar la sesion con ${leaderId}.`, err);
        console.log(pc.yellow('\nTip: Asegurate de haber iniciado sesion previamente con:'));
        console.log(pc.bold(pc.cyan(`  barhel login ${leaderId}\n`)));
        process.exit(1);
    }
    // Renderizar dashboard completo en pantalla dividida
    printCurrentBanner();
    // Historial de prompts para navegación con flechas Arriba/Abajo
    const promptHistory = [];
    const syncPromptHistory = () => {
        promptHistory.length = 0;
        const turnPrompts = orchestrator.getSession().turns.map((t) => t.prompt).filter(Boolean);
        promptHistory.push(...[...turnPrompts].reverse());
    };
    syncPromptHistory();
    // Completer nativo para Tab
    const completer = (linePartial) => {
        const allCmds = AVAILABLE_SLASH_COMMANDS.flatMap((c) => [c.name, ...(c.aliases || [])]);
        const hits = allCmds.filter((c) => c.startsWith(linePartial));
        return [hits.length ? hits : allCmds, linePartial];
    };
    // Funcion ejecutora de comandos
    const runCommand = async (command, arg) => {
        switch (command) {
            case '/test': {
                const testSandbox = orchestrator.getToolEngine().getTestSandbox();
                logger.startSpinner(`Ejecutando pruebas ${arg ? `para ${arg}` : 'del proyecto'}...`);
                const result = await testSandbox.runProjectTests(arg ? arg.trim() : undefined);
                logger.stopSpinner();
                if (result.success) {
                    console.log(pc.green(`\n✔ [PRUEBAS EXITOSAS - ${result.durationMs}ms]:\n`));
                    console.log(result.output);
                }
                else {
                    console.log(pc.red(`\n✖ [FALLARON LAS PRUEBAS - ${result.durationMs}ms]:\n`));
                    console.log(result.output);
                    console.log(pc.yellow('\nTip: Puedes pedirle a Barhel que las corrija escribiendo: "/fix"'));
                }
                console.log();
                break;
            }
            case '/graph':
            case '/codegraph': {
                const codeGraph = new CodeGraphEngine(workdir);
                const query = (arg || '').trim();
                const forceRescan = ['sync', 'rescan', 'refresh', 'reindex', 'build', '-f', '--force'].includes(query.toLowerCase());
                if (forceRescan) {
                    logger.startSpinner('Re-escaneando e indexando repositorio completo en CodeGraph...');
                    await codeGraph.scan();
                    logger.stopSpinner();
                    console.log(pc.green('\n✔ [CODEGRAPH SINCRONIZADO] Grafo de arquitectura AST actualizado en memoria y disco.\n'));
                    console.log(`\n${codeGraph.getHierarchy()}\n`);
                    break;
                }
                logger.startSpinner('Consultando CodeGraph en memoria...');
                await codeGraph.ensureLoaded();
                logger.stopSpinner();
                if (query) {
                    const info = codeGraph.inspectSymbol(query);
                    if (!info.includes('no encontrado')) {
                        console.log(`\n${info}\n`);
                    }
                    else {
                        const matches = codeGraph.search(query);
                        if (matches.length > 0) {
                            console.log(pc.bold(`\nSímbolos coincidentes con "${query}":`));
                            for (const m of matches.slice(0, 20)) {
                                console.log(`  ${pc.cyan(`[${m.kind}]`)} ${pc.white(m.name)} ${pc.dim(`(${m.file}:${m.line})`)}`);
                            }
                            console.log();
                        }
                        else {
                            console.log(pc.yellow(`No se encontraron símbolos para "${query}".`));
                        }
                    }
                }
                else {
                    console.log(`\n${codeGraph.getHierarchy()}\n`);
                }
                break;
            }
            case '/skills': {
                const skills = SkillManager.listSkills();
                console.log(pc.bold('\nSkills instaladas (estilo Claude Code):'));
                if (skills.length === 0) {
                    console.log(pc.dim('  (No hay skills instaladas aún. Instala una con: /skill install <url>)'));
                }
                else {
                    for (const s of skills) {
                        console.log(`  ${pc.green('•')} ${pc.bold(s.meta.name)}: ${s.meta.description}`);
                    }
                }
                console.log();
                break;
            }
            case '/skill': {
                const parts = (arg || '').split(' ');
                const sub = parts[0]?.toLowerCase();
                const targetUrl = parts.slice(1).join(' ').trim();
                if (sub === 'install' && targetUrl) {
                    try {
                        const installed = await SkillManager.installFromUrl(targetUrl);
                        console.log(pc.green(`[ok] Skill "${installed.meta.name}" instalada y lista para usarse.\n`));
                    }
                    catch (err) {
                        console.log(pc.red(`Error al instalar skill: ${err?.message || err}`));
                    }
                }
                else if (sub) {
                    const skill = SkillManager.getSkill(sub);
                    if (skill) {
                        console.log(pc.bold(`\n[SKILL: ${skill.meta.name}]`));
                        console.log(pc.dim(`Descripción: ${skill.meta.description}`));
                        console.log(pc.gray('──────────────────────────────────────────────'));
                        console.log(skill.instructions);
                        console.log(pc.gray('──────────────────────────────────────────────\n'));
                    }
                    else {
                        console.log(pc.yellow(`Skill "${sub}" no encontrada. Usa: /skills o /skill install <url>`));
                    }
                }
                else {
                    console.log(pc.yellow('Uso: /skill install <url>  o  /skill <nombre>'));
                }
                break;
            }
            case '/progress':
            case '/supervise': {
                console.log(`\n${ProgressSupervisor.formatProgressReport()}\n`);
                break;
            }
            case '/telegram': {
                const cfg = ConfigManager.loadConfig() || { leader: 'deepseek', workers: [] };
                if (arg && arg.trim()) {
                    cfg.telegramToken = arg.trim();
                    ConfigManager.saveConfig(cfg);
                    console.log(pc.green(`[ok] Token de Telegram guardado.`));
                }
                if (!cfg.telegramToken) {
                    console.log(pc.yellow('\nConfiguración de Telegram:'));
                    console.log('Ingresa tu token de bot de Telegram (@BotFather):');
                    console.log(pc.cyan('  /telegram <tu-bot-token>\n'));
                    break;
                }
                console.log(pc.green(`\nToken configurado. Iniciando Telegram Bot Bridge...`));
                const bot = new TelegramBot(cfg.telegramToken, cfg.allowedChatIds || []);
                bot.setOrchestrator(orchestrator);
                void bot.start();
                console.log(pc.dim('Telegram Bot activo y escuchando en segundo plano.\n'));
                break;
            }
            case '/daemon': {
                const action = (arg || '').trim().toLowerCase();
                if (action === 'start') {
                    const status = DaemonManager.startDaemon(workdir);
                    console.log(pc.green(`Daemon iniciado (PID: ${status.pid}).`));
                }
                else if (action === 'stop') {
                    DaemonManager.stopDaemon();
                }
                else {
                    const status = DaemonManager.getStatus();
                    if (status.running) {
                        console.log(pc.green(`\n[DAEMON ACTIVO] PID: ${status.pid} • Logs: ${status.logPath}\n`));
                    }
                    else {
                        console.log(pc.dim('\n[DAEMON INACTIVO] Usa: /daemon start para iniciarlo en segundo plano.\n'));
                    }
                }
                break;
            }
            case '/web':
            case '/server':
            case '/dashboard': {
                const parts = (arg || '').trim().split(/\s+/).filter(Boolean);
                const sub = (parts[0] || '').toLowerCase();
                const portArg = parts.find((p) => /^\d+$/.test(p)) || '7898';
                const port = parseInt(portArg, 10);
                if (sub === 'stop') {
                    let stoppedAny = false;
                    if (activeWebServer) {
                        await stopActiveWebServer();
                        stoppedAny = true;
                    }
                    const daemonStatus = DaemonManager.getWebStatus();
                    if (daemonStatus.running) {
                        DaemonManager.stopWebDaemon();
                        stoppedAny = true;
                    }
                    if (stoppedAny) {
                        console.log(pc.green('\n✔ [WEB] Servidor web detenido correctamente.\n'));
                    }
                    else {
                        console.log(pc.yellow('\n[WEB] No hay ningún servidor web activo.\n'));
                    }
                    break;
                }
                if (sub === 'status') {
                    const daemonStatus = DaemonManager.getWebStatus();
                    if (activeWebServer) {
                        console.log(pc.green(`\n✔ [WEB ACTIVO (EN PROCESO)] http://localhost:${activeWebServer.getPort()}\n`));
                    }
                    else if (daemonStatus.running) {
                        console.log(pc.green(`\n✔ [WEB ACTIVO (EN SEGUNDO PLANO)] PID: ${daemonStatus.pid} • http://localhost:${daemonStatus.port || 7898}\n`));
                    }
                    else {
                        console.log(pc.dim('\n[WEB INACTIVO] Usa: /web start o barhel web start para iniciarlo.\n'));
                    }
                    break;
                }
                const daemonStatus = DaemonManager.getWebStatus();
                let targetPort = port;
                if (daemonStatus.running && daemonStatus.port) {
                    targetPort = daemonStatus.port;
                    console.log(pc.cyan(`\n✔ [WEB ACTIVO] El servidor web ya se encuentra corriendo en segundo plano (PID: ${daemonStatus.pid}, Puerto: ${targetPort}).`));
                }
                else if (activeWebServer) {
                    targetPort = activeWebServer.getPort();
                    console.log(pc.cyan(`\n✔ [WEB ACTIVO] El servidor web ya está corriendo en este proceso (Puerto: ${targetPort}).`));
                }
                else {
                    logger.startSpinner(`Iniciando servidor web en segundo plano (puerto ${port})...`);
                    try {
                        const started = DaemonManager.startWebDaemon(port, workdir);
                        logger.stopSpinner();
                        targetPort = started.port || port;
                        console.log(pc.green(`\n✔ [WEB EN SEGUNDO PLANO] Servidor web iniciado en: ${pc.bold(pc.cyan(`http://localhost:${targetPort}`))}`));
                    }
                    catch (err) {
                        logger.stopSpinner();
                        logger.error(`No se pudo iniciar el servidor web daemon en el puerto ${port}`, err);
                        break;
                    }
                }
                const currentUrl = `http://localhost:${targetPort}`;
                console.log(pc.dim(`Abriendo ${currentUrl} en el navegador...`));
                openInBrowser(currentUrl);
                console.log();
                break;
            }
            case '/help':
                logger.printHelp();
                break;
            case '/doctor': {
                await runDoctorDiagnostic({ provider: arg || undefined });
                break;
            }
            case '/workers':
            case '/analysis':
            case '/inspect':
                await TUI.promptWorkerInspection();
                break;
            case '/think':
            case '/thinking': {
                const isFull = TUI.toggleThinkingDisplay();
                if (isFull) {
                    console.log(`\n${pc.cyan('[reasoning]')} ${pc.green('Extended (full)')}\n`);
                }
                else {
                    console.log(`\n${pc.cyan('[reasoning]')} ${pc.yellow('Compact (+ Thought: Xms)')}\n`);
                }
                break;
            }
            case '/resume':
            case '/history': {
                const selected = await HistoryManager.promptSelectSession(workdir);
                if (selected) {
                    await orchestrator.switchSession(selected.id);
                    syncPromptHistory();
                    printCurrentBanner();
                    TUI.renderSessionHistory(orchestrator.getSession());
                    console.log(pc.green(`[ok] Sesion reanudada: "${selected.title}" (#${selected.id})\n`));
                }
                break;
            }
            case '/new': {
                const newSess = await orchestrator.startNewSession(arg || 'Nueva sesion');
                promptHistory.length = 0;
                printCurrentBanner();
                console.log(pc.green(`[ok] Nueva sesion: "${newSess.title}" (#${newSess.id})\n`));
                break;
            }
            case '/title': {
                if (!arg) {
                    console.log(pc.yellow('Uso: /title <nuevo titulo para esta sesion>'));
                }
                else {
                    orchestrator.setSessionTitle(arg);
                    printCurrentBanner();
                    console.log(pc.green(`[ok] Titulo actualizado: "${arg}"\n`));
                }
                break;
            }
            case '/sessions':
            case '/list': {
                const sessions = HistoryManager.listSessions();
                console.log(pc.bold('\nHistorial de sesiones:'));
                if (sessions.length === 0) {
                    console.log(pc.dim('  (No hay sesiones guardadas)'));
                }
                else {
                    for (const s of sessions.slice(0, 10)) {
                        const currentBadge = s.id === orchestrator.getSessionId() ? pc.green(' [active]') : '';
                        console.log(`  ${pc.bold(s.id)} - ${pc.cyan(s.title)}${currentBadge}`);
                        console.log(`    ${pc.dim(`${s.workdir} | leader: ${s.leader} | ${s.turns.length} turns | ${s.updatedAt.substring(0, 10)}`)}`);
                    }
                }
                console.log();
                break;
            }
            case '/config':
            case '/models': {
                const currentCfg = ConfigManager.loadConfig();
                const updated = await ConfigManager.promptConfig(currentCfg);
                await orchestrator.switchModels(updated.leader, updated.workers);
                printCurrentBanner();
                break;
            }
            case '/auto': {
                const isAuto = orchestrator.toggleAutonomous();
                if (isAuto) {
                    console.log(`\n${pc.cyan('[mode]')} ${pc.green('AUTONOMOUS')} (No confirmations)\n`);
                }
                else {
                    console.log(`\n${pc.cyan('[mode]')} ${pc.yellow('SAFE')} (Confirmation required [y/N])\n`);
                }
                break;
            }
            case '/status': {
                console.log(pc.bold('\nEstado de sesiones:'));
                const status = listSessionsStatus();
                for (const [provider, info] of Object.entries(status)) {
                    const badge = info.exists ? pc.green('[connected]') : pc.yellow('[no session]');
                    console.log(`  ${pc.bold(provider.toUpperCase().padEnd(12))}: ${badge} ${pc.dim(`(${info.path})`)}`);
                }
                if (HistoryManager.hasEncryptedSessions() && !process.env.BARHEL_SECRET) {
                    console.log(pc.yellow(`\nHay sesiones cifradas (.json.enc). Define BARHEL_SECRET para leerlas.`));
                }
                console.log();
                break;
            }
            case '/plan': {
                const isPlan = orchestrator.togglePlanOnly();
                if (isPlan) {
                    console.log(`\n${pc.cyan('[plan]')} ${pc.blue('ACTIVATED')} (simulating changes without writing)\n`);
                }
                else {
                    console.log(`\n${pc.cyan('[plan]')} ${pc.dim('disabled')} (changes will be executed)\n`);
                }
                break;
            }
            case '/commit':
            case '/commitall': {
                const result = await orchestrator.commitWork(arg || undefined);
                if (result.startsWith('[git')) {
                    logger.warn(result);
                }
                else {
                    logger.success('Commit realizado.');
                    console.log(pc.dim(result));
                }
                break;
            }
            case '/review': {
                const review = await orchestrator.reviewGit();
                console.log('\n' + pc.cyan(pc.bold('Revision del workspace (git):')) + '\n');
                const lines = review.split('\n');
                console.log(lines.slice(0, 80).join('\n'));
                if (lines.length > 80)
                    console.log(pc.dim(`... (${lines.length - 80} lineas mas)`));
                console.log();
                break;
            }
            case '/explain': {
                if (!arg) {
                    console.log(pc.yellow('Uso: /explain <simbolo o archivo>'));
                }
                else {
                    await orchestrator.runTurn(`[EXPLAIN] Explica en detalle, con ejemplos del codigo, que hace "${arg}" en este proyecto. No modifiques nada.`);
                }
                break;
            }
            case '/fix': {
                const goal = arg
                    ? `[FIX] Corrige el siguiente problema: ${arg}. Deja el proyecto validado.`
                    : `[FIX] Analiza los errores y problemas del workspace y corrigelos en el codigo.`;
                await orchestrator.runTurn(goal);
                break;
            }
            case '/export': {
                const parts = arg.split(/\s+/).filter(Boolean);
                const format = parts[0] === 'json' ? 'json' : 'md';
                const outPath = parts.filter((p) => p !== format).pop();
                const session = orchestrator.getSession();
                const dir = outPath || process.cwd();
                const filePath = path.join(dir, `barhel-session-${session.id}.${format}`);
                try {
                    fs.writeFileSync(filePath, format === 'json' ? JSON.stringify(session, null, 2) : HistoryManager.sessionToMarkdown(session), 'utf-8');
                    logger.success(`Sesion exportada: ${filePath}`);
                }
                catch (err) {
                    logger.error(`No se pudo exportar: ${err}`);
                }
                break;
            }
            case '/backup': {
                const defaultFilename = `barhel-backup-${new Date().toISOString().substring(0, 10)}.tar.gz`;
                const targetFile = arg ? path.resolve(arg) : path.join(process.cwd(), defaultFilename);
                const sessionDir = getSessionBasePath();
                const parentDir = path.dirname(sessionDir);
                const dirName = path.basename(sessionDir);
                console.log(`\nExportando todas las sesiones y el historial a: ${targetFile}...`);
                try {
                    if (!fs.existsSync(sessionDir)) {
                        console.log(pc.red('No hay sesiones existentes para exportar.'));
                        break;
                    }
                    execSync(`tar -czf "${targetFile}" -C "${parentDir}" "${dirName}"`);
                    console.log(pc.green(`Copia de seguridad exportada con éxito en: ${targetFile}\n`));
                }
                catch (err) {
                    console.log(pc.red(`Error al exportar la copia de seguridad: ${err}`));
                }
                break;
            }
            case '/restore': {
                if (!arg) {
                    console.log(pc.yellow('Uso: /restore <ruta del archivo .tar.gz>'));
                    break;
                }
                const targetFile = path.resolve(arg);
                const sessionDir = getSessionBasePath();
                const parentDir = path.dirname(sessionDir);
                console.log(`\nImportando sesiones e historial desde: ${targetFile}...`);
                try {
                    if (!fs.existsSync(targetFile)) {
                        console.log(pc.red(`El archivo de copia de seguridad no existe: ${targetFile}`));
                        break;
                    }
                    fs.mkdirSync(parentDir, { recursive: true });
                    execSync(`tar -xzf "${targetFile}" -C "${parentDir}"`);
                    console.log(pc.green(`Sesiones e historial importados con éxito.\n`));
                }
                catch (err) {
                    console.log(pc.red(`Error al importar la copia de seguridad: ${err}`));
                }
                break;
            }
            case '/summarize': {
                const summary = await orchestrator.summarizeSession();
                if (summary) {
                    console.log(pc.cyan('\nResumen de memoria de sesion:\n'));
                    console.log(summary);
                    console.log();
                }
                break;
            }
            case '/leader': {
                const target = arg.toLowerCase().trim();
                if (!target) {
                    const all = DriverFactory.getAllProviders().map((p) => p.id).join(', ');
                    console.log(pc.yellow(`Uso: /leader <${all}>`));
                }
                else {
                    try {
                        await orchestrator.setLeader(target);
                        printCurrentBanner();
                        console.log(pc.green(`[ok] Lider cambiado a: ${target}\n`));
                    }
                    catch (err) {
                        logger.error(`No se pudo cambiar el lider a "${target}"`, err);
                    }
                }
                break;
            }
            case '/login': {
                const target = (arg || orchestrator.getLeaderId()).toLowerCase().trim();
                console.log(`\nIniciando login para ${pc.cyan(target)}...`);
                try {
                    if (target === 'all') {
                        for (const p of DriverFactory.getAllProviders()) {
                            console.log(pc.cyan(`\nLogin para ${p.name}...`));
                            const driver = p.createDriver();
                            await driver.login();
                        }
                    }
                    else {
                        const driver = DriverFactory.createDriver(target);
                        await driver.login();
                    }
                }
                catch (loginErr) {
                    logger.error(`Error al iniciar sesion para ${target}`, loginErr);
                }
                break;
            }
            case '/import-sessions':
            case '/import': {
                console.log(pc.cyan('\nImportando sesiones de Chrome/Edge...\n'));
                const userConfig = ConfigManager.loadConfig();
                let providersToImport = [];
                if (userConfig) {
                    providersToImport = [userConfig.leader, ...(userConfig.workers || [])];
                    providersToImport = [...new Set(providersToImport)];
                }
                else {
                    providersToImport = DriverFactory.getAllProviders().map(p => p.id);
                }
                console.log(pc.dim(`Proveedores: ${providersToImport.join(', ')}`));
                console.log(pc.dim('Navegador: chrome\n'));
                const { importSessionsFromBrowser } = await import('../utils/session.js');
                const results = importSessionsFromBrowser(providersToImport, 'chrome', false);
                let imported = 0;
                let skipped = 0;
                let failed = 0;
                for (const r of results) {
                    if (r.provider === '*') {
                        console.log(pc.red(`  ✖ ${r.message}`));
                        failed++;
                    }
                    else if (r.skipped) {
                        console.log(pc.yellow(`  ⏭ ${r.provider}: ${r.message}`));
                        skipped++;
                    }
                    else if (r.success) {
                        console.log(pc.green(`  ✓ ${r.provider}: ${r.message}`));
                        imported++;
                    }
                    else {
                        console.log(pc.red(`  ✖ ${r.provider}: ${r.message}`));
                        failed++;
                    }
                }
                console.log(`\n${pc.bold('Resumen:')} ${pc.green(`${imported} importadas`)}, ${pc.yellow(`${skipped} omitidas`)}, ${pc.red(`${failed} fallidas`)}\n`);
                break;
            }
            case '/clear-sessions': {
                console.log(pc.cyan('\nBorrando sesiones de autenticación...\n'));
                const clearConfig = ConfigManager.loadConfig();
                let providersToDelete = [];
                if (clearConfig) {
                    providersToDelete = [clearConfig.leader, ...(clearConfig.workers || [])];
                    providersToDelete = [...new Set(providersToDelete)];
                }
                else {
                    providersToDelete = DriverFactory.getAllProviders().map(p => p.id);
                }
                console.log(pc.dim(`Proveedores: ${providersToDelete.join(', ')}\n`));
                let deleted = 0;
                let notFound = 0;
                for (const providerId of providersToDelete) {
                    const normalized = providerId.toLowerCase().trim();
                    const sessionDir = path.join(os.homedir(), '.dev-agent-sessions', normalized);
                    if (!fs.existsSync(sessionDir)) {
                        console.log(pc.yellow(`  ⏭ ${normalized}: no existe, omitido.`));
                        notFound++;
                        continue;
                    }
                    try {
                        fs.rmSync(sessionDir, { recursive: true, force: true });
                        console.log(pc.green(`  ✓ ${normalized}: sesión eliminada.`));
                        deleted++;
                    }
                    catch (err) {
                        console.log(pc.red(`  ✖ ${normalized}: error al eliminar - ${err.message}`));
                    }
                }
                console.log(`\n${pc.bold('Resumen:')} ${pc.green(`${deleted} eliminadas`)}, ${pc.yellow(`${notFound} no encontradas`)}\n`);
                if (deleted > 0) {
                    console.log(pc.dim('Las sesiones se recrearán automáticamente al iniciar barhel.'));
                    console.log(pc.dim('Puedes re-importar con: /import-sessions\n'));
                }
                break;
            }
            case '/clear':
                console.clear();
                printCurrentBanner();
                break;
            case '/exit':
            case '/quit':
                console.log(pc.cyan('\nCerrando Barhel y guardando sesion...'));
                await stopActiveWebServer();
                await orchestrator.shutdown();
                printExitMessage();
                process.exit(0);
            default:
                console.log(pc.yellow(`Comando "${command}" no reconocido. Escribe / para ver la paleta de comandos.`));
                break;
        }
    };
    // Menu interactivo de seleccion de comandos con busqueda en vivo
    const openInteractiveMenu = async (initialQuery = '') => {
        const choices = AVAILABLE_SLASH_COMMANDS.map((c) => ({
            name: `${pc.cyan(c.name.padEnd(12))} ${pc.white(c.desc)}`,
            value: c.name,
            description: `Command: ${c.name}${c.aliases ? ` (aliases: ${c.aliases.join(', ')})` : ''}`,
        }));
        choices.push({
            name: pc.gray('back to chat'),
            value: '__cancel__',
            description: 'Close command palette',
        });
        const selectedCommand = await search({
            message: 'Command palette (type to filter):',
            source: async (term) => {
                const query = (term || initialQuery).toLowerCase().replace(/^\//, '').trim();
                if (!query)
                    return choices;
                return choices.filter((c) => {
                    if (c.value === '__cancel__')
                        return true;
                    const matchVal = c.value.toLowerCase().includes(query);
                    const matchName = c.name.toLowerCase().includes(query);
                    return matchVal || matchName;
                });
            },
            pageSize: 12,
        });
        if (!selectedCommand || selectedCommand === '__cancel__')
            return;
        const cmdDef = AVAILABLE_SLASH_COMMANDS.find((c) => c.name === selectedCommand);
        let finalArg = '';
        if (cmdDef?.needsArg) {
            finalArg = await promptInput({
                message: cmdDef.needsArg,
                default: '',
            });
            if (!cmdDef.optionalArg && !finalArg.trim()) {
                console.log(pc.yellow('Comando cancelado por falta de parametro.'));
                return;
            }
        }
        await runCommand(selectedCommand, finalArg);
    };
    const askInput = () => {
        return new Promise((resolve) => {
            if (process.stdin.isTTY) {
                try {
                    process.stdin.setRawMode(false);
                }
                catch {
                    // Ignorar
                }
            }
            process.stdin.resume();
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout,
                prompt: TUI.getPromptPrefix('barhel'),
                completer,
                history: promptHistory,
                historySize: 1000,
            });
            const onSigint = async () => {
                if (orchestrator.isTurnRunning) {
                    await orchestrator.interruptCurrentTurn();
                }
                else {
                    console.log(pc.cyan('\nCerrando Barhel y guardando sesion...'));
                    await stopActiveWebServer();
                    await orchestrator.shutdown();
                    printExitMessage();
                    process.exit(0);
                }
            };
            process.once('SIGINT', onSigint);
            rl.question(TUI.getPromptPrefix('barhel'), (answer) => {
                process.removeListener('SIGINT', onSigint);
                rl.close();
                const trimmed = (answer || '').trim();
                if (trimmed) {
                    const idx = promptHistory.indexOf(trimmed);
                    if (idx !== -1) {
                        promptHistory.splice(idx, 1);
                    }
                    promptHistory.unshift(trimmed);
                }
                resolve(answer);
            });
        });
    };
    // Loop interactivo robusto que nunca se congela tras el uso de menús
    while (!orchestrator.isClosing) {
        let rawLine;
        try {
            rawLine = await askInput();
        }
        catch {
            break;
        }
        const input = (rawLine || '').trim();
        if (!input)
            continue;
        // Salir directamente al tipear exit, quit, salir, :q, q
        const lower = input.toLowerCase();
        if (lower === 'exit' || lower === 'quit' || lower === 'salir' || lower === ':q' || lower === 'q') {
            console.log(pc.cyan('\nCerrando Barhel y guardando sesion...'));
            await stopActiveWebServer();
            await orchestrator.shutdown();
            printExitMessage();
            process.exit(0);
        }
        // Si el usuario escribe "/" o "/menu", abre la paleta de busqueda
        if (input === '/' || input === '/menu') {
            try {
                await openInteractiveMenu('');
            }
            catch {
                // Ignorar cancelacion
            }
            continue;
        }
        // Manejo de Slash Commands directos
        if (input.startsWith('/')) {
            const parts = input.split(' ');
            const command = parts[0].toLowerCase();
            const arg = parts.slice(1).join(' ').trim();
            const isKnown = AVAILABLE_SLASH_COMMANDS.some((c) => c.name === command || c.aliases?.includes(command));
            try {
                if (isKnown) {
                    await runCommand(command, arg);
                }
                else {
                    console.log(pc.yellow(`Comando "${command}" no reconocido. Abriendo paleta...`));
                    await openInteractiveMenu(command);
                }
            }
            catch (cmdErr) {
                logger.error('Error al ejecutar comando', cmdErr);
            }
            continue;
        }
        // Turno conversacional normal con el agente
        try {
            await orchestrator.runTurn(input);
            syncPromptHistory();
            printCurrentBanner();
        }
        catch (err) {
            TUI.stopThinking();
            logger.stopSpinner();
            const msg = err instanceof Error ? err.message : String(err);
            console.log(`\n${pc.red('✖ Error durante la ejecución del turno:')} ${pc.white(msg)}`);
            if (msg.toLowerCase().includes('login') || msg.toLowerCase().includes('sesión') || msg.toLowerCase().includes('campo de entrada') || msg.toLowerCase().includes('autenticad')) {
                console.log(`  ${pc.yellow('💡 Tip: Inicia sesión en el navegador con:')} ${pc.bold(pc.cyan('barhel login <proveedor>'))}\n`);
            }
            else {
                console.log();
            }
        }
    }
    await orchestrator.shutdown();
    printExitMessage();
    process.exit(0);
}
//# sourceMappingURL=repl.js.map