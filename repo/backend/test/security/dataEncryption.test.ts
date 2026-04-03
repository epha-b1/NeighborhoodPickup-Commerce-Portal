import { decryptAtRest, encryptAtRest } from '../../src/security/dataEncryption';

describe('data encryption', () => {
  it('round-trips encrypted values', () => {
    const source = 'member reference details';
    const encrypted = encryptAtRest(source);

    expect(encrypted).not.toEqual(source);
    expect(encrypted.startsWith('enc:v1:')).toBe(true);
    expect(decryptAtRest(encrypted)).toBe(source);
  });

  it('passes through plaintext values for backward compatibility', () => {
    const plaintext = 'legacy unencrypted text';
    expect(decryptAtRest(plaintext)).toBe(plaintext);
  });

  it('encrypts government ID last-4 fragments and produces a value longer than 4 chars', () => {
    const last4 = '6789';
    const encrypted = encryptAtRest(last4);

    expect(encrypted).not.toEqual(last4);
    expect(encrypted.startsWith('enc:v1:')).toBe(true);
    expect(encrypted.length).toBeGreaterThan(4);
    expect(decryptAtRest(encrypted)).toBe(last4);
  });

  it('produces different ciphertexts for the same plaintext (random IV)', () => {
    const plaintext = '1234';
    const a = encryptAtRest(plaintext);
    const b = encryptAtRest(plaintext);

    expect(a).not.toEqual(b);
    expect(decryptAtRest(a)).toBe(plaintext);
    expect(decryptAtRest(b)).toBe(plaintext);
  });
});
