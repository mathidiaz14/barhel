import { ProgressSupervisor } from '../engine/ProgressSupervisor.js';
import { logger } from '../utils/logger.js';
import { ConfigManager } from '../utils/config.js';
export class TelegramBot {
    token;
    allowedChatIds = new Set();
    orchestrator = null;
    isPolling = false;
    lastUpdateId = 0;
    pollingAbortController = null;
    constructor(token, allowedChatIds = []) {
        this.token = token.trim();
        this.allowedChatIds = new Set(allowedChatIds);
    }
    setOrchestrator(orchestrator) {
        this.orchestrator = orchestrator;
    }
    /**
     * Inicia el bucle de Long-Polling para recibir y procesar mensajes de Telegram
     */
    async start() {
        if (this.isPolling)
            return;
        this.isPolling = true;
        this.pollingAbortController = new AbortController();
        logger.info('Telegram Bot iniciado. Escuchando mensajes en segundo plano...');
        // Enviar mensaje de bienvenida a los chat IDs registrados
        for (const chatId of this.allowedChatIds) {
            await this.sendMessage(chatId, '🤖 *Barhel Daemon Conectado*\nListo para recibir instrucciones desde Telegram.');
        }
        // Suscribir notificaciones de supervisión
        ProgressSupervisor.onProgress((snap) => {
            if (snap.totalTodos > 0 && snap.completedTodos === snap.totalTodos) {
                this.broadcast(`🎉 *Barhel completó todas las tareas:* ${snap.completedTodos}/${snap.totalTodos} (100%)\n${snap.summary}`);
            }
        });
        while (this.isPolling) {
            try {
                await this.pollUpdates();
            }
            catch (err) {
                if (!this.isPolling)
                    break;
                logger.warn(`Error en Telegram polling: ${err?.message || err}. Reintentando en 5s...`);
                await new Promise((r) => setTimeout(r, 5000));
            }
        }
    }
    stop() {
        this.isPolling = false;
        if (this.pollingAbortController) {
            this.pollingAbortController.abort();
            this.pollingAbortController = null;
        }
        logger.info('Telegram Bot detenido.');
    }
    async pollUpdates() {
        const url = `https://api.telegram.org/bot${this.token}/getUpdates?offset=${this.lastUpdateId + 1}&timeout=30`;
        const res = await fetch(url, {
            signal: this.pollingAbortController?.signal,
        });
        if (!res.ok) {
            throw new Error(`Telegram API returned status ${res.status}`);
        }
        const data = (await res.json());
        if (!data.ok || !Array.isArray(data.result))
            return;
        for (const update of data.result) {
            this.lastUpdateId = Math.max(this.lastUpdateId, update.update_id);
            if (update.message && update.message.text) {
                await this.handleMessage(update.message);
            }
        }
    }
    async handleMessage(msg) {
        const chatId = msg.chat.id;
        const text = (msg.text || '').trim();
        // Verificación de seguridad
        if (this.allowedChatIds.size > 0 && !this.allowedChatIds.has(chatId)) {
            await this.sendMessage(chatId, '⛔ *Acceso Denegado*\nEste bot de Barhel es privado. Agrega tu Chat ID en `config.json`.');
            return;
        }
        // Auto-registrar primer Chat ID si la lista estaba vacía
        if (this.allowedChatIds.size === 0) {
            this.allowedChatIds.add(chatId);
            const cfg = ConfigManager.loadConfig() || { leader: 'deepseek', workers: [] };
            cfg.telegramChatId = String(chatId);
            ConfigManager.saveConfig(cfg);
            await this.sendMessage(chatId, `🔐 *Chat ID registrado con éxito:* \`${chatId}\`\nAhora este chat está autorizado.`);
        }
        if (text.startsWith('/start')) {
            const info = `🤖 *Barhel AI Coding Assistant*\n\n` +
                `• *Líder:* ${this.orchestrator?.getLeaderId() || 'No iniciado'}\n` +
                `• *Directorio:* \`${this.orchestrator?.getSession().workdir || process.cwd()}\`\n\n` +
                `Comandos disponibles:\n` +
                `/status - Ver porcentaje de avance y supervisión\n` +
                `/workers - Ver análisis de los workers secundarios\n` +
                `/cancel - Interrumpir la tarea actual\n` +
                `/help - Ayuda\n\n` +
                `_O escribe cualquier mensaje/código para que Barhel trabaje en tu proyecto._`;
            await this.sendMessage(chatId, info);
            return;
        }
        if (text.startsWith('/status')) {
            const report = ProgressSupervisor.formatProgressReport();
            await this.sendMessage(chatId, `\`\`\`\n${report}\n\`\`\``);
            return;
        }
        if (text.startsWith('/cancel')) {
            if (this.orchestrator && this.orchestrator.isTurnRunning) {
                await this.orchestrator.interruptCurrentTurn();
                await this.sendMessage(chatId, '⏹️ *Turno interrumpido por el usuario.*');
            }
            else {
                await this.sendMessage(chatId, 'ℹ️ No hay ningún turno en ejecución.');
            }
            return;
        }
        // Ejecutar turno en el Orchestrator
        if (this.orchestrator) {
            await this.sendMessage(chatId, `⏳ *Procesando instrucción:* _"${text}"_`);
            try {
                await this.orchestrator.runTurn(text);
                const lastTurn = this.orchestrator.getSession().turns.slice(-1)[0];
                const summary = lastTurn?.summary || lastTurn?.thought || 'Tarea completada.';
                await this.sendMessage(chatId, `✅ *Turno finalizado:*\n\n${summary}`);
            }
            catch (err) {
                await this.sendMessage(chatId, `❌ *Error al ejecutar:* ${err?.message || err}`);
            }
        }
        else {
            await this.sendMessage(chatId, '⚠️ Orchestrator no conectado.');
        }
    }
    async sendMessage(chatId, text) {
        try {
            const url = `https://api.telegram.org/bot${this.token}/sendMessage`;
            await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    text,
                    parse_mode: 'Markdown',
                }),
            });
        }
        catch {
            // Silencioso
        }
    }
    async broadcast(text) {
        for (const chatId of this.allowedChatIds) {
            await this.sendMessage(chatId, text);
        }
    }
}
//# sourceMappingURL=TelegramBot.js.map