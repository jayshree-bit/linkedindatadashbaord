
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';

import { connectDB } from './src/config/db.js';
import { seed } from './src/seed.js';
import publicRoutes from './src/routes/public.routes.js';
import authRoutes from './src/routes/auth.routes.js';
import privateRoutes from './src/routes/private.routes.js';

const app = express();

const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';

app.use(cors({
  origin: clientUrl,
  credentials: true,
}));

app.use(express.json());
app.use(cookieParser());

// Register routes AFTER cookieParser
app.use('/api/public', publicRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/private', privateRoutes);

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

app.listen(process.env.PORT || 5000, () => {
  console.log(`API running on port ${process.env.PORT || 5000}`);
});
