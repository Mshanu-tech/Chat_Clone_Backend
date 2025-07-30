const express = require('express');
const http = require('http');
const cors = require('cors');
require('dotenv').config();
const authRoutes = require('./router/authRoutes');
const connectDB = require('./config/mongodb'); // MongoDB connection
const setupSocket = require('./socketHandler');
// const fileRoutes = require('./router/fileRoutes');

connectDB(); // Connect to MongoDB

const app = express();

const allowedOrigins = [
  'http://localhost:5173',
  'https://chat-app-sigma-liard.vercel.app',
  'https://chat-app-git-main-mshanu-techs-projects.vercel.app'
];

app.use(cors({
  origin: function (origin, callback) {
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
// app.use('/api/files', fileRoutes);

const server = http.createServer(app);

// Setup Socket.IO
setupSocket(server);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));