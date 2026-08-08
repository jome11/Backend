const { getBookFileParts } = require('./bookFiles');
const { GoogleGenAI } = require('@google/genai');
const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });
const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('./database');

const router = express.Router();
const SECRET = process.env.JWT_SECRET || 'begena_secret_key';

// Rate limiter
const aiCallTracker = {};
const AI_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

const canCallAI = (userId) => {
  const now = Date.now();
  const last = aiCallTracker[userId];
  return !last || now - last > AI_COOLDOWN_MS;
};

const markAICalled = (userId) => {
  aiCallTracker[userId] = Date.now();
};

const timeUntilNext = (userId) => {
  const now = Date.now();
  const last = aiCallTracker[userId];
  if (!last) return 0;
  const remaining = AI_COOLDOWN_MS - (now - last);
  return Math.max(0, Math.ceil(remaining / 60000));
};

const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
};

const FINGER_NAMES_EN = { 1: 'thumb', 2: 'index', 3: 'middle', 4: 'ring', 5: 'pinky' };

// Save progress
router.post('/save', auth, async (req, res) => {
  try {
    const { mode, qenet, correct, wrong, accuracy, session_num, mezmur_name, finger_mistakes, finger_successes } = req.body;
    await db('progress').insert({
      user_id: req.user.id,
      mode, qenet, correct, wrong, accuracy, session_num,
      mezmur_name: mezmur_name || null,
      finger_mistakes: JSON.stringify(finger_mistakes || {}),
      finger_successes: JSON.stringify(finger_successes || {})
    });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get history
router.get('/history', auth, async (req, res) => {
  try {
    const history = await db('progress')
      .where({ user_id: req.user.id })
      .orderBy('created_at', 'desc')
      .limit(50);
    res.json({ history });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get recommendations
router.get('/recommendations', auth, async (req, res) => {
  try {
    const history = await db('progress')
      .where({ user_id: req.user.id })
      .orderBy('created_at', 'desc')
      .limit(20);

    if (history.length === 0) {
      return res.json({
        success: true,
        recommendations: 'Complete some practice sessions first and I will give you personalized recommendations!'
      });
    }

    if (!canCallAI(req.user.id)) {
      const minutes = timeUntilNext(req.user.id);
      return res.json({
        success: true,
        recommendations: `Your recommendations are still fresh! Come back in ${minutes} minute(s) for updated AI analysis.`,
        rateLimited: true
      });
    }

    const totalCorrect = history.reduce((sum, s) => sum + (s.correct || 0), 0);
    const totalWrong = history.reduce((sum, s) => sum + (s.wrong || 0), 0);
    const avgAccuracy = Math.round((totalCorrect / (totalCorrect + totalWrong)) * 100) || 0;

    const fingerMistakes = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    const fingerSuccesses = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    history.forEach(session => {
      try {
        const mistakes = typeof session.finger_mistakes === 'string'
          ? JSON.parse(session.finger_mistakes) : session.finger_mistakes || {};
        const successes = typeof session.finger_successes === 'string'
          ? JSON.parse(session.finger_successes) : session.finger_successes || {};
        Object.keys(fingerMistakes).forEach(f => {
          fingerMistakes[f] += mistakes[f] || 0;
          fingerSuccesses[f] += successes[f] || 0;
        });
      } catch (e) {}
    });

    const qenetCounts = {};
    history.forEach(s => {
      qenetCounts[s.qenet] = (qenetCounts[s.qenet] || 0) + 1;
    });
    const topQenet = Object.entries(qenetCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Selamta';

    // Find weakest finger
    const weakestFinger = Object.entries(fingerMistakes)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || 1;

    // Reference the actual book PDFs (Gemini reads them directly)
    const fileParts = await getBookFileParts();

    const prompt = `
You are an expert Ethiopian Begena music teacher giving personalized practice advice.
You have been given the student's full teaching books as reference material — use them
to ground your advice in real begena technique, exercises, and qenet (tuning) guidance.

Student's practice history (last ${history.length} sessions):
- Total sessions: ${history.length}
- Overall accuracy: ${avgAccuracy}%
- Total correct plucks: ${totalCorrect}
- Total wrong plucks: ${totalWrong}
- Most practiced qenet: ${topQenet}
- Weakest finger: ${FINGER_NAMES_EN[weakestFinger]}

Finger performance (all sessions combined):
- Thumb:  ${fingerSuccesses[1]} correct, ${fingerMistakes[1]} mistakes
- Index:  ${fingerSuccesses[2]} correct, ${fingerMistakes[2]} mistakes
- Middle: ${fingerSuccesses[3]} correct, ${fingerMistakes[3]} mistakes
- Ring:   ${fingerSuccesses[4]} correct, ${fingerMistakes[4]} mistakes
- Pinky:  ${fingerSuccesses[5]} correct, ${fingerMistakes[5]} mistakes

Write 3-4 specific, actionable practice recommendations for this student.
Speak as an experienced begena teacher sharing knowledge from years of teaching and
studying — as if this technique lives in your own head, not something you're citing.
Never mention book titles, chapter numbers, or page numbers, and never say phrases like
"as outlined in the book" or "on page X." Just teach the technique directly and naturally,
the way a real teacher would explain it to a student in person.
Format as a numbered list.
Be warm, encouraging, and specific to begena playing.
Keep each recommendation to 1-2 sentences.
Do not use markdown headers.
    `;

    const contents = [
      {
        role: 'user',
        parts: [
          ...fileParts.map(f => ({ fileData: { fileUri: f.fileUri, mimeType: f.mimeType } })),
          { text: prompt }
        ]
      }
    ];

    const result = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite',
      contents
    });
    const recommendations = result.text;
    markAICalled(req.user.id);
    res.json({ success: true, recommendations, usedBookKnowledge: true });

  } catch (error) {
    console.error('AI recommendations error:', error.message);
    res.json({
      success: true,
      recommendations: 'Practice regularly and focus on your weakest finger. Consistency is the key to mastering the Begena!'
    });
  }
});

// Session narrative
router.post('/session-narrative', async (req, res) => {
  try {
    const { sessionNum, correct, wrong, weakFinger, fingerSuccesses, fingerMistakes, qenet, userId } = req.body;

    const narrativeKey = `narrative_${userId || 'anonymous'}`;
    const now = Date.now();
    const lastCall = aiCallTracker[narrativeKey];
    if (lastCall && now - lastCall < 10 * 60 * 1000) {
      return res.json({
        success: true,
        narrative: 'Great session! Keep practicing consistently and you will master the Begena.'
      });
    }
    aiCallTracker[narrativeKey] = now;

    const fingerNames = { 1: 'thumb', 2: 'index', 3: 'middle', 4: 'ring', 5: 'pinky' };
    const prompt = `
You are a warm and encouraging Ethiopian Begena music teacher.
A student just completed a practice session on the Begena (traditional Ethiopian lyre).

Session data:
- Qenet (tuning): ${qenet || 'Selamta'}
- Session number: ${sessionNum}
- Correct plucks: ${correct}
- Wrong plucks: ${wrong}
- Accuracy: ${Math.round((correct / (correct + wrong)) * 100) || 0}%
- Current weak finger: ${fingerNames[weakFinger] || 'unknown'}
- Finger successes: Thumb=${fingerSuccesses[1]}, Index=${fingerSuccesses[2]}, Middle=${fingerSuccesses[3]}, Ring=${fingerSuccesses[4]}, Pinky=${fingerSuccesses[5]}
- Finger mistakes: Thumb=${fingerMistakes[1]}, Index=${fingerMistakes[2]}, Middle=${fingerMistakes[3]}, Ring=${fingerMistakes[4]}, Pinky=${fingerMistakes[5]}

Write a 2-3 sentence session summary that:
1. Acknowledges their performance warmly
2. Gives one specific tip about their weak finger
3. Encourages them to continue

Keep it friendly, short, and motivating. Do not use bullet points.
    `;

    const result = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite',
      contents: [{ role: 'user', parts: [{ text: prompt }] }]
    });
    const narrative = result.text;
    res.json({ success: true, narrative });

  } catch (error) {
    console.error('AI narrative error:', error.message);
    res.json({
      success: false,
      narrative: 'Great practice session! Keep working on your weak finger and you will improve steadily.'
    });
  }
});

module.exports = router;