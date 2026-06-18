const express = require('express');
const usersController = require('./users.controller');

const router = express.Router();

router.get('/', usersController.listUsers);
router.get('/:id', usersController.getUser);
router.post('/', usersController.createUser);
router.patch('/:id', usersController.updateUser);
router.delete('/:id', usersController.deleteUser);

module.exports = router;
