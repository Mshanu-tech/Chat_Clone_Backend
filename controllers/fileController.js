const Message = require('../models/Message');
const path = require('path');

async function uploadFile(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { sender, receiver, timestamp, replyTo } = req.body;
console.log(req.body);

    // Construct file URL
    const fileUrl = `/uploads/${req.file.filename}`;
    const isImage = req.file.mimetype.startsWith('image/');
    const isVideo = req.file.mimetype.startsWith('video/');
    
    // Generate thumbnail if needed
    let thumbnailUrl = null;
    if (isImage) {
      thumbnailUrl = await generateImageThumbnail(req.file.path); // Implement this function
    } else if (isVideo) {
      thumbnailUrl = await generateVideoThumbnail(req.file.path); // Implement this function
    }

    const messageData = {
      sender,
      receiver,
      file: fileUrl,
      fileType: req.file.mimetype,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      timestamp: timestamp ? new Date(timestamp) : new Date(),
      replyTo: replyTo ? JSON.parse(replyTo) : null
    };

    if (thumbnailUrl) {
      messageData.thumbnail = thumbnailUrl;
    }

    const savedMessage = await Message.create(messageData);
    res.json(savedMessage);
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'File upload failed' });
  }
}

// Example stubs
async function generateImageThumbnail(filePath) {
  return '/uploads/thumbnails/' + path.basename(filePath); // just for demo
}

async function generateVideoThumbnail(filePath) {
  return '/uploads/thumbnails/' + path.basename(filePath) + '.jpg'; // just for demo
}

module.exports = { uploadFile };
