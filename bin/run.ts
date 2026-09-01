#!/usr/bin/env node

import { Command } from 'commander';
import pc from 'picocolors';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { startInteractiveChat } from '../src/cli/repl.js';
import { Orchestrator } from '../src/engine/Orchestrator.js';
import { DriverFactory } from '../src/drivers/DriverFactory.js';
import { ConfigManager } from '../src/utils/config.js';
import { HistoryManager } from '../src/utils/history.js';
import { listSessionsStatus, getSessionBasePath, importSessionsFromBrowser } from '../src/utils/session.js';
import { logger } from '../src/utils/logger.js';
import { execSync } from 'node:child_process';
import { getBarhelVersion } from '../src/utils/version.js';
import { TUI } from '../src/cli/tui.js';
import { CodeGraphEngine } from '../src/codegraph/CodeGraphEngine.js';
import { SkillManager } from '../src/skills/SkillManager.js';
import { TelegramBot } from '../src/daemon/TelegramBot.js';
import { DaemonManager } from '../src/daemon/DaemonManager.js';
import { ProgressSupervisor } from '../src/engine/ProgressSupervisor.js';
import { runDoctorDiagnostic } from '../src/cli/doctor.js';

const program = new Command();

program
  .name('barhel')
  .description('Asistente de codificación interactivo en terminal estilo Claude Code / OpenCode')
  .version(getBarhelVersion());

