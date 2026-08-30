import { Router } from 'express';
import {
  getStudentDashboard,
  getStaffDashboard,
  getAdminDashboard,
} from '../controllers/dashboard.controller';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/student', authorize(['STUDENT']), getStudentDashboard);
router.get('/staff', authorize(['STAFF']), getStaffDashboard);
router.get('/admin', authorize(['ADMIN']), getAdminDashboard);

export default router;
