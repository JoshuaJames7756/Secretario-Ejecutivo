/**
 * Cifrado del respaldo con Web Crypto (disponible en Chrome de Android, sin dependencias).
 *
 * - Clave: PBKDF2-SHA256 a partir de la contraseña, con sal aleatoria por archivo.
 * - Cifrado: AES-256-GCM, que además detecta cualquier alteración del archivo.
 * - La contraseña nunca se guarda. Si se pierde, el respaldo NO se puede recuperar.
 */

export const PBKDF2_ITERATIONS = 600_000;

export interface KdfParams {
  name: 'PBKDF2-SHA256';
  iterations: number;
  salt: string; // base64
}

export class BackupPasswordError extends Error {
  constructor() {
    super('La contraseña es incorrecta o el archivo está dañado.');
    this.name = 'BackupPasswordError';
  }
}

export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function deriveKey(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function encrypt(
  plaintext: Uint8Array<ArrayBuffer>,
  password: string,
  aad: Uint8Array<ArrayBuffer>,
  iterations = PBKDF2_ITERATIONS,
): Promise<{ kdf: KdfParams; iv: string; data: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, iterations);
  const data = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad }, key, plaintext),
  );
  return {
    kdf: { name: 'PBKDF2-SHA256', iterations, salt: toBase64(salt) },
    iv: toBase64(iv),
    data: toBase64(data),
  };
}

export async function decrypt(
  parts: { kdf: KdfParams; iv: string; data: string },
  password: string,
  aad: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  try {
    const key = await deriveKey(password, fromBase64(parts.kdf.salt), parts.kdf.iterations);
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(parts.iv), additionalData: aad },
      key,
      fromBase64(parts.data),
    );
    return new Uint8Array(plain);
  } catch {
    // AES-GCM no distingue contraseña incorrecta de archivo alterado: es a propósito.
    throw new BackupPasswordError();
  }
}
