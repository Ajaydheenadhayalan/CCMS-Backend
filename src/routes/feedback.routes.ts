import { Router } from 'express';
import { submitFeedback, getFeedback } from '../controllers/feedback.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.post('/:id/feedback', submitFeedback);
router.get('/:id/feedback', getFeedback);

export default router;
