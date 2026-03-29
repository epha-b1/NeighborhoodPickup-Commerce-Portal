import crypto from 'crypto';
import { env } from '../config/env';

const ENCRYPTION_PREFIX = 'enc:v1';

const deriveKey = (): Buffer => {
  const raw = env.dataEncryptionKey.trim();
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, 'hex');
  }

  return crypto.createHash('sha256').update(raw).digest();
};

const key = deriveKey();

export const encryptAtRest = (plainText: string): string => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${ENCRYPTION_PREFIX}:${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
};

export const decryptAtRest = (value: string): string => {
  if (!value.startsWith(`${ENCRYPTION_PREFIX}:`)) {
    return value;
  }

  const parts = value.split(':');
  const ivBase64 = parts[2];
  const authTagBase64 = parts[3];
  const encryptedBase64 = parts.slice(4).join(':');
  if (!ivBase64 || !authTagBase64 || !encryptedBase64) {
    throw new Error('Malformed encrypted value.');
  }

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivBase64, 'base64'));
  decipher.setAuthTag(Buffer.from(authTagBase64, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedBase64, 'base64')),
    decipher.final()
  ]);

  return decrypted.toString('utf8');
};
