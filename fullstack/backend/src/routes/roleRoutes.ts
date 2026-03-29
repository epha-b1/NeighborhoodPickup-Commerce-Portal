import { Router } from 'express';
import { requireAuth, requireRoles } from '../middleware/rbac';

export const roleRouter = Router();

roleRouter.get('/member', requireAuth, requireRoles('MEMBER'), (_req, res) => {
  res.json({ message: 'Member area' });
});

roleRouter.get(
  '/group-leader',
  requireAuth,
  requireRoles('GROUP_LEADER'),
  (_req, res) => {
    res.json({ message: 'Group leader area' });
  }
);

roleRouter.get('/reviewer', requireAuth, requireRoles('REVIEWER'), (_req, res) => {
  res.json({ message: 'Reviewer area' });
});

roleRouter.get(
  '/finance-clerk',
  requireAuth,
  requireRoles('FINANCE_CLERK'),
  (_req, res) => {
    res.json({ message: 'Finance clerk area' });
  }
);

roleRouter.get(
  '/administrator',
  requireAuth,
  requireRoles('ADMINISTRATOR'),
  (_req, res) => {
    res.json({ message: 'Administrator area' });
  }
);