import { encryptAtRest, decryptAtRest } from '../../src/security/dataEncryption';

describe('leader PII encryption contract', () => {
  it('government_id_last4 is encrypted before storage and masked on retrieval', () => {
    const rawLast4 = '6789';

    // Simulate the write path (leaderRepository.createLeaderApplication)
    const storedValue = encryptAtRest(rawLast4);
    expect(storedValue).not.toEqual(rawLast4);
    expect(storedValue.startsWith('enc:v1:')).toBe(true);

    // Simulate the read path (leaderRepository.getLatestApplicationByUserId / listPendingApplications)
    const decrypted = decryptAtRest(storedValue);
    const maskedOutput = `****${decrypted}`;

    expect(decrypted).toBe(rawLast4);
    expect(maskedOutput).toBe('****6789');
    // The raw last4 should never appear in the stored value
    expect(storedValue).not.toContain(rawLast4);
  });

  it('null government_id_last4 passes through without encryption', () => {
    const rawLast4: string | null = null;
    // Simulate the write path: null is stored as null
    const storedValue = rawLast4 ? encryptAtRest(rawLast4) : null;
    expect(storedValue).toBeNull();

    // Simulate the read path: null maps to null
    const maskedOutput = storedValue ? `****${decryptAtRest(storedValue)}` : null;
    expect(maskedOutput).toBeNull();
  });

  it('encrypted value requires VARCHAR(512) or wider column (not VARCHAR(4))', () => {
    const last4 = '1234';
    const encrypted = encryptAtRest(last4);

    // AES-256-GCM enc:v1 format is significantly longer than 4 characters
    expect(encrypted.length).toBeGreaterThan(50);
    expect(encrypted.length).toBeLessThan(512);
  });
});
