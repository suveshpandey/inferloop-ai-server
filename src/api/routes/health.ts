import { Router, Request, Response } from 'express';
import { prisma } from '../../db/client.js';

export const healthRouter = Router();

healthRouter.get('/', async (_req: Request, res: Response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', db: 'reachable' });
  } catch (err) {
    res.status(503).json({ status: 'degraded', db: 'unreachable' });
  }
});
