import { Router } from 'express';
import { getComments, addComment } from '../controllers/comment.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/:id/comments', getComments);
router.post('/:id/comments', addComment);

export default router;
