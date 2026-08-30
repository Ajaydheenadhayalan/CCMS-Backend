import { Router } from 'express';
import {
  createComplaint,
  getMyComplaints,
  getComplaintDetails,
  assignComplaint,
  startComplaintProgress,
  resolveComplaint,
  closeComplaint,
  updateComplaintPriority,
  reviewComplaint,
} from '../controllers/complaint.controller';
import { getStaffComplaints, getAdminComplaints } from '../controllers/admin.controller';
import { authenticate, authorize } from '../middleware/auth';
import prisma from '../config/db';

const router = Router();

router.use(authenticate);

// Shared categories query for dropdowns
router.get('/categories/list', async (req, res, next) => {
  try {
    const list = await prisma.categories.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, name: true, description: true },
      orderBy: { name: 'asc' },
    });
    return res.status(200).json({ success: true, data: list });
  } catch (error) {
    next(error);
  }
});

// Student Specific
router.post('/', authorize(['STUDENT']), createComplaint);
router.get('/my', authorize(['STUDENT']), getMyComplaints);

// Staff Specific
router.get('/staff', authorize(['STAFF']), getStaffComplaints);

// Admin Specific
router.get('/admin', authorize(['ADMIN']), getAdminComplaints);
router.patch('/:id/assign', authorize(['ADMIN']), assignComplaint);
router.patch('/:id/priority', authorize(['ADMIN']), updateComplaintPriority);
router.patch('/:id/review', authorize(['ADMIN']), reviewComplaint);

// Shared Staff & Admin
router.patch('/:id/start', authorize(['STAFF', 'ADMIN']), startComplaintProgress);
router.patch('/:id/resolve', authorize(['STAFF', 'ADMIN']), resolveComplaint);

// Shared Student & Admin
router.patch('/:id/close', authorize(['STUDENT', 'ADMIN']), closeComplaint);

// Shared Read Access
router.get('/:id', getComplaintDetails);

export default router;
