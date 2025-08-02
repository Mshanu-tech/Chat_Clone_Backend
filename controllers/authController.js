const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const User = require('../models/User');
const Message = require('../models/Message');
const generateUserID = require('../utils/generateUserID');

// Google Signup/Login
exports.googleAuth = async (req, res) => {
  const { email, name, picture, googleId } = req.body;
  console.log(req.body);

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
    const userPicture = user.picture;

    // Get friend & messages
    let friend = null;
    let messages = [];

    if (user.friends && user.friends.length > 0) {
      const friendUser = await User.findOne({ userID: user.friends[0] }); // assuming first friend
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

    const token = jwt.sign({ email, name, userID, picture: userPicture }, process.env.JWT_SECRET, {
      expiresIn: '1d',
    });

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

    if (!currentUser || !currentUser.friends) return res.json([]);

    const friends = await User.find(
      { userID: currentUser.friends },
      { userID: 1, name: 1, picture: 1, _id: 0 }
    );

    console.log(friends);

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

exports.requests = async (req, res) => {
  const { userID } = req.params;

  try {
    const user = await User.findOne({ userID });

    if (!user) return res.status(404).json({ error: "User not found" });

    // Get users who sent requests to this user
    const receivedUserIDs = user.myRequests.map(req => req.sender_id);
    const receivedUsers = await User.find(
      { userID: { $in: receivedUserIDs } },
      { userID: 1, name: 1, picture: 1, _id: 0 }
    );

    const receivedRequests = user.myRequests.map(req => {
      const userInfo = receivedUsers.find(u => u.userID === req.sender_id);
      return {
        userID: req.sender_id,
        fromName: userInfo?.name || 'Unknown',
        picture: userInfo?.picture || '',
        status: req.status,
        type: 'received',
      };
    });

    // Get users whom this user sent requests to
    const sentUserIDs = user.sentRequests.map(req => req.receiver_id);
    const sentUsers = await User.find(
      { userID: { $in: sentUserIDs } },
      { userID: 1, name: 1, picture: 1, _id: 0 }
    );

    const sentRequests = user.sentRequests.map(req => {
      const userInfo = sentUsers.find(u => u.userID === req.receiver_id);
      return {
        userID: req.receiver_id,
        fromName: userInfo?.name || 'Unknown',
        picture: userInfo?.picture || '',
        status: req.status,
        type: 'sent',
      };
    });

    res.json({
      received: receivedRequests,
      sent: sentRequests,
    });
  } catch (err) {
    console.error('Error fetching requests:', err);
    res.status(500).json({ error: 'Failed to fetch requests' });
  }
};


exports.respondToRequest = async (req, res) => {
  const { userID, senderID, action } = req.body;

  if (!['accept', 'decline'].includes(action)) {
    return res.status(400).json({ error: 'Invalid action' });
  }

  try {
    // 1. Update receiver's myRequests
    await User.updateOne(
      { userID, 'myRequests.sender_id': senderID },
      { $set: { 'myRequests.$.status': action } }
    );

    // 2. Update sender's sentRequests
    await User.updateOne(
      { userID: senderID, 'sentRequests.receiver_id': userID },
      { $set: { 'sentRequests.$.status': action } }
    );

    // 3. If accepted, add each other as friends
    if (action === 'accept') {
      await User.updateOne(
        { userID },
        { $addToSet: { friends: senderID } }
      );

      await User.updateOne(
        { userID: senderID },
        { $addToSet: { friends: userID } }
      );
    }

    res.status(200).json({ message: `Request ${action}ed successfully` });
  } catch (err) {
    console.error('Error updating request status:', err);
    res.status(500).json({ error: 'Failed to respond to request' });
  }
};


exports.updateProfile = async (req, res) => {
  const { userID, name, email, profilePhoto } = req.body;

  if (!userID || !name || !email) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const updateData = {
      name,
      email,
    };

    if (profilePhoto) {
      updateData.picture = profilePhoto;
    }

    const updatedUser = await User.findOneAndUpdate(
      { userID },
      updateData,
      { new: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Create new token with updated details
    const newToken = jwt.sign(
      {
        email: updatedUser.email,
        name: updatedUser.name,
        userID: updatedUser.userID,
        picture: updatedUser.picture,
      },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    res.status(200).json({
      message: 'Profile updated successfully',
      token: newToken,
      user: {
        userID: updatedUser.userID,
        name: updatedUser.name,
        email: updatedUser.email,
        picture: updatedUser.picture,
      },
    });
  } catch (err) {
    console.error('Error updating profile:', err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
};




