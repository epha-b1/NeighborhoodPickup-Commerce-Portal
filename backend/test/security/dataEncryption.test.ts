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
});
