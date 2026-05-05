import 'dotenv/config'
import express from 'express';
import { env } from './config/env.js';

import { healthRouter } from './api/routes/health.js';
import { authRouter } from './api/routes/auth.js';
import { analyzeRouter } from './api/routes/analyze.js';

const app = express();
app.use(express.json());

app.use('/health', healthRouter);
app.use('/auth', authRouter);
app.use('/api', analyzeRouter);



app.listen(env.PORT, () => {
    console.log(`Server is running on port ${env.PORT}`);
});