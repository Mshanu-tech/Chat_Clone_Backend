const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const upload = require('../config/multerConfig');
const {uploadFile} = require('../controllers/fileController');
const Message = require('../models/Message');
// Routes
router.post('/google', authController.googleAuth);
router.post('/signup', authController.signup);
router.post('/login', authController.login);
router.get('/friends/:userID', authController.friends);
router.get('/last-messages/:userID', authController.lastMessage );
router.get('/messages/:user1/:user2', authController.messages );


router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { sender, receiver, timestamp, replyTo } = req.body;
    
    const fileMsg = {
      sender,
      receiver,
      file: `/uploads/${req.file.filename}`,
      fileType: req.file.mimetype,
      fileName: req.file.originalname,
      timestamp: timestamp || new Date(),
      replyTo: replyTo ? JSON.parse(replyTo) : null
    };

    // Save to database
    const savedMessage = await Message.create(fileMsg);

    res.status(200).json(savedMessage);
  } catch (error) {
    console.error('Error uploading file:', error);
    res.status(500).json({ error: 'File upload failed' });
  }
});

module.exports = router; 