// Comando principal: Si no hay argumentos, abre el chat REPL. Si hay argumentos, ejecuta el prompt.
program
  .argument('[prompt...]', 'Objetivo o instrucción inicial (opcional, si se omite abre el chat interactivo)')
  .option('-r, --resume [sessionId]', 'Reanuda una sesión previa del historial')
  .option('-s, --session <id>', 'Especifica un ID de sesión exacto')
  .option('-a, --autonomous', 'Inicia en modo de autonomía total (sin pedir confirmaciones [y/N])')
  .option('-w, --workdir <path>', 'Directorio de trabajo del proyecto', process.cwd())
  .option('--leader <provider>', 'Modelo líder específico (deepseek, claude, chatgpt, gemini, qwen, mistral, perplexity)')
  .option('--workers <list>', 'Lista de workers separados por coma (ej. chatgpt,gemini,claude)')
  .option('--visible', 'Muestra la ventana visible del navegador en lugar de ejecutarlo en segundo plano (headless)', false)
  .option('-p, --plan', 'Modo PLAN ONLY: simula escrituras/comandos sin aplicarlos', false)
  .option('--notify', 'Emite una señal sonora al terminar la tarea', false)
  .option('-m, --max-iterations <number>', 'Límite máximo de pasos ReAct por instrucción', '25')
  .action(async (promptParts: string[], options) => {
    const prompt = promptParts.join(' ').trim();
    const workers = options.workers ? options.workers.split(',').map((s: string) => s.trim()) : undefined;
    const isHeadless = !options.visible;
    const sessionId = typeof options.resume === 'string' ? options.resume : options.session;
    const shouldResume = options.resume !== undefined;

    // Si no se pasó un prompt, abrir la CLI interactiva tipo Claude Code / OpenCode
    if (!prompt) {
      await startInteractiveChat({
        autonomous: options.autonomous,
        workdir: options.workdir,
        leader: options.leader,
        workers: workers,
        headless: isHeadless,
        sessionId: sessionId,
        resume: shouldResume,
        maxIterations: parseInt(options.maxIterations, 10),
        planOnly: options.plan,
        watchNotify: options.notify,
      });
      return;
    }

    // Asegurar configuración
    const userConfig = await ConfigManager.getOrPromptConfig(false);

    const orchestrator = new Orchestrator({
      autonomous: options.autonomous,
      workdir: options.workdir,
      leader: options.leader || userConfig.leader,
      workers: workers || userConfig.workers,
      headless: isHeadless,
      sessionId: sessionId,
      maxIterations: parseInt(options.maxIterations, 10),
      planOnly: options.plan,
      watchNotify: options.notify,
    });

    try {
      const leaderMeta = DriverFactory.getMeta(orchestrator.getLeaderId());
      const leaderName = leaderMeta?.name || orchestrator.getLeaderId();
      const workersNames = orchestrator.getActiveWorkers().join(', ');

      TUI.renderBanner(
        options.workdir,
        options.autonomous,
        leaderName,
        workersNames,
        orchestrator.getSessionTitle(),
        orchestrator.getSessionId()
      );
      if (options.plan) {
        logger.warn('Modo PLAN ONLY activado: no se aplicarán cambios reales.');
      }
      await orchestrator.runTurn(prompt);
      const sess = orchestrator.getSession();
      await orchestrator.shutdown();
      console.log(`\n${pc.bold('Sesión guardada:')} ${pc.cyan(sess.title)} ${pc.dim(`(#${sess.id})`)}`);
      console.log(`Para reanudar esta sesión, ejecuta:`);
      console.log(`  ${pc.bold(pc.green(`barhel -s ${sess.id}`))}\n`);
      if (options.notify) {
        process.stdout.write('\x07');
      }
    } catch (err) {
      logger.error('Error fatal durante la ejecución de la tarea', err);
      process.exit(1);
    }
  });

// Subcomando: Reanudar sesión mediante menú interactivo
program
  .command('resume [sessionId]')
  .alias('continue')
  .description('Reanuda una sesión de trabajo anterior con todo su contexto y chat web')
  .option('-w, --workdir <path>', 'Directorio de trabajo del proyecto', process.cwd())
  .option('--visible', 'Muestra la ventana visible del navegador', false)
  .action(async (sessionIdArg, options) => {
    let targetSessionId = sessionIdArg;

    if (!targetSessionId) {
      const selected = await HistoryManager.promptSelectSession(options.workdir);
      if (selected) {
        targetSessionId = selected.id;
      }
    }

    await startInteractiveChat({
      workdir: options.workdir,
      headless: !options.visible,
      sessionId: targetSessionId,
    });
  });

// Subcomando: Historial de sesiones
program
  .command('history')
  .alias('list')
  .description('Muestra el historial de todas las sesiones de trabajo guardadas')
  .action(() => {
    const sessions = HistoryManager.listSessions();
    console.log(pc.bold('\n📜 Historial de Sesiones Guardadas en Barhel:'));

    if (sessions.length === 0) {
      console.log(pc.dim('  (No hay sesiones guardadas aún)'));
      console.log(pc.cyan('\nInicia una sesión con: barhel\n'));
      return;
    }

    for (const s of sessions) {
      console.log(`\n  ${pc.cyan(pc.bold(s.id))} - ${pc.bold(s.title)}`);
      console.log(`    📁 ${pc.gray('Carpeta:')} ${s.workdir}`);
      console.log(`    👑 ${pc.gray('Líder:')}   ${s.leader} | 👥 ${pc.gray('Workers:')} ${s.workers.join(', ') || 'ninguno'}`);
      console.log(`    🔄 ${pc.gray('Turnos:')}  ${s.turns.length} | 🕒 ${pc.gray('Actualizado:')} ${s.updatedAt.substring(0, 19).replace('T', ' ')}`);
      if (s.chatUrl) {
        console.log(`    🌐 ${pc.gray('Chat Web:')} ${pc.dim(s.chatUrl)}`);
      }
    }
    console.log(pc.cyan('\nPara reanudar cualquiera de estas sesiones:'));
    console.log(`  ${pc.bold('barhel resume <ID>')}\n`);
  });

// Subcomando: Configurar interactivamente modelos Líder y Workers
program
  .command('config')
  .alias('models')
  .description('Configura interactivamente qué modelo web actúa como Agente Líder y cuáles como Workers')
  .action(async () => {
    const currentCfg = ConfigManager.loadConfig();
    await ConfigManager.promptConfig(currentCfg);
  });

// Subcomando: Login interactivo por proveedor
program
  .command('login [provider]')
  .description('Inicia sesión en la interfaz web del proveedor y persiste la sesión localmente')
  .action(async (providerArg?: string) => {
    const allProviders = DriverFactory.getAllProviders();
    const target = providerArg ? providerArg.toLowerCase().trim() : 'all';

    logger.info('Autenticación persistente de proveedores para Barhel');

    try {
      if (target === 'all') {
        for (const p of allProviders) {
          console.log(pc.cyan(`\nAbriendo login para ${p.name}...`));
          const driver = p.createDriver();
          await driver.login();
        }
        logger.success('Todos los proveedores seleccionados han sido configurados.');
      } else {
        const driver = DriverFactory.createDriver(target);
        await driver.login();
      }
      process.exit(0);
    } catch (err) {
      logger.error(`Error durante el proceso de login para "${target}"`, err);
      process.exit(1);
    }
  });

// Subcomando: Importar sesiones de Chrome/Edge a los perfiles de barhel
program
  .command('import-sessions')
  .alias('import')
  .description('Importa sesiones de Chrome/Edge a los perfiles de barhel para proveedores configurados')
  .option('-b, --browser <name>', 'Navegador origen: chrome (default) o edge', 'chrome')
  .option('-f, --force', 'Sobreescribir sesiones existentes', false)
  .action(async (options) => {
    logger.info('Importando sesiones de navegador...\n');

    // Cargar configuración para saber qué proveedores están activos
    const userConfig = ConfigManager.loadConfig();
    let providersToImport: string[] = [];

    if (userConfig) {
      providersToImport = [userConfig.leader, ...(userConfig.workers || [])];
      // Eliminar duplicados
      providersToImport = [...new Set(providersToImport)];
    } else {
      // Si no hay configuración, importar todos los proveedores
      providersToImport = DriverFactory.getAllProviders().map(p => p.id);
    }

    console.log(pc.cyan(`📋 Proveedores a importar: ${providersToImport.join(', ')}`));
    console.log(pc.dim(`   Navegador origen: ${options.browser}\n`));

    const results = importSessionsFromBrowser(providersToImport, options.browser, options.force);

    console.log(pc.bold('📦 Resultados:\n'));
    let imported = 0;
    let skipped = 0;
    let failed = 0;

    for (const r of results) {
      if (r.provider === '*') {
        // Error general
        console.log(pc.red(`  ✖ ${r.message}`));
        failed++;
        continue;
      }

      if (r.skipped) {
        console.log(pc.yellow(`  ⏭ ${r.provider}: ${r.message}`));
        skipped++;
      } else if (r.success) {
        console.log(pc.green(`  ✓ ${r.provider}: ${r.message}`));
        imported++;
      } else {
        console.log(pc.red(`  ✖ ${r.provider}: ${r.message}`));
        failed++;
      }
    }

    console.log(`\n${pc.bold('Resumen:')} ${pc.green(`${imported} importadas`)}, ${pc.yellow(`${skipped} omitidas`)}, ${pc.red(`${failed} fallidas`)}\n`);

    if (imported > 0) {
      console.log(pc.dim('Nota: Asegúrate de que el navegador estuvo cerrado durante la importación para evitar archivos bloqueados.'));
      console.log(pc.dim('Si alguna sesión no funciona, ejecuta: barhel login <proveedor>\n'));
    }

    process.exit(0);
  });

// Subcomando: Borrar sesiones de proveedores
program
  .command('clear-sessions')
  .alias('clear')
  .description('Borra las sesiones de autenticación de los proveedores')
  .option('-p, --provider <name>', 'Borrar solo un proveedor específico (deepseek, chatgpt, gemini, etc.)')
  .option('-a, --all', 'Borrar todas las sesiones de todos los proveedores', false)
  .action(async (options) => {
    logger.info('Gestión de sesiones de autenticación\n');

    const providersToDelete: string[] = [];

    if (options.all) {
      // Borrar todos los proveedores
      providersToDelete.push(...DriverFactory.getAllProviders().map(p => p.id));
    } else if (options.provider) {
      providersToDelete.push(options.provider.toLowerCase().trim());
    } else {
      // Borrar solo proveedores configurados
      const userConfig = ConfigManager.loadConfig();
      if (userConfig) {
        providersToDelete.push(userConfig.leader, ...(userConfig.workers || []));
      } else {
        providersToDelete.push(...DriverFactory.getAllProviders().map(p => p.id));
      }
      // Eliminar duplicados
      const unique = [...new Set(providersToDelete)];
      providersToDelete.length = 0;
      providersToDelete.push(...unique);
    }

    console.log(pc.cyan(`📋 Sesiones a borrar: ${providersToDelete.join(', ')}\n`));

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
      } catch (err: any) {
        console.log(pc.red(`  ✖ ${normalized}: error al eliminar - ${err.message}`));
      }
    }

    console.log(`\n${pc.bold('Resumen:')} ${pc.green(`${deleted} eliminadas`)}, ${pc.yellow(`${notFound} no encontradas`)}\n`);

    if (deleted > 0) {
      console.log(pc.dim('Las sesiones se recrearán automáticamente al iniciar barhel.'));
      console.log(pc.dim('Puedes re-importar con: barhel import-sessions\n'));
    }

    process.exit(0);
  });

