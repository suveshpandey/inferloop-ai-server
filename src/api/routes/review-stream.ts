import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../auth/middleware.js';
import { reviewLoop, type OnProgress } from '../../orchestrator/pipeline.js';
import { saveCompletedRun } from '../../db/runs.js';

export const reviewStreamRouter = Router();

const ReviewRequest = z.object({
    code:          z.string().min(1).max(20_000),
    language:      z.string().min(1).max(50),
    // 1 means "single pass" (back-compat for old clients); 5 is the upper bound.
    // Default to 3 — a sensible middle ground that catches most easy wins
    // without burning model budget on diminishing returns.
    maxIterations: z.number().int().min(1).max(5).optional().default(3),
});

reviewStreamRouter.post('/review/stream', requireAuth, async (req: Request, res: Response) => {
    const parsed = ReviewRequest.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({
            error: 'Invalid request body',
            details: parsed.error.issues,
        });
    }

    const { code, language, maxIterations } = parsed.data;

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
        const result = await reviewLoop(code, language, maxIterations, onProgress);

        // Persist the finished run before signalling done so the sidebar's
        // Recents list sees it on the next fetch. We don't fail the request
        // if the DB write throws — the user already got their review; log
        // and move on. `runId` is included in the `done` event when the save
        // succeeds so the client can deep-link to /history/[id].
        let runId: string | null = null;
        try {
            const saved = await saveCompletedRun({
                userId: req.user!.id,
                code,
                language,
                maxIterations,
                loopResult: result,
            });
            runId = saved.id;
        } catch (saveErr) {
            console.error('saveCompletedRun failed:', saveErr);
        }

        if (!clientGone) {
            // Include the discriminator inline — the client's StreamEvent
            // union keys off `type`, and the parser doesn't inject the SSE
            // event name into the data payload.
            send('done', { type: 'done', result, runId });
            res.end();
        }
    } catch (err) {
        console.error('review stream failed:', err);
        if (!clientGone) {
            send('error', {
                type: 'error',
                error: 'Review failed. One of the pipeline agents returned an invalid response or is unavailable.',
            });
            res.end();
        }
    }
});
