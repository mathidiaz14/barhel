import { AgentResponse, ActionType } from '../types/actions.js';

export interface ParseResult {
  success: boolean;
  data?: AgentResponse;
  raw: string;
  error?: string;
  correctionPrompt?: string;
}

export class ResponseParser {
  private static readonly VALID_ACTIONS: ActionType[] = [
    'read_file',
    'write_file',
    'run_command',
    'list_directory',
    'delegate_task',
    'finish',
  ];

  /**
   * Extrae y valida la respuesta del agente con alta tolerancia a fallos
   */
  public static parse(rawText: string): ParseResult {
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
      } else {
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
        data: parsed as AgentResponse,
        raw: rawText,
      };
    } catch (parseErr) {
      // 5. Intentar heurísticas avanzadas de reparación para errores JSON
      const repaired = this.tryRepairJson(candidateJson);
      if (repaired) {
        const validationError = this.validateSchema(repaired);
        if (!validationError) {
          return {
            success: true,
            data: repaired as AgentResponse,
            raw: rawText,
          };
        }
      }

      const errMsg = parseErr instanceof Error ? parseErr.message : String(parseErr);
      return {
        success: false,
        raw: rawText,
        error: `Error de sintaxis JSON: ${errMsg}`,
        correctionPrompt: this.generateCorrectionPrompt(
          `Tu respuesta anterior no era un JSON válido (${errMsg}). Asegúrate de escapar las comillas y barras invertidas correctamente.`
        ),
      };
    }
  }

  /**
   * Sanitiza barras invertidas no escapadas (comunes en rutas de Windows como C:\laragon\...)
   */
  private static sanitizeJsonString(jsonStr: string): string {
    // Reemplazar barras invertidas que no formen escapes válidos de JSON
    return jsonStr.replace(/\\(?!["\\/bfnrt]|u[0-9a-fA-F]{4})/g, '\\\\');
  }

  /**
   * Valida la estructura requerida del protocolo ReAct
   */
  private static validateSchema(obj: unknown): string | null {
    if (!obj || typeof obj !== 'object') {
      return 'La respuesta raíz debe ser un objeto JSON.';
    }

    const res = obj as Record<string, unknown>;

    if (typeof res.thought !== 'string' || res.thought.trim().length === 0) {
      return 'El campo "thought" es obligatorio y debe ser un string con tu razonamiento.';
    }

    if (!res.action || typeof res.action !== 'object') {
      return 'El campo "action" es obligatorio y debe ser un objeto.';
    }

    const action = res.action as Record<string, unknown>;

    if (!action.type || typeof action.type !== 'string') {
      return 'El campo "action.type" es obligatorio.';
    }

    if (!this.VALID_ACTIONS.includes(action.type as ActionType)) {
      return `Tipo de acción "${action.type}" no reconocido. Valores permitidos: ${this.VALID_ACTIONS.join(', ')}`;
    }

    // Validar campos requeridos según la acción
    switch (action.type as ActionType) {
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
      case 'delegate_task':
        if (!action.agent || typeof action.agent !== 'string') {
          return 'Para "delegate_task", "action.agent" es obligatorio.';
        }
        if (!action.prompt || typeof action.prompt !== 'string') {
          return 'Para "delegate_task", el campo "action.prompt" es obligatorio.';
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
  private static tryRepairJson(jsonStr: string): unknown | null {
    try {
      // 1. Arreglar barras invertidas ilegales (Windows paths)
      let cleaned = jsonStr.replace(/\\(?!["\\/bfnrt]|u[0-9a-fA-F]{4})/g, '\\\\');

      // 2. Arreglar barras invertidas en nombres de carpeta como \barhel
      cleaned = cleaned.replace(/([a-zA-Z0-9_])\\([a-zA-Z0-9_])/g, '$1\\\\$2');

      // 3. Eliminar comas finales en arrays u objetos
      cleaned = cleaned.replace(/,\s*([\]}])/g, '$1');

      return JSON.parse(cleaned);
    } catch {
      return null;
    }
  }

  /**
   * Genera el prompt de autocorrección que se inyecta de vuelta al modelo si falla
   */
  public static generateCorrectionPrompt(errorMessage: string): string {
    return `[ERROR DE PROTOCOLO JSON]: ${errorMessage}
Debes responder ESTRICTAMENTE con un bloque JSON parseable con esta estructura:
\`\`\`json
{
  "thought": "Tu análisis y justificación aquí...",
  "action": {
    "type": "read_file" | "write_file" | "run_command" | "list_directory" | "delegate_task" | "finish",
    "path": "ruta/al/archivo",
    "content": "contenido a escribir",
    "command": "comando terminal",
    "agent": "chatgpt | gemini | claude | qwen",
    "prompt": "instrucción para el worker",
    "summary": "resumen del trabajo"
  }
}
\`\`\``;
  }
}
