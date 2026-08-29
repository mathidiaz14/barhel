import readline from 'node:readline';
import path from 'node:path';
import fs from 'node:fs';
import pc from 'picocolors';
import { search, input as promptInput } from '@inquirer/prompts';
import { Orchestrator } from '../engine/Orchestrator.js';
import { logger } from '../utils/logger.js';
import { listSessionsStatus } from '../utils/session.js';
import { DriverFactory } from '../drivers/DriverFactory.js';
import { ConfigManager } from '../utils/config.js';
import { HistoryManager } from '../utils/history.js';
import { TUI } from './tui.js';
import { CLIOptions } from '../types/actions.js';

const AVAILABLE_SLASH_COMMANDS = [
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
  { name: '/summarize', desc: 'Genera y muestra el resumen de memoria de la sesion' },
  { name: '/leader', desc: 'Cambia el modelo lider rapidamente', needsArg: 'Nombre del modelo:' },
  { name: '/login', desc: 'Inicia sesion en la interfaz web de un proveedor' },
  { name: '/clear', desc: 'Limpia la pantalla de la terminal' },
  { name: '/help', desc: 'Muestra la lista de todos los comandos y ayuda' },
  { name: '/exit', desc: 'Cierra Barhel y guarda la sesion', aliases: ['/quit'] },
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
    logger.error(`No se pudo inicializar la sesion con ${leaderId}.`, err);
    console.log(pc.yellow('\nTip: Asegurate de haber iniciado sesion previamente con:'));
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

  // Funcion ejecutora de comandos
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
          console.log(`\n${pc.cyan('[reasoning]')} ${pc.green('Extended (full)')}\n`);
        } else {
          console.log(`\n${pc.cyan('[reasoning]')} ${pc.yellow('Compact (+ Thought: Xms)')}\n`);
        }
        break;
      }

      case '/resume':
      case '/history': {
        const selected = await HistoryManager.promptSelectSession(workdir);
        if (selected) {
          await orchestrator.switchSession(selected.id);
          printCurrentBanner();
          console.log(pc.green(`[ok] Sesion reanudada: "${selected.title}" (#${selected.id})\n`));
        }
        break;
      }

      case '/new': {
        const newSess = await orchestrator.startNewSession(arg || 'Nueva sesion');
        printCurrentBanner();
        console.log(pc.green(`[ok] Nueva sesion: "${newSess.title}" (#${newSess.id})\n`));
        break;
      }

      case '/title': {
        if (!arg) {
          console.log(pc.yellow('Uso: /title <nuevo titulo para esta sesion>'));
        } else {
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
        } else {
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
        } else {
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
        } else {
          console.log(`\n${pc.cyan('[plan]')} ${pc.dim('disabled')} (changes will be executed)\n`);
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
        console.log('\n' + pc.cyan(pc.bold('Revision del workspace (git):')) + '\n');
        const lines = review.split('\n');
        console.log(lines.slice(0, 80).join('\n'));
        if (lines.length > 80) console.log(pc.dim(`... (${lines.length - 80} lineas mas)`));
        console.log();
        break;
      }

      case '/explain': {
        if (!arg) {
          console.log(pc.yellow('Uso: /explain <simbolo o archivo>'));
        } else {
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
        } catch (err) {
          logger.error(`No se pudo exportar: ${err}`);
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
        } else {
          try {
            await orchestrator.setLeader(target);
            printCurrentBanner();
            console.log(pc.green(`[ok] Lider cambiado a: ${target}\n`));
          } catch (err) {
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
          } else {
            const driver = DriverFactory.createDriver(target);
            await driver.login();
          }
        } catch (loginErr) {
          logger.error(`Error al iniciar sesion para ${target}`, loginErr);
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
        await orchestrator.shutdown();
        rl.close();
        process.exit(0);

      default:
        console.log(pc.yellow(`Comando "${command}" no reconocido. Escribe / para ver la paleta de comandos.`));
        break;
    }
  };

  // Menu interactivo de seleccion de comandos con busqueda en vivo
  const openInteractiveMenu = async (initialQuery = ''): Promise<void> => {
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
        console.log(pc.yellow('Comando cancelado por falta de parametro.'));
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

    // Si el usuario escribe "/" o "/menu", abre la paleta de busqueda
    if (input === '/' || input === '/menu') {
      rl.pause();
      try {
        await openInteractiveMenu('');
      } catch {
        // Ignorar cancelacion
      }
      rl.resume();
      rl.prompt();
      return;
    }

    // Manejo de Slash Commands directos
    if (input.startsWith('/')) {
      const parts = input.split(' ');
      const command = parts[0].toLowerCase();
      const arg = parts.slice(1).join(' ').trim();

      const isKnown = AVAILABLE_SLASH_COMMANDS.some(
        (c) => c.name === command || c.aliases?.includes(command)
      );

      rl.pause();
      try {
        if (isKnown) {
          await runCommand(command, arg);
        } else {
          console.log(pc.yellow(`Comando "${command}" no reconocido. Abriendo paleta...`));
          await openInteractiveMenu(command);
        }
      } catch (cmdErr) {
        logger.error('Error al ejecutar comando', cmdErr);
      }
      rl.resume();
      rl.prompt();
      return;
    }

    // Turno conversacional normal con el agente
    rl.pause();
    try {
      await orchestrator.runTurn(input);
    } catch (err) {
      logger.error('Error durante la ejecucion del turno', err);
    }
    rl.resume();
    rl.prompt();
  });

  rl.on('SIGINT', async () => {
    console.log(pc.cyan('\nCerrando Barhel y guardando sesion...'));
    await orchestrator.shutdown();
    process.exit(0);
  });

  rl.on('close', async () => {
    await orchestrator.shutdown();
    process.exit(0);
  });
}