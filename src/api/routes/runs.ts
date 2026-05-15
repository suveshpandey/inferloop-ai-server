// History endpoints. Read-only — runs are written by the SSE pipeline route
// (review-stream.ts) at end-of-loop. These just project the stored rows for
// the sidebar Recents list and the historic-run detail view.

import { Router, Request, Response } from 'express';
import { requireAuth } from '../../auth/middleware.js';
import { listRunsForUser, getRunForUser, deleteRunForUser } from '../../db/runs.js';

export const runsRouter = Router();

// GET /api/runs — lightweight list for the sidebar. No JSON blobs, no
// iteration rows. Caps at 30 most-recent; pagination can come later.
runsRouter.get('/runs', requireAuth, async (req: Request, res: Response) => {
    const runs = await listRunsForUser(req.user!.id);
    return res.json({ runs });
});

// GET /api/runs/:id — full payload for the detail view. Includes every
// iteration with its four agent JSON blobs, in order. 404 if the run isn't
// the caller's or doesn't exist (same shape — don't leak existence).
runsRouter.get('/runs/:id', requireAuth, async (req: Request, res: Response) => {
    const id = req.params.id;
    if (typeof id !== 'string') return res.status(400).json({ error: 'Invalid run id' });
    const run = await getRunForUser(req.user!.id, id);
    if (!run) return res.status(404).json({ error: 'Run not found' });
    return res.json({ run });
});

// DELETE /api/runs/:id — wipes the run and its iterations (cascade in schema).
// Returns 204 on success, 404 if the run doesn't belong to the caller or
// doesn't exist (same response — don't leak existence).
runsRouter.delete('/runs/:id', requireAuth, async (req: Request, res: Response) => {
    const id = req.params.id;
    if (typeof id !== 'string') return res.status(400).json({ error: 'Invalid run id' });
    const deleted = await deleteRunForUser(req.user!.id, id);
    if (deleted === 0) return res.status(404).json({ error: 'Run not found' });
    return res.status(204).end();
});
