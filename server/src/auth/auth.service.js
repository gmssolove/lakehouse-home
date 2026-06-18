const db = require('../shared/db');

function findUserByEmail(email) {
  for (const user of db.users.values()) {
    if (user.email === email) return user;
  }
  return null;
}

function createSession(userId) {
  const token = `sess_${Date.now()}_${userId}`;
  db.sessions.set(token, { userId, createdAt: Date.now() });
  return token;
}

function getSession(token) {
  return db.sessions.get(token) || null;
}

async function login({ email, password }) {
  const user = findUserByEmail(email);
  if (!user || user.passwordHash !== password) {
    const err = new Error('Invalid email or password');
    err.status = 401;
    throw err;
  }
  const token = createSession(user.id);
  return { token, user: { id: user.id, email: user.email, name: user.name } };
}

async function logout(token) {
  if (token) db.sessions.delete(token);
  return { ok: true };
}

async function me(token) {
  const session = getSession(token);
  if (!session) {
    const err = new Error('Unauthorized');
    err.status = 401;
    throw err;
  }
  const user = db.users.get(session.userId);
  if (!user) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }
  return { id: user.id, email: user.email, name: user.name };
}

module.exports = {
  login,
  logout,
  me,
};
