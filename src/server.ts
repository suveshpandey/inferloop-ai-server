import 'dotenv/config'
import express from 'express';
import { env } from './config/env.js';

import { healthRouter } from './api/routes/health.js';

const PORT = process.env.PORT;

const app = express();
app.use(express.json());

app.use('/health', healthRouter);



app.listen(PORT, () => {
    console.log(`Server is running on port ${env.PORT}`);
});