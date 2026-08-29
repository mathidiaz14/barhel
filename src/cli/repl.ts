import readline from 'node:readline';
import path from 'node:path';
import fs from 'node:fs';
import pc from 'picocolors';
import { select, search, input as promptInput } from '@inquirer/prompts';
import { Orchestrator } from '../engine/Orchestrator.js';
import { logger } from '../utils/logger.js';
import { listSessionsStatus } from '../utils/session.js';
import { DriverFactory } from '../drivers/DriverFactory.js';
import { ConfigManager } from '../utils/config.js';
import { HistoryManager } from '../utils/history.js';
import { TUI } from './tui.js';
import { CLIOptions } from '../types/actions.js';

const AVAILABLE_SLASH_COMMANDS = [
  { name: '/workers', desc: 'Inspector de análisis de agentes secundarios (Claude, ChatGPT, etc.)', aliases: ['/analysis', '/inspect'] },
  { name: '/think', desc: 'Alterna modo de razonamiento (resumido OpenCode / extendido)', aliases: ['/thinking'] },
  { name: '/resume', desc: 'Reanuda una sesión anterior con todo su contexto web', aliases: ['/history'] },
  { name: '/new', desc: 'Inicia una nueva sesión limpia con chat nuevo en el LLM' },
  { name: '/title', desc: 'Cambia el título descriptivo de la sesión actual', needsArg: 'Nuevo título:' },
  { name: '/sessions', desc: 'Lista el historial de sesiones guardadas', aliases: ['/list'] },
  { name: '/config', desc: 'Configura interactivamente modelo Líder y Workers', aliases: ['/models'] },
  { name: '/auto', desc: 'Alterna entre modo Autónomo y Seguro [y/N]' },
  { name: '/status', desc: 'Muestra estado de autenticación de proveedores' },
  { name: '/plan', desc: 'Alterna modo PLAN ONLY (simula cambios sin aplicarlos)' },
  { name: '/commit', desc: 'Commit git de los cambios del workspace', needsArg: 'Mensaje de commit (opcional):', optionalArg: true },
  { name: '/review', desc: 'Muestra git status y diff detallado del workspace' },
  { name: '/explain', desc: 'Pide al líder que explique un símbolo o archivo', needsArg: 'Símbolo o archivo a explicar:' },
  { name: '/fix', desc: 'Pide al líder que analice y corrija errores del proyecto', needsArg: 'Descripción del error (opcional):', optionalArg: true },
  { name: '/export', desc: 'Exporta la sesión actual a Markdown o JSON', needsArg: 'Formato (md/json) o ruta:', optionalArg: true },
  { name: '/summarize', desc: 'Genera y muestra el resumen de memoria de la sesión' },
  { name: '/leader', desc: 'Cambia el modelo líder rápidamente', needsArg: 'Nombre del modelo:' },
  { name: '/login', desc: 'Inicia sesión en la interfaz web de un proveedor' },
  { name: '/clear', desc: 'Limpia la pantalla de la terminal' },
  { name: '/help', desc: 'Muestra la lista de todos los comandos y ayuda' },
  { name: '/exit', desc: 'Cierra Barhel y guarda la sesión', aliases: ['/quit'] },
];

