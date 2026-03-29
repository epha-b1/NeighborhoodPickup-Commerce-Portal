import express from 'express';
import request from 'supertest';
import { requireAuth, requireRoles } from '../../src/middleware/rbac';

describe('RBAC middleware', () => {
  const buildApp = () => {
    const app = express();

    app.use((req, _res, next) => {
      const role = req.header('x-role');
      if (role) {
        req.auth = {
          userId: 1,
          username: 'test-user',
          roles: [role as any],
          tokenHash: 'test-hash'
        };
      }
      next();
    });

    app.get('/member-only', requireAuth, requireRoles('MEMBER'), (_req, res) => {
      res.json({ ok: true });
    });

    return app;
  };

  it('rejects anonymous user', async () => {
    const app = buildApp();
    const response = await request(app).get('/member-only');
    expect(response.status).toBe(401);
  });

  it('rejects user with wrong role', async () => {
    const app = buildApp();
    const response = await request(app).get('/member-only').set('x-role', 'REVIEWER');
    expect(response.status).toBe(403);
  });

  it('allows user with required role', async () => {
    const app = buildApp();
    const response = await request(app).get('/member-only').set('x-role', 'MEMBER');
    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
  });
});