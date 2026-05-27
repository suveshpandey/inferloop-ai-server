// CRUD for a run's test cases, mounted at /api (→ /api/runs/:runId/test-cases[/:id]).
// All routes require auth; ownership is scoped in the repo, so another user's case 404s.

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../auth/middleware.js';
import {
    listTestCases,
    createTestCase,
    updateTestCase,
    deleteTestCase,
} from '../../db/test-cases.js';

export const testCasesRouter = Router();

// Manual-case payload. No `source` — forced to 'manual' in the repo.
const CreateBody = z.object({
    name:           z.string().min(1).max(120),
    input:          z.string().max(20_000),
    expectedOutput: z.string().max(20_000),
    timeLimitMs:    z.number().int().positive().max(60_000).optional(),
    memoryLimitMb:  z.number().int().positive().max(1_024).optional(),
});

// Every field optional on edit — a PATCH may touch just the expected output.
const UpdateBody = CreateBody.partial();

// GET /api/runs/:runId/test-cases — list the run's cases.
testCasesRouter.get('/runs/:runId/test-cases', requireAuth, async (req: Request, res: Response) => {
    const runId = req.params.runId;
    if (typeof runId !== 'string') return res.status(400).json({ error: 'Invalid run id' });
    const cases = await listTestCases(runId, req.user!.id);
    if (cases === null) return res.status(404).json({ error: 'Run not found' });
    return res.json({ testCases: cases });
});

// POST /api/runs/:runId/test-cases — add a manual case.
testCasesRouter.post('/runs/:runId/test-cases', requireAuth, async (req: Request, res: Response) => {
    const runId = req.params.runId;
    if (typeof runId !== 'string') return res.status(400).json({ error: 'Invalid run id' });
    const parsed = CreateBody.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid request body', details: parsed.error.issues });
    }
    const created = await createTestCase(runId, req.user!.id, parsed.data);
    if (created === null) return res.status(404).json({ error: 'Run not found' });
    return res.status(201).json({ testCase: created });
});

// PATCH /api/runs/:runId/test-cases/:id — edit a case.
testCasesRouter.patch('/runs/:runId/test-cases/:id', requireAuth, async (req: Request, res: Response) => {
    const id = req.params.id;
    if (typeof id !== 'string') return res.status(400).json({ error: 'Invalid test case id' });
    const parsed = UpdateBody.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid request body', details: parsed.error.issues });
    }
    const updated = await updateTestCase(id, req.user!.id, parsed.data);
    if (updated === null) return res.status(404).json({ error: 'Test case not found' });
    return res.json({ testCase: updated });
});

// DELETE /api/runs/:runId/test-cases/:id — remove a case.
testCasesRouter.delete('/runs/:runId/test-cases/:id', requireAuth, async (req: Request, res: Response) => {
    const id = req.params.id;
    if (typeof id !== 'string') return res.status(400).json({ error: 'Invalid test case id' });
    const deleted = await deleteTestCase(id, req.user!.id);
    if (deleted === 0) return res.status(404).json({ error: 'Test case not found' });
    return res.status(204).end();
});
