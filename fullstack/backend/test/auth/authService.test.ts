import { AuthService } from '../../src/auth/authService';
import { hashPassword } from '../../src/auth/passwordHash';
import { InMemoryAuthStore } from '../helpers/inMemoryAuthStore';

describe('AuthService login and lockout', () => {
  it('logs in with valid credentials', async () => {
    const store = new InMemoryAuthStore();
    const passwordHash = await hashPassword('Member#Pass123');
    store.addUser({
      id: 1,
      username: 'member1',
      passwordHash,
      isActive: true,
      roles: ['MEMBER']
    });

    const service = new AuthService(store);
    const result = await service.login({
      username: 'member1',
      password: 'Member#Pass123'
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('Expected successful login');
    }
    expect(result.user.username).toBe('member1');
    expect(result.user.roles).toContain('MEMBER');
    expect(result.token.length).toBeGreaterThan(20);
  });

  it('fails with invalid credentials', async () => {
    const store = new InMemoryAuthStore();
    const passwordHash = await hashPassword('Member#Pass123');
    store.addUser({
      id: 1,
      username: 'member1',
      passwordHash,
      isActive: true,
      roles: ['MEMBER']
    });

    const service = new AuthService(store);
    const result = await service.login({
      username: 'member1',
      password: 'Wrong#Pass123'
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('Expected failed login');
    }
    expect(result.code).toBe('INVALID_CREDENTIALS');
  });

  it('locks account for 15 minutes after five failed attempts', async () => {
    const store = new InMemoryAuthStore();
    const passwordHash = await hashPassword('Member#Pass123');
    store.addUser({
      id: 1,
      username: 'member1',
      passwordHash,
      isActive: true,
      roles: ['MEMBER']
    });

    const service = new AuthService(store);

    for (let i = 0; i < 5; i += 1) {
      const attempt = await service.login({
        username: 'member1',
        password: 'Wrong#Pass123'
      });

      if (i < 4) {
        expect(attempt.ok).toBe(false);
        if (!attempt.ok) {
          expect(attempt.code).toBe('INVALID_CREDENTIALS');
        }
      } else {
        expect(attempt.ok).toBe(false);
        if (!attempt.ok) {
          expect(attempt.code).toBe('LOCKED');
          expect(attempt.lockedUntil).toBeDefined();
        }
      }
    }

    const blockedLogin = await service.login({
      username: 'member1',
      password: 'Member#Pass123'
    });

    expect(blockedLogin.ok).toBe(false);
    if (!blockedLogin.ok) {
      expect(blockedLogin.code).toBe('LOCKED');
    }
  });
});