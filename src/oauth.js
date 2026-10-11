const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./database');

const router = express.Router();
const SECRET = process.env.JWT_SECRET || 'begena_secret_key';
const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, BACKEND_URL, FRONTEND_URL } = process.env;
const callbackUrl = () => `${BACKEND_URL}/api/auth/google/callback`;
const failUrl = () => `${FRONTEND_URL}/#/auth/callback?error=1`;

// One-time codes (valid 2 minutes, usable once)
const codes = new Map();
function makeCode(user) {
  const code = crypto.randomBytes(24).toString('hex');
  codes.set(code, { user, exp: Date.now() + 2 * 60 * 1000 });
  return code;
}
setInterval(() => {
  for (const [c, v] of codes) if (v.exp < Date.now()) codes.delete(c);
}, 60 * 1000).unref();

// Step 1: send the user to Google
router.get('/google', (req, res) => {
  if (!GOOGLE_CLIENT_ID) return res.redirect(failUrl());
  const state = jwt.sign({ n: crypto.randomBytes(8).toString('hex') }, SECRET, { expiresIn: '10m' });
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: callbackUrl(),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

// Step 2: Google sends the user back here
router.get('/google/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;
    if (error || !code || !state) return res.redirect(failUrl());
    jwt.verify(state, SECRET); // rejects forged or expired requests

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: callbackUrl(),
        grant_type: 'authorization_code',
      }),
    });
    const tokens = await tokenRes.json();
    if (!tokens.access_token) return res.redirect(failUrl());

    const infoRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const g = await infoRes.json();
    if (!g.sub || !g.email || !g.email_verified) return res.redirect(failUrl());

    // Find by Google id, else link to an existing account with the same email, else create
    let user = await db('users').where({ google_id: g.sub }).first();
    if (!user) {
      user = await db('users').where({ email: g.email }).first();
      if (user) {
        await db('users').where({ id: user.id }).update({ google_id: g.sub });
      } else {
        const randomPw = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
        const [id] = await db('users').insert({
          name: g.name || g.email.split('@')[0],
          email: g.email,
          password: randomPw,
          google_id: g.sub,
        });
        user = await db('users').where({ id }).first();
      }
    }

    const oneTime = makeCode({ id: user.id, name: user.name, email: user.email });
    res.redirect(`${FRONTEND_URL}/#/auth/callback?code=${oneTime}`);
  } catch (err) {
    console.error('Google OAuth error:', err);
    res.redirect(failUrl());
  }
});

// Step 3: the app swaps the one-time code for a real session token
router.post('/exchange', (req, res) => {
  const entry = codes.get(req.body?.code);
  if (!entry || entry.exp < Date.now()) return res.status(400).json({ error: 'Invalid or expired code' });
  codes.delete(req.body.code);
  const { id, name, email } = entry.user;
  const token = jwt.sign({ id, name, email }, SECRET, { expiresIn: '7d' });
  res.json({ token, user: { id, name, email } });
});

module.exports = router;