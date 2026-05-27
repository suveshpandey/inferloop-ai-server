// POST /api/runs/:runId/execute-tests — run a run's cases against its finalCode
// and return per-case results + pass-rate. Idempotent; ownership enforced in the service.

import { Router, Request, Response } from 'express';
import { requireAuth } from '../../auth/middleware.js';
import { executeTestsForRun } from '../../services/run-tests.js';

export const executeTestsRouter = Router();

executeTestsRouter.post('/runs/:runId/execute-tests', requireAuth, async (req: Request, res: Response) => {
    const runId = req.params.runId;
    if (typeof runId !== 'string') return res.status(400).json({ error: 'Invalid run id' });
    try {
        const result = await executeTestsForRun(runId, req.user!.id);
        if (result === null) return res.status(404).json({ error: 'Run not found' });
        return res.json({ ...result, ranAt: new Date().toISOString() });
    } catch (err) {
        // Sandbox/infra failure — report that tests couldn't run.
        console.error('execute-tests failed:', err);
        return res.status(502).json({ error: 'Test execution failed. The sandbox may be unavailable.' });
    }
});
