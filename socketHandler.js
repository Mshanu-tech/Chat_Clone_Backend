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
socket.on('send_invite', async ({ from, fromName, to, picture }) => {
  try {
    const target = onlineUsers.get(to);
    const senderUser = onlineUsers.get(from);
    if (!senderUser) return;
    const fromUser = await User.findOne({ userID: from });
    const toUser = await User.findOne({ userID: to });
    if (!fromUser || !toUser) return;

    // Already friends?
    if (fromUser.friends.includes(to)) {
      io.to(senderUser.socketId).emit('invite_feedback', {
        status: 'friend',
        message: 'This user is already your friend.'
      });
      return;
    }

    // In sentRequests?
    const sentReq = fromUser.sentRequests.find(r => r.receiver_id === to);
    if (sentReq) {
      if (sentReq.status === 'request') {
        io.to(senderUser.socketId).emit('invite_feedback', {
          status: 'pending',
          message: 'You already sent a request to this user.'
        });
        return;
      }
      if (sentReq.status === 'accept') {
        io.to(senderUser.socketId).emit('invite_feedback', {
          status: 'friend',
          message: 'This user is already your friend.'
        });
        return;
      }
      if (sentReq.status === 'decline') {
        io.to(senderUser.socketId).emit('invite_feedback', {
          status: 'declined',
          message: 'This user previously declined your request.',
          confirmResend: true,
          to
        });
        return;
      }
    }

    // In myRequests?
    const myReq = fromUser.myRequests.find(r => r.sender_id === to);
    if (myReq) {
      if (myReq.status === 'request') {
        io.to(senderUser.socketId).emit('invite_feedback', {
          status: 'incoming',
          message: 'This user already sent you a request.',
          showAccept: true,
          from: to,
          fromName: toUser.name,
          picture: toUser.picture
        });
        return;
      }
      if (myReq.status === 'accept') {
        io.to(senderUser.socketId).emit('invite_feedback', {
          status: 'friend',
          message: 'This user is already your friend.'
        });
        return;
      }
    }

    // Save new request
    await User.findOneAndUpdate(
      { userID: from },
      { $addToSet: { sentRequests: { receiver_id: to, status: 'request' } } }
    );
    await User.findOneAndUpdate(
      { userID: to },
      { $addToSet: { myRequests: { sender_id: from, status: 'request' } } }
    );

    // Notify receiver
    if (target) io.to(target.socketId).emit('receive_invite', { from, fromName, picture });
    else {
      const arr = pendingInvites.get(to) || [];
      arr.push({ from, fromName, picture });
      pendingInvites.set(to, arr);
    }

    io.to(senderUser.socketId).emit('invite_feedback', {
      status: 'success',
      message: `Invite sent to ${to}`
    });

  } catch (err) {
    console.error('send_invite error:', err);
    io.to(socket.id).emit('invite_feedback', {
      status: 'error',
      message: 'Something went wrong. Please try again.'
    });
  }
});

socket.on('confirm_resend_invite', async ({ from, to, fromName, picture }) => {
  try {
    const sender = onlineUsers.get(from);
    const receiver = onlineUsers.get(to);
    if (!sender) return;

    // Reset status in existing requests
    await User.updateOne(
      { userID: from, 'sentRequests.receiver_id': to },
      { $set: { 'sentRequests.$.status': 'request' } }
    );
    await User.updateOne(
      { userID: to, 'myRequests.sender_id': from },
      {
        $set: {
          'myRequests.$.status': 'request',
          'myRequests.$.fromName': fromName,
          'myRequests.$.picture': picture
        }
      }
    );

    if (receiver) io.to(receiver.socketId).emit('receive_invite', { from, fromName, picture });

    io.to(sender.socketId).emit('invite_feedback', {
      status: 'success',
      message: `Re-invite sent to ${to}`
    });

  } catch (err) {
    console.error('resend error:', err);
    io.to(socket.id).emit('invite_feedback', {
      status: 'error',
      message: 'Failed to resend invite.'
    });
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