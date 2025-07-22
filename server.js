const express = require('express');
const http = require('http');
const cors = require('cors');
require('dotenv').config();
const authRoutes = require('./router/authRoutes');
const connectDB = require('./config/mongodb'); // MongoDB connection
const setupSocket = require('./socketHandler');
const path = require('path');

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

// Error handling middleware
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: 'File upload error', details: err.message });
  }
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/api/auth', authRoutes);

const server = http.createServer(app);

// Setup Socket.IO
setupSocket(server);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));