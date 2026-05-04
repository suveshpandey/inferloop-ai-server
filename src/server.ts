import 'dotenv/config'
import express from 'express';
import { env } from './config/env.js';

import { healthRouter } from './api/routes/health.js';
import { authRouter } from './api/routes/auth.js';

const app = express();
app.use(express.json());

app.use('/health', healthRouter);
app.use('/auth', authRouter);



app.listen(env.PORT, () => {
    console.log(`Server is running on port ${env.PORT}`);
});