import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import { prisma } from './db/client.js';

import { healthRouter } from './api/routes/health.js';
import { authRouter } from './api/routes/auth.js';
import { analyzeRouter } from './api/routes/analyze.js';
import { critiqueRouter } from './api/routes/critique.js';
import { improveRouter } from './api/routes/improve.js';
import { evaluateRouter } from './api/routes/evaluate.js';
import { reviewRouter } from './api/routes/review.js';
import { reviewStreamRouter } from './api/routes/review-stream.js';
import { runsRouter } from './api/routes/runs.js';
import { testCasesRouter } from './api/routes/test-cases.js';
import { executeTestsRouter } from './api/routes/execute-tests.js';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';

async function start() {
    try {
        await prisma.$connect();
        // Warm-up query: forces Neon (and similar serverless Postgres) to
        // resume from suspend so the first user request doesn't eat the
        // cold-start. Cheap, ~1 RTT — and surfaces auth/network issues at
        // boot rather than under load.
        await prisma.$queryRaw`SELECT 1`;
        console.log(`${GREEN}✓ Database connected${RESET}`);
    } catch (err) {
        console.error(`${RED}✗ Database connection failed${RESET}`, err);
        process.exit(1);
    }

    const app = express();
    app.use(cors({
        origin: env.CORS_ORIGIN,
        credentials: true,
    }));
    app.use(express.json());

    
    app.use('/health', healthRouter);
    app.use('/auth', authRouter);
    app.use('/api', analyzeRouter);
    app.use('/api', critiqueRouter);
    app.use('/api', improveRouter);
    app.use('/api', evaluateRouter);
    app.use('/api', reviewRouter);
    app.use('/api', reviewStreamRouter);
    app.use('/api', runsRouter);
    app.use('/api', testCasesRouter);
    app.use('/api', executeTestsRouter);

    app.listen(env.PORT, () => {
        console.log(`${GREEN}✓ Server is running on port ${env.PORT}${RESET}`);
    });
}

start();
