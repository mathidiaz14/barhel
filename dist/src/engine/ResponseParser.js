export class ResponseParser {
    static VALID_ACTIONS = [
        'read_file',
        'write_file',
        'run_command',
        'list_directory',
        'grep',
        'glob',
        'check',
        'codegraph',
        'use_skill',
        'delegate_task',
        'delegate_batch',
        'finish',
    ];
    /**
     * Extrae y valida la respuesta del agente con alta tolerancia a fallos
     */
    static parse(rawText) {
        if (!rawText || rawText.trim().length === 0) {
            return {
                success: false,
                raw: rawText,
                error: 'Respuesta vacía recibida del modelo.',
                correctionPrompt: this.generateCorrectionPrompt('Respuesta vacía. Debes responder con un objeto JSON válido.'),
            };
        }
        // 1. Intentar extraer JSON de bloques de código markdown ```json ... ```
        const jsonBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/i;
        const match = rawText.match(jsonBlockRegex);
        let candidateJson = match ? match[1].trim() : '';
        // 2. Si no hay bloque markdown, buscar el primer '{' y el último '}'
        if (!candidateJson) {
            const firstBrace = rawText.indexOf('{');
            const lastBrace = rawText.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
                candidateJson = rawText.substring(firstBrace, lastBrace + 1).trim();
            }
            else {
                candidateJson = rawText.trim();
            }
        }
        // 3. Limpiar caracteres invisibles o artefactos comunes
        candidateJson = candidateJson.replace(/^\uFEFF/, '').trim();
        // 4. Intentar parsear aplicando primero sanitización de caracteres de escape
        try {
            const sanitized = this.sanitizeJsonString(candidateJson);
            const parsed = JSON.parse(sanitized);
            const validationError = this.validateSchema(parsed);
            if (validationError) {
                return {
                    success: false,
                    raw: rawText,
                    error: `Esquema JSON no válido: ${validationError}`,
                    correctionPrompt: this.generateCorrectionPrompt(validationError),
                };
            }
            return {
                success: true,
                data: parsed,
                raw: rawText,
            };
        }
        catch (parseErr) {
            // 5. Intentar heurísticas avanzadas de reparación para errores JSON
            const repaired = this.tryRepairJson(candidateJson);
            if (repaired) {
                const validationError = this.validateSchema(repaired);
                if (!validationError) {
                    return {
                        success: true,
                        data: repaired,
                        raw: rawText,
                    };
                }
            }
            const errMsg = parseErr instanceof Error ? parseErr.message : String(parseErr);
            return {
                success: false,
                raw: rawText,
                error: `Error de sintaxis JSON: ${errMsg}`,
                correctionPrompt: this.generateCorrectionPrompt(`Tu respuesta anterior no era un JSON válido (${errMsg}). Asegúrate de escapar las comillas y barras invertidas correctamente.`),
            };
        }
    }
    /**
     * Sanitiza barras invertidas no escapadas (comunes en rutas de Windows como C:\laragon\...).
     * El lookbehind negativo evita tocar escapes JSON ya válidos (\\, \n, \t, \uXXXX, ...).
     */
    static sanitizeJsonString(jsonStr) {
        return jsonStr.replace(/(?<!\\)\\(?!["\\/bfnrt]|u[0-9a-fA-F]{4})/g, '\\\\');
    }
    /**
     * Valida la estructura requerida del protocolo ReAct
     */
    static validateSchema(obj) {
        if (!obj || typeof obj !== 'object') {
            return 'La respuesta raíz debe ser un objeto JSON.';
        }
        const res = obj;
        if (typeof res.thought !== 'string' || res.thought.trim().length === 0) {
            return 'El campo "thought" es obligatorio y debe ser un string con tu razonamiento.';
        }
        if (Array.isArray(res.todos)) {
            res.todos = res.todos.map((item) => {
                if (typeof item === 'object' && item !== null) {
                    const t = item;
                    const rawStatus = String(t.status || 'pending').toLowerCase().trim();
                    let normStatus = 'pending';
                    if (rawStatus === 'completed' || rawStatus === 'done' || rawStatus === 'finished') {
                        normStatus = 'completed';
                    }
                    else if (rawStatus === 'in_progress' || rawStatus === 'active' || rawStatus === 'running') {
                        normStatus = 'in_progress';
                    }
                    else if (rawStatus === 'failed' || rawStatus === 'error') {
                        normStatus = 'failed';
                    }
                    return {
                        task: String(t.task || t.title || t.description || 'Tarea'),
                        status: normStatus,
                        assignedTo: t.assignedTo ? String(t.assignedTo) : undefined,
                    };
                }
                return {
                    task: String(item),
                    status: 'pending',
                };
            });
        }
        if (!res.action || typeof res.action !== 'object') {
            return 'El campo "action" es obligatorio y debe ser un objeto.';
        }
        const action = res.action;
        if (!action.type || typeof action.type !== 'string') {
            return 'El campo "action.type" es obligatorio.';
        }
        if (!this.VALID_ACTIONS.includes(action.type)) {
            return `Tipo de acción "${action.type}" no reconocido. Valores permitidos: ${this.VALID_ACTIONS.join(', ')}`;
        }
        // Validar campos requeridos según la acción
        switch (action.type) {
            case 'read_file':
                if (!action.path || typeof action.path !== 'string') {
                    return 'Para "read_file", el campo "action.path" es obligatorio.';
                }
                break;
            case 'write_file':
                if (!action.path || typeof action.path !== 'string') {
                    return 'Para "write_file", el campo "action.path" es obligatorio.';
                }
                if (action.content === undefined || typeof action.content !== 'string') {
                    return 'Para "write_file", el campo "action.content" es obligatorio.';
                }
                break;
            case 'run_command':
                if (!action.command || typeof action.command !== 'string') {
                    return 'Para "run_command", el campo "action.command" es obligatorio.';
                }
                break;
            case 'list_directory':
                if (action.path !== undefined && typeof action.path !== 'string') {
                    return 'Para "list_directory", el campo "action.path" debe ser un string.';
                }
                break;
            case 'grep':
                if (!action.pattern || typeof action.pattern !== 'string') {
                    return 'Para "grep", el campo "action.pattern" es obligatorio.';
                }
                if (action.path !== undefined && typeof action.path !== 'string') {
                    return 'Para "grep", el campo "action.path" debe ser un string.';
                }
                break;
            case 'glob':
                if (!action.pattern || typeof action.pattern !== 'string') {
                    return 'Para "glob", el campo "action.pattern" es obligatorio.';
                }
                if (action.path !== undefined && typeof action.path !== 'string') {
                    return 'Para "glob", el campo "action.path" debe ser un string.';
                }
                break;
            case 'check':
                break;
            case 'delegate_task':
                if (!action.agent || typeof action.agent !== 'string') {
                    return 'Para "delegate_task", "action.agent" es obligatorio.';
                }
                if (!action.prompt || typeof action.prompt !== 'string') {
                    return 'Para "delegate_task", el campo "action.prompt" es obligatorio.';
                }
                break;
            case 'delegate_batch':
                if (!Array.isArray(action.tasks) || action.tasks.length === 0) {
                    return 'Para "delegate_batch", el campo "action.tasks" es obligatorio y debe contener al menos una tarea.';
                }
                for (const task of action.tasks) {
                    if (!task || typeof task !== 'object') {
                        return 'Cada tarea de "delegate_batch" debe ser un objeto.';
                    }
                    if (!task.agent || typeof task.agent !== 'string') {
                        return 'Cada tarea de "delegate_batch" debe incluir "agent".';
                    }
                    if (!task.prompt || typeof task.prompt !== 'string') {
                        return 'Cada tarea de "delegate_batch" debe incluir "prompt".';
                    }
                }
                break;
            case 'finish':
                if (!action.summary || typeof action.summary !== 'string') {
                    return 'Para "finish", el campo "action.summary" es obligatorio.';
                }
                break;
        }
        return null;
    }
    /**
     * Intenta reparar problemas comunes de formato JSON generados por LLMs
     */
    static tryRepairJson(jsonStr) {
        try {
            // 1. Arreglar barras invertidas ilegales (Windows paths) sin tocar escapes válidos
            let cleaned = this.sanitizeJsonString(jsonStr);
            // 2. Eliminar comas finales en arrays u objetos
            cleaned = cleaned.replace(/,\s*([\]}])/g, '$1');
            return JSON.parse(cleaned);
        }
        catch {
            return null;
        }
    }
    /**
     * Genera el prompt de autocorrección que se inyecta de vuelta al modelo si falla
     */
    static generateCorrectionPrompt(errorMessage) {
        return `[ERROR DE PROTOCOLO JSON]: ${errorMessage}
Debes responder ESTRICTAMENTE con un bloque JSON parseable con esta estructura:
\`\`\`json
{
  "thought": "Tu análisis y justificación aquí...",
  "action": {
    "type": "read_file" | "write_file" | "run_command" | "list_directory" | "grep" | "glob" | "check" | "delegate_task" | "delegate_batch" | "finish",
    "path": "ruta/al/archivo",
    "content": "contenido a escribir",
    "command": "comando terminal",
    "pattern": "patrón regex o glob",
    "agent": "chatgpt | gemini | claude | qwen",
    "prompt": "instrucción para el worker",
    "tasks": [
      { "agent": "chatgpt", "prompt": "instrucción para un worker, se ejecutan en paralelo" },
      { "agent": "gemini", "prompt": "instrucción para otro worker" }
    ],
    "summary": "resumen del trabajo"
  }
}
\`\`\``;
    }
    /**
     * Extrae un preview en vivo de lo que el modelo está pensando o planeando hacer mientras transmite
     */
    static extractStreamingPreview(accumulatedText) {
        if (!accumulatedText)
            return null;
        // 1. Detectar acciones concretas inminentes o en progreso
        if (accumulatedText.includes('"write_file"')) {
            const pathMatch = accumulatedText.match(/"path"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)/i);
            if (pathMatch && pathMatch[1]) {
                return `Escribiendo archivo: ${pathMatch[1].replace(/\\\\/g, '/')}`;
            }
            return 'Preparando escritura de archivo...';
        }
        if (accumulatedText.includes('"run_command"')) {
            const cmdMatch = accumulatedText.match(/"command"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)/i);
            if (cmdMatch && cmdMatch[1]) {
                const cmd = cmdMatch[1].replace(/\\"/g, '"');
                return `Ejecutando en terminal: ${cmd.length > 40 ? cmd.slice(0, 37) + '...' : cmd}`;
            }
            return 'Preparando comando de terminal...';
        }
        if (accumulatedText.includes('"read_file"')) {
            const pathMatch = accumulatedText.match(/"path"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)/i);
            if (pathMatch && pathMatch[1]) {
                return `Leyendo archivo: ${pathMatch[1].replace(/\\\\/g, '/')}`;
            }
            return 'Leyendo archivo de código...';
        }
        if (accumulatedText.includes('"codegraph"')) {
            const symMatch = accumulatedText.match(/"symbol"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)/i);
            if (symMatch && symMatch[1]) {
                return `Consultando CodeGraph para: ${symMatch[1]}`;
            }
            return 'Consultando mapa CodeGraph AST...';
        }
        if (accumulatedText.includes('"delegate_batch"') || accumulatedText.includes('"delegate_task"')) {
            const agentMatch = accumulatedText.match(/"agent"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)/i);
            if (agentMatch && agentMatch[1]) {
                return `Delegando subtarea a: ${agentMatch[1].toUpperCase()}`;
            }
            return 'Delegando tareas a subagentes...';
        }
        if (accumulatedText.includes('"grep"') || accumulatedText.includes('"glob"')) {
            const patMatch = accumulatedText.match(/"pattern"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)/i);
            if (patMatch && patMatch[1]) {
                return `Buscando coincidencias: "${patMatch[1]}"`;
            }
            return 'Buscando en el repositorio...';
        }
        if (accumulatedText.includes('"check"')) {
            return 'Ejecutando verificación de tipos y compilación...';
        }
        if (accumulatedText.includes('"finish"')) {
            return 'Concluyendo tarea y resumiendo cambios...';
        }
        // 2. Buscar bloques de pensamiento <think> (DeepSeek R1 / Qwen)
        const thinkMatch = accumulatedText.match(/<think>([\s\S]*?)(?:<\/think>|$)/i);
        if (thinkMatch && thinkMatch[1]) {
            const thinkLines = thinkMatch[1].trim().split('\n').map((l) => l.trim()).filter(Boolean);
            if (thinkLines.length > 0) {
                const lastLine = thinkLines[thinkLines.length - 1];
                if (lastLine.length > 3) {
                    return lastLine.length > 70 ? lastLine.slice(0, 67) + '...' : lastLine;
                }
            }
        }
        // 3. Buscar campo "thought": "..." parcial
        const thoughtMatch = accumulatedText.match(/"thought"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)/i);
        if (thoughtMatch && thoughtMatch[1]) {
            const clean = thoughtMatch[1].replace(/\\n/g, ' ').replace(/\\"/g, '"').trim();
            if (clean.length > 3) {
                return clean.length > 70 ? clean.slice(0, 67) + '...' : clean;
            }
        }
        // 4. Buscar campo "summary": "..."
        const summaryMatch = accumulatedText.match(/"summary"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)/i);
        if (summaryMatch && summaryMatch[1]) {
            const clean = summaryMatch[1].replace(/\\n/g, ' ').replace(/\\"/g, '"').trim();
            if (clean.length > 3) {
                return clean.length > 70 ? clean.slice(0, 67) + '...' : clean;
            }
        }
        return null;
    }
}
//# sourceMappingURL=ResponseParser.js.map