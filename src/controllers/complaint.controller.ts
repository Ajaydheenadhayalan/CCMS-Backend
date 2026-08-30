import { Response, NextFunction } from 'express';
import prisma from '../config/db';
import { AuthRequest } from '../middleware/auth';
import {
  createComplaintSchema,
  assignComplaintSchema,
  resolveComplaintSchema,
  closeComplaintSchema,
} from '../validators';

// Helper to generate unique complaint ID: CMP-YYYY-NNNNNN
const generateComplaintNumber = async (): Promise<string> => {
  const year = new Date().getFullYear();
  const prefix = `CMP-${year}-`;

  // Find last complaint with this year's prefix
  const lastComplaint = await prisma.complaints.findFirst({
    where: {
      complaint_number: {
        startsWith: prefix,
      },
    },
    orderBy: {
      complaint_number: 'desc',
    },
    select: {
      complaint_number: true,
    },
  });

  let nextSeq = 1;
  if (lastComplaint) {
    const parts = lastComplaint.complaint_number.split('-');
    if (parts.length === 3) {
      const lastSeq = parseInt(parts[2], 10);
      if (!isNaN(lastSeq)) {
        nextSeq = lastSeq + 1;
      }
    }
  }

  const seqString = String(nextSeq).padStart(6, '0');
  return `${prefix}${seqString}`;
};

export const createComplaint = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user || req.user.role !== 'STUDENT') {
      return res.status(403).json({
        success: false,
        message: 'Only students can submit complaints',
        error: { code: 'FORBIDDEN' },
      });
    }

    const parseResult = createComplaintSchema.safeParse(req.body);
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

    const { title, category_id, description, location } = parseResult.data;

    // Check category exists
    const category = await prisma.categories.findFirst({
      where: { id: category_id, status: 'ACTIVE' },
    });
    if (!category) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or inactive category selected',
        error: { code: 'INVALID_CATEGORY' },
      });
    }

    const complaint_number = await generateComplaintNumber();

    // Create complaint, status history, and initial notification in a transaction
    const result = await prisma.$transaction(async (tx) => {
      const complaint = await tx.complaints.create({
        data: {
          complaint_number,
          student_id: req.user!.id,
          category_id,
          title,
          description,
          location,
          priority: 'MEDIUM',
          status: 'SUBMITTED',
        },
      });

      // Status History
      await tx.complaint_status_history.create({
        data: {
          complaint_id: complaint.id,
          old_status: null,
          new_status: 'SUBMITTED',
          changed_by: req.user!.id,
          reason: 'Complaint submitted by student',
        },
      });

      // Notify Admins
      const admins = await tx.users.findMany({
        where: { role: 'ADMIN', status: 'ACTIVE' },
        select: { id: true },
      });

      for (const admin of admins) {
        await tx.notifications.create({
          data: {
            user_id: admin.id,
            complaint_id: complaint.id,
            title: 'New Complaint Submitted',
            message: `A new complaint ${complaint_number} has been submitted: "${title}"`,
            type: 'COMPLAINT_SUBMITTED',
          },
        });
      }

      // Handle optional attachments if passed in body
      if (req.body.attachments && Array.isArray(req.body.attachments)) {
        for (const file of req.body.attachments) {
          await tx.attachments.create({
            data: {
              complaint_id: complaint.id,
              uploaded_by: req.user!.id,
              file_name: file.name || 'attachment',
              file_url: file.url || '',
              file_type: file.type || 'image/png',
              file_size: file.size || 0,
            },
          });
        }
      }

      return complaint;
    });

    return res.status(201).json({
      success: true,
      message: 'Complaint submitted successfully',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const getMyComplaints = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user || req.user.role !== 'STUDENT') {
      return res.status(403).json({
        success: false,
        message: 'Forbidden',
      });
    }

    const { status, category_id, priority, search, page = '1', limit = '20' } = req.query;
    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const offset = (pageNum - 1) * limitNum;

    // Build filter query
    const whereClause: any = {
      student_id: req.user.id,
    };

    if (status) {
      whereClause.status = status;
    }
    if (priority) {
      whereClause.priority = priority;
    }
    if (category_id) {
      whereClause.category_id = parseInt(category_id as string, 10);
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

export const getComplaintDetails = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, message: 'Invalid complaint ID' });
    }

    const complaint = await prisma.complaints.findUnique({
      where: { id },
      include: {
        categories: true,
        departments: true,
        users_complaints_student_idTousers: {
          select: { id: true, name: true, email: true, phone: true, student_id: true },
        },
        users_complaints_assigned_staff_idTousers: {
          select: { id: true, name: true, email: true, phone: true, employee_id: true },
        },
        attachments: true,
        comments: {
          include: {
            users: {
              select: { name: true, role: true },
            },
          },
          orderBy: { created_at: 'asc' },
        },
        complaint_status_history: {
          include: {
            users: {
              select: { name: true, role: true },
            },
          },
          orderBy: { created_at: 'asc' },
        },
        feedback: true,
      },
    });

    if (!complaint) {
      return res.status(404).json({
        success: false,
        message: 'Complaint not found',
        error: { code: 'NOT_FOUND' },
      });
    }

    // Role-based Access Authorization
    if (req.user.role === 'STUDENT' && complaint.student_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden. You do not own this complaint.',
        error: { code: 'FORBIDDEN' },
      });
    }

    if (req.user.role === 'STAFF') {
      const isAssignedStaff = complaint.assigned_staff_id === req.user.id;
      const isSameDepartment = complaint.department_id === req.user.departmentId;

      if (!isAssignedStaff && !isSameDepartment) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden. This complaint is not assigned to your department/queue.',
          error: { code: 'FORBIDDEN' },
        });
      }
    }

    return res.status(200).json({
      success: true,
      data: complaint,
    });
  } catch (error) {
    next(error);
  }
};

