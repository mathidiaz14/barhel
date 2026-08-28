#!/usr/bin/env node

import { Command } from 'commander';
import pc from 'picocolors';
import { startInteractiveChat } from '../src/cli/repl.js';
import { Orchestrator } from '../src/engine/Orchestrator.js';
import { DriverFactory } from '../src/drivers/DriverFactory.js';
import { ConfigManager } from '../src/utils/config.js';
import { listSessionsStatus } from '../src/utils/session.js';
import { logger } from '../src/utils/logger.js';

const program = new Command();

program
  .name('barhel')
  .description('Asistente de codificación interactivo en terminal estilo Claude Code / OpenCode')
  .version('1.0.0');

// Comando principal: Si no hay argumentos, abre el chat REPL. Si hay argumentos, ejecuta el prompt.
program
  .argument('[prompt...]', 'Objetivo o instrucción inicial (opcional, si se omite abre el chat interactivo)')
  .option('-a, --autonomous', 'Inicia en modo de autonomía total (sin pedir confirmaciones [y/N])', false)
  .option('-w, --workdir <path>', 'Directorio de trabajo del proyecto', process.cwd())
  .option('--leader <provider>', 'Modelo líder específico (deepseek, claude, chatgpt, gemini, qwen, mistral, perplexity)')
  .option('--workers <list>', 'Lista de workers separados por coma (ej. chatgpt,gemini,claude)')
  .option('--visible', 'Muestra la ventana visible del navegador en lugar de ejecutarlo en segundo plano (headless)', false)
  .option('-m, --max-iterations <number>', 'Límite máximo de pasos ReAct por instrucción', '25')
  .action(async (promptParts: string[], options) => {
    const prompt = promptParts.join(' ').trim();
    const workers = options.workers ? options.workers.split(',').map((s: string) => s.trim()) : undefined;
    const isHeadless = !options.visible;

    // Si no se pasó un prompt, abrir la CLI interactiva tipo Claude Code / OpenCode
    if (!prompt) {
      await startInteractiveChat({
        autonomous: options.autonomous,
        workdir: options.workdir,
        leader: options.leader,
        workers: workers,
        headless: isHeadless,
        maxIterations: parseInt(options.maxIterations, 10),
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
      maxIterations: parseInt(options.maxIterations, 10),
    });

    try {
      const leaderMeta = DriverFactory.getMeta(orchestrator.getLeaderId());
      const leaderName = leaderMeta?.name || orchestrator.getLeaderId();
      const workersNames = orchestrator.getActiveWorkers().join(', ');

      logger.banner(options.workdir, options.autonomous, leaderName, workersNames);
      await orchestrator.runTurn(prompt);
      await orchestrator.shutdown();
    } catch (err) {
      logger.error('Error fatal durante la ejecución de la tarea', err);
      process.exit(1);
    }
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

// Subcomando: Estado de sesiones
program
  .command('sessions')
  .alias('status')
  .description('Muestra el estado de las sesiones persistentes almacenadas en el sistema')
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

program.parse(process.argv);
