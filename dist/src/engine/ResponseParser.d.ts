import { AgentResponse } from '../types/actions.js';
export interface ParseResult {
    success: boolean;
    data?: AgentResponse;
    raw: string;
    error?: string;
    correctionPrompt?: string;
}
export declare class ResponseParser {
    private static readonly VALID_ACTIONS;
    /**
     * Extrae y valida la respuesta del agente con alta tolerancia a fallos
     */
    static parse(rawText: string): ParseResult;
    /**
     * Sanitiza barras invertidas no escapadas (comunes en rutas de Windows como C:\laragon\...).
     * El lookbehind negativo evita tocar escapes JSON ya válidos (\\, \n, \t, \uXXXX, ...).
     */
    private static sanitizeJsonString;
    /**
     * Valida la estructura requerida del protocolo ReAct
     */
    private static validateSchema;
    /**
     * Intenta reparar problemas comunes de formato JSON generados por LLMs
     */
    private static tryRepairJson;
    /**
     * Genera el prompt de autocorrección que se inyecta de vuelta al modelo si falla
     */
    static generateCorrectionPrompt(errorMessage: string): string;
}