export async function startInteractiveChat(options: CLIOptions = {}): Promise<void> {
  let targetSessionId = options.sessionId;
  if (options.resume && !targetSessionId) {
    const selected = await HistoryManager.promptSelectSession(options.workdir || process.cwd());
    if (selected) {
      targetSessionId = selected.id;
    }
  }

  const userConfig = await ConfigManager.getOrPromptConfig(false);

  const mergedOptions: CLIOptions = {
    ...options,
    sessionId: targetSessionId,
    leader: options.leader || userConfig.leader,
    workers: options.workers || userConfig.workers,
  };

  const orchestrator = new Orchestrator(mergedOptions);
  const workdir = orchestrator.getWorkdir();

  const printCurrentBanner = () => {
    const leaderMeta = DriverFactory.getMeta(orchestrator.getLeaderId());
    const leaderName = leaderMeta?.name || orchestrator.getLeaderId();
    const workersNames = orchestrator.getActiveWorkers().join(', ');
    TUI.renderBanner(
      workdir,
      orchestrator.isAutonomous(),
      leaderName,
      workersNames,
      orchestrator.getSessionTitle(),
      orchestrator.getSessionId()
    );
  };

  console.clear();
  printCurrentBanner();

  try {
    await orchestrator.initSession();
  } catch (err) {
    const leaderId = orchestrator.getLeaderId();
    logger.error(`No se pudo inicializar la sesión con ${leaderId}.`, err);
    console.log(pc.yellow('\nTip: Asegúrate de haber iniciado sesión previamente con:'));
    console.log(pc.bold(pc.cyan(`  barhel login ${leaderId}\n`)));
    process.exit(1);
  }

  // Completer nativo para Tab
  const completer = (linePartial: string): [string[], string] => {
    const allCmds = AVAILABLE_SLASH_COMMANDS.flatMap((c) => [c.name, ...(c.aliases || [])]);
    const hits = allCmds.filter((c) => c.startsWith(linePartial));
    return [hits.length ? hits : allCmds, linePartial];
  };

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: TUI.getPromptPrefix('barhel'),
    completer,
  });

  rl.prompt();

  // Función ejecutora de comandos
  const runCommand = async (command: string, arg: string): Promise<void> => {
    switch (command) {
      case '/help':
        logger.printHelp();
        break;

      case '/workers':
      case '/analysis':
      case '/inspect':
        await TUI.promptWorkerInspection();
        break;

      case '/think':
      case '/thinking': {
        const isFull = TUI.toggleThinkingDisplay();
        if (isFull) {
          console.log(`\n${pc.magenta('💭 Modo de Razonamiento:')} ${pc.bgGreen(pc.black(' EXTENDIDO (Completo) '))}\n`);
        } else {
          console.log(`\n${pc.magenta('💭 Modo de Razonamiento:')} ${pc.bgYellow(pc.black(' RESUMIDO (OpenCode Style) '))}\n`);
        }
        break;
      }

      case '/resume':
      case '/history': {
        const selected = await HistoryManager.promptSelectSession(workdir);
        if (selected) {
          await orchestrator.switchSession(selected.id);
          printCurrentBanner();
          console.log(pc.green(`✔ Sesión reanudada: "${selected.title}" (ID: ${selected.id})\n`));
        }
        break;
      }

      case '/new': {
        const newSess = await orchestrator.startNewSession(arg || 'Nueva sesión');
        printCurrentBanner();
        console.log(pc.green(`✔ Nueva sesión iniciada: "${newSess.title}" (ID: ${newSess.id})\n`));
        break;
      }

      case '/title': {
        if (!arg) {
          console.log(pc.yellow('Uso: /title <nuevo título descriptivo para esta sesión>'));
        } else {
          orchestrator.setSessionTitle(arg);
          printCurrentBanner();
          console.log(pc.green(`✔ Título de la sesión actualizado: "${arg}"\n`));
        }
        break;
      }

      case '/sessions':
      case '/list': {
        const sessions = HistoryManager.listSessions();
        console.log(pc.bold('\n📜 Historial de Sesiones Guardadas:'));
        if (sessions.length === 0) {
          console.log(pc.dim('  (No hay sesiones guardadas aún)'));
        } else {
          for (const s of sessions.slice(0, 10)) {
            const currentBadge = s.id === orchestrator.getSessionId() ? pc.green(' [ACTIVA]') : '';
            console.log(`  ${pc.bold(s.id)} - ${pc.cyan(s.title)}${currentBadge}`);
            console.log(`    ${pc.dim(`📁 ${s.workdir} | 👑 ${s.leader} | ${s.turns.length} turnos | ${s.updatedAt.substring(0, 10)}`)}`);
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
          console.log(`\n🛡️  Modo Autónomo: ${pc.bgGreen(pc.black(' ACTIVADO '))} (No se pedirán confirmaciones [y/N])\n`);
        } else {
          console.log(`\n🛡️  Modo Seguro: ${pc.bgYellow(pc.black(' ACTIVADO '))} (Se pedirá confirmación interactiva [y/N])\n`);
        }
        break;
      }

      case '/status': {
        console.log(pc.bold('\n📊 Estado de Sesiones Guardadas:'));
        const status = listSessionsStatus();
        for (const [provider, info] of Object.entries(status)) {
          const badge = info.exists ? pc.green('✔ CONECTADO') : pc.yellow('✖ SIN SESIÓN');
          console.log(`  ${pc.bold(provider.toUpperCase().padEnd(12))}: ${badge} ${pc.dim(`(${info.path})`)}`);
        }
        if (HistoryManager.hasEncryptedSessions() && !process.env.BARHEL_SECRET) {
          console.log(pc.yellow(`\n⚠ Hay sesiones cifradas (.json.enc). Define BARHEL_SECRET para poder leerlas.`));
        }
        console.log();
        break;
      }

      case '/plan': {
        const isPlan = orchestrator.togglePlanOnly();
        if (isPlan) {
          console.log(`\n📝 Modo Plan Only: ${pc.bgBlue(pc.black(' ACTIVADO '))} (no se aplicarán cambios)\n`);
        } else {
          console.log(`\n📝 Modo Plan Only: ${pc.dim('desactivado')} (se ejecutan los cambios)\n`);
        }
        break;
      }

      case '/commit':
      case '/commitall': {
        const result = await orchestrator.commitWork(arg || undefined);
        if (result.startsWith('[git')) {
          logger.warn(result);
        } else {
          logger.success('Commit realizado.');
          console.log(pc.dim(result));
        }
        break;
      }

      case '/review': {
        const review = await orchestrator.reviewGit();
        console.log('\n' + pc.cyan(pc.bold('🔍 Revisión del workspace (git):')) + '\n');
        const lines = review.split('\n');
        console.log(lines.slice(0, 80).join('\n'));
        if (lines.length > 80) console.log(pc.dim(`... (${lines.length - 80} líneas más)`));
        console.log();
        break;
      }

      case '/explain': {
        if (!arg) {
          console.log(pc.yellow('Uso: /explain <símbolo o archivo>'));
        } else {
          await orchestrator.runTurn(`[EXPLAIN] Explica en detalle, con ejemplos del código, qué hace "${arg}" en este proyecto y cómo encaja con el resto. No modifiques nada.`);
        }
        break;
      }

      case '/fix': {
        const goal = arg
          ? `[FIX] Corrige el siguiente problema reportado: ${arg}. Deja el proyecto validado.`
          : `[FIX] Analiza los errores de tipo/lint o problemas del workspace y corrígelos en el código.`;
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
          logger.success(`Sesión exportada: ${filePath}`);
        } catch (err) {
          logger.error(`No se pudo exportar: ${err}`);
        }
        break;
      }

      case '/summarize': {
        const summary = await orchestrator.summarizeSession();
        if (summary) {
          console.log(pc.cyan('\n🧠 Resumen de memoria generado:\n'));
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
        } else {
          try {
            await orchestrator.setLeader(target);
            printCurrentBanner();
            console.log(pc.green(`✔ Líder cambiado a: ${target}\n`));
          } catch (err) {
            logger.error(`No se pudo cambiar el líder a "${target}"`, err);
          }
        }
        break;
      }

      case '/login': {
        const target = (arg || orchestrator.getLeaderId()).toLowerCase().trim();
        console.log(`\n🔑 Iniciando login para ${pc.cyan(target)}...`);
        try {
          if (target === 'all') {
            for (const p of DriverFactory.getAllProviders()) {
              console.log(pc.cyan(`\nAbriendo login para ${p.name}...`));
              const driver = p.createDriver();
              await driver.login();
            }
          } else {
            const driver = DriverFactory.createDriver(target);
            await driver.login();
          }
        } catch (loginErr) {
          logger.error(`Error al iniciar sesión para ${target}`, loginErr);
        }
        break;
      }

      case '/clear':
        console.clear();
        printCurrentBanner();
        break;

      case '/exit':
      case '/quit':
        console.log(pc.cyan('\n¡Hasta luego! Cerrando Barhel y guardando sesión...'));
        await orchestrator.shutdown();
        rl.close();
        process.exit(0);

      default:
        console.log(pc.yellow(`Comando "${command}" no reconocido. Escribe / y presiona Enter para ver el menú.`));
        break;
    }
  };

  // Menú interactivo de selección de comandos con búsqueda en vivo
  const openInteractiveMenu = async (initialQuery = ''): Promise<void> => {
    const choices = AVAILABLE_SLASH_COMMANDS.map((c) => ({
      name: `${pc.cyan(pc.bold(c.name.padEnd(12)))} ${pc.white(c.desc)}`,
      value: c.name,
      description: `Comando: ${c.name}${c.aliases ? ` (alias: ${c.aliases.join(', ')})` : ''}`,
    }));

    choices.push({
      name: pc.gray('✖ Volver al chat'),
      value: '__cancel__',
      description: 'Cierra el menú de comandos',
    });

    const selectedCommand = await search({
      message: '⚡ Escribe para filtrar comandos (o navega con flechas):',
      source: async (term) => {
        const query = (term || initialQuery).toLowerCase().replace(/^\//, '').trim();
        if (!query) return choices;
        return choices.filter((c) => {
          if (c.value === '__cancel__') return true;
          const matchVal = c.value.toLowerCase().includes(query);
          const matchName = c.name.toLowerCase().includes(query);
          return matchVal || matchName;
        });
      },
      pageSize: 12,
    });

    if (!selectedCommand || selectedCommand === '__cancel__') return;

    const cmdDef = AVAILABLE_SLASH_COMMANDS.find((c) => c.name === selectedCommand);
    let finalArg = '';

    if (cmdDef?.needsArg) {
      finalArg = await promptInput({
        message: cmdDef.needsArg,
        default: '',
      });
      if (!cmdDef.optionalArg && !finalArg.trim()) {
        console.log(pc.yellow('Comando cancelado por falta de parámetro obligatorio.'));
        return;
      }
    }

    await runCommand(selectedCommand, finalArg);
  };

  rl.on('line', async (line: string) => {
    const input = line.trim();

    if (!input) {
      rl.prompt();
      return;
    }

    // Si el usuario escribe únicamente "/" o "/menu", abre el menú interactivo con búsqueda en vivo
    if (input === '/' || input === '/menu') {
      rl.pause();
      try {
        await openInteractiveMenu('');
      } catch {
        // Ignorar interrupción en menú
      }
      rl.resume();
      rl.prompt();
      return;
    }

    // Manejo de Slash Commands escritos directamente
    if (input.startsWith('/')) {
      const parts = input.split(' ');
      const command = parts[0].toLowerCase();
      const arg = parts.slice(1).join(' ').trim();

      // Verificar si el comando existe directamente o por alias
      const isKnown = AVAILABLE_SLASH_COMMANDS.some(
        (c) => c.name === command || c.aliases?.includes(command)
      );

      rl.pause();
      try {
        if (isKnown) {
          await runCommand(command, arg);
        } else {
          // Si no se reconoce exactamente, abrir el buscador filtrando por lo que escribió
          console.log(pc.yellow(`Comando "${command}" no encontrado. Abriendo buscador de comandos...`));
          await openInteractiveMenu(command);
        }
      } catch (cmdErr) {
        logger.error('Error al ejecutar comando', cmdErr);
      }
      rl.resume();
      rl.prompt();
      return;
    }

    // Normal Turn Execution
    rl.pause();
    try {
      await orchestrator.runTurn(input);
    } catch (err) {
      logger.error('Error durante la ejecución del turno', err);
    }
    rl.resume();
    rl.prompt();
  });

  rl.on('SIGINT', async () => {
    console.log(pc.cyan('\n¡Hasta luego! Cerrando Barhel y guardando sesión...'));
    await orchestrator.shutdown();
    process.exit(0);
  });

  rl.on('close', async () => {
    await orchestrator.shutdown();
    process.exit(0);
  });
}