const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
  sender: { type: String, required: true },
  receiver: { type: String, required: true },
  message: { type: String },
  audio: { type: String },
  duration: { type: Number },
  file: { type: String },
  fileType: { type: String },
  fileName: { type: String },
  timestamp: { type: Date, default: Date.now },
  replyTo: { type: Object }
});

module.exports = mongoose.model('Message', MessageSchema);