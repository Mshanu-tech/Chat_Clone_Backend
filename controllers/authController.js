const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const User = require('../models/User');
const Message = require('../models/Message');
const generateUserID = require('../utils/generateUserID');

// Google Signup/Login
exports.googleAuth = async (req, res) => {
  const { email, name, picture, googleId } = req.body;

  try {
    let user = await User.findOne({ email });

    if (!user) {
      const userID = generateUserID();
      user = await User.create({
        userID,
        name,
        email,
        picture,
        google_id: googleId,
        is_google_user: true,
      });
    }

    const userID = user.userID;

    // Get friend & messages
    let friend = null;
    let messages = [];

    if (user.friend) {
      const friendUser = await User.findOne({ userID: user.friend });
      if (friendUser) {
        friend = { userID: friendUser.userID, name: friendUser.name };

        messages = await Message.find({
          $or: [
            { sender: userID, receiver: friendUser.userID },
            { sender: friendUser.userID, receiver: userID },
          ]
        }).sort({ timestamp: 1 });
      }
    }

    const token = jwt.sign({ email, name, userID }, process.env.JWT_SECRET, { expiresIn: '1d' });

    res.status(200).json({ token, email, name, userID, friend, messages });
  } catch (err) {
    console.error('Google auth error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// Email Signup
exports.signup = async (req, res) => {
  const { name, email, password } = req.body;

  try {
    const existing = await User.findOne({ email });
    if (existing)
      return res.status(400).json({ message: 'User already exists' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const userID = generateUserID();

    await User.create({
      userID,
      name,
      email,
      password: hashedPassword,
      is_google_user: false,
    });

    const token = jwt.sign({ email }, process.env.JWT_SECRET, { expiresIn: '1d' });
    res.status(200).json({ token });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// Email Login
exports.login = async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user || user.is_google_user)
      return res.status(401).json({ message: 'Invalid credentials' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: 'Invalid credentials' });

    const token = jwt.sign(
      { userID: user.userID, name: user.name, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    let friend = null;
    let messages = [];

    if (user.friend) {
      const friendUser = await User.findOne({ userID: user.friend });
      if (friendUser) {
        friend = { userID: friendUser.userID, name: friendUser.name };

        messages = await Message.find({
          $or: [
            { sender: user.userID, receiver: friendUser.userID },
            { sender: friendUser.userID, receiver: user.userID },
          ]
        }).sort({ timestamp: 1 });
      }
    }

    res.status(200).json({ token, userID: user.userID, name: user.name, friend, messages });

  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get Friends
exports.friends = async (req, res) => {
  const { userID } = req.params;

  try {
    const currentUser = await User.findOne({ userID });
    if (!currentUser || !currentUser.friend) return res.json([]);

    const friends = await User.find({
      userID: currentUser.friend,
    }, { userID: 1, name: 1, _id: 0 });

    res.json(friends);
  } catch (err) {
    console.error('Error fetching friends:', err);
    res.status(500).json({ error: 'Failed to get friends' });
  }
};


// Get Last Message per Chat
exports.lastMessage = async (req, res) => {
  const { userID } = req.params;

  try {
    const allMessages = await Message.find({
      $or: [{ sender: userID }, { receiver: userID }]
    }).sort({ timestamp: -1 });

    const latest = {};
    allMessages.forEach(msg => {
      const key = [msg.sender, msg.receiver].sort().join('-');
      if (!latest[key]) latest[key] = msg;
    });

    const result = Object.values(latest).sort((a, b) => b.timestamp - a.timestamp);
    res.json(result);
  } catch (err) {
    console.error('Error fetching last messages:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// Get All Messages Between 2 Users
exports.messages = async (req, res) => {
  const { user1, user2 } = req.params;

  try {
    const msgs = await Message.find({
      $or: [
        { sender: user1, receiver: user2 },
        { sender: user2, receiver: user1 }
      ]
    }).sort({ timestamp: 1 });

    res.json(msgs);
  } catch (err) {
    console.error('Error fetching messages:', err);
    res.status(500).json({ error: 'Server error' });
  }
};
