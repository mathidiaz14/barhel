import { chromium, BrowserContext, Page } from 'playwright';
import { ProviderConfig, ProviderType } from '../types/providers.js';
import { getProviderSessionPath } from '../utils/session.js';
import { logger } from '../utils/logger.js';

export abstract class BaseDriver {
  protected config: ProviderConfig;
  protected context: BrowserContext | null = null;
  protected page: Page | null = null;
  protected isInitialized = false;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  public get providerId(): ProviderType {
    return this.config.id;
  }

  public get displayName(): string {
    return this.config.displayName;
  }

  protected currentChatUrl?: string;

  public setChatUrl(url?: string): void {
    this.currentChatUrl = url;
  }

  public getChatUrl(): string | undefined {
    if (this.page) {
      const url = this.page.url();
      if (url && !url.startsWith('about:') && url.includes(new URL(this.config.url).hostname)) {
        this.currentChatUrl = url;
      }
    }
    return this.currentChatUrl;
  }

  /**
   * Inicializa el contexto de navegador persistente con técnicas anti-detección
   */
  public async init(headless = true, initialChatUrl?: string): Promise<void> {
    if (initialChatUrl) {
      this.currentChatUrl = initialChatUrl;
    }

    if (this.isInitialized && this.context && this.page) {
      if (this.currentChatUrl) {
        await this.ensureChatPage(this.currentChatUrl);
      }
      return;
    }

    const sessionDir = getProviderSessionPath(this.config.id);
    const userAgent =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

    const launchArgs = [
      '--window-position=0,0',
      '--lang=es-ES,es,en-US,en',
    ];

    try {
      const launchOptions = {
        headless,
        userAgent,
        viewport: { width: 1280, height: 800 },
        args: launchArgs,
        ignoreDefaultArgs: ['--enable-automation', '--no-sandbox', '--disable-setuid-sandbox'],
        deviceScaleFactor: 1,
        hasTouch: false,
        isMobile: false,
        locale: 'es-ES',
        timezoneId: 'America/Argentina/Buenos_Aires',
      };

      // Intentar primero con Google Chrome del sistema o Edge para máxima legitimidad ante Google
      try {
        this.context = await chromium.launchPersistentContext(sessionDir, {
          ...launchOptions,
          channel: 'chrome',
        });
      } catch {
        try {
          this.context = await chromium.launchPersistentContext(sessionDir, {
            ...launchOptions,
            channel: 'msedge',
          });
        } catch {
          this.context = await chromium.launchPersistentContext(sessionDir, launchOptions);
        }
      }

      // Scripts de evasión inyectados antes de que cargue cualquier página
      await this.context.addInitScript(() => {
        // Eliminar rastro de webdriver
        Object.defineProperty(navigator, 'webdriver', {
          get: () => undefined,
        });

        // Simular objeto window.chrome estándar
        (window as unknown as { chrome: { runtime: Record<string, unknown> } }).chrome = {
          runtime: {},
        };

        // Simular plugins válidos
        Object.defineProperty(navigator, 'plugins', {
          get: () => [1, 2, 3, 4, 5],
        });

        // Simular idiomas reales
        Object.defineProperty(navigator, 'languages', {
          get: () => ['en-US', 'en', 'es'],
        });

        // Override de permissions query
        const originalQuery = window.navigator.permissions.query;
        window.navigator.permissions.query = (parameters: PermissionDescriptor) =>
          parameters.name === 'notifications'
            ? Promise.resolve({ state: Notification.permission } as PermissionStatus)
            : originalQuery(parameters);
      });

      const pages = this.context.pages();
      this.page = pages.length > 0 ? pages[0] : await this.context.newPage();
      this.page.setDefaultTimeout(this.config.defaultTimeoutMs);

      // Navegar a la URL de chat específica o al nuevo chat
      const targetUrl = this.currentChatUrl || this.config.url;
      try {
        await this.page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
        await this.page.bringToFront();
      } catch (navErr) {
        logger.warn(`No se pudo cargar de inmediato ${targetUrl}: ${navErr}`);
      }

      this.isInitialized = true;
    } catch (err) {
      logger.error(`Fallo al inicializar navegador para ${this.config.displayName}`, err);
      throw err;
    }
  }

  /**
   * Abre la URL del proveedor y permite al usuario autenticarse manualmente
   */
  public async login(): Promise<void> {
    logger.info(`Iniciando sesión interactiva para ${this.config.displayName}...`);
    await this.init(false); // Siempre visible

    if (!this.page) throw new Error('Página no inicializada');

    await this.ensureChatPage(this.config.url);
    await this.page.bringToFront();

    logger.success(`Navegador abierto en ${this.config.url}`);
    logger.info(
      `Por favor inicia sesión en la ventana del navegador. Una vez completado y estés en el chat, presiona Enter en este terminal para guardar la sesión.`
    );

    // Esperar a que el usuario presione Enter en terminal
    await new Promise<void>((resolve) => {
      process.stdin.resume();
      process.stdin.once('data', () => {
        process.stdin.pause();
        resolve();
      });
    });

    logger.success(`Sesión guardada para ${this.config.displayName}`);
    await this.close();
  }

  /**
   * Navega a la página del chat (o a una URL de chat específica) y espera a que esté lista
   */
  public async ensureChatPage(targetChatUrl?: string): Promise<void> {
    if (!this.page) throw new Error('Página no inicializada');

    const destUrl = targetChatUrl || this.currentChatUrl || this.config.url;
    const currentUrl = this.page.url();
    const targetHost = new URL(this.config.url).hostname;

    // Si necesitamos ir a una URL específica de chat o si la página actual no es del host
    if (destUrl !== currentUrl && (targetChatUrl || !currentUrl.includes(targetHost) || currentUrl === 'about:blank')) {
      await this.page.goto(destUrl, { waitUntil: 'domcontentloaded' });
      await this.page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
      await this.page.waitForTimeout(1000);
    }

    const afterUrl = this.page.url();
    if (afterUrl.includes('/sign_in') || afterUrl.includes('/login') || afterUrl.includes('/auth')) {
      throw new Error(
        `Tu sesión de ${this.config.displayName} no está autenticada. Por favor ejecuta: barhel login ${this.config.id}`
      );
    }

    this.currentChatUrl = afterUrl;
  }

  /**
   * Método abstracto para enviar prompt y esperar la respuesta completa del LLM
   */
  public abstract sendMessage(prompt: string): Promise<string>;

  /**
   * Método abstracto para verificar si la respuesta sigue en proceso (streaming)
   */
  public abstract isStreaming(): Promise<boolean>;

  /**
   * Cierra el contexto del navegador y libera recursos
   */
  public async close(): Promise<void> {
    try {
      if (this.context) {
        await this.context.close();
        this.context = null;
        this.page = null;
        this.isInitialized = false;
      }
    } catch (err) {
      logger.warn(`Error al cerrar navegador de ${this.config.displayName}: ${err}`);
    }
  }

  /**
   * Helper seguro para encontrar un elemento entre una lista de selectores alternativos con reintentos
   */
  protected async findFirstVisibleSelector(selectors: string[], timeoutMs = 8000): Promise<string | null> {
    if (!this.page) return null;
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      for (const sel of selectors) {
        try {
          const el = this.page.locator(sel).first();
          if (await el.isVisible({ timeout: 600 })) {
            return sel;
          }
        } catch {
          // Probar siguiente selector
        }
      }
      await this.page.waitForTimeout(400);
    }
    return null;
  }
}
