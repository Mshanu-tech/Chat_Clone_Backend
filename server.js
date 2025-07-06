const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
require('dotenv').config();
const authRoutes = require('./router/authRoutes');
const db = require('./config/db');

const app = express();

app.use(cors({
  origin: 'http://localhost:5173', // frontend URL
  credentials: true
}));
app.use(express.json());
app.use('/api/auth', authRoutes);

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const onlineUsers = new Map(); // userID -> { socketId, name }
const pendingInvites = new Map(); // userID -> [{ from, fromName }]

console.log("onlineUsers", onlineUsers);
console.log("pendingInvites", pendingInvites);


io.on('connection', (socket) => {
  const userID = socket.handshake.query.userID;
  const name = socket.handshake.query.name;

if (userID && name) {
  onlineUsers.set(userID, { socketId: socket.id, name });
  socket.userID = userID;
  socket.name = name;

  // Notify others
  io.emit('user-online', { userID, name });

  // 🔥 Send the current online users to the newly connected user
  io.to(socket.id).emit('online-users', Array.from(onlineUsers.entries()).map(([userID, { name }]) => ({ userID, name })));
}


  // ✅ Send pending invites
  if (pendingInvites.has(userID)) {
    const invites = pendingInvites.get(userID);
    invites.forEach(({ from, fromName }) => {
      io.to(socket.id).emit('receive_invite', { from, fromName });
    });
    pendingInvites.delete(userID);
  }

  // 📥 Receive an invite
  socket.on('send_invite', ({ from, to }) => {
    const target = onlineUsers.get(to);
    const sender = onlineUsers.get(from);

    if (target && sender) {
      io.to(target.socketId).emit('receive_invite', {
        from,
        fromName: sender.name,
      });
    } else if (sender) {
      const existing = pendingInvites.get(to) || [];
      existing.push({ from, fromName: sender.name });
      pendingInvites.set(to, existing);
      console.log(`Stored pending invite for ${to} from ${from}`);
    }
  });

  // ✅ Handle invite response
  socket.on('invite_response', async ({ to, accepted }) => {
    const inviter = onlineUsers.get(to);
    const receiverID = socket.userID;
    const receiverName = socket.name;

    if (inviter) {
      io.to(inviter.socketId).emit('invite_result', {
        from: receiverID,
        fromName: receiverName,
        accepted,
      });

      if (accepted) {
        try {
          await db.query('UPDATE usersdata SET friend = ? WHERE userID = ?', [to, receiverID]);
          await db.query('UPDATE usersdata SET friend = ? WHERE userID = ?', [receiverID, to]);
          console.log(`Friendship stored: ${receiverID} ↔ ${to}`);
        } catch (err) {
          console.error('Error storing friendship:', err);
        }
      }
    }
  });

  // ✅ Message handling
socket.on('send_message', async ({ sender, receiver, message, timestamp, replyTo }) => {
  const target = onlineUsers.get(receiver);

  // Emit the full message (with replyTo if present) to the receiver
  if (target) {
    io.to(target.socketId).emit('receive_message', {
      sender,
      message,
      timestamp,
      replyTo: replyTo || null,
    });
  }

  // Save message to database (including replyTo)
  try {
    await db.query(
      'INSERT INTO messages (sender, receiver, message, timestamp, replyTo) VALUES (?, ?, ?, ?, ?)',
      [sender, receiver, message, timestamp, replyTo || null]
    );
  } catch (err) {
    console.error('Error saving message:', err);
  }
});


  // 🔴 Handle disconnect
  socket.on('disconnect', () => {
    if (socket.userID) {
      onlineUsers.delete(socket.userID);
      console.log(`${socket.userID} disconnected`);

      // 🔴 Notify all clients that this user is now offline
      io.emit('user-offline', { userID: socket.userID });
    }
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
