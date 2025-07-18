const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  sender: String,
  receiver: String,
  message: { type: String, required: false },
  audio: { type: String, required: false }, // Base64 encoded audio
  duration: { type: Number, required: false }, // Duration in seconds
  timestamp: Date,
  replyTo: {
    type: mongoose.Schema.Types.Mixed,
    default: null,
  }
});

module.exports = mongoose.model('Message', messageSchema);
