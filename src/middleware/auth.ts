import { Request, Response, NextFunction } from 'express';
import { verifyToken, TokenPayload } from '../utils/jwt';
import prisma from '../config/db';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
    departmentId: number | null;
  };
}

export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.',
        error: { code: 'UNAUTHORIZED' },
      });
    }

    const token = authHeader.split(' ')[1];
    let decoded: TokenPayload;
    try {
      decoded = verifyToken(token);
    } catch (err) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token.',
        error: { code: 'UNAUTHORIZED' },
      });
    }

    // Check user in database
    const dbUser = await prisma.users.findUnique({
      where: { id: decoded.userId },
      select: { id: true, email: true, role: true, department_id: true, status: true },
    });

    if (!dbUser) {
      return res.status(401).json({
        success: false,
        message: 'User not found.',
        error: { code: 'UNAUTHORIZED' },
      });
    }

    if (dbUser.status !== 'ACTIVE') {
      return res.status(403).json({
        success: false,
        message: 'User account is inactive.',
        error: { code: 'FORBIDDEN' },
      });
    }

    req.user = {
      id: dbUser.id,
      email: dbUser.email,
      role: dbUser.role,
      departmentId: dbUser.department_id,
    };

    next();
  } catch (error) {
    next(error);
  }
};

export const authorize = (allowedRoles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized.',
        error: { code: 'UNAUTHORIZED' },
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Access forbidden. Insufficient permissions.',
        error: { code: 'FORBIDDEN' },
      });
    }

    next();
  };
};
