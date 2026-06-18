const { createApp } = require('./src/app');

const PORT = process.env.PORT || 3001;
const app = createApp();

app.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
  console.log('[server] routes: GET /health, POST /auth/login, GET /users');
});
