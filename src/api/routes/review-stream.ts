import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../auth/middleware.js';
import { review, type OnProgress } from '../../orchestrator/pipeline.js';

export const reviewStreamRouter = Router();

const ReviewRequest = z.object({
    code: z.string().min(1).max(20_000),
    language: z.string().min(1).max(50),
});

reviewStreamRouter.post('/review/stream', requireAuth, async (req: Request, res: Response) => {
    const parsed = ReviewRequest.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({
            error: 'Invalid request body',
            details: parsed.error.issues,
        });
    }

    const { code, language } = parsed.data;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const send = (event: string, data: unknown) => {
        res.write(`event: ${event}\n`);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    let clientGone = false;
    req.on('close', () => { clientGone = true; });

    const onProgress: OnProgress = (event) => {
        if (clientGone) return;
        send(event.type, event);
    };

    try {
        const result = await review(code, language, onProgress);
        if (!clientGone) {
            send('done', result);
            res.end();
        }
    } catch (err) {
        console.error('review stream failed:', err);
        if (!clientGone) {
            send('error', {
                error: 'Review failed. One of the pipeline agents returned an invalid response or is unavailable.',
            });
            res.end();
        }
    }
});
