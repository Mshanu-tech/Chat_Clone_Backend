const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  userID: { type: String, unique: true },
  name: String,
  email: { type: String, unique: true },
  password: String,
  picture: String,
  is_google_user: { type: Boolean, default: false },
  google_id: String,
  friend: { type: String, default: null },
});

module.exports = mongoose.model('User', userSchema);
