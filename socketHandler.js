const { Server } = require('socket.io');
const User = require('./models/User');
const Message = require('./models/Message');

function setupSocket(server) {
  const allowedOrigins = [
    'http://localhost:5173',
    'https://chat-app-sigma-liard.vercel.app',
    'https://chat-app-git-main-mshanu-techs-projects.vercel.app'
  ];

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
            // Add inviter (to) to receiver's friends list
            await User.findOneAndUpdate(
              { userID: receiverID },
              { $addToSet: { friends: to } }
            );

            // Add receiver (receiverID) to inviter's friends list
            await User.findOneAndUpdate(
              { userID: to },
              { $addToSet: { friends: receiverID } }
            );

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

    socket.on('voice_message', async ({ sender, receiver, audio, timestamp, duration, replyTo }) => {
      const target = onlineUsers.get(receiver);

      if (target) {
        io.to(target.socketId).emit('voice_message', {
          from: sender,
          audio,
          timestamp,
          duration,
          replyTo: replyTo || null,
        });
      }

      try {
        await Message.create({
          sender,
          receiver,
          audio,
          timestamp: new Date(timestamp),
          duration,
          replyTo: replyTo || null,
        });
      } catch (err) {
        console.error('Error saving voice message:', err);
      }
    });

    socket.on('file_message', async (fileMsg) => {
  try {
    const savedMessage = await Message.create(fileMsg);
    
    // Broadcast to the recipient
    const recipient = onlineUsers.get(fileMsg.receiver);
    if (recipient) {
      io.to(recipient.socketId).emit('receive_file_message', savedMessage);
    }
  } catch (error) {
    console.error('Error handling file message:', error);
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

  return io;
}

module.exports = setupSocket;