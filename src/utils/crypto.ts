import crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

/**
 * Deriva una clave AES-256-GCM a partir de BARHEL_SECRET.
 * Devuelve null si la variable de entorno no está definida (sin cifrado).
 */
export function getCryptoKey(): Buffer | null {
  const secret = process.env.BARHEL_SECRET;
  if (!secret) return null;
  return crypto.createHash('sha256').update(secret, 'utf-8').digest();
}

export function isEncryptionEnabled(): boolean {
  return getCryptoKey() !== null;
}

/**
 * Cifra un objeto serializable a una cadena base64 con formato iv.tag.data.
 */
export function encryptObject(obj: unknown): string {
  const key = getCryptoKey();
  if (!key) {
    throw new Error('BARHEL_SECRET no está definido: no se puede cifrar.');
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const payload = JSON.stringify(obj);

  const encrypted = Buffer.concat([cipher.update(payload, 'utf-8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [iv.toString('base64'), tag.toString('base64'), encrypted.toString('base64')].join('.');
}

/**
 * Descifra una cadena producida por encryptObject.
 * Devuelve null si falta BARHEL_SECRET, el formato es inválido o la clave no coincide.
 */
export function decryptToObject<T = unknown>(data: string): T | null {
  const key = getCryptoKey();
  if (!key) return null;

  try {
    const parts = data.split('.');
    if (parts.length !== 3) return null;

    const [ivB64, tagB64, dataB64] = parts;
    const iv = Buffer.from(ivB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    const encrypted = Buffer.from(dataB64, 'base64');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return JSON.parse(decrypted.toString('utf-8')) as T;
  } catch {
    return null;
  }
}

/**
 * Comprueba si una cadena guardada parece cifrado (sin intentar descifrar).
 */
export function isEncryptedPayload(data: string): boolean {
  return /^[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+$/.test(data) && data.includes('.');
}