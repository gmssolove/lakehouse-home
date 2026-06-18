const authService = require('./auth.service');

function getToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7);
  return req.headers['x-auth-token'] || null;
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }
    const result = await authService.login({ email, password });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function logout(req, res, next) {
  try {
    const token = getToken(req);
    const result = await authService.logout(token);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function me(req, res, next) {
  try {
    const token = getToken(req);
    const user = await authService.me(token);
    res.json({ user });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  login,
  logout,
  me,
};
