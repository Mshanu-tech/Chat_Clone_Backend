const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
require('dotenv').config();
const authRoutes = require('./router/authRoutes');
const connectDB = require('./config/mongodb'); // MongoDB connection
const User = require('./models/User');
const Message = require('./models/Message');

connectDB(); // Connect to MongoDB

const app = express();

const allowedOrigins = [
  'http://localhost:5173',
  'https://chat-app-sigma-liard.vercel.app',
  'https://chat-app-git-main-mshanu-techs-projects.vercel.app'
];

app.use(cors({
  origin: function (origin, callback) {
    // allow requests with no origin (e.g., mobile apps or curl requests)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

app.use(express.json());
app.use('/api/auth', authRoutes);

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true
  }
});



const onlineUsers = new Map();
const pendingInvites = new Map();

io.on('connection', (socket) => {
  const userID = socket.handshake.query.userID;
  const name = socket.handshake.query.name;
  console.log("socket working");

  if (userID && name) {
    onlineUsers.set(userID, { socketId: socket.id, name });
    socket.userID = userID;
    socket.name = name;

    io.emit('user-online', { userID, name });

    io.to(socket.id).emit('online-users',
      Array.from(onlineUsers.entries()).map(([id, { name }]) => ({ userID: id, name }))
    );
  }

  // Send pending invites
  if (pendingInvites.has(userID)) {
    const invites = pendingInvites.get(userID);
    invites.forEach(({ from, fromName }) => {
      io.to(socket.id).emit('receive_invite', { from, fromName });
    });
    pendingInvites.delete(userID);
  }

  // Handle invite send
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

  // Handle invite response
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
          await User.findOneAndUpdate({ userID: receiverID }, { friend: to });
          await User.findOneAndUpdate({ userID: to }, { friend: receiverID });
          console.log(`Friendship stored: ${receiverID} ↔ ${to}`);
        } catch (err) {
          console.error('Error storing friendship:', err);
        }
      }
    }
  });

  // Handle messages
  socket.on('send_message', async ({ sender, receiver, message, timestamp, replyTo }) => {
    const target = onlineUsers.get(receiver);

    if (target) {
      io.to(target.socketId).emit('receive_message', {
        sender,
        message,
        timestamp,
        replyTo: replyTo || null,
      });
    }

    try {
      await Message.create({
        sender,
        receiver,
        message,
        timestamp: new Date(timestamp),
        replyTo: replyTo || null,
      });
    } catch (err) {
      console.error('Error saving message:', err);
    }
  });

  // Disconnect
  socket.on('disconnect', () => {
    if (socket.userID) {
      onlineUsers.delete(socket.userID);
      console.log(`${socket.userID} disconnected`);
      io.emit('user-offline', { userID: socket.userID });
    }
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
