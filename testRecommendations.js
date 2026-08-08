require('dotenv').config();
const { getBookFileParts } = require('./src/bookFiles');
const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });

const FINGER_NAMES_EN = { 1: 'thumb', 2: 'index', 3: 'middle', 4: 'ring', 5: 'pinky' };

// --- Fake practice history (simulates what db('progress') would return) ---
const fakeHistory = [
  { qenet: 'Selamta', correct: 40, wrong: 12, finger_mistakes: { 1: 1, 2: 6, 3: 2, 4: 1, 5: 0 }, finger_successes: { 1: 10, 2: 4, 3: 8, 4: 9, 5: 9 } },
  { qenet: 'Selamta', correct: 35, wrong: 15, finger_mistakes: { 1: 0, 2: 8, 3: 3, 4: 2, 5: 1 }, finger_successes: { 1: 12, 2: 3, 3: 7, 4: 8, 5: 9 } },
  { qenet: 'Tizita',  correct: 30, wrong: 10, finger_mistakes: { 1: 1, 2: 5, 3: 1, 4: 1, 5: 0 }, finger_successes: { 1: 9,  2: 5, 3: 9, 4: 9, 5: 9 } },
];

const run = async () => {
  const totalCorrect = fakeHistory.reduce((sum, s) => sum + (s.correct || 0), 0);
  const totalWrong = fakeHistory.reduce((sum, s) => sum + (s.wrong || 0), 0);
  const avgAccuracy = Math.round((totalCorrect / (totalCorrect + totalWrong)) * 100) || 0;

  const fingerMistakes = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const fingerSuccesses = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  fakeHistory.forEach(session => {
    Object.keys(fingerMistakes).forEach(f => {
      fingerMistakes[f] += session.finger_mistakes[f] || 0;
      fingerSuccesses[f] += session.finger_successes[f] || 0;
    });
  });

  const qenetCounts = {};
  fakeHistory.forEach(s => { qenetCounts[s.qenet] = (qenetCounts[s.qenet] || 0) + 1; });
  const topQenet = Object.entries(qenetCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Selamta';

  const weakestFinger = Object.entries(fingerMistakes).sort((a, b) => b[1] - a[1])[0]?.[0] || 1;

  console.log('--- Fake stats ---');
  console.log({ totalCorrect, totalWrong, avgAccuracy, topQenet, weakestFinger: FINGER_NAMES_EN[weakestFinger] });

  console.log('\nFetching book file parts...');
  const fileParts = await getBookFileParts();
  console.log('Got', fileParts.length, 'file parts');

  const prompt = `
You are an expert Ethiopian Begena music teacher giving personalized practice advice.
You have been given the student's full teaching books as reference material — use them
to ground your advice in real begena technique, exercises, and qenet (tuning) guidance.

Student's practice history (last ${fakeHistory.length} sessions):
- Total sessions: ${fakeHistory.length}
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

  console.log('\nCalling Gemini...\n');
  const result = await ai.models.generateContent({
    model: 'gemini-3.1-flash-lite',
    contents
  });

  console.log('--- RECOMMENDATIONS ---\n');
  console.log(result.text);
};

run().catch(err => console.error('Test failed:', err));