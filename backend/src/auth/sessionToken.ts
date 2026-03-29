import crypto from 'crypto';

export const hashToken = (token: string, secret: string): string => {
  return crypto.createHash('sha256').update(`${token}:${secret}`).digest('hex');
};

export const generateSessionToken = (): string => {
  return crypto.randomBytes(48).toString('hex');
};