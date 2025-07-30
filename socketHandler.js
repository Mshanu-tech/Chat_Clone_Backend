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
const User = require('./models/User'); // adjust the path as needed

socket.on('send_invite', async ({ from, to, fromName }) => {
  const target = onlineUsers.get(to);
  const sender = onlineUsers.get(from);

  // Emit to receiver if online
  if (target && sender) {
    io.to(target.socketId).emit('receive_invite', {
      from,
      fromName: sender.name,
    });
  } else if (sender) {
    // Store as pending if receiver offline
    const existing = pendingInvites.get(to) || [];
    existing.push({ from, fromName: sender.name });
    pendingInvites.set(to, existing);
    console.log(`Stored pending invite for ${to} from ${from}`);
  }

  try {
    // Update sender: add to sentRequests
    await User.findOneAndUpdate(
      { userID: from },
      {
        $addToSet: {
          sentRequests: { receiver_id: to, status: 'request' },
        },
      }
    );

    // Update receiver: add to myRequests
    await User.findOneAndUpdate(
      { userID: to },
      {
        $addToSet: {
          myRequests: { sender_id: from, status: 'request' },
        },
      }
    );

    console.log(`Invite saved: ${from} ➜ ${to}`);
  } catch (err) {
    console.error("Error saving invite:", err.message);
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
    // Handle messages
    socket.on('send_message', async ({ sender, receiver, message, timestamp, replyTo }, callback) => {
      const target = onlineUsers.get(receiver);

      try {
        const savedMsg = await Message.create({
          sender,
          receiver,
          message,
          timestamp: new Date(timestamp),
          replyTo: replyTo || null,
        });
        console.log(savedMsg);

        if (target) {
          io.to(target.socketId).emit('receive_message', {
            _id: savedMsg._id,  // Include the MongoDB _id
            sender,
            message,
            timestamp,
            replyTo: replyTo || null,
          });
        }

        if (callback) {
          callback({ status: 'ok', data: savedMsg });
        }
      } catch (err) {
        console.error('Error saving message:', err);
        if (callback) {
          callback({ status: 'error', error: err.message });
        }
      }
    });

    socket.on('voice_message', async ({ sender, receiver, audio, timestamp, duration, replyTo }, callback) => {
      const target = onlineUsers.get(receiver);

      try {
        // Save to DB
        const savedVoiceMsg = await Message.create({
          sender,
          receiver,
          audio,
          timestamp: new Date(timestamp),
          duration,
          replyTo: replyTo || null,
        });

        // Emit to receiver if online
        if (target) {
          io.to(target.socketId).emit('voice_message', {
            _id: savedVoiceMsg._id,
            from: sender,
            audio,
            timestamp,
            duration,
            replyTo: replyTo || null,
          });
        }

        if (callback) {
          callback({ status: 'ok', data: savedVoiceMsg });
        }
      } catch (err) {
        console.error('Error saving voice message:', err);
        if (callback) {
          callback({ status: 'error', error: err.message });
        }
      }
    });

socket.on('file_message', async (fileMsg, callback) => {
  try {
    const {
      sender,
      receiver,
      file,
      fileType,
      fileName,
      timestamp,
      replyTo
    } = fileMsg;

    // Save the file message to MongoDB
    const savedMsg = await Message.create({
      sender,
      receiver,
      file,
      fileType,
      fileName,
      timestamp: new Date(timestamp),
      replyTo: replyTo || null
    });

    // Emit to receiver if online
    const target = onlineUsers.get(receiver);
    if (target) {
      io.to(target.socketId).emit('receive_file_message', {
        _id: savedMsg._id,
        sender,
        receiver,
        file,
        fileType,
        fileName,
        timestamp,
        replyTo: replyTo || null,
        from: sender
      });
    }

    // Callback to sender
    if (callback) {
      callback({
        status: 'ok',
        data: {
          _id: savedMsg._id,
          sender,
          receiver,
          file,
          fileType,
          fileName,
          timestamp,
          replyTo: replyTo || null
        }
      });
    }
  } catch (error) {
    console.error('Error saving file message:', error);
    if (callback) {
      callback({ status: 'error', error: error.message });
    }
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