import { isPasswordPolicyValid, passwordPolicyMessage } from '../../src/auth/passwordPolicy';

describe('password policy', () => {
  it('accepts complex passwords with at least 12 chars', () => {
    expect(isPasswordPolicyValid('Complex#Pass123')).toBe(true);
  });

  it('rejects short passwords', () => {
    expect(isPasswordPolicyValid('Ab1#short')).toBe(false);
  });

  it('rejects passwords missing complexity rules', () => {
    expect(isPasswordPolicyValid('alllowercase123!')).toBe(false);
    expect(isPasswordPolicyValid('ALLUPPERCASE123!')).toBe(false);
    expect(isPasswordPolicyValid('NoSpecialChars12')).toBe(false);
    expect(isPasswordPolicyValid('NoNumbers!!!!AA')).toBe(false);
  });

  it('returns a non-empty policy message', () => {
    expect(passwordPolicyMessage.length).toBeGreaterThan(10);
  });
});