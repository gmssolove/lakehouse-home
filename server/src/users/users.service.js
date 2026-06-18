const db = require('../shared/db');

async function listUsers() {
  return Array.from(db.users.values()).map(({ id, email, name }) => ({ id, email, name }));
}

async function getUserById(id) {
  const user = db.users.get(Number(id));
  if (!user) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }
  return { id: user.id, email: user.email, name: user.name };
}

async function createUser({ email, name, password }) {
  if (!email || !name || !password) {
    const err = new Error('email, name, and password are required');
    err.status = 400;
    throw err;
  }
  for (const user of db.users.values()) {
    if (user.email === email) {
      const err = new Error('Email already exists');
      err.status = 409;
      throw err;
    }
  }
  const id = db.users.size + 1;
  const user = { id, email, name, passwordHash: password };
  db.users.set(id, user);
  return { id, email, name };
}

async function updateUser(id, { name, email }) {
  const user = db.users.get(Number(id));
  if (!user) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }
  if (email) user.email = email;
  if (name) user.name = name;
  db.users.set(user.id, user);
  return { id: user.id, email: user.email, name: user.name };
}

async function deleteUser(id) {
  const numId = Number(id);
  if (!db.users.has(numId)) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }
  db.users.delete(numId);
  return { ok: true };
}

module.exports = {
  listUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
};
