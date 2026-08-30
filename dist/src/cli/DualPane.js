import pc from 'picocolors';
import path from 'node:path';
import { getGitBranch } from '../utils/git.js';
import { getBarhelVersion } from '../utils/version.js';
import { ProgressSupervisor } from '../engine/ProgressSupervisor.js';
import { DriverFactory } from '../drivers/DriverFactory.js';
/**
 * Utilidad para calcular el ancho visual de un string ignorando secuencias ANSI de color
 */
export function visualLength(str) {
    const ansiRegex = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;
    return str.replace(ansiRegex, '').length;
}
/**
 * Rellena un string con espacios a la derecha hasta alcanzar el ancho visual deseado
 */
export function padRightVisual(str, targetWidth) {
    const len = visualLength(str);
    if (len >= targetWidth) {
        const ansiRegex = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;
        const plain = str.replace(ansiRegex, '');
        if (plain.length > targetWidth) {
            return str.slice(0, targetWidth - 1) + '…';
        }
        return str;
    }
    return str + ' '.repeat(targetWidth - len);
}
/**
 * Divide un texto en líneas que respeten el ancho máximo visual
 */
export function wrapTextVisual(text, maxWidth) {
    if (!text)
        return [''];
    const result = [];
    const lines = text.split('\n');
    for (const line of lines) {
        if (visualLength(line) <= maxWidth) {
            result.push(line);
        }
        else {
            let current = '';
            const words = line.split(' ');
            for (const word of words) {
                if (visualLength(current + (current ? ' ' : '') + word) <= maxWidth) {
                    current += (current ? ' ' : '') + word;
                }
                else {
                    if (current)
                        result.push(current);
                    current = word;
                }
            }
            if (current)
                result.push(current);
        }
    }
    return result;
}
export class DualPane {
    static state = {
        title: 'Sesión de trabajo',
        sessionId: 'nueva',
        workdir: process.cwd(),
        branch: '',
        leaderName: 'DeepSeek Chat (V3 / R1)',
        leaderStatus: 'Inactivo',
        workers: [
            { id: 'claude', name: 'Claude', status: 'idle' },
            { id: 'chatgpt', name: 'ChatGPT', status: 'idle' },
            { id: 'gemini', name: 'Gemini', status: 'idle' },
            { id: 'qwen', name: 'Qwen', status: 'idle' },
        ],
        autonomous: false,
        planOnly: false,
        todos: [],
        metrics: {
            turns: 0,
            actions: 0,
            filesRead: 0,
            filesWritten: 0,
            durationSec: 0,
        },
    };
    static updateState(partial) {
        this.state = {
            ...this.state,
            ...partial,
            metrics: {
                ...this.state.metrics,
                ...(partial.metrics || {}),
            },
        };
    }
    static setTodos(todos) {
        this.state.todos = todos;
    }
    static setLeaderStatus(status) {
        this.state.leaderStatus = status;
    }
    static setWorkers(workerIds) {
        this.state.workers = workerIds.map((id) => {
            const meta = DriverFactory.getMeta(id);
            return {
                id: id.toLowerCase(),
                name: meta?.name || id.toUpperCase(),
                status: 'idle',
            };
        });
    }
    static incrementAction(type) {
        this.state.metrics.actions++;
        if (type === 'read_file')
            this.state.metrics.filesRead++;
        if (type === 'write_file')
            this.state.metrics.filesWritten++;
    }
    static incrementTurn() {
        this.state.metrics.turns++;
    }
    /**
     * Genera el bloque del Banner Superior Izquierdo (ASCII + Subtítulo + Hints)
     */
    static buildLeftHeaderLines(maxWidth = 54) {
        const lines = [];
        lines.push(pc.cyan('      ____             __          __   '));
        lines.push(pc.cyan('     / __ )____ ______/ /_  ___   / /   '));
        lines.push(pc.cyan('    / __  / __ `/ ___/ __ \\/ _ \\ / /    '));
        lines.push(pc.cyan('   / /_/ / /_/ / /  / / / /  __// /     '));
        lines.push(pc.cyan('  /_____/\\__,_/_/  /_/ /_/\\___//_/      '));
        lines.push(pc.bold(pc.white('  Autonomous Multi-Model Coding Agent   ')));
        lines.push(pc.gray('  ' + '─'.repeat(Math.min(maxWidth - 4, 46))));
        lines.push(`  ${pc.dim('Type')} ${pc.cyan('/')} ${pc.dim('for palette')} ${pc.dim('•')} ${pc.cyan('/workers')} ${pc.dim('•')} ${pc.cyan('/help')}`);
        lines.push(pc.gray('  ' + '─'.repeat(Math.min(maxWidth - 4, 46))));
        lines.push('');
        return lines;
    }
    /**
     * Genera las 3 Cajas del Panel Lateral Derecho
     * Caja 1: Metadatos de Sesión y Workspace
     * Caja 2: Estado de Subagentes (Workers) en vivo
     * Caja 3: Lista de Tareas (TODO List)
     */
    static buildRightSidebarLines(boxWidth = 48) {
        const lines = [];
        const dirBase = path.basename(this.state.workdir) || this.state.workdir;
        const branchStr = this.state.branch || getGitBranch(this.state.workdir);
        const branchTag = branchStr ? `:${branchStr}` : '';
        const idBadge = `#${this.state.sessionId.slice(0, 8)}`;
        const modeBadge = this.state.autonomous ? pc.green('autonomous') : pc.yellow('safe');
        const version = getBarhelVersion();
        const g = pc.dim;
        const w = pc.white;
        const cy = pc.cyan;
        const gr = pc.gray;
        const topBorder = (title) => gr(`┌─ ${pc.bold(title)} ${'─'.repeat(Math.max(2, boxWidth - visualLength(title) - 5))}┐`);
        const bottomBorder = () => gr(`└${'─'.repeat(boxWidth - 1)}┘`);
        const lineWrapper = (content) => `${gr('│')} ${padRightVisual(content, boxWidth - 4)} ${gr('│')}`;
        // ── CAJA 1: SESIÓN & METADATOS ──────────────────────────────────────────────
        lines.push(topBorder('SESIÓN & METADATOS'));
        lines.push(lineWrapper(`${g('Session   :')} ${w(this.state.title.slice(0, 18))} ${g(`(${idBadge})`)}`));
        lines.push(lineWrapper(`${g('Workspace :')} ${w(dirBase)} ${g(`(${this.state.workdir.slice(0, 14)}${branchTag})`)}`));
        lines.push(lineWrapper(`${g('Leader    :')} ${cy(this.state.leaderName.slice(0, 20))} ${g(`(${this.state.leaderStatus})`)}`));
        const workerNames = this.state.workers.length > 0
            ? this.state.workers.map((wrk) => wrk.id).join(', ')
            : 'ninguno';
        lines.push(lineWrapper(`${g('Workers   :')} ${pc.yellow(workerNames)}`));
        lines.push(lineWrapper(`${g('Mode      :')} ${modeBadge} ${g('(/auto to toggle)')}`));
        lines.push(lineWrapper(`${g('Version   :')} ${w(`Barhel ${version}`)}`));
        lines.push(bottomBorder());
        // ── CAJA 2: ESTADO DE SUBAGENTES (WORKERS) ──────────────────────────────────
        const supervisorSnapshot = ProgressSupervisor.getSnapshot();
        lines.push(topBorder('ESTADO DE SUBAGENTES'));
        if (this.state.workers.length === 0) {
            lines.push(lineWrapper(g('  Sin workers secundarios configurados')));
        }
        else {
            for (const wrk of this.state.workers) {
                const agInfo = supervisorSnapshot.agents[wrk.id.toLowerCase()];
                let icon = pc.dim('[●]');
                let statusText = pc.dim('En espera (Listo)');
                if (agInfo) {
                    if (agInfo.status === 'thinking' || agInfo.status === 'executing') {
                        icon = pc.yellow('[⚡]');
                        statusText = pc.cyan(`Trabajando (${agInfo.percentage}%)`);
                    }
                    else if (agInfo.status === 'completed') {
                        icon = pc.green('[✓]');
                        statusText = pc.green('Completado');
                    }
                    else if (agInfo.status === 'failed') {
                        icon = pc.red('[✖]');
                        statusText = pc.red('No disponible');
                    }
                }
                const nameLabel = w(wrk.name.slice(0, 14).padEnd(14));
                lines.push(lineWrapper(` ${icon} ${nameLabel} : ${statusText}`));
            }
        }
        lines.push(bottomBorder());
        // ── CAJA 3: PLAN DE TAREAS (TODO LIST) ──────────────────────────────────────
        lines.push(topBorder('PLAN DE TAREAS (TODOS)'));
        const todos = this.state.todos;
        if (todos.length === 0) {
            lines.push(lineWrapper(g('  (Sin plan de tareas activo)')));
        }
        else {
            const completedCount = todos.filter((t) => (t.status || '').toLowerCase() === 'completed' || (t.status || '').toLowerCase() === 'done').length;
            const pct = Math.round((completedCount / todos.length) * 100);
            const barLen = 10;
            const filled = Math.round((pct / 100) * barLen);
            const empty = barLen - filled;
            const progressBar = `[${pc.green('█'.repeat(filled))}${pc.dim('░'.repeat(empty))}] ${pct}% (${completedCount}/${todos.length})`;
            lines.push(lineWrapper(` ${progressBar}`));
            // Mostrar subtareas más relevantes
            const previewTodos = todos.slice(0, 6);
            previewTodos.forEach((item, idx) => {
                let statusIcon = pc.dim('[ ]');
                const st = (item.status || 'pending').toLowerCase();
                if (st === 'completed' || st === 'done') {
                    statusIcon = pc.green('[✓]');
                }
                else if (st === 'in_progress' || st === 'running') {
                    statusIcon = pc.yellow('[▶]');
                }
                else if (st === 'failed') {
                    statusIcon = pc.red('[✖]');
                }
                const agentTag = item.assignedTo ? g(` [${item.assignedTo.toUpperCase()}]`) : '';
                const taskName = w(item.task.slice(0, 22));
                lines.push(lineWrapper(` ${statusIcon} ${idx + 1}. ${taskName}${agentTag}`));
            });
            if (todos.length > 6) {
                lines.push(lineWrapper(g(`    ... (+${todos.length - 6} tareas más)`)));
            }
        }
        lines.push(bottomBorder());
        return lines;
    }
    /**
     * Construye las líneas formateadas de los turnos previos de la sesión para el panel izquierdo
     */
    static buildChatHistoryLines(session, maxChatWidth = 56) {
        const lines = [];
        if (!session.turns || session.turns.length === 0)
            return lines;
        const workdir = session.workdir || process.cwd();
        const cleanPath = (rawPath) => {
            if (!rawPath)
                return '';
            try {
                const normRaw = rawPath.replace(/\\/g, '/');
                const normWd = workdir.replace(/\\/g, '/');
                if (normRaw.toLowerCase().startsWith(normWd.toLowerCase())) {
                    return normRaw.slice(normWd.length).replace(/^\/+/, '') || '.';
                }
                return path.relative(workdir, rawPath).replace(/\\/g, '/') || rawPath;
            }
            catch {
                return rawPath;
            }
        };
        session.turns.forEach((turn, idx) => {
            const time = turn.timestamp ? turn.timestamp.substring(11, 16) : '';
            const turnHeader = `Turno ${idx + 1}${time ? ` (${time})` : ''}`;
            const headerBorder = pc.blue('┌─ ') + pc.bold(pc.white(turnHeader)) + pc.blue(' ' + '─'.repeat(Math.max(4, maxChatWidth - turnHeader.length - 6)));
            lines.push(headerBorder);
            // Prompt usuario
            lines.push(`${pc.blue('│')} ${pc.bold(pc.cyan('👤 user ❯'))} ${pc.white(pc.bold(turn.prompt.slice(0, maxChatWidth - 14)))}`);
            // Razonamiento
            if (turn.thought && turn.thought.trim()) {
                lines.push(`${pc.blue('│')}  ${pc.yellow('💭 Razonamiento:')}`);
                const thoughtLines = turn.thought.trim().split('\n').filter(Boolean).slice(0, 3);
                for (const tl of thoughtLines) {
                    lines.push(`${pc.blue('│')}    ${pc.dim(tl.slice(0, maxChatWidth - 8))}`);
                }
            }
            // Acciones
            if (turn.actions && turn.actions.length > 0) {
                lines.push(`${pc.blue('│')}  ${pc.magenta('⚡ Acciones:')}`);
                for (const act of turn.actions) {
                    if (act.type === 'read_file') {
                        lines.push(`${pc.blue('│')}    ${pc.dim('• Read')} ${pc.cyan(cleanPath(String(act.details?.path || '')).slice(0, maxChatWidth - 12))}`);
                    }
                    else if (act.type === 'write_file') {
                        lines.push(`${pc.blue('│')}    ${pc.green('• Write')} ${pc.white(cleanPath(String(act.details?.path || '')).slice(0, maxChatWidth - 13))}`);
                    }
                    else if (act.type === 'run_command') {
                        lines.push(`${pc.blue('│')}    ${pc.white('• $')} ${pc.white(String(act.details?.command || '').slice(0, maxChatWidth - 10))}`);
                    }
                    else if (act.type === 'delegate_task') {
                        lines.push(`${pc.blue('│')}    ${pc.magenta('•')} ${pc.magenta(`Delegó a ${String(act.details?.agent || '').toUpperCase()}`)}`);
                    }
                    else if (act.type !== 'finish') {
                        lines.push(`${pc.blue('│')}    ${pc.dim('•')} ${pc.white(act.type)}`);
                    }
                }
            }
            // Resumen
            if (turn.summary && turn.summary.trim()) {
                const sumLine = turn.summary.trim().split('\n')[0];
                lines.push(`${pc.blue('│')}  ${pc.green('✓ Resumen:')} ${pc.white(sumLine.slice(0, maxChatWidth - 16))}`);
            }
            lines.push(pc.blue('└' + '─'.repeat(maxChatWidth - 1)));
            lines.push('');
        });
        return lines;
    }
    /**
     * Renderiza la pantalla completa en Split-Screen permanente (Header + Chat a la izquierda, 3 Cajas a la derecha)
     */
    static renderFullScreen(session) {
        console.clear();
        const totalCols = process.stdout.columns || 120;
        const rightBoxWidth = 48;
        const leftWidth = Math.max(48, totalCols - rightBoxWidth - 5);
        const sep = pc.gray('│');
        // 1. Líneas del lado izquierdo: Header fijo + Historial de chat
        const leftHeaderLines = this.buildLeftHeaderLines(leftWidth);
        const leftChatLines = session ? this.buildChatHistoryLines(session, leftWidth) : [];
        const allLeftLines = [...leftHeaderLines, ...leftChatLines];
        // 2. Líneas del lado derecho: 3 Cajas fijas
        const rightLines = this.buildRightSidebarLines(rightBoxWidth);
        // 3. Renderizar fila a fila balanceando ambas columnas
        const maxRows = Math.max(allLeftLines.length, rightLines.length);
        for (let r = 0; r < maxRows; r++) {
            const leftRaw = allLeftLines[r] || '';
            const rightRaw = rightLines[r] || '';
            const leftPadded = padRightVisual(leftRaw, leftWidth);
            console.log(`  ${leftPadded}  ${sep}  ${rightRaw}`);
        }
        console.log();
    }
    /**
     * Renderiza el marco inicial de pantalla dividida
     */
    static renderSplitFrame(leftCustomLines) {
        const totalCols = process.stdout.columns || 120;
        const rightBoxWidth = 48;
        const leftWidth = Math.max(48, totalCols - rightBoxWidth - 5);
        const sep = pc.gray('│');
        const leftLines = leftCustomLines || this.buildLeftHeaderLines(leftWidth);
        const rightLines = this.buildRightSidebarLines(rightBoxWidth);
        const maxRows = Math.max(leftLines.length, rightLines.length);
        console.log();
        for (let r = 0; r < maxRows; r++) {
            const leftRaw = leftLines[r] || '';
            const rightRaw = rightLines[r] || '';
            const leftPadded = padRightVisual(leftRaw, leftWidth);
            console.log(`  ${leftPadded}  ${sep}  ${rightRaw}`);
        }
        console.log();
    }
}
//# sourceMappingURL=DualPane.js.map