const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const db = require('../config/db');
const generateUserID = require('../utils/generateUserID');

// Google Signup/Login
// Google Signup/Login
exports.googleAuth = async (req, res) => {
  const { email, name, picture, googleId } = req.body;

  try {
    let userID;
    const [user] = await db.query('SELECT * FROM usersdata WHERE email = ?', [email]);

    if (user.length === 0) {
      userID = generateUserID();
      await db.query(
        'INSERT INTO usersdata (userID, name, email, picture, google_id, is_google_user) VALUES (?, ?, ?, ?, ?, ?)',
        [userID, name, email, picture, googleId, 1]
      );
    } else {
      userID = user[0].userID;
    }

    // ✅ Fetch friend and messages
    let friend = null;
    let messages = [];

    const [userData] = await db.query('SELECT friend FROM usersdata WHERE userID = ?', [userID]);

    if (userData.length > 0 && userData[0].friend) {
      const friendID = userData[0].friend;
      const [friendRows] = await db.query('SELECT name FROM usersdata WHERE userID = ?', [friendID]);
      const friendName = friendRows.length ? friendRows[0].name : '';

      friend = { userID: friendID, name: friendName };

      const [msgRows] = await db.query(
        'SELECT * FROM messages WHERE (sender = ? AND receiver = ?) OR (sender = ? AND receiver = ?) ORDER BY timestamp ASC',
        [userID, friendID, friendID, userID]
      );

      messages = msgRows;
    }

    // ✅ Create JWT
    const token = jwt.sign({ email, name, userID }, process.env.JWT_SECRET, { expiresIn: '1d' });

    // ✅ Send response
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
    const [existing] = await db.query('SELECT * FROM usersdata WHERE email = ?', [email]);
    if (existing.length > 0)
      return res.status(400).json({ message: 'User already exists' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const userID = generateUserID();

    await db.query(
      'INSERT INTO usersdata (userID, name, email, password, is_google_user) VALUES (?, ?, ?, ?, 0)',
      [userID, name, email, hashedPassword]
    );

    const token = jwt.sign({ email }, process.env.JWT_SECRET, { expiresIn: '1d' });
    res.status(200).json({ token });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.login = async (req, res) => {
  const { email, password } = req.body;

  try {
    const [userRows] = await db.query('SELECT * FROM usersdata WHERE email = ?', [email]);
    if (userRows.length === 0 || userRows[0].is_google_user)
      return res.status(401).json({ message: 'Invalid credentials' });

    const user = userRows[0];

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: 'Invalid credentials' });

    // ✅ Generate JWT with userID and name
    const token = jwt.sign(
      { userID: user.userID, name: user.name, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    // ✅ Fetch friend info and messages
    let friend = null;
    let messages = [];

    if (user.friend) {
      const [friendRows] = await db.query('SELECT name FROM usersdata WHERE userID = ?', [user.friend]);
      const friendName = friendRows.length ? friendRows[0].name : '';

      friend = {
        userID: user.friend,
        name: friendName,
      };

      const [messageRows] = await db.query(
        'SELECT * FROM messages WHERE (sender = ? AND receiver = ?) OR (sender = ? AND receiver = ?) ORDER BY timestamp ASC',
        [user.userID, user.friend, user.friend, user.userID]
      );

      messages = messageRows;
    }

    // ✅ Return everything
    res.status(200).json({ token, userID: user.userID, name: user.name, friend, messages });

  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.friends = async (req, res) => {
  const { userID } = req.params;

  try {
    const [results] = await db.query(
      `SELECT userID, name FROM usersdata WHERE friend = ? OR userID IN (
         SELECT friend FROM usersdata WHERE userID = ?
       )`, [userID, userID]
    );

    res.json(results);
  } catch (err) {
    console.error('Error fetching friends:', err);
    res.status(500).json({ error: 'Failed to get friends' });
  }
}

exports.lastMessage = async (req, res) => {
  const { userID } = req.params;
  try {
    const [rows] = await db.query(`
      SELECT m1.*
      FROM messages m1
      INNER JOIN (
        SELECT 
          LEAST(sender, receiver) AS user1,
          GREATEST(sender, receiver) AS user2,
          MAX(id) AS max_id
        FROM messages
        WHERE sender = ? OR receiver = ?
        GROUP BY user1, user2
      ) m2
      ON m1.id = m2.max_id
      ORDER BY m1.timestamp DESC
    `, [userID, userID]);

    res.json(rows);
  } catch (err) {
    console.error('Error fetching last messages:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

exports.messages = async (req, res) => {
  const { user1, user2 } = req.params;

  try {
    const [rows] = await db.query(
      `SELECT * FROM messages 
       WHERE (sender = ? AND receiver = ?) OR (sender = ? AND receiver = ?) 
       ORDER BY timestamp ASC`,
      [user1, user2, user2, user1]
    );

    res.json(rows);
  } catch (err) {
    console.error('Error fetching messages:', err);
    res.status(500).json({ error: 'Server error' });
  }
}