import { Router } from 'express';
import { register, login, getMe, logout, forgotPassword, resetPassword } from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth';

import prisma from '../config/db';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/logout', logout);
router.get('/me', authenticate, getMe);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

// Public departments list for registration
router.get('/departments', async (req, res, next) => {
  try {
    const list = await prisma.departments.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    return res.status(200).json({ success: true, data: list });
  } catch (error) {
    next(error);
  }
});

export default router;
