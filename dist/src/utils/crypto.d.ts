/**
 * Deriva una clave AES-256-GCM a partir de BARHEL_SECRET.
 * Devuelve null si la variable de entorno no está definida (sin cifrado).
 */
export declare function getCryptoKey(): Buffer | null;
export declare function isEncryptionEnabled(): boolean;
/**
 * Cifra un objeto serializable a una cadena base64 con formato iv.tag.data.
 */
export declare function encryptObject(obj: unknown): string;
/**
 * Descifra una cadena producida por encryptObject.
 * Devuelve null si falta BARHEL_SECRET, el formato es inválido o la clave no coincide.
 */
export declare function decryptToObject<T = unknown>(data: string): T | null;
/**
 * Comprueba si una cadena guardada parece cifrado (sin intentar descifrar).
 */
export declare function isEncryptedPayload(data: string): boolean;
