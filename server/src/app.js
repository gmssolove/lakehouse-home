const express = require('express');
const db = require('./shared/db');
const authRouter = require('./auth/auth.router');
const usersRouter = require('./users/users.router');

function createApp() {
  const app = express();

  app.use(express.json());

  app.get('/health', async (_req, res) => {
    const dbStatus = await db.ping();
    res.json({ status: 'ok', db: dbStatus });
  });

  app.use('/auth', authRouter);
  app.use('/users', usersRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  app.use((err, _req, res, _next) => {
    const status = err.status || 500;
    res.status(status).json({
      error: err.message || 'Internal server error',
    });
  });

  return app;
}

module.exports = { createApp };
