export interface DoctorOptions {
    provider?: string;
    ping?: boolean;
    visible?: boolean;
}
/**
 * Ejecuta el diagnóstico exhaustivo de salud, autenticación y selectores de UI
 */
export declare function runDoctorDiagnostic(options?: DoctorOptions): Promise<boolean>;
