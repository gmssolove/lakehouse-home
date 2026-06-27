const bcrypt = require('bcryptjs');

/**
 * 공통 DB 연결 샘플.
 * 실제 DB 드라이버(mysql2, pg, mongoose 등)로 교체하세요.
 */
const users = new Map([
  [
    1,
    {
      id: 1,
      email: 'demo@lakehouse.local',
      name: 'Demo User',
      passwordHash: bcrypt.hashSync('demo123', 10),
    },
  ],
]);

const sessions = new Map();

const db = {
  users,
  sessions,

  async ping() {
    return { ok: true, at: new Date().toISOString() };
  },
};

module.exports = db;