// Subcomando: Estado de perfiles de autenticación
program
  .command('auth-status')
  .alias('status')
  .description('Muestra el estado de las credenciales y perfiles de navegador almacenados')
  .action(() => {
    logger.info('Verificando perfiles de sesión locales...\n');
    const status = listSessionsStatus();

    for (const [provider, info] of Object.entries(status)) {
      const stateBadge = info.exists ? pc.green('✔ CONECTADO') : pc.yellow('✖ SIN SESIÓN');
      console.log(`${pc.bold(provider.toUpperCase().padEnd(12))}: ${stateBadge}`);
      console.log(`  ${pc.gray('Ruta:')} ${pc.dim(info.path)}`);
      console.log(`  ${pc.gray('Archivos en perfil:')} ${info.fileCount}\n`);
    }

    console.log(pc.cyan('Para iniciar sesión en un proveedor:'));
    console.log(`  ${pc.bold('barhel login <deepseek|claude|chatgpt|gemini|qwen|mistral|perplexity|all>')}\n`);
  });

// Subcomando: Exportar una sesión a Markdown o JSON
program
  .command('export <sessionId>')
  .description('Exporta una sesión guardada a Markdown o JSON')
  .option('-f, --format <format>', 'Formato de salida: md (default) o json', 'md')
  .option('-o, --out <path>', 'Directorio o archivo de salida', process.cwd())
  .action((sessionId, options) => {
    const session = HistoryManager.getSession(sessionId);
    if (!session) {
      logger.error(`Sesión "${sessionId}" no encontrada. Usa: barhel history`);
      process.exit(1);
    }

    const format = options.format === 'json' ? 'json' : 'md';
    const outPath = options.out.endsWith(`.${format}`) ? options.out : path.join(options.out, `barhel-session-${session.id}.${format}`);
    const content = format === 'json' ? JSON.stringify(session, null, 2) : HistoryManager.sessionToMarkdown(session);

    try {
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, content, 'utf-8');
      logger.success(`Sesión exportada: ${outPath}`);
    } catch (err) {
      logger.error(`No se pudo exportar la sesión: ${err}`);
      process.exit(1);
    }
  });

