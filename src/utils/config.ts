import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { select, checkbox } from '@inquirer/prompts';
import pc from 'picocolors';
import { ProviderType } from '../types/providers.js';
import { AVAILABLE_PROVIDERS, DriverFactory } from '../drivers/DriverFactory.js';
import { logger } from './logger.js';

export interface CommandPoliciesConfig {
  deny?: string[];
  allow?: string[];
}

export interface BarhelConfig {
  leader: string;
  workers: string[];
  autonomousDefault?: boolean;
  maxIterations?: number;
  commandPolicies?: CommandPoliciesConfig;
  fallbackOrder?: string[];
  autoSummarize?: boolean;
  autoCommit?: boolean;
  checkCommands?: string[];
  telegramToken?: string;
  telegramChatId?: string;
  allowedChatIds?: number[];
  openrouterApiKey?: string;
  openrouterModel?: string;
}

const CONFIG_DIR = path.join(os.homedir(), '.dev-agent-sessions');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

export class ConfigManager {
  private static ensureDir(): void {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
  }

  public static loadConfig(): BarhelConfig | null {
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
        return JSON.parse(raw) as BarhelConfig;
      }
    } catch {
      // Ignorar error de lectura
    }
    return null;
  }

  public static saveConfig(config: BarhelConfig): void {
    this.ensureDir();
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
  }

  /**
   * Muestra un menú interactivo en terminal para que el usuario escoja
   * su modelo Principal (Líder) y los modelos de soporte (Workers).
   */
  public static async promptConfig(currentConfig?: BarhelConfig | null): Promise<BarhelConfig> {
    const allProviders = DriverFactory.getAllProviders();

    console.log(pc.cyan('\n⚙️  Configuración de Modelos e Inteligencias Web para Barhel'));
    console.log(
      pc.dim(
        'Elige el modelo que liderará el ReAct Loop (codificación) y los modelos que darán soporte.\n'
      )
    );

    // 1. Seleccionar Agente Líder
    const leaderChoices = allProviders.map((p) => ({
      name: `${p.name}  ${pc.dim(`- ${p.description}`)}`,
      value: p.id,
      description: `${pc.cyan(p.url)} - ${p.description}`,
    }));

    const leader = await select({
      message: '👑 ¿Qué modelo web quieres como Agente Líder (Orquestador principal)?',
      choices: leaderChoices,
      default: (currentConfig?.leader as ProviderType) || ProviderType.DEEPSEEK,
    });

    // 2. Seleccionar Workers de Soporte (Multi-selección)
    const workerChoices = allProviders
      .filter((p) => p.id !== leader)
      .map((p) => ({
        name: `${p.name}  ${pc.dim(`(${p.url})`)}`,
        value: p.id,
        checked: currentConfig?.workers?.includes(p.id) ?? (p.id === ProviderType.CHATGPT || p.id === ProviderType.GEMINI),
      }));

    const workers = await checkbox({
      message: '👥 ¿Qué modelos quieres activar como Workers de soporte? (Espacio para marcar)',
      choices: workerChoices,
    });

    const newConfig: BarhelConfig = {
      leader,
      workers,
      autonomousDefault: currentConfig?.autonomousDefault ?? false,
      maxIterations: currentConfig?.maxIterations ?? 25,
      commandPolicies: currentConfig?.commandPolicies,
      fallbackOrder: currentConfig?.fallbackOrder,
      autoSummarize: currentConfig?.autoSummarize ?? true,
      autoCommit: currentConfig?.autoCommit ?? false,
    };

    this.saveConfig(newConfig);

    const leaderMeta = DriverFactory.getMeta(leader);
    console.log('\n' + pc.green('✔') + ' ' + pc.bold('Configuración guardada exitosamente:'));
    console.log(`  ${pc.bold('👑 Agente Líder:')} ${pc.cyan(leaderMeta?.name || leader)}`);
    console.log(
      `  ${pc.bold('👥 Workers:')}      ${workers.length > 0 ? workers.map((w) => pc.yellow(w)).join(', ') : pc.dim('(ninguno)')}\n`
    );

    return newConfig;
  }

  /**
   * Obtiene la configuración existente o solicita al usuario configurarla si no existe
   */
  public static async getOrPromptConfig(forcePrompt = false): Promise<BarhelConfig> {
    const existing = this.loadConfig();
    if (!existing || forcePrompt) {
      return await this.promptConfig(existing);
    }
    return existing;
  }
}
