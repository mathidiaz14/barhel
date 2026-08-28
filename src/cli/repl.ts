import readline from 'node:readline';
import pc from 'picocolors';
import { Orchestrator } from '../engine/Orchestrator.js';
import { logger } from '../utils/logger.js';
import { listSessionsStatus } from '../utils/session.js';
import { DriverFactory } from '../drivers/DriverFactory.js';
import { ConfigManager } from '../utils/config.js';
import { CLIOptions } from '../types/actions.js';

export async function startInteractiveChat(options: CLIOptions = {}): Promise<void> {
  // Asegurar que exista configuración de modelos elegidos por el usuario
  const userConfig = await ConfigManager.getOrPromptConfig(false);

  const mergedOptions: CLIOptions = {
    ...options,
    leader: options.leader || userConfig.leader,
    workers: options.workers || userConfig.workers,
  };

  const orchestrator = new Orchestrator(mergedOptions);
  const workdir = orchestrator.getWorkdir();

  const printCurrentBanner = () => {
    const leaderMeta = DriverFactory.getMeta(orchestrator.getLeaderId());
    const leaderName = leaderMeta?.name || orchestrator.getLeaderId();
    const workersNames = orchestrator.getActiveWorkers().join(', ');
    logger.banner(workdir, orchestrator.isAutonomous(), leaderName, workersNames);
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

        case '/status':
        case '/sessions': {
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
          console.log(pc.cyan('\n¡Hasta luego! Cerrando Barhel...'));
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