// Subcomando: Exportar copia de seguridad (backup) de todas las sesiones
program
  .command('backup [file]')
  .description('Exporta todas las sesiones de autenticación e historial a un archivo comprimido (.tar.gz)')
  .action((fileArg) => {
    const defaultFilename = `barhel-backup-${new Date().toISOString().substring(0, 10)}.tar.gz`;
    const targetFile = fileArg ? path.resolve(fileArg) : path.join(process.cwd(), defaultFilename);
    const sessionDir = getSessionBasePath();
    const parentDir = path.dirname(sessionDir);
    const dirName = path.basename(sessionDir);

    logger.info(`Exportando todas las sesiones y el historial a: ${targetFile}...`);
    try {
      if (!fs.existsSync(sessionDir)) {
        logger.error('No hay sesiones existentes para exportar.');
        process.exit(1);
      }
      execSync(`tar -czf "${targetFile}" -C "${parentDir}" "${dirName}"`);
      logger.success(`Copia de seguridad exportada con éxito en: ${targetFile}`);
    } catch (err) {
      logger.error('Error al exportar la copia de seguridad', err);
      process.exit(1);
    }
  });

// Subcomando: Importar copia de seguridad (restore) de todas las sesiones
program
  .command('restore <file>')
  .description('Importa sesiones de autenticación e historial desde un archivo comprimido (.tar.gz)')
  .action((fileArg) => {
    const targetFile = path.resolve(fileArg);
    const sessionDir = getSessionBasePath();
    const parentDir = path.dirname(sessionDir);

    logger.info(`Importando sesiones e historial desde: ${targetFile}...`);
    try {
      if (!fs.existsSync(targetFile)) {
        logger.error(`El archivo de copia de seguridad no existe: ${targetFile}`);
        process.exit(1);
      }
      // Aseguramos que la carpeta base exista
      fs.mkdirSync(parentDir, { recursive: true });
      execSync(`tar -xzf "${targetFile}" -C "${parentDir}"`);
      logger.success(`Sesiones e historial importados con éxito.`);
    } catch (err) {
      logger.error('Error al importar la copia de seguridad', err);
      process.exit(1);
    }
  });

