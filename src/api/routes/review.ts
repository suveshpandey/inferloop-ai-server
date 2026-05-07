import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../auth/middleware.js';
import { review } from '../../orchestrator/pipeline.js';

export const reviewRouter = Router();

const ReviewRequest = z.object({
    code: z.string().min(1).max(20_000),
    language: z.string().min(1).max(50),
});

reviewRouter.post('/review', requireAuth, async (req: Request, res: Response) => {
    const parsed = ReviewRequest.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({
            error: 'Invalid request body',
            details: parsed.error.issues,
        });
    }

    const { code, language } = parsed.data;

    try {
        const result = await review(code, language);
        return res.status(200).json(result);
    } catch (err) {
        console.error('review pipeline failed:', err);
        return res.status(502).json({
            error: 'Review failed. One of the pipeline agents returned an invalid response or is unavailable.',
        });
    }
});