// Admin Assignment Endpoint
export const assignComplaint = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user || req.user.role !== 'ADMIN') {
      return res.status(403).json({ success: false, message: 'Admin permissions required' });
    }

    const complaintId = parseInt(req.params.id, 10);
    if (isNaN(complaintId)) {
      return res.status(400).json({ success: false, message: 'Invalid complaint ID' });
    }

    const parseResult = assignComplaintSchema.safeParse(req.body);
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

    const { department_id, assigned_staff_id } = parseResult.data;

    const complaint = await prisma.complaints.findUnique({
      where: { id: complaintId },
    });

    if (!complaint) {
      return res.status(404).json({ success: false, message: 'Complaint not found' });
    }

    // Status Transition Validation: Admin can assign from SUBMITTED, UNDER_REVIEW, or ASSIGNED.
    const validStatuses = ['SUBMITTED', 'UNDER_REVIEW', 'ASSIGNED'];
    if (!validStatuses.includes(complaint.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot assign complaint in status ${complaint.status}`,
        error: { code: 'INVALID_STATUS_TRANSITION' },
      });
    }

    // Validate staff is in department
    if (assigned_staff_id && department_id) {
      const staffUser = await prisma.users.findUnique({
        where: { id: assigned_staff_id },
      });
      if (!staffUser || staffUser.role !== 'STAFF' || staffUser.department_id !== department_id) {
        return res.status(400).json({
          success: false,
          message: 'Assigned staff must exist and belong to the selected department',
          error: { code: 'INVALID_STAFF_DEPARTMENT' },
        });
      }
    }

    const oldStatus = complaint.status;
    const newStatus = 'ASSIGNED';

    await prisma.$transaction(async (tx) => {
      // Update Complaint
      await tx.complaints.update({
        where: { id: complaintId },
        data: {
          department_id,
          assigned_staff_id,
          status: newStatus,
          updated_at: new Date(),
        },
      });

      // Status History
      await tx.complaint_status_history.create({
        data: {
          complaint_id: complaintId,
          old_status: oldStatus,
          new_status: newStatus,
          changed_by: req.user!.id,
          reason: `Assigned to department ID ${department_id} and staff ${assigned_staff_id || 'unassigned'}`,
        },
      });

      // Notify Student
      await tx.notifications.create({
        data: {
          user_id: complaint.student_id,
          complaint_id: complaintId,
          title: 'Complaint Assigned',
          message: `Your complaint ${complaint.complaint_number} has been assigned.`,
          type: 'COMPLAINT_ASSIGNED',
        },
      });

      // Notify Staff if assigned
      if (assigned_staff_id) {
        await tx.notifications.create({
          data: {
            user_id: assigned_staff_id,
            complaint_id: complaintId,
            title: 'New Complaint Assigned',
            message: `Complaint ${complaint.complaint_number} has been assigned to you.`,
            type: 'COMPLAINT_ASSIGNED',
          },
        });
      }
    });

    return res.status(200).json({
      success: true,
      message: 'Complaint assigned successfully',
    });
  } catch (error) {
    next(error);
  }
};

// Staff/Admin progress activation endpoint
export const startComplaintProgress = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user || req.user.role === 'STUDENT') {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const id = parseInt(req.params.id, 10);
    const complaint = await prisma.complaints.findUnique({ where: { id } });

    if (!complaint) {
      return res.status(404).json({ success: false, message: 'Complaint not found' });
    }

    // Role Checks
    if (req.user.role === 'STAFF') {
      if (complaint.assigned_staff_id !== req.user.id && complaint.department_id !== req.user.departmentId) {
        return res.status(403).json({ success: false, message: 'Unauthorized for this complaint' });
      }
    }

    if (complaint.status !== 'ASSIGNED') {
      return res.status(400).json({
        success: false,
        message: 'Complaint must be ASSIGNED to start progress',
      });
    }

    await prisma.$transaction(async (tx) => {
      await tx.complaints.update({
        where: { id },
        data: { status: 'IN_PROGRESS', updated_at: new Date() },
      });

      await tx.complaint_status_history.create({
        data: {
          complaint_id: id,
          old_status: 'ASSIGNED',
          new_status: 'IN_PROGRESS',
          changed_by: req.user!.id,
          reason: 'Technician started working on the issue',
        },
      });

      await tx.notifications.create({
        data: {
          user_id: complaint.student_id,
          complaint_id: id,
          title: 'Complaint In Progress',
          message: `Work has started on your complaint ${complaint.complaint_number}.`,
          type: 'COMPLAINT_IN_PROGRESS',
        },
      });
    });

    return res.status(200).json({
      success: true,
      message: 'Complaint status changed to IN_PROGRESS',
    });
  } catch (error) {
    next(error);
  }
};

// Staff/Admin Resolve Endpoint
export const resolveComplaint = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user || req.user.role === 'STUDENT') {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const complaintId = parseInt(req.params.id, 10);
    if (isNaN(complaintId)) {
      return res.status(400).json({ success: false, message: 'Invalid complaint ID' });
    }

    const parseResult = resolveComplaintSchema.safeParse(req.body);
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

    const { resolution_description } = parseResult.data;

    const complaint = await prisma.complaints.findUnique({
      where: { id: complaintId },
    });

    if (!complaint) {
      return res.status(404).json({ success: false, message: 'Complaint not found' });
    }

    if (req.user.role === 'STAFF') {
      if (complaint.assigned_staff_id !== req.user.id && complaint.department_id !== req.user.departmentId) {
        return res.status(403).json({ success: false, message: 'Unauthorized for this complaint' });
      }
    }

    // Status transition: must be in IN_PROGRESS to resolve
    if (complaint.status !== 'IN_PROGRESS') {
      return res.status(400).json({
        success: false,
        message: 'Complaint must be IN_PROGRESS to resolve',
        error: { code: 'INVALID_STATUS' },
      });
    }

    await prisma.$transaction(async (tx) => {
      await tx.complaints.update({
        where: { id: complaintId },
        data: {
          status: 'RESOLVED',
          resolution_description,
          resolved_at: new Date(),
          updated_at: new Date(),
        },
      });

      await tx.complaint_status_history.create({
        data: {
          complaint_id: complaintId,
          old_status: 'IN_PROGRESS',
          new_status: 'RESOLVED',
          changed_by: req.user!.id,
          reason: `Resolved. Resolution: ${resolution_description}`,
        },
      });

      // Notify Student
      await tx.notifications.create({
        data: {
          user_id: complaint.student_id,
          complaint_id: complaintId,
          title: 'Complaint Resolved',
          message: `Your complaint ${complaint.complaint_number} has been marked as resolved. Please review and close it.`,
          type: 'COMPLAINT_RESOLVED',
        },
      });
    });

    return res.status(200).json({
      success: true,
      message: 'Complaint resolved successfully',
    });
  } catch (error) {
    next(error);
  }
};

// Student Accept/Reject Closure
export const closeComplaint = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const complaintId = parseInt(req.params.id, 10);
    if (isNaN(complaintId)) {
      return res.status(400).json({ success: false, message: 'Invalid complaint ID' });
    }

    const parseResult = closeComplaintSchema.safeParse(req.body);
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

    const { accept, reason } = parseResult.data;

    const complaint = await prisma.complaints.findUnique({
      where: { id: complaintId },
    });

    if (!complaint) {
      return res.status(404).json({ success: false, message: 'Complaint not found' });
    }

    // Auth check: student owner or admin
    if (req.user.role === 'STUDENT' && complaint.student_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Forbidden. Access denied.' });
    }

    if (complaint.status !== 'RESOLVED') {
      return res.status(400).json({
        success: false,
        message: 'Complaint must be RESOLVED before it can be closed or rejected',
      });
    }

    if (accept) {
      // Transition to CLOSED
      await prisma.$transaction(async (tx) => {
        await tx.complaints.update({
          where: { id: complaintId },
          data: {
            status: 'CLOSED',
            closed_at: new Date(),
            updated_at: new Date(),
          },
        });

        await tx.complaint_status_history.create({
          data: {
            complaint_id: complaintId,
            old_status: 'RESOLVED',
            new_status: 'CLOSED',
            changed_by: req.user!.id,
            reason: 'Resolution accepted and complaint closed by student',
          },
        });

        // Notify Admins
        const admins = await tx.users.findMany({
          where: { role: 'ADMIN', status: 'ACTIVE' },
          select: { id: true },
        });

        for (const admin of admins) {
          await tx.notifications.create({
            data: {
              user_id: admin.id,
              complaint_id: complaintId,
              title: 'Complaint Closed',
              message: `Complaint ${complaint.complaint_number} has been closed by the student.`,
              type: 'COMPLAINT_CLOSED',
            },
          });
        }
      });

      return res.status(200).json({
        success: true,
        message: 'Complaint closed successfully',
      });
    } else {
      // Transition back to IN_PROGRESS (Reopened)
      if (!reason) {
        return res.status(422).json({
          success: false,
          message: 'Reason is required when rejecting resolution',
          error: {
            code: 'VALIDATION_ERROR',
            details: { reason: ['Reason is required when rejecting resolution'] },
          },
        });
      }

      await prisma.$transaction(async (tx) => {
        await tx.complaints.update({
          where: { id: complaintId },
          data: {
            status: 'IN_PROGRESS',
            resolution_description: null,
            resolved_at: null,
            updated_at: new Date(),
          },
        });

        // Record status history
        await tx.complaint_status_history.create({
          data: {
            complaint_id: complaintId,
            old_status: 'RESOLVED',
            new_status: 'IN_PROGRESS',
            changed_by: req.user!.id,
            reason: `Resolution REJECTED by student. Reason: ${reason}`,
          },
        });

        // Add a progress comment on behalf of student
        await tx.comments.create({
          data: {
            complaint_id: complaintId,
            user_id: req.user!.id,
            comment: `[SYSTEM: Resolution Rejected] ${reason}`,
          },
        });

        // Notify staff if assigned
        if (complaint.assigned_staff_id) {
          await tx.notifications.create({
            data: {
              user_id: complaint.assigned_staff_id,
              complaint_id: complaintId,
              title: 'Resolution Rejected',
              message: `Student rejected resolution for ${complaint.complaint_number}. Action required.`,
              type: 'COMPLAINT_REOPENED',
            },
          });
        }

        // Notify admins
        const admins = await tx.users.findMany({
          where: { role: 'ADMIN', status: 'ACTIVE' },
          select: { id: true },
        });

        for (const admin of admins) {
          await tx.notifications.create({
            data: {
              user_id: admin.id,
              complaint_id: complaintId,
              title: 'Complaint Reopened',
              message: `Student rejected resolution for ${complaint.complaint_number}.`,
              type: 'COMPLAINT_REOPENED',
            },
          });
        }
      });

      return res.status(200).json({
        success: true,
        message: 'Resolution rejected. Complaint has been reopened.',
      });
    }
  } catch (error) {
    next(error);
  }
};

// Admin status and priority manual updates
export const updateComplaintPriority = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user || req.user.role !== 'ADMIN') {
      return res.status(403).json({ success: false, message: 'Forbidden. Admin role required.' });
    }

    const id = parseInt(req.params.id, 10);
    const { priority } = req.body;

    if (!['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(priority)) {
      return res.status(400).json({ success: false, message: 'Invalid priority value' });
    }

    const complaint = await prisma.complaints.update({
      where: { id },
      data: { priority, updated_at: new Date() },
    });

    // Notify staff if assigned
    if (complaint.assigned_staff_id) {
      await prisma.notifications.create({
        data: {
          user_id: complaint.assigned_staff_id,
          complaint_id: id,
          title: 'Priority Updated',
          message: `Priority for assigned complaint ${complaint.complaint_number} changed to ${priority}`,
          type: 'PRIORITY_UPDATED',
        },
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Priority updated successfully',
      data: complaint,
    });
  } catch (error) {
    next(error);
  }
};

// Under review update by Admin
export const reviewComplaint = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user || req.user.role !== 'ADMIN') {
      return res.status(403).json({ success: false, message: 'Forbidden. Admin role required.' });
    }

    const id = parseInt(req.params.id, 10);
    const complaint = await prisma.complaints.findUnique({ where: { id } });

    if (!complaint) {
      return res.status(404).json({ success: false, message: 'Complaint not found' });
    }

    if (complaint.status !== 'SUBMITTED') {
      return res.status(400).json({ success: false, message: 'Complaint is already reviewed or processed.' });
    }

    await prisma.$transaction(async (tx) => {
      await tx.complaints.update({
        where: { id },
        data: { status: 'UNDER_REVIEW', updated_at: new Date() },
      });

      await tx.complaint_status_history.create({
        data: {
          complaint_id: id,
          old_status: 'SUBMITTED',
          new_status: 'UNDER_REVIEW',
          changed_by: req.user!.id,
          reason: 'Admin marked complaint as under review',
        },
      });

      // Notify Student
      await tx.notifications.create({
        data: {
          user_id: complaint.student_id,
          complaint_id: id,
          title: 'Complaint Under Review',
          message: `Your complaint ${complaint.complaint_number} is now under review.`,
          type: 'COMPLAINT_UNDER_REVIEW',
        },
      });
    });

    return res.status(200).json({
      success: true,
      message: 'Complaint is now under review',
    });
  } catch (error) {
    next(error);
  }
};