// Subcomando: Diagnóstico exhaustivo de salud, autenticación y selectores
program
  .command('doctor')
  .description('Diagnóstico profundo de autenticación de sesión, Cloudflare, latencia y selectores de UI')
  .option('--provider <id>', 'Verifica solo un proveedor específico')
  .option('--ping', 'Envía un prompt de prueba real para verificar respuesta de extremo a extremo', false)
  .option('--visible', 'Muestra la ventana visible del navegador', false)
  .action(async (options) => {
    const ok = await runDoctorDiagnostic({
      provider: options.provider,
      ping: options.ping,
      visible: options.visible,
    });
    if (!ok) {
      process.exitCode = 1;
    }
  });

// Subcomando: CodeGraph - Análisis AST y Grafo de Símbolos
program
  .command('graph [query]')
  .alias('codegraph')
  .description('Analiza e indexa en memoria el grafo de símbolos y dependencias AST del repositorio')
  .option('-w, --workdir <path>', 'Directorio de trabajo', process.cwd())
  .action(async (query, options) => {
    const engine = new CodeGraphEngine(options.workdir);
    logger.startSpinner('Escaneando repositorio e indexando símbolos AST...');
    await engine.scan();
    logger.stopSpinner();

    if (query) {
      const info = engine.inspectSymbol(query);
      if (!info.includes('no encontrado')) {
        console.log(`\n${info}\n`);
      } else {
        const matches = engine.search(query);
        if (matches.length > 0) {
          console.log(pc.bold(`\nSímbolos coincidentes con "${query}":`));
          for (const m of matches.slice(0, 25)) {
            console.log(`  ${pc.cyan(`[${m.kind}]`)} ${pc.white(m.name)} ${pc.dim(`(${m.file}:${m.line})`)}`);
          }
          console.log();
        } else {
          console.log(pc.yellow(`No se encontraron símbolos para "${query}".`));
        }
      }
    } else {
      console.log(`\n${engine.getHierarchy()}\n`);
    }
  });

