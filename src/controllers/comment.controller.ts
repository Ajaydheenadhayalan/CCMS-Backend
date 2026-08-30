import { Response, NextFunction } from 'express';
import prisma from '../config/db';
import { AuthRequest } from '../middleware/auth';
import { addCommentSchema } from '../validators';

export const getComments = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const complaintId = parseInt(req.params.id, 10);
    if (isNaN(complaintId)) {
      return res.status(400).json({ success: false, message: 'Invalid complaint ID' });
    }

    // Verify access
    const complaint = await prisma.complaints.findUnique({
      where: { id: complaintId },
      select: { student_id: true, department_id: true, assigned_staff_id: true },
    });

    if (!complaint) {
      return res.status(404).json({ success: false, message: 'Complaint not found' });
    }

    if (req.user.role === 'STUDENT' && complaint.student_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    if (req.user.role === 'STAFF') {
      const isAssigned = complaint.assigned_staff_id === req.user.id;
      const isSameDept = complaint.department_id === req.user.departmentId;
      if (!isAssigned && !isSameDept) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }
    }

    const list = await prisma.comments.findMany({
      where: { complaint_id: complaintId },
      include: {
        users: {
          select: { name: true, role: true },
        },
      },
      orderBy: { created_at: 'asc' },
    });

    return res.status(200).json({ success: true, data: list });
  } catch (error) {
    next(error);
  }
};

export const addComment = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const complaintId = parseInt(req.params.id, 10);
    if (isNaN(complaintId)) {
      return res.status(400).json({ success: false, message: 'Invalid complaint ID' });
    }

    const parseResult = addCommentSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(422).json({ success: false, error: parseResult.error.flatten() });
    }

    const { comment } = parseResult.data;

    // Verify access
    const complaint = await prisma.complaints.findUnique({
      where: { id: complaintId },
      select: { id: true, student_id: true, department_id: true, assigned_staff_id: true, complaint_number: true },
    });

    if (!complaint) {
      return res.status(404).json({ success: false, message: 'Complaint not found' });
    }

    if (req.user.role === 'STUDENT' && complaint.student_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    if (req.user.role === 'STAFF') {
      const isAssigned = complaint.assigned_staff_id === req.user.id;
      const isSameDept = complaint.department_id === req.user.departmentId;
      if (!isAssigned && !isSameDept) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }
    }

    const newComment = await prisma.$transaction(async (tx) => {
      // Create Comment
      const created = await tx.comments.create({
        data: {
          complaint_id: complaintId,
          user_id: req.user!.id,
          comment,
        },
        include: {
          users: {
            select: { name: true, role: true },
          },
        },
      });

      // Create Notifications
      // If STUDENT comments, notify assigned staff / admins
      if (req.user!.role === 'STUDENT') {
        if (complaint.assigned_staff_id) {
          await tx.notifications.create({
            data: {
              user_id: complaint.assigned_staff_id,
              complaint_id: complaintId,
              title: 'New Comment Added',
              message: `Student left a comment on ${complaint.complaint_number}.`,
              type: 'NEW_COMMENT',
            },
          });
        }
        // Notify Admins
        const admins = await tx.users.findMany({ where: { role: 'ADMIN', status: 'ACTIVE' }, select: { id: true } });
        for (const admin of admins) {
          await tx.notifications.create({
            data: {
              user_id: admin.id,
              complaint_id: complaintId,
              title: 'New Comment Added',
              message: `Student left a comment on ${complaint.complaint_number}.`,
              type: 'NEW_COMMENT',
            },
          });
        }
      }

      // If STAFF comments, notify Student & admins
      if (req.user!.role === 'STAFF') {
        await tx.notifications.create({
          data: {
            user_id: complaint.student_id,
            complaint_id: complaintId,
            title: 'New Comment from Staff',
            message: `Staff left a comment on your complaint ${complaint.complaint_number}.`,
            type: 'NEW_COMMENT',
          },
        });
        // Notify Admins
        const admins = await tx.users.findMany({ where: { role: 'ADMIN', status: 'ACTIVE' }, select: { id: true } });
        for (const admin of admins) {
          await tx.notifications.create({
            data: {
              user_id: admin.id,
              complaint_id: complaintId,
              title: 'New Comment from Staff',
              message: `Staff left a comment on ${complaint.complaint_number}.`,
              type: 'NEW_COMMENT',
            },
          });
        }
      }

      // If ADMIN comments, notify Student & assigned staff
      if (req.user!.role === 'ADMIN') {
        await tx.notifications.create({
          data: {
            user_id: complaint.student_id,
            complaint_id: complaintId,
            title: 'New Comment from Admin',
            message: `Admin left a comment on your complaint ${complaint.complaint_number}.`,
            type: 'NEW_COMMENT',
          },
        });
        if (complaint.assigned_staff_id) {
          await tx.notifications.create({
            data: {
              user_id: complaint.assigned_staff_id,
              complaint_id: complaintId,
              title: 'New Comment from Admin',
              message: `Admin left a comment on complaint ${complaint.complaint_number}.`,
              type: 'NEW_COMMENT',
            },
          });
        }
      }

      return created;
    });

    return res.status(201).json({
      success: true,
      message: 'Comment added successfully',
      data: newComment,
    });
  } catch (error) {
    next(error);
  }
};
