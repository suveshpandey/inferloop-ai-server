// POST /api/runs/:runId/execute-tests — SSE stream that runs a run's test cases
// against its finalCode and emits per-case progress (case_start → case_complete)
// followed by a `done` summary. Optional body `{ caseIds: string[] }` runs only
// the listed cases — used by the per-row "Run this case" button — and preserves
// the other cases' previous results when recomputing the pass-rate.

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../auth/middleware.js';
import { executeTestsForRunStream } from '../../services/run-tests.js';

export const executeTestsRouter = Router();

const Body = z.object({
    caseIds: z.array(z.string()).optional(),
}).optional();

executeTestsRouter.post('/runs/:runId/execute-tests', requireAuth, async (req: Request, res: Response) => {
    const runId = req.params.runId;
    if (typeof runId !== 'string') return res.status(400).json({ error: 'Invalid run id' });

    const parsed = Body.safeParse(req.body ?? {});
    if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid request body', details: parsed.error.issues });
    }
    const caseIds = parsed.data?.caseIds;

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

    try {
        const result = await executeTestsForRunStream(runId, req.user!.id, {
            caseIds,
            onCaseStart: (caseId, name) => {
                if (clientGone) return;
                send('case_start', { type: 'case_start', caseId, name });
            },
            onCaseComplete: (caseId, r) => {
                if (clientGone) return;
                send('case_complete', { type: 'case_complete', caseId, result: r });
            },
        });

        if (result === null) {
            if (!clientGone) {
                send('error', { type: 'error', error: 'Run not found' });
                res.end();
            }
            return;
        }

        if (!clientGone) {
            send('done', {
                type:         'done',
                results:      result.results,
                testPassRate: result.testPassRate,
                ranAt:        new Date().toISOString(),
            });
            res.end();
        }
    } catch (err) {
        console.error('execute-tests stream failed:', err);
        if (!clientGone) {
            send('error', {
                type:  'error',
                error: 'Test execution failed. The sandbox may be unavailable.',
            });
            res.end();
        }
    }
});
