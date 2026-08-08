require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./src/auth');
const progressRoutes = require('./src/progress');

const app = express();
const PORT = process.env.PORT || 5000;

// flutter run -d chrome picks a random localhost port every run (e.g.
// http://localhost:58540), so a fixed origin allowlist blocks it. Allow
// any localhost/127.0.0.1 origin instead (fine for local dev; lock this
// down to real domains before deploying).
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      return callback(null, true);
    }
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true
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