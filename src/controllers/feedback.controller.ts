import { Response, NextFunction } from 'express';
import prisma from '../config/db';
import { AuthRequest } from '../middleware/auth';
import { submitFeedbackSchema } from '../validators';

export const submitFeedback = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const complaintId = parseInt(req.params.id, 10);
    if (isNaN(complaintId)) {
      return res.status(400).json({ success: false, message: 'Invalid complaint ID' });
    }

    const parseResult = submitFeedbackSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(422).json({ success: false, error: parseResult.error.flatten() });
    }

    const { rating, comment } = parseResult.data;

    // Check complaint exists and is CLOSED
    const complaint = await prisma.complaints.findUnique({
      where: { id: complaintId },
    });

    if (!complaint) {
      return res.status(404).json({ success: false, message: 'Complaint not found' });
    }

    // Must be owner student
    if (req.user.role === 'STUDENT' && complaint.student_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    if (complaint.status !== 'CLOSED') {
      return res.status(400).json({
        success: false,
        message: 'Feedback can only be submitted after the complaint is closed.',
        error: { code: 'INVALID_COMPLAINT_STATUS' },
      });
    }

    // Check if feedback already exists
    const existingFeedback = await prisma.feedback.findUnique({
      where: { complaint_id: complaintId },
    });

    if (existingFeedback) {
      return res.status(409).json({
        success: false,
        message: 'Feedback has already been submitted for this complaint',
        error: { code: 'DUPLICATE_FEEDBACK' },
      });
    }

    const feedback = await prisma.feedback.create({
      data: {
        complaint_id: complaintId,
        student_id: req.user.id,
        rating,
        comment: comment || '',
      },
    });

    return res.status(201).json({
      success: true,
      message: 'Feedback submitted successfully',
      data: feedback,
    });
  } catch (error) {
    next(error);
  }
};

export const getFeedback = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const complaintId = parseInt(req.params.id, 10);
    if (isNaN(complaintId)) {
      return res.status(400).json({ success: false, message: 'Invalid complaint ID' });
    }

    const feedback = await prisma.feedback.findUnique({
      where: { complaint_id: complaintId },
    });

    if (!feedback) {
      return res.status(404).json({ success: false, message: 'Feedback not found' });
    }

    return res.status(200).json({
      success: true,
      data: feedback,
    });
  } catch (error) {
    next(error);
  }
};
