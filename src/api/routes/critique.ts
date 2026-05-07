import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../auth/middleware.js';
import { critique } from '../../agents/critic.js';
import { AnalyzerOutput } from '../../agents/schemas.js';

export const critiqueRouter = Router();

const CritiqueRequest = z.object({
    code: z.string().min(1).max(20_000),
    language: z.string().min(1).max(50),
    findings: AnalyzerOutput,
});

critiqueRouter.post('/critique', requireAuth, async (req: Request, res: Response) => {
    const parsed = CritiqueRequest.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({
            error: 'Invalid request body',
            details: parsed.error.issues,
        });
    }

    const { code, language, findings } = parsed.data;

    try {
        const result = await critique(code, language, findings);
        return res.status(200).json(result);
    } catch (err) {
        console.error('critique failed:', err);
        return res.status(502).json({
            error: 'Critique failed. The model returned an invalid response or is unavailable.',
        });
    }
});
