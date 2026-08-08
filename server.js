require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./src/auth');
const progressRoutes = require('./src/progress');

const app = express();
const PORT = process.env.PORT || 5000;

// TEMPORARY: fully open CORS to isolate whether origin-matching was the
// actual problem. Reflects any origin — do not leave this in place once
// the real issue is confirmed; replace with a proper allowlist afterward.
app.use(cors({
  origin: true,
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