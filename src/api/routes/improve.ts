import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../auth/middleware.js';
import { improve } from '../../agents/improver.js';
import { CriticOutput } from '../../agents/schemas.js';

export const improveRouter = Router();

const ImproveRequest = z.object({
    code: z.string().min(1).max(20_000),
    language: z.string().min(1).max(50),
    reviewed: CriticOutput,
});

improveRouter.post('/improve', requireAuth, async (req: Request, res: Response) => {
    const parsed = ImproveRequest.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({
            error: 'Invalid request body',
            details: parsed.error.issues,
        });
    }

    const { code, language, reviewed } = parsed.data;

    try {
        const result = await improve(code, language, reviewed);
        return res.status(200).json(result);
    } catch (err) {
        console.error('improve failed:', err);
        return res.status(502).json({
            error: 'Improvement failed. The model returned an invalid response or is unavailable.',
        });
    }
});
