import { Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../config/db';
import { AuthRequest } from '../middleware/auth';
import {
  manageCategorySchema,
  manageDepartmentSchema,
  createStaffSchema,
  editStaffSchema,
} from '../validators';

// Categories
export const getCategories = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const list = await prisma.categories.findMany({
      orderBy: { created_at: 'desc' },
    });
    return res.status(200).json({ success: true, data: list });
  } catch (error) {
    next(error);
  }
};

export const createCategory = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const parseResult = manageCategorySchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(422).json({ success: false, error: parseResult.error.flatten() });
    }

    const { name, description } = parseResult.data;

    // Check unique name
    const existing = await prisma.categories.findUnique({ where: { name } });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Category already exists' });
    }

    const category = await prisma.categories.create({
      data: { name, description: description || '', status: 'ACTIVE' },
    });

    return res.status(201).json({ success: true, data: category });
  } catch (error) {
    next(error);
  }
};

export const updateCategory = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id, 10);
    const parseResult = manageCategorySchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(422).json({ success: false, error: parseResult.error.flatten() });
    }

    const { name, description, status } = parseResult.data;

    const category = await prisma.categories.update({
      where: { id },
      data: {
        name,
        description: description || '',
        status: status || 'ACTIVE',
        updated_at: new Date(),
      },
    });

    return res.status(200).json({ success: true, data: category });
  } catch (error) {
    next(error);
  }
};

export const deleteCategory = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id, 10);

    // Soft delete / Deactivate
    await prisma.categories.update({
      where: { id },
      data: { status: 'INACTIVE', updated_at: new Date() },
    });

    return res.status(200).json({ success: true, message: 'Category deactivated successfully' });
  } catch (error) {
    next(error);
  }
};

// Departments
export const getDepartments = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const list = await prisma.departments.findMany({
      orderBy: { name: 'asc' },
      include: {
        users: {
          where: { role: 'STAFF', status: 'ACTIVE' },
          select: { id: true, name: true },
        },
      },
    });
    return res.status(200).json({ success: true, data: list });
  } catch (error) {
    next(error);
  }
};

export const createDepartment = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const parseResult = manageDepartmentSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(422).json({ success: false, error: parseResult.error.flatten() });
    }

    const { name, description } = parseResult.data;

    // Check unique name
    const existing = await prisma.departments.findUnique({ where: { name } });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Department already exists' });
    }

    const dept = await prisma.departments.create({
      data: { name, description: description || '', status: 'ACTIVE' },
    });

    return res.status(201).json({ success: true, data: dept });
  } catch (error) {
    next(error);
  }
};

export const updateDepartment = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id, 10);
    const parseResult = manageDepartmentSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(422).json({ success: false, error: parseResult.error.flatten() });
    }

    const { name, description, status } = parseResult.data;

    const dept = await prisma.departments.update({
      where: { id },
      data: {
        name,
        description: description || '',
        status: status || 'ACTIVE',
        updated_at: new Date(),
      },
    });

    return res.status(200).json({ success: true, data: dept });
  } catch (error) {
    next(error);
  }
};

export const deleteDepartment = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id, 10);

    // Deactivate
    await prisma.departments.update({
      where: { id },
      data: { status: 'INACTIVE', updated_at: new Date() },
    });

    return res.status(200).json({ success: true, message: 'Department deactivated successfully' });
  } catch (error) {
    next(error);
  }
};

// Staff Management
export const getStaffList = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const list = await prisma.users.findMany({
      where: { role: 'STAFF' },
      include: { departments: true },
      orderBy: { name: 'asc' },
    });
    return res.status(200).json({ success: true, data: list });
  } catch (error) {
    next(error);
  }
};

export const createStaff = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const parseResult = createStaffSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(422).json({ success: false, error: parseResult.error.flatten() });
    }

    const { name, email, employee_id, department_id, phone, password } = parseResult.data;

    const existingEmail = await prisma.users.findUnique({ where: { email } });
    if (existingEmail) {
      return res.status(409).json({ success: false, message: 'Email already exists' });
    }

    const existingEmpId = await prisma.users.findUnique({ where: { employee_id } });
    if (existingEmpId) {
      return res.status(409).json({ success: false, message: 'Employee ID already exists' });
    }

    const password_hash = await bcrypt.hash(password, 10);

    const staff = await prisma.users.create({
      data: {
        name,
        email,
        employee_id,
        department_id,
        phone,
        password_hash,
        role: 'STAFF',
        status: 'ACTIVE',
      },
    });

    return res.status(201).json({ success: true, data: staff });
  } catch (error) {
    next(error);
  }
};

