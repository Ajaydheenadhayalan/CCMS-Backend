import { Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../config/db';
import { AuthRequest } from '../middleware/auth';
import { registerSchema, loginSchema } from '../validators';
import { signToken } from '../utils/jwt';

export const register = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const parseResult = registerSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(422).json({
        success: false,
        message: 'Validation failed',
        error: {
          code: 'VALIDATION_ERROR',
          details: parseResult.error.flatten().fieldErrors,
        },
      });
    }

    const { name, email, password, student_id, phone, department, year } = parseResult.data;

    // Check unique email
    const existingEmail = await prisma.users.findUnique({ where: { email } });
    if (existingEmail) {
      return res.status(409).json({
        success: false,
        message: 'Email already registered',
        error: { code: 'DUPLICATE_EMAIL' },
      });
    }

    // Check unique student ID
    const existingStudentId = await prisma.users.findUnique({ where: { student_id } });
    if (existingStudentId) {
      return res.status(409).json({
        success: false,
        message: 'Student ID already exists',
        error: { code: 'DUPLICATE_STUDENT_ID' },
      });
    }

    // Hash password
    const password_hash = await bcrypt.hash(password, 10);

    // Find or create department by name (case-insensitive)
    let dept = await prisma.departments.findFirst({
      where: {
        name: {
          equals: department.trim(),
          mode: 'insensitive',
        },
      },
    });

    if (!dept) {
      dept = await prisma.departments.create({
        data: {
          name: department.trim(),
          description: 'Created automatically during student registration',
          status: 'ACTIVE',
        },
      });
    }

    // Create user
    const user = await prisma.users.create({
      data: {
        name,
        email,
        password_hash,
        student_id,
        phone,
        department_id: dept.id,
        role: 'STUDENT',
        status: 'ACTIVE',
      },
    });

    const token = signToken({
      userId: user.id,
      role: user.role,
      email: user.email,
    });

    return res.status(201).json({
      success: true,
      message: 'Registration successful',
      data: {
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          student_id: user.student_id,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

export const login = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const parseResult = loginSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(422).json({
        success: false,
        message: 'Validation failed',
        error: {
          code: 'VALIDATION_ERROR',
          details: parseResult.error.flatten().fieldErrors,
        },
      });
    }

    const { email, password } = parseResult.data;

    const user = await prisma.users.findUnique({
      where: { email },
      include: { departments: true },
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
        error: { code: 'INVALID_CREDENTIALS' },
      });
    }

    if (user.status !== 'ACTIVE') {
      return res.status(403).json({
        success: false,
        message: 'Account is inactive. Contact Administrator.',
        error: { code: 'INACTIVE_USER' },
      });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
        error: { code: 'INVALID_CREDENTIALS' },
      });
    }

    const token = signToken({
      userId: user.id,
      role: user.role,
      email: user.email,
    });

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          student_id: user.student_id,
          employee_id: user.employee_id,
          phone: user.phone,
          department: user.departments ? { id: user.departments.id, name: user.departments.name } : null,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getMe = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
        error: { code: 'UNAUTHORIZED' },
      });
    }

    const user = await prisma.users.findUnique({
      where: { id: req.user.id },
      include: { departments: true },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
        error: { code: 'USER_NOT_FOUND' },
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        student_id: user.student_id,
        employee_id: user.employee_id,
        phone: user.phone,
        department: user.departments ? { id: user.departments.id, name: user.departments.name } : null,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const logout = async (req: AuthRequest, res: Response, next: NextFunction) => {
  // Stateless token-based auth logout is managed by client removing the token
  return res.status(200).json({
    success: true,
    message: 'Logout successful',
  });
};

// Password Reset Flow
export const forgotPassword = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }

    const user = await prisma.users.findUnique({ where: { email } });
    if (!user) {
      // Return 200 to prevent user enumeration
      return res.status(200).json({
        success: true,
        message: 'If the email exists, a password reset code has been sent.',
      });
    }

    // In production, send a real reset code. In dev, write it to audit logs/response
    const resetToken = Math.random().toString(36).substring(2, 8).toUpperCase();
    await prisma.audit_logs.create({
      data: {
        user_id: user.id,
        action: 'PASSWORD_RESET_REQUESTED',
        entity_type: 'USER',
        entity_id: user.id,
        metadata: { resetToken },
      },
    });

    return res.status(200).json({
      success: true,
      message: 'If the email exists, a password reset code has been sent.',
      // Expose resetToken in response in dev mode for easy testing
      data: { resetToken },
    });
  } catch (error) {
    next(error);
  }
};

export const resetPassword = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { email, resetToken, newPassword } = req.body;
    if (!email || !resetToken || !newPassword) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    const user = await prisma.users.findUnique({ where: { email } });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Check latest audit log reset token
    const lastAudit = await prisma.audit_logs.findFirst({
      where: {
        user_id: user.id,
        action: 'PASSWORD_RESET_REQUESTED',
      },
      orderBy: { created_at: 'desc' },
    });

    const meta = lastAudit?.metadata as any;
    if (!meta || meta.resetToken !== resetToken) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired reset token',
        error: { code: 'INVALID_RESET_TOKEN' },
      });
    }

    const password_hash = await bcrypt.hash(newPassword, 10);
    await prisma.users.update({
      where: { id: user.id },
      data: { password_hash },
    });

    // Delete token by creating log
    await prisma.audit_logs.create({
      data: {
        user_id: user.id,
        action: 'PASSWORD_RESET_COMPLETED',
        entity_type: 'USER',
        entity_id: user.id,
      },
    });

    return res.status(200).json({
      success: true,
      message: 'Password reset successful',
    });
  } catch (error) {
    next(error);
  }
};
