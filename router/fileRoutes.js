// // router/fileRoutes.js

// const express = require('express');
// const router = express.Router();
// const Message = require('../models/Message');

// router.post('/save', async (req, res) => {
//   try {
//     const { sender, receiver, file, fileType, fileName, resourceType, timestamp, replyTo } = req.body;
//     console.log("save", req.body);

//     const savedMessage = await Message.create({
//       sender,
//       receiver,
//       file,
//       fileType,
//       fileName,
//       resourceType,
//       timestamp,
//       replyTo
//     });
//     console.log(savedMessage);

//     res.status(200).json(savedMessage);
//   } catch (error) {
//     console.error('Error saving file message:', error);
//     res.status(500).json({ error: error.message });
//   }
// });

// module.exports = router;
