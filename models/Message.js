const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  sender: String,
  receiver: String,
  message: String,
  timestamp: Date,
  replyTo: { type: String, default: null },
});

module.exports = mongoose.model('Message', messageSchema);
