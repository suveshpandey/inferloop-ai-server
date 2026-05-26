// POST /api/runs/:runId/execute-tests — run all of a run's test cases against
// its finalCode in the sandbox and return per-case results + the pass-rate.
// Idempotent (the service replaces prior results). Auth + ownership are
// enforced inside the service, which returns null for a run that isn't the
// caller's.

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
        // Sandbox/infra failure (Vercel API down, bad token, etc). The agent
        // loop is unaffected; this endpoint just reports that tests couldn't run.
        console.error('execute-tests failed:', err);
        return res.status(502).json({ error: 'Test execution failed. The sandbox may be unavailable.' });
    }
});
