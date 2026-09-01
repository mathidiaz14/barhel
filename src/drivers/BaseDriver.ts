import { chromium, BrowserContext, Page } from 'playwright';
import { ProviderConfig, ProviderType } from '../types/providers.js';
import { getProviderSessionPath } from '../utils/session.js';
import { logger } from '../utils/logger.js';

export class WebProviderError extends Error {
  public readonly reason: string;
  constructor(message: string, reason: string) {
    super(message);
    this.name = 'WebProviderError';
    this.reason = reason;
  }
}

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
   * Inicializa el contexto de navegador persistente con técnicas anti-detección avanzadas
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

    const sessionDir = getProviderSessionPath(this.config.sessionDirName);
    const getSystemUserAgent = (): string => {
      const plat = process.platform;
      if (plat === 'win32') {
        return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
      } else if (plat === 'darwin') {
        return 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
      } else {
        return 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
      }
    };
    const userAgent = getSystemUserAgent();

    const launchArgs = [
      '--window-position=0,0',
      '--lang=es-ES,es,en-US,en',
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
      '--disable-infobars',
    ];

    const isSandboxError = (err: any) => {
      const msg = String(err?.message || '');
      return msg.includes('sandbox') || msg.includes('Sandbox') || msg.includes('sandboxing');
    };

    const isProfileCorruptionError = (err: any) => {
      const msg = String(err?.message || '');
      return (
        msg.includes('Target page, context or browser has been closed') ||
        msg.includes('browser has been closed') ||
        msg.includes('Session deleted') ||
        msg.includes('crashed')
      );
    };

    const killStaleBrowserProcesses = async () => {
      const { execFile } = await import('node:child_process');
      const { promisify } = await import('node:util');
      const execFileAsync = promisify(execFile);
      try {
        if (process.platform === 'win32') {
          // Obtener PIDs de procesos Chrome que usen nuestro directorio de sesión
          const escapedDir = sessionDir.replace(/\\/g, '\\\\').replace(/'/g, "''");
          const { stdout } = await execFileAsync('powershell.exe', [
            '-NoProfile',
            '-Command',
            `Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | Where-Object { $_.CommandLine -like '*${escapedDir}*' } | ForEach-Object { $_.ProcessId }`,
          ]);
          const pids = stdout.trim().split(/\s+/).filter((p: string) => p.length > 0);
          if (pids.length > 0) {
            // taskkill /F /T mata el árbol completo de procesos (hijos incluidos)
            for (const pid of pids) {
              await execFileAsync('taskkill.exe', ['/F', '/T', '/PID', pid]).catch(() => {});
            }
            logger.warn(`${pids.length} procesos de navegador finalizados.`);
          }
        } else {
          const { exec } = await import('node:child_process');
          const { promisify: promisifyExec } = await import('node:util');
          const execAsync = promisifyExec(exec);
          await execAsync(`pkill -f "${sessionDir}"`).catch(() => {});
        }
        // Esperar a que el sistema libere los locks de archivos
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } catch {
        // Si no se pueden listar/finalizar procesos, continuar de todos modos
      }
    };

    const cleanSessionDir = async () => {
      await killStaleBrowserProcesses();
      const { rm } = await import('node:fs/promises');
      // Reintentar la eliminación completa del directorio hasta 3 veces
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          await rm(sessionDir, { recursive: true, force: true });
          logger.warn(`Directorio de sesión eliminado: ${sessionDir}`);
          return;
        } catch {
          if (attempt < 3) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
            await killStaleBrowserProcesses();
          }
        }
      }
      // Si la eliminación completa falla, limpiar el contenido como respaldo
      const { readdir } = await import('node:fs/promises');
      const { join } = await import('node:path');
      try {
        const entries = await readdir(sessionDir);
        for (const entry of entries) {
          await rm(join(sessionDir, entry), { recursive: true, force: true }).catch(() => {});
        }
        logger.warn(`Contenido del directorio de sesión limpiado: ${sessionDir}`);
      } catch {
        // Si no se puede limpiar, ignorar
      }
    };

    const doLaunch = async (options: any, overrideSessionDir?: string): Promise<BrowserContext> => {
      const targetDir = overrideSessionDir || sessionDir;
      try {
        return await chromium.launchPersistentContext(targetDir, {
          ...options,
          channel: 'chrome',
        });
      } catch (err: any) {
        if (isSandboxError(err)) throw err;
        try {
          return await chromium.launchPersistentContext(targetDir, {
            ...options,
            channel: 'msedge',
          });
        } catch (err2: any) {
          if (isSandboxError(err2)) throw err2;
          return await chromium.launchPersistentContext(targetDir, options);
        }
      }
    };

    try {
      const launchOptions = {
        headless,
        userAgent,
        viewport: { width: 1280, height: 800 },
        args: [...launchArgs],
        ignoreDefaultArgs: ['--enable-automation', '--no-sandbox', '--disable-setuid-sandbox'],
        deviceScaleFactor: 1,
        hasTouch: false,
        isMobile: false,
        locale: 'es-ES',
        timezoneId: 'America/Argentina/Buenos_Aires',
      };

      try {
        this.context = await doLaunch(launchOptions);
      } catch (err: any) {
        if (isProfileCorruptionError(err)) {
          logger.warn('Posible corrupción de perfil detectada. Usando directorio de sesión temporal...');
          // Usar un directorio temporal para evitar problemas de locks de archivos.
          // Chrome regenera la estructura completa en el primer lanzamiento.
          const { join } = await import('node:path');
          const tempSessionDir = join(sessionDir + '-tmp-' + Date.now());
          try {
            await killStaleBrowserProcesses();
            this.context = await doLaunch(launchOptions, tempSessionDir);
          } catch (retryErr: any) {
            if (isSandboxError(retryErr)) {
              const fallbackOptions = {
                ...launchOptions,
                ignoreDefaultArgs: ['--enable-automation'],
                args: [...launchOptions.args, '--no-sandbox', '--disable-setuid-sandbox'],
              };
              this.context = await doLaunch(fallbackOptions, tempSessionDir);
            } else {
              throw retryErr;
            }
          }
        } else if (isSandboxError(err)) {
          logger.warn('Detección de fallo de sandbox de Chromium. Reintentando sin sandbox...');
          const fallbackOptions = {
            ...launchOptions,
            ignoreDefaultArgs: ['--enable-automation'],
            args: [...launchOptions.args, '--no-sandbox', '--disable-setuid-sandbox'],
          };
          this.context = await doLaunch(fallbackOptions);
        } else {
          const msg = String(err?.message || '');
          if (msg.includes("Executable doesn't exist") || msg.includes('playwright install')) {
            logger.info('Navegador Chromium no encontrado. Instalándolo automáticamente con Playwright...');
            const { execSync } = await import('node:child_process');
            try {
              execSync('npx playwright install chromium', { stdio: 'inherit' });
              try {
                this.context = await doLaunch(launchOptions);
              } catch (retryErr: any) {
                if (isSandboxError(retryErr)) {
                  logger.warn('Detección de fallo de sandbox de Chromium tras la instalación. Reintentando sin sandbox...');
                  const fallbackOptions = {
                    ...launchOptions,
                    ignoreDefaultArgs: ['--enable-automation'],
                    args: [...launchOptions.args, '--no-sandbox', '--disable-setuid-sandbox'],
                  };
                  this.context = await doLaunch(fallbackOptions);
                } else {
                  throw retryErr;
                }
              }
            } catch (installErr) {
              logger.error('No se pudo instalar Chromium automáticamente.', installErr);
              throw err;
            }
          } else {
            throw err;
          }
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
          get: () => ['es-ES', 'es', 'en-US', 'en'],
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

    await this.ensureChatPage(this.config.url, false);
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
  public async ensureChatPage(targetChatUrl?: string, checkAuth = true): Promise<void> {
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
    if (checkAuth && (afterUrl.includes('/sign_in') || afterUrl.includes('/login') || afterUrl.includes('/auth'))) {
      throw new Error(
        `Tu sesión de ${this.config.displayName} no está autenticada. Por favor ejecuta: barhel login ${this.config.id}`
      );
    }

    this.currentChatUrl = afterUrl;
    await this.dismissModals();
  }

  /**
   * Inyecta de forma universal y ultra-rápida prompts de cualquier longitud
   * compatible con editores ricos (Lexical, ProseMirror, React, Draft.js, Svelte).
   */
  public async injectPrompt(inputSelector: string, prompt: string): Promise<void> {
    if (!this.page) throw new Error('Página no inicializada');

    const locator = this.page.locator(inputSelector).first();
    await locator.click({ force: true, timeout: 1500 }).catch(() => locator.focus().catch(() => {}));

    // 1. Probar inyección vía DataTransfer / ClipboardEvent simulado
    const injectedViaClipboard = await this.page.evaluate(
      ({ sel, text }) => {
        const el = document.querySelector(sel) as HTMLElement;
        if (!el) return false;
        el.focus();

        try {
          const dt = new DataTransfer();
          dt.setData('text/plain', text);
          const pasteEvent = new ClipboardEvent('paste', {
            clipboardData: dt,
            bubbles: true,
            cancelable: true,
            composed: true,
          });
          const notPrevented = el.dispatchEvent(pasteEvent);
          if (!notPrevented || el.innerText?.trim() || (el as HTMLTextAreaElement).value?.trim()) {
            return true;
          }
        } catch {
          // Fallback evaluate
        }
        return false;
      },
      { sel: inputSelector, text: prompt }
    );

    // 2. Si el editor requiere react descriptor setter
    if (!injectedViaClipboard) {
      await this.page.evaluate(
        ({ sel, text }) => {
          const el = document.querySelector(sel) as HTMLTextAreaElement | HTMLElement;
          if (!el) return;
          el.focus();

          if ('value' in el) {
            const proto = Object.getPrototypeOf(el);
            const setter =
              Object.getOwnPropertyDescriptor(proto, 'value')?.set ||
              Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
            if (setter) {
              setter.call(el, text);
            } else {
              (el as HTMLTextAreaElement).value = text;
            }
          } else {
            el.innerHTML = `<p>${text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}</p>`;
          }

          el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
          el.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
          el.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, data: text }));
        },
        { sel: inputSelector, text: prompt }
      );
    }

    await this.page.waitForTimeout(250);
  }

  /**
   * Detecta tempranamente errores de la web (Rate Limits, Cloudflare, saturación)
   */
  public async detectWebErrors(): Promise<string | null> {
    if (!this.page) return null;
    try {
      return await this.page.evaluate(() => {
        const bodyText = document.body?.innerText?.toLowerCase() || '';
        const errorPatterns = [
          { pattern: 'too many requests', reason: 'Rate limit (too many requests)' },
          { pattern: 'rate limit', reason: 'Rate limit alcanzado' },
          { pattern: 'you have reached your limit', reason: 'Límite de mensajes alcanzado' },
          { pattern: 'capacidad agotada', reason: 'Servidor sobrecargado' },
          { pattern: 'high traffic', reason: 'Servidor ocupado por alto tráfico' },
          { pattern: 'unusual traffic', reason: 'Cloudflare / Detección de tráfico inusual' },
          { pattern: 'verify you are human', reason: 'Captcha / Cloudflare Turnstile' },
          { pattern: 'just a moment...', reason: 'Cloudflare Challenge' },
          { pattern: 'checking your browser', reason: 'Cloudflare Protection' },
          { pattern: 'access denied', reason: 'Acceso denegado / Bloqueo web' },
        ];
        for (const p of errorPatterns) {
          if (bodyText.includes(p.pattern)) {
            return p.reason;
          }
        }
        return null;
      });
    } catch {
      return null;
    }
  }

  /**
   * Auto-healing: Encuentra semánticamente el campo de entrada si los selectores cambiaron
   */
  public async findSemanticInput(): Promise<string | null> {
    if (!this.page) return null;
    return await this.page.evaluate(() => {
      const candidates = Array.from(
        document.querySelectorAll('textarea, [contenteditable="true"], div[role="textbox"]')
      ) as HTMLElement[];
      let best: HTMLElement | null = null;
      let maxArea = 0;
      for (const el of candidates) {
        const rect = el.getBoundingClientRect();
        if (rect.width > 100 && rect.height > 20 && rect.top < window.innerHeight) {
          const area = rect.width * rect.height;
          if (area > maxArea) {
            maxArea = area;
            best = el;
          }
        }
      }
      if (best) {
        if (best.id) return `#${best.id}`;
        if (best.tagName.toLowerCase() === 'textarea') return 'textarea';
        return '[contenteditable="true"]';
      }
      return null;
    });
  }

  /**
   * Cierra automáticamente popups, banners o modales que bloqueen la interfaz
   */
  public async dismissModals(): Promise<void> {
    if (!this.page) return;
    try {
      await this.page.keyboard.press('Escape');
      await this.page.evaluate(() => {
        const closeSelectors = [
          '.ds-modal-close',
          'div.ds-modal-wrapper button',
          'div[class*="modal"] button[aria-label*="Close"]',
          'div[class*="modal"] button[aria-label*="Cerrar"]',
          'div[class*="dialog"] button',
          'button.ds-dialog-close',
          'svg[class*="close"]',
          '[data-testid="modal-close-button"]',
          'div[role="dialog"] button',
        ];
        for (const sel of closeSelectors) {
          const btn = document.querySelector(sel) as HTMLElement;
          if (btn && typeof btn.click === 'function') {
            btn.click();
          }
        }
        document.querySelectorAll('.ds-modal-focus-lock, .ds-modal-wrapper').forEach((el) => {
          if (!el.querySelector('form, textarea, input[type="password"]')) {
            el.remove();
          }
        });
      });
    } catch {
      // Ignorar errores
    }
  }

  /**
   * Detiene en caliente la generación del LLM haciendo clic en el botón de stop o enviando Escape
   */
  public async stopGeneration(): Promise<boolean> {
    if (!this.page) return false;
    try {
      for (const stopSel of this.config.selectors.stopButton) {
        try {
          const btn = this.page.locator(stopSel).first();
          if (await btn.isVisible({ timeout: 200 })) {
            await btn.click({ force: true, timeout: 500 });
            return true;
          }
        } catch {
          // Continuar
        }
      }

      await this.page.keyboard.press('Escape');

      return await this.page.evaluate(() => {
        const stopSelectors = [
          'div[role="button"][aria-label*="Stop"]',
          'button[aria-label*="Stop"]',
          'button[aria-label*="Detener"]',
          '.ds-loading-icon',
          'svg.ds-stop-icon',
          'button:has(rect)',
          'div:has(rect)',
          'div[class*="stop"]',
          'button[aria-label*="Stop response"]',
        ];
        for (const sel of stopSelectors) {
          const el = document.querySelector(sel) as HTMLElement;
          if (el && typeof el.click === 'function') {
            el.click();
            return true;
          }
        }
        return false;
      });
    } catch {
      return false;
    }
  }

  /**
   * Método abstracto para enviar prompt y esperar la respuesta completa del LLM con soporte de streaming opcional
   */
  public abstract sendMessage(prompt: string, onChunk?: (chunk: string) => void): Promise<string>;

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
   * Helper seguro para encontrar un elemento entre una lista de selectores alternativos con auto-healing
   */
  protected async findFirstVisibleSelector(selectors: string[], timeoutMs = 8000): Promise<string | null> {
    if (!this.page) return null;
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      for (const sel of selectors) {
        try {
          const el = this.page.locator(sel).first();
          if (await el.isVisible({ timeout: 400 })) {
            return sel;
          }
        } catch {
          // Probar siguiente selector
        }
      }
      await this.page.waitForTimeout(300);
    }

    // Auto-healing fallback
    const semantic = await this.findSemanticInput();
    if (semantic) return semantic;

    return null;
  }

  /**
   * Diagnóstico exhaustivo de salud, autenticación y selectores de UI del proveedor
   */
  public async verifyHealth(testPing = false): Promise<DriverHealthReport> {
    if (!this.page) {
      return {
        providerId: this.config.id,
        displayName: this.config.displayName,
        url: this.config.url,
        authenticated: false,
        authReason: 'Página no inicializada',
        cloudflareBlocked: false,
        inputSelectorFound: false,
        sendButtonFound: false,
        responseContainerFound: false,
        latencyMs: 0,
        error: 'El navegador no pudo ser iniciado.',
      };
    }

    const start = performance.now();
    try {
      await this.ensureChatPage(undefined, false);
      const latencyMs = Math.round(performance.now() - start);
      const currentUrl = this.page.url();

      const isLoginUrl =
        currentUrl.includes('/login') ||
        currentUrl.includes('/sign_in') ||
        currentUrl.includes('/auth') ||
        currentUrl.includes('/signin') ||
        currentUrl.includes('accounts.google.com') ||
        currentUrl.includes('auth0.openai.com');

      const title = await this.page.title().catch(() => '');
      const cfCount = await this.page
        .locator('#challenge-running, #challenge-stage, #cf-turnstile, iframe[src*="cloudflare"]')
        .count()
        .catch(() => 0);
      const cloudflareBlocked = title.toLowerCase().includes('just a moment') || cfCount > 0;

      const inputSelector = await this.findFirstVisibleSelector(this.config.selectors.inputPrompt, 4000);
      const sendButtonSelector = await this.findFirstVisibleSelector(this.config.selectors.sendButton, 1500);
      const responseContainerSelector = await this.findFirstVisibleSelector(this.config.selectors.responseContainer, 1500);

      const authenticated = !isLoginUrl && !cloudflareBlocked && inputSelector !== null;
      let authReason: string | undefined;

      if (!authenticated) {
        if (cloudflareBlocked) {
          authReason = 'Bloqueado por verificación Cloudflare / Anti-bot';
        } else if (isLoginUrl) {
          authReason = `Redirigido a pantalla de inicio de sesión (${currentUrl.slice(0, 45)}...)`;
        } else if (!inputSelector) {
          authReason = 'Campo de entrada no disponible (posible sesión expirada o modal invasivo)';
        }
      }

      const report: DriverHealthReport = {
        providerId: this.config.id,
        displayName: this.config.displayName,
        url: this.config.url,
        currentUrl,
        authenticated,
        authReason,
        cloudflareBlocked,
        inputSelectorFound: inputSelector !== null,
        inputSelector: inputSelector ?? undefined,
        sendButtonFound: sendButtonSelector !== null,
        sendButtonSelector: sendButtonSelector ?? undefined,
        responseContainerFound: responseContainerSelector !== null,
        latencyMs,
      };

      if (testPing && authenticated && inputSelector) {
        const pingStart = performance.now();
        try {
          const pingResp = await this.sendMessage('Responde estrictamente la palabra "OK" para prueba de diagnóstico.');
          report.pingDurationMs = Math.round(performance.now() - pingStart);
          report.pingSuccess = pingResp.trim().length > 0;
          report.pingResponse = pingResp.slice(0, 100);
        } catch (pingErr) {
          report.pingSuccess = false;
          report.pingDurationMs = Math.round(performance.now() - pingStart);
          report.error = pingErr instanceof Error ? pingErr.message : String(pingErr);
        }
      }

      return report;
    } catch (err) {
      return {
        providerId: this.config.id,
        displayName: this.config.displayName,
        url: this.config.url,
        currentUrl: this.page.url(),
        authenticated: false,
        authReason: err instanceof Error ? err.message : String(err),
        cloudflareBlocked: false,
        inputSelectorFound: false,
        sendButtonFound: false,
        responseContainerFound: false,
        latencyMs: Math.round(performance.now() - start),
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Verifica que los selectores clave del proveedor sigan presentes en la página.
   */
  public async verifyUI(): Promise<{ name: string; found: boolean; selector?: string }[]> {
    if (!this.page) return [];

    const checks = [
      { name: 'inputPrompt', selectors: this.config.selectors.inputPrompt },
      { name: 'sendButton', selectors: this.config.selectors.sendButton },
      { name: 'responseContainer', selectors: this.config.selectors.responseContainer },
    ];

    const results: { name: string; found: boolean; selector?: string }[] = [];
    for (const ch of checks) {
      const selector = await this.findFirstVisibleSelector(ch.selectors, 6000);
      results.push({ name: ch.name, found: selector !== null, selector: selector ?? undefined });
    }
    return results;
  }
}

export interface DriverHealthReport {
  providerId: string;
  displayName: string;
  url: string;
  currentUrl?: string;
  authenticated: boolean;
  authReason?: string;
  cloudflareBlocked: boolean;
  inputSelectorFound: boolean;
  inputSelector?: string;
  sendButtonFound: boolean;
  sendButtonSelector?: string;
  responseContainerFound: boolean;
  latencyMs: number;
  pingSuccess?: boolean;
  pingResponse?: string;
  pingDurationMs?: number;
  error?: string;
}
