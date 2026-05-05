import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../auth/middleware.js';
import { analyze } from '../../agents/analyzer.js';

export const analyzeRouter = Router();

const AnalyzeRequest = z.object({
    code: z.string().min(1).max(20_000),
    language: z.string().min(1).max(50),
});

analyzeRouter.post('/analyze', requireAuth, async (req: Request, res: Response) => {
    const parsed = AnalyzeRequest.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({
            error: 'Invalid request body',
            details: parsed.error.issues,
        });
    }

    const { code, language } = parsed.data;

    try {
        const result = await analyze(code, language);
        return res.status(200).json(result);
    } catch (err) {
        console.error('analyze failed:', err);
        return res.status(502).json({
            error: 'Analysis failed. The model returned an invalid response or is unavailable.',
        });
    }
});
