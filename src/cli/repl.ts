import readline from 'node:readline';
import pc from 'picocolors';
import { Orchestrator } from '../engine/Orchestrator.js';
import { logger } from '../utils/logger.js';
import { listSessionsStatus } from '../utils/session.js';
import { DriverFactory } from '../drivers/DriverFactory.js';
import { ConfigManager } from '../utils/config.js';
import { HistoryManager } from '../utils/history.js';
import { TUI } from './tui.js';
import { CLIOptions } from '../types/actions.js';

export async function startInteractiveChat(options: CLIOptions = {}): Promise<void> {
  // Si se solicitó reanudar sesión interactiva mediante flag --resume / -r
  let targetSessionId = options.sessionId;
  if (options.resume && !targetSessionId) {
    const selected = await HistoryManager.promptSelectSession(options.workdir || process.cwd());
    if (selected) {
      targetSessionId = selected.id;
    }
  }

  // Asegurar que exista configuración de modelos elegidos por el usuario
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

  printCurrentBanner();

  // Inicializar la sesión del navegador
  try {
    await orchestrator.initSession();
  } catch (err) {
    const leaderId = orchestrator.getLeaderId();
    logger.error(`No se pudo inicializar la sesión con ${leaderId}.`, err);
    console.log(pc.yellow('\nTip: Asegúrate de haber iniciado sesión previamente con:'));
    console.log(pc.bold(pc.cyan(`  barhel login ${leaderId}\n`)));
    process.exit(1);
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `${pc.cyan(pc.bold('barhel'))} ${pc.gray('❯')} `,
  });

  rl.prompt();

  rl.on('line', async (line: string) => {
    const input = line.trim();

    if (!input) {
      rl.prompt();
      return;
    }

    // Manejo de Slash Commands
    if (input.startsWith('/')) {
      const parts = input.split(' ');
      const command = parts[0].toLowerCase();
      const arg = parts.slice(1).join(' ').trim();

      switch (command) {
        case '/help':
          logger.printHelp();
          break;

        case '/workers':
        case '/analysis':
        case '/inspect': {
          rl.pause();
          try {
            await TUI.promptWorkerInspection();
          } catch (inspectErr) {
            logger.error('Error en inspector de workers', inspectErr);
          }
          rl.resume();
          break;
        }

        case '/think':
        case '/thinking': {
          const isFull = TUI.toggleThinkingDisplay();
          if (isFull) {
            console.log(`\n${pc.magenta('💭 Modo de Razonamiento:')} ${pc.bgGreen(pc.black(' COMPLETO (Claude Code Style) '))}\n`);
          } else {
            console.log(`\n${pc.magenta('💭 Modo de Razonamiento:')} ${pc.bgYellow(pc.black(' RESUMIDO (Línea compacta) '))}\n`);
          }
          break;
        }

        case '/resume':
        case '/history': {
          rl.pause();
          try {
            const selected = await HistoryManager.promptSelectSession(workdir);
            if (selected) {
              await orchestrator.switchSession(selected.id);
              printCurrentBanner();
              console.log(pc.green(`✔ Sesión reanudada: "${selected.title}" (ID: ${selected.id})\n`));
            }
          } catch (resErr) {
            logger.error('Error al reanudar sesión', resErr);
          }
          rl.resume();
          break;
        }

        case '/new': {
          rl.pause();
          try {
            const newSess = await orchestrator.startNewSession(arg || 'Nueva sesión');
            printCurrentBanner();
            console.log(pc.green(`✔ Nueva sesión iniciada: "${newSess.title}" (ID: ${newSess.id})\n`));
          } catch (newErr) {
            logger.error('Error al iniciar nueva sesión', newErr);
          }
          rl.resume();
          break;
        }

        case '/title': {
          if (!arg) {
            console.log(pc.yellow('Uso: /title <nuevo título descriptivo para esta sesión>'));
          } else {
            orchestrator.setSessionTitle(arg);
            console.log(pc.green(`✔ Título de sesión actualizado a: "${arg}"\n`));
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
          rl.pause();
          try {
            const currentCfg = ConfigManager.loadConfig();
            const updated = await ConfigManager.promptConfig(currentCfg);
            await orchestrator.switchModels(updated.leader, updated.workers);
            printCurrentBanner();
          } catch (cfgErr) {
            logger.error('Error al cambiar configuración', cfgErr);
          }
          rl.resume();
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
          console.log();
          break;
        }

        case '/login': {
          rl.pause();
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
          rl.resume();
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
          console.log(pc.yellow(`Comando "${command}" no reconocido. Usa /help para ver comandos disponibles.`));
          break;
      }

      rl.prompt();
      return;
    }

    // Ejecución de turno conversacional con el agente
    rl.pause();
    try {
      await orchestrator.runTurn(input);
    } catch (err) {
      logger.error('Error durante la ejecución del turno', err);
    }
    rl.resume();
    rl.prompt();
  });

  rl.on('close', async () => {
    await orchestrator.shutdown();
    process.exit(0);
  });
}
