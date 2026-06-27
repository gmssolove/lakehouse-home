const bcrypt = require('bcryptjs');

const ROUNDS = 10;

function hashPassword(plain) {
  return bcrypt.hashSync(String(plain), ROUNDS);
}

async function verifyPassword(plain, passwordHash) {
  return bcrypt.compare(String(plain), String(passwordHash));
}

module.exports = {
  hashPassword,
  verifyPassword,
};
