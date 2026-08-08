require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./src/auth');
const progressRoutes = require('./src/progress');

const app = express();
const PORT = process.env.PORT || 5000;

// Allowed origins:
// - any localhost/127.0.0.1 port (flutter run -d chrome picks a random
//   port each run, so a fixed port number would break on every restart)
// - the deployed Netlify frontend
const ALLOWED_ORIGINS = [
  'https://peppy-longma-ac930d.netlify.app',
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true); // same-origin / non-browser requests (curl, server-to-server)
    const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
    const isAllowedDeployed = ALLOWED_ORIGINS.includes(origin);
    if (isLocalhost || isAllowedDeployed) {
      return callback(null, true);
    }
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

app.use(express.json());

// routes
app.use('/api/auth', authRoutes);
app.use('/api/progress', progressRoutes);

// health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Begena Trainer API running' });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});