// Subcomando: Gestión de Skills
program
  .command('skill <action> [target]')
  .description('Instala, lista o inspecciona skills estilo Claude Code (install <url> | list | info <nombre>)')
  .action(async (action, target) => {
    const act = action.toLowerCase();
    if (act === 'install') {
      if (!target) {
        logger.error('Debes proporcionar la URL de la skill. Ej: barhel skill install https://github.com/.../SKILL.md');
        process.exit(1);
      }
      try {
        const def = await SkillManager.installFromUrl(target);
        logger.success(`Skill "${def.meta.name}" instalada con éxito.`);
      } catch (err: any) {
        logger.error(`Error al instalar skill: ${err?.message || err}`);
        process.exit(1);
      }
    } else if (act === 'list') {
      const skills = SkillManager.listSkills();
      console.log(pc.bold('\nSkills instaladas:'));
      if (skills.length === 0) {
        console.log(pc.dim('  (No hay skills instaladas aún)'));
      } else {
        for (const s of skills) {
          console.log(`  ${pc.green('•')} ${pc.bold(s.meta.name)}: ${s.meta.description}`);
        }
      }
      console.log();
    } else {
      const skill = SkillManager.getSkill(target || action);
      if (skill) {
        console.log(pc.bold(`\n[SKILL: ${skill.meta.name}]`));
        console.log(pc.dim(`Descripción: ${skill.meta.description}`));
        console.log(pc.gray('──────────────────────────────────────────────'));
        console.log(skill.instructions);
        console.log(pc.gray('──────────────────────────────────────────────\n'));
      } else {
        logger.error(`Skill "${target || action}" no encontrada.`);
      }
    }
  });

// Subcomando: Telegram Bridge & Daemon
program
  .command('telegram')
  .description('Inicia el bot de Telegram de Barhel para control remoto y notificaciones')
  .option('-t, --token <token>', 'Token del bot de Telegram')
  .option('-w, --workdir <path>', 'Directorio de trabajo', process.cwd())
  .action(async (options) => {
    const cfg = ConfigManager.loadConfig() || { leader: 'deepseek', workers: [] };
    const token = options.token || cfg.telegramToken;

    if (!token) {
      logger.error('No se configuró el Token de Telegram. Usa: barhel telegram -t <tu-token> o /telegram en el chat.');
      process.exit(1);
    }

    if (options.token) {
      cfg.telegramToken = options.token;
      ConfigManager.saveConfig(cfg);
    }

    const orchestrator = new Orchestrator({
      workdir: options.workdir,
      leader: cfg.leader,
      workers: cfg.workers,
      autonomous: true, // Telegram funciona en modo autónomo remoto
    });

    await orchestrator.initSession();

    const bot = new TelegramBot(token, cfg.allowedChatIds || []);
    bot.setOrchestrator(orchestrator);
    await bot.start();
  });

// Subcomando: Daemon en segundo plano
program
  .command('daemon [action]')
  .description('Inicia, detiene o consulta el daemon en segundo plano (start | stop | status)')
  .option('-w, --workdir <path>', 'Directorio de trabajo', process.cwd())
  .action((action, options) => {
    const act = (action || 'status').toLowerCase();
    if (act === 'start') {
      DaemonManager.startDaemon(options.workdir);
    } else if (act === 'stop') {
      DaemonManager.stopDaemon();
    } else {
      const status = DaemonManager.getStatus();
      if (status.running) {
        console.log(pc.green(`\n✔ [DAEMON ACTIVO] PID: ${status.pid}`));
        console.log(pc.dim(`  Logs: ${status.logPath}\n`));
      } else {
        console.log(pc.dim('\n[DAEMON INACTIVO] Usa: barhel daemon start\n'));
      }
    }
  });

program.parse(process.argv);