export const updateStaff = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id;
    const parseResult = editStaffSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(422).json({ success: false, error: parseResult.error.flatten() });
    }

    const { name, email, employee_id, department_id, phone, status } = parseResult.data;

    // Check email uniqueness excluding current staff
    const conflictEmail = await prisma.users.findFirst({
      where: { email, NOT: { id } },
    });
    if (conflictEmail) {
      return res.status(409).json({ success: false, message: 'Email already exists' });
    }

    const staff = await prisma.users.update({
      where: { id },
      data: {
        name,
        email,
        employee_id,
        department_id,
        phone,
        status: status || 'ACTIVE',
        updated_at: new Date(),
      },
    });

    return res.status(200).json({ success: true, data: staff });
  } catch (error) {
    next(error);
  }
};

export const deleteStaff = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id;

    await prisma.users.update({
      where: { id },
      data: { status: 'INACTIVE', updated_at: new Date() },
    });

    return res.status(200).json({ success: true, message: 'Staff deactivated successfully' });
  } catch (error) {
    next(error);
  }
};

// Users Management (For Students & Admins)
export const getUsers = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const list = await prisma.users.findMany({
      orderBy: { created_at: 'desc' },
      include: { departments: true },
    });
    return res.status(200).json({ success: true, data: list });
  } catch (error) {
    next(error);
  }
};

export const updateUserStatus = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id;
    const { status } = req.body;

    if (!['ACTIVE', 'INACTIVE'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const user = await prisma.users.update({
      where: { id },
      data: { status, updated_at: new Date() },
    });

    return res.status(200).json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
};

// Global Admin Complaints Management (With filtering, sorting, pagination)
export const getAdminComplaints = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user || req.user.role !== 'ADMIN') {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const { status, category_id, priority, department_id, assigned_staff_id, search, page = '1', limit = '20' } = req.query;
    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const offset = (pageNum - 1) * limitNum;

    const whereClause: any = {};

    if (status) {
      whereClause.status = status;
    }
    if (priority) {
      whereClause.priority = priority;
    }
    if (category_id) {
      whereClause.category_id = parseInt(category_id as string, 10);
    }
    if (department_id) {
      whereClause.department_id = parseInt(department_id as string, 10);
    }
    if (assigned_staff_id) {
      whereClause.assigned_staff_id = assigned_staff_id;
    }
    if (search) {
      whereClause.OR = [
        { title: { contains: search as string, mode: 'insensitive' } },
        { description: { contains: search as string, mode: 'insensitive' } },
        { location: { contains: search as string, mode: 'insensitive' } },
        { complaint_number: { contains: search as string, mode: 'insensitive' } },
        {
          users_complaints_student_idTousers: {
            name: { contains: search as string, mode: 'insensitive' },
          },
        },
      ];
    }

    const [complaintsList, totalCount] = await Promise.all([
      prisma.complaints.findMany({
        where: whereClause,
        include: {
          categories: true,
          departments: true,
          users_complaints_student_idTousers: {
            select: { name: true, student_id: true },
          },
          users_complaints_assigned_staff_idTousers: {
            select: { name: true },
          },
        },
        orderBy: { created_at: 'desc' },
        skip: offset,
        take: limitNum,
      }),
      prisma.complaints.count({ where: whereClause }),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        complaints: complaintsList,
        pagination: {
          total: totalCount,
          page: pageNum,
          limit: limitNum,
          pages: Math.ceil(totalCount / limitNum),
        },
      },
    });
  } catch (error) {
    next(error);
  }
};
export const getStaffComplaints = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user || req.user.role !== 'STAFF') {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const { status, priority, search, page = '1', limit = '20' } = req.query;
    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const offset = (pageNum - 1) * limitNum;

    // Build filter query: Assigned to their department OR directly assigned to them
    const whereClause: any = {
      OR: [
        { assigned_staff_id: req.user.id },
        {
          department_id: req.user.departmentId,
          assigned_staff_id: null
        }
      ]
    };

    if (status) {
      whereClause.status = status;
    }
    if (priority) {
      whereClause.priority = priority;
    }
    if (search) {
      whereClause.OR = [
        { title: { contains: search as string, mode: 'insensitive' } },
        { description: { contains: search as string, mode: 'insensitive' } },
        { location: { contains: search as string, mode: 'insensitive' } },
        { complaint_number: { contains: search as string, mode: 'insensitive' } },
      ];
    }

    const [complaintsList, totalCount] = await Promise.all([
      prisma.complaints.findMany({
        where: whereClause,
        include: {
          categories: true,
          departments: true,
          users_complaints_student_idTousers: {
            select: { name: true, student_id: true },
          },
        },
        orderBy: { created_at: 'desc' },
        skip: offset,
        take: limitNum,
      }),
      prisma.complaints.count({ where: whereClause }),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        complaints: complaintsList,
        pagination: {
          total: totalCount,
          page: pageNum,
          limit: limitNum,
          pages: Math.ceil(totalCount / limitNum),
        },
      },
    });
  } catch (error) {
    next(error);
  }
};
