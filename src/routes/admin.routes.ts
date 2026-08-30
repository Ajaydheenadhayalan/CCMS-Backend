import { Router } from 'express';
import {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  getDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  getStaffList,
  createStaff,
  updateStaff,
  deleteStaff,
  getUsers,
  updateUserStatus,
} from '../controllers/admin.controller';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

// Apply global admin check
router.use(authenticate, authorize(['ADMIN']));

// Categories
router.get('/categories', getCategories);
router.post('/categories', createCategory);
router.patch('/categories/:id', updateCategory);
router.delete('/categories/:id', deleteCategory);

// Departments
router.get('/departments', getDepartments);
router.post('/departments', createDepartment);
router.patch('/departments/:id', updateDepartment);
router.delete('/departments/:id', deleteDepartment);

// Staff
router.get('/staff', getStaffList);
router.post('/staff', createStaff);
router.patch('/staff/:id', updateStaff);
router.delete('/staff/:id', deleteStaff);

// Users (Students / General)
router.get('/users', getUsers);
router.patch('/users/:id/status', updateUserStatus);

export default router;
