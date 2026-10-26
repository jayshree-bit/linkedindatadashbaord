import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { createServer } from 'node:http';
import { Server } from 'socket.io';

import { connectDB } from './src/config/db.js';
import { seed } from './src/seed.js';
import publicRoutes from './src/routes/public.routes.js';
import authRoutes from './src/routes/auth.routes.js';
import privateRoutes from './src/routes/private.routes.js';
import notificationRoutes from './src/routes/notification.routes.js';

const app = express();
const server = createServer(app);

const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';

app.use(cors({
  origin: clientUrl,
  credentials: true,
}));

const io = new Server(server, {
  cors: {
    origin: clientUrl,
    credentials: true,
  },
});

// Make io available to controllers through req.app.get('io').
app.set('io', io);

io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);

  socket.on('disconnect', () => {
    console.log('Socket disconnected:', socket.id);
  });
});

app.use(express.json());
app.use(cookieParser());

app.use('/api/public', publicRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/private', privateRoutes);
app.use('/api/private/notifications', notificationRoutes);

app.use((req, res) =>
  res.status(404).json({ message: 'Route not found' })
);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({
    message: err.message || 'Server error',
  });
});

await connectDB();
await seed();

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`API running on port ${PORT}`);
});
