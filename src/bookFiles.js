require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });

const CACHE_PATH = path.join(__dirname, '../bookFilesCache.json');
const BOOKS_DIR = path.join(__dirname, '../books');
const MAX_AGE_MS = 47 * 60 * 60 * 1000; // 47 hours (files expire at 48h)

const loadCache = () => {
  try {
    return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
  } catch {
    return {};
  }
};

const saveCache = (cache) => {
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
};

const isFresh = (entry) => {
  if (!entry || !entry.uploadedAt) return false;
  return Date.now() - entry.uploadedAt < MAX_AGE_MS;
};

const uploadBook = async (filePath, displayName, safeName) => {
  console.log(`Uploading ${displayName} to Gemini File API...`);

  // Copy to a temp ASCII-safe path first — the SDK reads the file path
  // into an HTTP header, which breaks on non-ASCII (Amharic) characters.
  const tempPath = path.join(BOOKS_DIR, safeName);
  fs.copyFileSync(filePath, tempPath);

  let file;
  try {
    file = await ai.files.upload({
      file: tempPath,
      config: { mimeType: 'application/pdf', displayName: safeName },
    });
  } finally {
    fs.unlinkSync(tempPath); // clean up the temp copy either way
  }

  // Poll until processing finishes
  while (file.state === 'PROCESSING') {
    await new Promise((r) => setTimeout(r, 3000));
    file = await ai.files.get({ name: file.name });
  }

  if (file.state === 'FAILED') {
    throw new Error(`File processing failed for ${displayName}`);
  }

  console.log(`✅ Uploaded ${displayName} -> ${file.uri}`);
  return { uri: file.uri, mimeType: file.mimeType, uploadedAt: Date.now() };
};

/**
 * Returns an array of { fileUri, mimeType } for all books in books/,
 * uploading or re-uploading any that are missing or stale (>47h old).
 */
const getBookFileParts = async () => {
  const cache = loadCache();
  const books = fs.readdirSync(BOOKS_DIR).filter((f) => f.endsWith('.pdf'));

  for (let i = 0; i < books.length; i++) {
    const book = books[i];
    if (!isFresh(cache[book])) {
      const filePath = path.join(BOOKS_DIR, book);
      const safeName = `begena_book_${i + 1}.pdf`; // ASCII-safe name for HTTP headers
      cache[book] = await uploadBook(filePath, book, safeName);
      saveCache(cache);
    }
  }

  return books.map((book) => ({
    fileUri: cache[book].uri,
    mimeType: cache[book].mimeType,
  }));
};

module.exports = { getBookFileParts };