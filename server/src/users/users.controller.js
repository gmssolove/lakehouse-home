const usersService = require('./users.service');

async function listUsers(req, res, next) {
  try {
    const users = await usersService.listUsers();
    res.json({ users });
  } catch (err) {
    next(err);
  }
}

async function getUser(req, res, next) {
  try {
    const user = await usersService.getUserById(req.params.id);
    res.json({ user });
  } catch (err) {
    next(err);
  }
}

async function createUser(req, res, next) {
  try {
    const user = await usersService.createUser(req.body || {});
    res.status(201).json({ user });
  } catch (err) {
    next(err);
  }
}

async function updateUser(req, res, next) {
  try {
    const user = await usersService.updateUser(req.params.id, req.body || {});
    res.json({ user });
  } catch (err) {
    next(err);
  }
}

async function deleteUser(req, res, next) {
  try {
    const result = await usersService.deleteUser(req.params.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listUsers,
  getUser,
  createUser,
  updateUser,
  deleteUser,
};
