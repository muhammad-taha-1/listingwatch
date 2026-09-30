import { Router } from 'express';
import { pingDb } from '../lib/db.js';

export const healthRouter = Router();

healthRouter.get('/', async (_req, res) => {
  const dbUp = await pingDb();
  res.status(dbUp ? 200 : 503).json({
    status: dbUp ? 'ok' : 'degraded',
    db: dbUp ? 'up' : 'down',
    uptimeSeconds: Math.round(process.uptime()),
  });
});
