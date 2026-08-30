import { z } from 'zod';

export const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  student_id: z.string().min(3, 'Student ID must be at least 3 characters'),
  phone: z.string().optional(),
  department: z.string().min(2, 'Department name must be at least 2 characters'),
  year: z.number().int().min(1).max(5).optional(), // Assuming year is 1-5
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const createComplaintSchema = z.object({
  title: z.string().min(5, 'Title must be at least 5 characters').max(255),
  category_id: z.number().int('Category ID must be an integer'),
  description: z.string().min(10, 'Description must be at least 10 characters'),
  location: z.string().min(3, 'Location must be at least 3 characters'),
});

export const updateComplaintStatusSchema = z.object({
  status: z.enum(['SUBMITTED', 'UNDER_REVIEW', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']),
  reason: z.string().optional(),
});

export const assignComplaintSchema = z.object({
  department_id: z.number().int().nullable().optional(),
  assigned_staff_id: z.string().uuid().nullable().optional(),
});

export const resolveComplaintSchema = z.object({
  resolution_description: z.string().min(10, 'Resolution description must be at least 10 characters'),
});

export const closeComplaintSchema = z.object({
  accept: z.boolean(),
  reason: z.string().optional(), // required if accept is false
});

export const addCommentSchema = z.object({
  comment: z.string().min(1, 'Comment cannot be empty'),
});

export const submitFeedbackSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().optional().nullable(),
});

export const manageCategorySchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(255),
  description: z.string().optional().nullable(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});

export const manageDepartmentSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(255),
  description: z.string().optional().nullable(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});

export const createStaffSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  employee_id: z.string().min(3, 'Employee ID is required'),
  department_id: z.number().int('Department ID is required'),
  phone: z.string().optional().nullable(),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const editStaffSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  employee_id: z.string().min(3, 'Employee ID is required'),
  department_id: z.number().int('Department ID is required'),
  phone: z.string().optional().nullable(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});
