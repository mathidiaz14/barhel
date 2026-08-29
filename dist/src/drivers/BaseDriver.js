import { chromium } from 'playwright';
import { getProviderSessionPath } from '../utils/session.js';
import { logger } from '../utils/logger.js';
export class WebProviderError extends Error {
    reason;
    constructor(message, reason) {
        super(message);
        this.name = 'WebProviderError';
        this.reason = reason;
    }
}
export class BaseDriver {
    config;
    context = null;
    page = null;
    isInitialized = false;
    constructor(config) {
        this.config = config;
    }
    get providerId() {
        return this.config.id;
    }
    get displayName() {
        return this.config.displayName;
    }
    currentChatUrl;
    setChatUrl(url) {
        this.currentChatUrl = url;
    }
    getChatUrl() {
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
    async init(headless = true, initialChatUrl) {
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
        const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
        const launchArgs = [
            '--window-position=0,0',
            '--lang=es-ES,es,en-US,en',
            '--disable-blink-features=AutomationControlled',
            '--disable-features=IsolateOrigins,site-per-process',
            '--disable-infobars',
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
            // Intentar primero con Google Chrome del sistema o Edge para máxima legitimidad
            try {
                this.context = await chromium.launchPersistentContext(sessionDir, {
                    ...launchOptions,
                    channel: 'chrome',
                });
            }
            catch {
                try {
                    this.context = await chromium.launchPersistentContext(sessionDir, {
                        ...launchOptions,
                        channel: 'msedge',
                    });
                }
                catch {
                    try {
                        this.context = await chromium.launchPersistentContext(sessionDir, launchOptions);
                    }
                    catch (err) {
                        const msg = String(err?.message || '');
                        if (msg.includes("Executable doesn't exist") || msg.includes('playwright install')) {
                            logger.info('Navegador Chromium no encontrado. Instalándolo automáticamente con Playwright...');
                            const { execSync } = await import('node:child_process');
                            try {
                                execSync('npx playwright install chromium', { stdio: 'inherit' });
                                this.context = await chromium.launchPersistentContext(sessionDir, launchOptions);
                            }
                            catch (installErr) {
                                logger.error('No se pudo instalar Chromium automáticamente.', installErr);
                                throw err;
                            }
                        }
                        else {
                            throw err;
                        }
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
                window.chrome = {
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
                window.navigator.permissions.query = (parameters) => parameters.name === 'notifications'
                    ? Promise.resolve({ state: Notification.permission })
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
            }
            catch (navErr) {
                logger.warn(`No se pudo cargar de inmediato ${targetUrl}: ${navErr}`);
            }
            this.isInitialized = true;
        }
        catch (err) {
            logger.error(`Fallo al inicializar navegador para ${this.config.displayName}`, err);
            throw err;
        }
    }
    /**
     * Abre la URL del proveedor y permite al usuario autenticarse manualmente
     */
    async login() {
        logger.info(`Iniciando sesión interactiva para ${this.config.displayName}...`);
        await this.init(false); // Siempre visible
        if (!this.page)
            throw new Error('Página no inicializada');
        await this.ensureChatPage(this.config.url);
        await this.page.bringToFront();
        logger.success(`Navegador abierto en ${this.config.url}`);
        logger.info(`Por favor inicia sesión en la ventana del navegador. Una vez completado y estés en el chat, presiona Enter en este terminal para guardar la sesión.`);
        // Esperar a que el usuario presione Enter en terminal
        await new Promise((resolve) => {
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
    async ensureChatPage(targetChatUrl) {
        if (!this.page)
            throw new Error('Página no inicializada');
        const destUrl = targetChatUrl || this.currentChatUrl || this.config.url;
        const currentUrl = this.page.url();
        const targetHost = new URL(this.config.url).hostname;
        // Si necesitamos ir a una URL específica de chat o si la página actual no es del host
        if (destUrl !== currentUrl && (targetChatUrl || !currentUrl.includes(targetHost) || currentUrl === 'about:blank')) {
            await this.page.goto(destUrl, { waitUntil: 'domcontentloaded' });
            await this.page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => { });
            await this.page.waitForTimeout(1000);
        }
        const afterUrl = this.page.url();
        if (afterUrl.includes('/sign_in') || afterUrl.includes('/login') || afterUrl.includes('/auth')) {
            throw new Error(`Tu sesión de ${this.config.displayName} no está autenticada. Por favor ejecuta: barhel login ${this.config.id}`);
        }
        this.currentChatUrl = afterUrl;
        await this.dismissModals();
    }
    /**
     * Inyecta de forma universal y ultra-rápida prompts de cualquier longitud
     * compatible con editores ricos (Lexical, ProseMirror, React, Draft.js, Svelte).
     */
    async injectPrompt(inputSelector, prompt) {
        if (!this.page)
            throw new Error('Página no inicializada');
        const locator = this.page.locator(inputSelector).first();
        await locator.click({ force: true, timeout: 1500 }).catch(() => locator.focus().catch(() => { }));
        // 1. Probar inyección vía DataTransfer / ClipboardEvent simulado
        const injectedViaClipboard = await this.page.evaluate(({ sel, text }) => {
            const el = document.querySelector(sel);
            if (!el)
                return false;
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
                if (!notPrevented || el.innerText?.trim() || el.value?.trim()) {
                    return true;
                }
            }
            catch {
                // Fallback evaluate
            }
            return false;
        }, { sel: inputSelector, text: prompt });
        // 2. Si el editor requiere react descriptor setter
        if (!injectedViaClipboard) {
            await this.page.evaluate(({ sel, text }) => {
                const el = document.querySelector(sel);
                if (!el)
                    return;
                el.focus();
                if ('value' in el) {
                    const proto = Object.getPrototypeOf(el);
                    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set ||
                        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
                    if (setter) {
                        setter.call(el, text);
                    }
                    else {
                        el.value = text;
                    }
                }
                else {
                    el.innerHTML = `<p>${text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}</p>`;
                }
                el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
                el.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
                el.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, data: text }));
            }, { sel: inputSelector, text: prompt });
        }
        await this.page.waitForTimeout(250);
    }
    /**
     * Detecta tempranamente errores de la web (Rate Limits, Cloudflare, saturación)
     */
    async detectWebErrors() {
        if (!this.page)
            return null;
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
        }
        catch {
            return null;
        }
    }
    /**
     * Auto-healing: Encuentra semánticamente el campo de entrada si los selectores cambiaron
     */
    async findSemanticInput() {
        if (!this.page)
            return null;
        return await this.page.evaluate(() => {
            const candidates = Array.from(document.querySelectorAll('textarea, [contenteditable="true"], div[role="textbox"]'));
            let best = null;
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
                if (best.id)
                    return `#${best.id}`;
                if (best.tagName.toLowerCase() === 'textarea')
                    return 'textarea';
                return '[contenteditable="true"]';
            }
            return null;
        });
    }
    /**
     * Cierra automáticamente popups, banners o modales que bloqueen la interfaz
     */
    async dismissModals() {
        if (!this.page)
            return;
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
                    const btn = document.querySelector(sel);
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
        }
        catch {
            // Ignorar errores
        }
    }
    /**
     * Detiene en caliente la generación del LLM haciendo clic en el botón de stop o enviando Escape
     */
    async stopGeneration() {
        if (!this.page)
            return false;
        try {
            for (const stopSel of this.config.selectors.stopButton) {
                try {
                    const btn = this.page.locator(stopSel).first();
                    if (await btn.isVisible({ timeout: 200 })) {
                        await btn.click({ force: true, timeout: 500 });
                        return true;
                    }
                }
                catch {
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
                    const el = document.querySelector(sel);
                    if (el && typeof el.click === 'function') {
                        el.click();
                        return true;
                    }
                }
                return false;
            });
        }
        catch {
            return false;
        }
    }
    /**
     * Cierra el contexto del navegador y libera recursos
     */
    async close() {
        try {
            if (this.context) {
                await this.context.close();
                this.context = null;
                this.page = null;
                this.isInitialized = false;
            }
        }
        catch (err) {
            logger.warn(`Error al cerrar navegador de ${this.config.displayName}: ${err}`);
        }
    }
    /**
     * Helper seguro para encontrar un elemento entre una lista de selectores alternativos con auto-healing
     */
    async findFirstVisibleSelector(selectors, timeoutMs = 8000) {
        if (!this.page)
            return null;
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            for (const sel of selectors) {
                try {
                    const el = this.page.locator(sel).first();
                    if (await el.isVisible({ timeout: 400 })) {
                        return sel;
                    }
                }
                catch {
                    // Probar siguiente selector
                }
            }
            await this.page.waitForTimeout(300);
        }
        // Auto-healing fallback
        const semantic = await this.findSemanticInput();
        if (semantic)
            return semantic;
        return null;
    }
    /**
     * Verifica que los selectores clave del proveedor sigan presentes en la página.
     */
    async verifyUI() {
        if (!this.page)
            return [];
        const checks = [
            { name: 'inputPrompt', selectors: this.config.selectors.inputPrompt },
            { name: 'sendButton', selectors: this.config.selectors.sendButton },
            { name: 'responseContainer', selectors: this.config.selectors.responseContainer },
        ];
        const results = [];
        for (const ch of checks) {
            const selector = await this.findFirstVisibleSelector(ch.selectors, 6000);
            results.push({ name: ch.name, found: selector !== null, selector: selector ?? undefined });
        }
        return results;
    }
}
//# sourceMappingURL=BaseDriver.js.map