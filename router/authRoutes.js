const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// Routes
router.post('/google', authController.googleAuth);
router.post('/signup', authController.signup);
router.post('/login', authController.login);
router.get('/friends/:userID', authController.friends);
router.get('/last-messages/:userID', authController.lastMessage );
router.get('/messages/:user1/:user2', authController.messages );

module.exports = router; 
